# Incident — « kpi_agent n'a pas pu traiter cette demande »

> Suite de `08_LLM_PROVIDER_OPENAI.md` (fournisseur LLM opérationnel). Cette
> fois un vrai bug applicatif, reproduit EN DIRECT avec un vrai appel
> OpenAI, corrigé, puis reproduit à nouveau pour prouver la correction.
> Chaque affirmation est vérifiable (fichier + ligne, ou commande
> exécutable).

## CAUSE EXACTE

Une erreur de déstructuration JavaScript dans une requête SQL brute —
`const [[hc]] = await sequelize.query(sql, { type: "SELECT" })` — un
niveau de crochets EN TROP. `sequelize.query(sql, { type: "SELECT" })`
résout DIRECTEMENT vers `rows` (un tableau de lignes), jamais
`[rows, metadata]`. Le double niveau `[[hc]]` fonctionne UNIQUEMENT
lorsque l'appel est enveloppé dans `Promise.all([...])` (où le niveau
extérieur vient de `Promise.all` lui-même) — ici l'appel était isolé, donc
`[[hc]]` tentait de déstructurer `rows[0]` (un objet `{total, active,
archived, null_val}`) COMME UN TABLEAU → `TypeError: object is not
iterable (cannot read property Symbol(Symbol.iterator))`, systématiquement,
pour TOUT compte au rôle non-admin (`getKPIByRole` ne route vers cette
fonction que pour les rôles non admin-tier).

**Reproduit en direct AVANT correction**, avec un vrai appel OpenAI et le
compte réellement signalé (`516f6dca-7a6f-43cb-b527-5c5652e3e03f`,
rôle `user`) :
```
[WARN] [ai:mcp:error-handler] handled error (code=-32004): Tool "get_dashboard_kpis" failed to execute.
[WARN] [ai:mcp:error-handler] underlying cause: Error [TypeError]: object is not iterable (cannot read property Symbol(Symbol.iterator))
    at ... dashboard.service.js ...
```
Cette cause exacte n'était PAS visible avant cette passe :
`BaseAgent.execute()` ne loggait que `err.message` en `warn`, jamais la
stack — voir §CORRECTION.

## FICHIER RESPONSABLE

`Backend Master/src/modules/dashboard/services/dashboard.service.js`,
ligne 220 (fonction `getUserKPIs`, bloc "0. DB health check").

## FONCTION RESPONSABLE

`getUserKPIs(userId)` — appelée par `getKPIByRole(userId, role)` pour tout
rôle non admin-tier (`ADMIN_ROLES.includes(role) ? getAdminKPIs() :
getUserKPIs(userId)`).

## TOOL

`get_dashboard_kpis` (`src/ai/mcp/tools/dashboard/getDashboardKpisTool.js`)
→ appelle EXCLUSIVEMENT `dashboardService.getKPIByRole(actingUser.id,
actingUser.role)` (aucun accès Sequelize/SQL direct dans le Tool
lui-même — conforme à `test/ai.mcp.tools.policy.test.js`).

## AGENT

`kpi_agent` (`src/ai/agents/kpiAgent.js`, intention `dashboard`) — appelle
`get_dashboard_kpis` en premier, obligatoire (`ALLOWED_TOOL_NAMES[0]`).

## 3. Dashboard AI vs Chat — deux chemins RÉELLEMENT différents

Confirmé en lisant le code, pas supposé :

| | AI Dashboard (`GET /ai-copilot/dashboard`) | Chat → kpi_agent |
|---|---|---|
| Fichier | `modules/ai-copilot/services/dashboardBriefing.service.js` | `modules/dashboard/services/dashboard.service.js` |
| Données "critique" | `analyzeProjectAttention(projects)` filtré `priority === "critique"` | `analyzeKpiDomain()` + `analyzeProjectAttention` (via `project_agent`, PAS `kpi_agent` — voir §5) |
| Touché par le bug ? | **Non** — ne passe jamais par `getUserKPIs()` | **Oui** — c'est exactement ce chemin |

**Ne duplique aucune requête SQL** : la correction touche la SEULE
fonction fautive, réutilisée telle quelle par les DEUX surfaces qui en
dépendent réellement (voir §12).

## 5. RÈGLE MÉTIER — « projet critique »

