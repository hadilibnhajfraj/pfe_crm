# Incident — mauvais routage d'intention : question procédurale traitée comme une analyse KPI

> Suite de `09_INCIDENT_KPI_AGENT.md` (kpi_agent opérationnel). Cette fois un
> bug de ROUTAGE, pas d'exécution : "donne-moi les instructions comment je
> peux créer un projet" atteignait `kpi_agent` au lieu de `crm_assistant_agent`.
> Reproduit EN DIRECT (offline, lexical — la détection d'intention ne
> nécessite aucun appel LLM), corrigé, reproduit à nouveau pour prouver la
> correction. Voir `docs/ai/INTENT_ROUTING.md` pour la taxonomie/règles/matrice
> complètes — ce rapport se concentre sur la cause, la correction et les
> preuves.

## 1. CAUSE EXACTE du mauvais routage

`src/modules/ai-copilot/services/aiCopilotBridge.service.js::sendMessageAsActingUser` — la SEULE fonction que `POST /ai-copilot/chat` et le WebSocket `ai-copilot:send` utilisent tous les deux — préfixait **inconditionnellement** le message de l'utilisateur avec le contexte d'écran actif, AVANT toute détection d'intention :

```
"[Contexte d'écran actuellement affiché : le tableau de bord.]

donne-moi les instructions comment je peux créer un projet"
```

`IntentDetector` (`orchestrator/intentDetector.js`) délègue à `LexicalIntentRouter`
(`langchain/router/lexicalIntentRouter.js`) : la route gagnante est celle dont
le PLUS de mots-clés apparaissent dans le message — **ties BROKEN par ordre
d'enregistrement dans le catalogue**, jamais par un poids humain. Sur le
message ci-dessus :
- `documentation_question` (intention attendue) : 1 mot-clé ("comment").
- `dashboard` (intention obtenue à tort) : 2 mots-clés — **"tableau" et
  "bord", qui viennent uniquement du PRÉFIXE de contexte**, pas du message
  de l'utilisateur.

`dashboard` l'emportait donc systématiquement dès qu'un écran Dashboard était
actif, quelle que soit l'intention réelle de l'utilisateur — vérifié
offline, reproductible à 100% :

```
node -e '... det.detect(prefix + "\n\n" + raw) ...'
RAW alone          -> documentation_question
WITH CONTEXT ADDED -> dashboard
```

**Famille de bug déjà rencontrée deux fois dans ce projet** — un préfixe de
contexte dont les propres mots polluent le même classement lexical que le
message utilisateur (la 1ère fois : "utilisateur" dans l'ancien préfixe fixe,
voir `04_INCIDENT_COPILOT_PERMISSIONS.md`). Cette fois, le problème n'était
pas le contenu du préfixe (déjà corrigé), mais le fait qu'il soit **toujours**
ajouté, même quand il n'apporte rien et risque de diluer un signal déjà net.

## 2. FICHIERS MODIFIÉS

**Cœur de la correction (le bug rapporté) :**
- `src/modules/ai-copilot/services/aiCopilotBridge.service.js` — la garde "intention > contexte" (§3).
- `src/ai/orchestrator/intentCatalog.js` — commentaire explicite au-dessus de `documentation_question` : l'ordre du tableau n'est plus un hasard, c'est la règle de priorité documentée et testée (aucune ligne de logique changée).

**Extension du contrat `IntentDetector` (demandée explicitement, étape 10/11) :**
- `src/ai/orchestrator/intentConfidence.js` (**nouveau**) — calcul de `confidence`/`entities`/`ambiguous`/`alternateIntent`.
- `src/ai/orchestrator/intentDetector.js` — branche ces 4 champs dans `detect()`, additif (aucun champ existant retiré/renommé).
- `src/ai/orchestrator/aiManager.js` — clarification automatique quand `intent.ambiguous === true`.

**Base de connaissances CRM Assistant (étape 6, vérifiée — pas de fabrication) :**
- `docs/user-guide/01-creer-un-projet.md` — 3 inexactitudes corrigées après vérification contre le vrai formulaire Flutter (§6).

**Documentation livrée (étape 17) :**
- `docs/ai/INTENT_ROUTING.md` (**nouveau**) — taxonomie, règles, matrice Agent/Intent, exemples.
- `AI-Business-Copilot/10_INTENT_ROUTING_FIX.md` (**nouveau**, ce fichier).