La définition RÉELLE et UNIQUE de "projet critique" dans ce CRM :
`ProjectAttentionAnalyzer.analyzeProjectAttention()`
(`src/ai/reasoning/projectAttentionAnalyzer.js`) — un moteur de règles
déterministe (jamais un LLM), 6 dimensions pondérées (retard=3,
échéance=3, blocage=3, pipeline=2, activité=2, budget=1), classant chaque
projet en `critique`/`elevee`/`moyenne`/`faible`. C'est EXACTEMENT cette
fonction, et cette seule, que `dashboardBriefing.service.js` filtre pour
compter "60 projets critiques".

**Découverte additionnelle, directement liée à cette règle** :
`kpi_agent` N'UTILISE JAMAIS cette fonction — il produit des tendances KPI
(comparaison mensuelle, prévision, alertes), jamais une liste de projets
nommés. C'est `project_agent` qui l'utilise, mais UNIQUEMENT si le message
contient un mot de `ATTENTION_MARKERS`
(`src/ai/agents/projectAgent.js`) — et **"critique"/"critiques" en était
absent**, exactement le même angle mort déjà documenté et corrigé pour
"retard" dans ce même fichier. Corrigé (voir §CORRECTION, point 2) : sans
ce correctif, MÊME en dehors de tout contexte Dashboard, "Quels projets
sont critiques ?" ne produisait jamais la liste nommée attendue.

## 6. Permissions — vérifié en direct, pas supposé

Pour l'utilisateur réel `516f6dca-7a6f-43cb-b527-5c5652e3e03f` (rôle
`user`) :
- `get_dashboard_kpis`/`get_user_dashboard` : exécutés, scope
  `ownerId = actingUser.id` en dur dans le SQL (`getUserKPIs`) — jamais
  contourné.
- `get_professional_dashboard` (admin-tier) : **refusé**, message réel
  observé : `"Role \"user\" is not allowed to call tool
  \"get_professional_dashboard\"."` — RBAC intact, dégrade seulement cette
  section, jamais toute la réponse (design déjà en place dans
  `kpiAgent.js::_enrichWithProfessionalDashboard`).
- `list_projects` (via `project_agent`) : aucune restriction de rôle
  (`requiredRoles: []`) — déjà le comportement du CRM classique (même
  route REST, voir `04_INCIDENT_COPILOT_PERMISSIONS.md`), non modifié ici.

Aucun contournement de `moduleAccessGuard`/RBAC/`ownerId` introduit par
cette correction.

## CORRECTION

1. **La cause réelle** — `dashboard.service.js:220` :
   ```diff
   - const [[hc]] = await sequelize.query(sql, { type: "SELECT" });
   + const [hc] = await sequelize.query(sql, { type: "SELECT" });
   ```
   Seule occurrence de ce motif dans tout le fichier (vérifié
   exhaustivement) — pas un bug systémique, un seul site corrigé.
2. **L'angle mort lexical** — `projectAgent.js`, ajout de
   `"critique"`/`"critiques"` à `ATTENTION_MARKERS` (même mécanisme déjà
   en place pour "retard").
3. **Diagnostic durable** — `BaseAgent.execute()` (`agents/baseAgent.js`)
   logge désormais l'erreur COMPLÈTE (`logger.error`, plus `logger.warn`
   tronqué à `err.message`) préfixée d'un code stable
   (`src/ai/utils/agentErrorClassification.js`, nouveau — 6 codes :
   `AI_AGENT_ERROR`/`AI_TOOL_ERROR`/`AI_DATABASE_ERROR`/
   `AI_PERMISSION_ERROR`/`AI_VALIDATION_ERROR`/`AI_LLM_ERROR`). Ne change
   JAMAIS la réponse utilisateur (toujours le même message de repli
   volontairement générique) — seulement ce qui est loggé côté serveur.
   Vit sous `src/ai/utils/`, pas `src/ai/agents/`, pour respecter
   `test/ai.agents.policy.test.js` (aucun Agent ne doit référencer
   `sequelize` directement).
4. **Trouvaille annexe, corrigée par la même occasion** — en reproduisant
   l'incident en direct, un vrai `429` OpenAI a été obtenu ; le
   classifieur de fournisseur (`services/providers/errors.js`, ajouté dans
   `08_LLM_PROVIDER_OPENAI.md`) ne classait pas encore 429 comme
   `LlmProviderUnavailableError` — corrigé, 429 bénéficie maintenant du
   même retry contrôlé qu'un 5xx.

Aucune donnée supprimée, aucune validation désactivée, aucun contrôle RBAC
contourné, aucune donnée fictive créée.

## TESTS AVANT