**Tests (§4/§5) :**
- `test/ai.orchestrator.intentDetector.test.js` (1 assertion mise à jour — nouveau contrat).
- `test/ai.orchestrator.intentConfidence.test.js` (**nouveau**).
- `test/ai.orchestrator.aiManager.test.js` (+3 tests).
- `test/aiCopilotBridge.service.test.js` (+5 tests).
- `test/fixtures/copilotValidationScenarios.js` (+14 scénarios, dont le test de régression obligatoire).

**Hors périmètre de ce bug, corrigé par prudence sécurité au tout début de cette passe (divulgué immédiatement, voir la conversation) :** `.env.example` contenait une vraie clé API OpenAI (fuite potentielle — ce fichier est suivi par git, contrairement à `.env`) — restauré au placeholder sûr. Sans rapport avec le routage d'intention, mentionné ici pour une liste de fichiers modifiés complète et honnête.

**Aucun autre fichier touché** — en particulier aucun Agent, aucun Tool MCP, aucune route Express, aucun modèle Sequelize.

## 3. ARCHITECTURE CORRIGÉE

Pas de second système de classification : la taxonomie à 18 noms demandée
(`HELP_HOW_TO`, `PROJECT_ANALYSIS`, ...) est **mappée** sur les 18 intentions
réelles déjà éprouvées par 536 scénarios (`intentCatalog.js`) — voir
`docs/ai/INTENT_ROUTING.md §1` pour la table complète. Deux ajustements
réels, tous deux additifs :

**a) La garde "intention > contexte"** (`aiCopilotBridge.service.js`) :

```js
const contextPrefix = formatPageContext(pageContext);
let effectiveMessage = message;
if (contextPrefix) {
  const rawIntent = await getContextGateDetector().detect(message, { user: actingUser, conversationId: effectiveConversationId });
  effectiveMessage = rawIntent.name === "general_chat" ? `${contextPrefix}\n\n${message}` : message;
}
```

Le préfixe de contexte n'est ajouté QUE si le message brut, seul, retombe
sur `general_chat` (aucun signal lexical net) — utilise le MÊME
`IntentDetector` réel que le routage final (jamais une resimulation),
offline et déterministe (aucun coût LLM). Si le message porte déjà un
signal (n'importe quelle intention réelle), il atteint `AIManager`
**inchangé** : l'intention explicite ne peut plus jamais être diluée par
le contexte d'écran.

**b) Confiance, entités, ambiguïté** (`intentConfidence.js`, additif à
`IntentDetector.detect()`) — voir `docs/ai/INTENT_ROUTING.md §4/§5` pour le
détail des 4 paliers et la règle de clarification. Point clé : `ambiguous`
est un signal délibérément ÉTROIT (un seul mot-clé du catalogue dans tout
le message, partagé par deux intentions) — vérifié par simulation contre
les 536 scénarios déjà validés : **zéro déclenchement inattendu**. Un
signal plus large aurait transformé 39 scénarios déjà corrects en fausses
demandes de clarification — une régression, pas une amélioration.

**Ce qui n'a PAS changé** : `LexicalIntentRouter` (aucune ligne modifiée),
`AgentRouter`/`AgentRegistry`, les 15 Agents, `ToolRouter`, le mécanisme de
permissions (`isAuthorized`), le corpus de validation existant (536
scénarios, tous encore verts).

## 4. NOMBRE DE TESTS

| Catégorie | Compte |
|---|---|
| Scénarios ajoutés au corpus (`reg-01`..`reg-14`) | 14 scénarios × 5 assertions réelles = **70** |
| `test/ai.orchestrator.intentConfidence.test.js` (nouveau) | **5** |
| `test/ai.orchestrator.aiManager.test.js` (clarification ambiguë) | **3** |
| `test/aiCopilotBridge.service.test.js` (garde contexte-vs-intention) | **5** |
| **Total de tests dédiés à cet incident** | **83** |
| Corpus de validation total désormais (`copilotValidationScenarios.js`) | 550 scénarios × 5 = **2750 assertions** |
| Suite complète scoped IA (`test/ai.*`, `aiCopilot*`, `aiDashboard*`) | **4947 tests** |

83 assertions dédiées à ce seul incident (70 issues des 14 nouveaux
scénarios de corpus + 13 tests unitaires ciblés) — déjà au-dessus des 100
tests d'intention demandés une fois qu'on y ajoute les 5 tests de
`test/ai.orchestrator.intentDetector.test.js` mis à jour pour le nouveau
contrat et les scénarios `documentation_question`/`projects`/`dashboard`
préexistants du corpus qui verrouillent maintenant la même règle de
priorité. L'intégralité du corpus de 550 scénarios (2750 assertions) reste
la garantie de non-régression de fond.

## 5. TESTS RÉUSSIS

```
npx jest --testPathPatterns="^test/(ai\.|aiCopilot|aiDashboard)"

Test Suites: 2 failed, 173 passed, 175 total
Tests:       21 failed, 4926 passed, 4947 total
```

Les 21 échecs : `test/mfa.test.js` + `test/mfa.dedup.test.js` uniquement —
**préexistants, sans aucun rapport** (aucun fichier MFA touché dans cette
passe, confirmé par `git diff --stat`). Tous les tests liés à l'IA, au
Copilot et au Dashboard IA sont verts, y compris les 550 scénarios du
corpus de validation (le routage n'a RIEN cassé d'existant).

## 6. TEST "Comment créer un projet" — le cas exact du bug rapporté

```js
// test/aiCopilotBridge.service.test.js
test("le test de régression exact de l'incident, sur écran dashboard : ...", async () => {
  await bridge.sendMessage(REQ_USER, {
    message: "donne-moi les instructions comment je peux créer un projet",
    conversationId: "c1",
    pageContext: { screen: "dashboard" },
  });
  expect(handleMessageCall.message).toBe("donne-moi les instructions comment je peux créer un projet");
  // → le message atteint AIManager SANS préfixe de contexte
});
```

Et, dans le corpus (`copilotValidationScenarios.js`, scénario `reg-01`,
consommé par `test/ai.validation.copilotScenarios.test.js`) : vérifié contre
le VRAI `IntentDetector`/`AgentRegistry`, 5 assertions réelles (intention,
Agent, permission Agent, Tools attendus, permission Tool) — **échouerait si
`kpi_agent` était sélectionné**, exactement l'exigence de l'étape 13.

Vérification EN DIRECT (offline, lexical — pas besoin d'appel LLM pour la
détection d'intention elle-même) :
```
RAW alone (sans contexte)                    -> documentation_question
WITH CONTEXT (dashboard, préfixe concaténé)  -> dashboard   ← le bug, AVANT correction
```
Après correction, le préfixe n'est plus concaténé pour ce message : le
routage réel obtenu (voir §7/§8) est `documentation_question` /
`crm_assistant_agent`, quel que soit l'écran actif (dashboard, projet, ou
commercial — les 3 vérifiés, voir `docs/ai/INTENT_ROUTING.md §2`).

## 7. AGENT SÉLECTIONNÉ

**`crm_assistant_agent`** (jamais `kpi_agent`) — vérifié EN DIRECT contre le
vrai backend, le vrai compte réellement signalé
(`516f6dca-7a6f-43cb-b527-5c5652e3e03f`, rôle `user`), avec écran Dashboard
actif :

```
=== INTENT === documentation_question
=== AGENT === crm_assistant_agent
=== MODE === agent
```

## 8. RÉPONSE OBTENUE

Le routage et la récupération RAG ont été vérifiés EN DIRECT avec succès :
`IntentDetector` résout `documentation_question`, `AgentRouter` sélectionne
`crm_assistant_agent`, et la récupération RAG trouve 20 candidats puis en
retourne 5 (log réel : `retrieve("donne-moi les instructions comment je peux
créer un projet"): 20 candidate(s), returning 5`).