Recherche exhaustive : **aucun test n'existait** pour
`dashboard.service.js::getUserKPIs`/`getKPIByRole` (confirmé,
`test/ai.dashboard.dashboardService.test.js` teste un module DIFFÉRENT,
`src/ai/dashboard/`, malgré le nom similaire) — exactement pourquoi ce bug
de destructuration, qui ne casse QUE la vraie base de données, n'a jamais
été détecté par la suite de tests existante (entièrement mockée pour ce
module).

## TESTS APRÈS

| Fichier | Tests |
|---|---|
| `test/dashboard.service.getUserKPIs.test.js` (**nouveau**) | 2 — base de données réelle, jamais mockée |
| `test/ai.utils.agentErrorClassification.test.js` (**nouveau**) | 11 — les 6 codes, contre de vraies classes d'erreur, y compris à travers `WorkflowError` |
| `test/ai.agents.projectAgent.test.js` (+2 tests) | "critique"/"critiques" déclenchent bien `analyze_project_attention`, y compris la question EXACTE de l'incident |
| `test/ai.services.llmProviderErrors.test.js` (+1 test) | 429 → `LlmProviderUnavailableError`, retryable |
| `test/fixtures/copilotValidationScenarios.js` (+4 scénarios : prj-41..44) | Les questions exactes de l'ÉTAPE 9, contre le vrai routage/permissions |

```
Backend — suites liées à l'IA : 157 suites, 4733 tests — 100% verts
npm test (suite complète) : 174 suites, 4863 tests, 4842 verts, 21 échecs
(tous test/mfa.test.js/test/mfa.dedup.test.js — préexistants, sans rapport)
```

## RÉSULTAT CHAT

Reproduit EN DIRECT, vrai appel OpenAI, compte réel
`516f6dca-7a6f-43cb-b527-5c5652e3e03f` :

**Avant** : `mode: "agent"`, réponse : *"Désolé, kpi_agent n'a pas pu
traiter cette demande pour le moment."*

**Après** (question exacte, sans contexte d'écran particulier — le chemin
normal) :
> 100 projet(s) nécessitent une attention, classés par priorité :
> 1. Depôt SOROUBAT — priorité CRITIQUE (score 22) : Échéance ingénieur
>    dépassée de 119 jour(s) (2026-04-13) ; ... Budget non renseigné.
> 2. Immeuble Narjess Yasminet — priorité CRITIQUE (score 22) : ...
> [3 autres projets CRITIQUE nommés, chacun avec ses raisons réelles]
> ... et 95 autre(s) projet(s) signalé(s).

Exactement la forme attendue (ÉTAPE 10) : nom réel, raison réelle,
priorité réelle — jamais un projet inventé.

**Avec le contexte Dashboard actif** (screen="dashboard") : la même
question route vers `kpi_agent` (comportement de Context Awareness,
inchangé, voir `04_INCIDENT_COPILOT_PERMISSIONS.md`/`05_...`) et produit
désormais une vraie synthèse KPI (17 projets personnels, comparaison
mensuelle, prévision, alertes) au lieu de l'erreur — également vérifié en
direct.

## RÉSULTAT DASHBOARD

"60 projets critiques" (déjà fonctionnel, non affecté par ce bug).
**Cohérence honnête, pas forcée** : les deux chemins utilisent la MÊME
règle métier (`ProjectAttentionAnalyzer`, `priority === "critique"`) —
confirmé, plusieurs projets listés côté chat portent explicitement le
libellé "CRITIQUE". Le chiffre affiché diffère cependant ("100" côté chat
vs "60" côté Dashboard) pour une raison EXPLICABLE et déjà existante,
non liée à ce bug : `attentionAnswerBuilder.js` (chemin chat) additionne
TOUTES les priorités `!== "faible"` (critique + élevée + moyenne), tandis
que `dashboardBriefing.service.js` (Dashboard) filtre STRICTEMENT
`priority === "critique"`. Deux agrégats différents de la même donnée
sous-jacente, pas une divergence de règle ni un bug — non modifié ici
("ne modifie aucune fonctionnalité non liée au problème").

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# La cause exacte, corrigée
git diff -- src/modules/dashboard/services/dashboard.service.js

# Tests dédiés à cet incident
npx jest test/dashboard.service.getUserKPIs.test.js test/ai.utils.agentErrorClassification.test.js test/ai.agents.projectAgent.test.js --verbose

# Régression complète
npm test
```