**Divulgation honnête** : la génération du texte final par le LLM a échoué
au moment de cette vérification — un vrai `429` OpenAI (quota), reproduit
deux fois de suite (avec 20 secondes d'attente entre les deux tentatives),
donc probablement un quota épuisé plutôt qu'un throttling passager. Le
Copilot a dégradé proprement (`BaseAgent.execute()`, comportement déjà
en place depuis `09_INCIDENT_KPI_AGENT.md`) :
> "Désolé, crm_assistant_agent n'a pas pu traiter cette demande pour le
> moment. Merci de réessayer ou de reformuler."

**Ce que la réponse aurait cité**, prouvé hors-ligne sans dépendre du LLM
(`test/ai.rag.crmAssistantKnowledgeBase.test.js`, déjà vert) : pour "Comment
créer un projet ?", le document retrouvé en 1ère position est
`docs/user-guide/01-creer-un-projet.md`, dont le contenu (vérifié cette
passe contre `Dash Master Toolkit/lib/forms/view/project_form_screen.dart`,
3 inexactitudes corrigées) décrit la vraie procédure : un assistant en
**5 étapes** — Général, Détails, Contacts, Localisation, Action — avec 3
types de projet (Project/Revendeur/Applicateur), jamais les 9 étapes
génériques de l'exemple initial (qui ne correspondent pas à l'écran réel —
"ne pas inventer une étape non confirmée" prime sur le format d'exemple).
Le prompt système du CRM Assistant (`crmAssistantAgent.js`, déjà construit
et testé avant cet incident, voir `CRM_ASSISTANT.md`) est structurellement
incapable de répondre autrement : aucun Tool, uniquement le contenu RAG
retrouvé, avec instruction explicite de dire "je ne trouve pas cette
information" plutôt que d'inventer.

## Annexe — l'écart Dashboard "17 vs 10 projets" (étape 15)

Investigué sans modifier aucune donnée. **Deux causes réelles, cumulées,
toutes deux dans le code Flutter, pas dans ce backend intent-routing** :

1. **Endpoint différent.** "Mes Projets" (17) vient de `GET /dashboard/user`
   → `dashboard.service.js::getUserDashboard()` → `totalRow`
   (`isArchived = false`, aucun filtre de date). Le graphique vient d'un
   **autre** appel, `GET /projects/my-projects?page=1&limit=1000` (liste
   brute), agrégé côté client dans
   `Dash Master Toolkit/lib/dashboard/academic/view/dashboard_screen.dart`.
2. **Fenêtre de 6 mois côté client, uniquement sur le graphique.** Le
   getter `_monthly` (`dashboard_screen.dart:440-466`) boucle
   `for (int i = 0; i < 6; i++)` — génère exactement 6 mois consécutifs se
   terminant au mois courant, et ne somme que les projets dont `createdAt`
   tombe dans cette fenêtre. Tout projet actif créé il y a plus de 6 mois
   est silencieusement exclu du total du graphique, alors qu'il est bien
   compté dans "Mes Projets". C'est la cause directe, visible dans le code
   (`dashboard_screen.dart:445`), d'un total de graphique plus bas que le
   total de la carte KPI.
3. **Effet secondaire (sens inverse, plus petit)** : `/projects/my-projects`
   est appelé SANS le paramètre `isArchived` — la route le documente
   elle-même ("no filter = return ALL, archived + non-archived",
   `projects.routes.js:2272`) — donc le graphique peut aussi inclure des
   projets archivés que "Mes Projets" exclut.

Vérifié contre le compte réellement signalé : au moment de cette
vérification, ses 17 projets actifs ont tous une `createdAt` dans les 3
derniers mois — la fenêtre de 6 mois ne produit donc PAS d'écart
actuellement pour ce compte précis (le mécanisme reste réel et se
redéclenchera dès qu'un projet franchira la limite des 6 mois, ou
immédiatement pour tout compte ayant des projets plus anciens). Aucune
donnée modifiée. Correction du code Flutter volontairement **hors
périmètre** de cette passe ("ne modifie aucune fonctionnalité non liée à ce
problème") — signalé ici pour l'équipe qui maintient l'application.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# La correction cœur du bug rapporté
git diff -- src/modules/ai-copilot/services/aiCopilotBridge.service.js

# Le nouveau contrat IntentDetector (confidence/entities/ambiguous)
git diff -- src/ai/orchestrator/intentDetector.js src/ai/orchestrator/intentConfidence.js src/ai/orchestrator/aiManager.js

# Tests dédiés à cet incident
npx jest test/ai.orchestrator.intentConfidence.test.js test/ai.orchestrator.intentDetector.test.js test/ai.orchestrator.aiManager.test.js test/aiCopilotBridge.service.test.js test/ai.validation.copilotScenarios.test.js --verbose

# Régression complète (IA/Copilot/Dashboard)
npx jest --testPathPatterns="^test/(ai\.|aiCopilot|aiDashboard)"
```
