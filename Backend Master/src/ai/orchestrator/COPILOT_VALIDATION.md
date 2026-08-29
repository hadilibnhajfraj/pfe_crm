# Validation du Copilot — 500 conversations réalistes

Ce document décrit comment le Copilot est validé de bout en bout : un corpus de conversations réalistes couvrant chaque persona métier du CRM, et deux niveaux de tests automatisés qui vérifient, pour chacune, que le Copilot **sélectionne les bons outils** et **produit une réponse cohérente**, dans le respect des permissions de l'utilisateur.

## Où sont les fichiers

| Fichier | Rôle |
|---|---|
| `test/fixtures/copilotValidationScenarios.js` | Le corpus : 500 conversations, chacune annotée (intention, module, Agent, Tools, permissions, contexte, indice de réponse attendue). |
| `test/fixtures/copilotToolReference.js` | Transcription du manifeste réel des 74 Tools MCP (`requiredRoles`/`allowedEmails` par Tool) + mapping Tool → module — nécessaire hors-ligne (voir plus bas). |
| `test/ai.validation.copilotScenarios.test.js` | **Tier 1** : pour les 500 scénarios, vérifie intention/Agent/permissions/Tools/contexte contre le VRAI code. |
| `test/ai.validation.copilotEndToEnd.test.js` | **Tier 2** : pour un échantillon représentatif (un par intention, 18), exécute un tour de conversation complet via un VRAI `AIManager` et vérifie une réponse cohérente. |

## Le corpus — comment il est construit

Chaque scénario documente, pour une question réaliste en français :

```js
{
  id, persona, message, actingUser: {id, role, email?},
  expectedIntent, expectedModuleKey, expectedAgent,      // ou null
  expectedContext,                                        // "tools" | "rag"
  expectedAgentAllowed,                                   // true | false | null
  expectedTools,                                          // noms de Tools réels
  toolCheck,                                               // { tool, expectedAllowed } — vérification ciblée
  expectedResponseHint,                                    // ce qu'une bonne réponse doit faire
}
```

Réparti par intention (18 au total : les 14 du catalogue métier + les 4 capacités ajoutées lors des passes Business Analyst/Recommendation/Data Quality/Advanced Search), avec les 4 personas explicitement demandées largement couvertes :

| Intention | Persona | Nombre |
|---|---|---|
| `commercial_contacts` | Commercial | 40 |
| `projects` | Chef de projet | 40 |
| `hr` | RH | 34 |
| `dashboard` | Direction | 37 |
| `reporting` | Direction | 28 |
| `automation` | Direction / Administration | 31 |
| `business_analysis` | Direction | 24 |
| `recommendation` | Direction | 22 |
| `data_quality` | Direction | 21 |
| `advanced_search` | Direction | 23 |
| `users` | Administration | 26 |
| `pipeline` | Commercial | 26 |
| `maintenance` | Maintenance | 28 |
| `notifications` | Tous rôles | 24 |
| `industrial` | Industriel | 24 |
| `por_promesh` | Qualité / Production | 24 |
| `documentation_question` | Tous rôles | 24 |
| `general_chat` | Tous rôles | 24 |

**Total : 500 scénarios**, un par question — couvrant les 18 intentions du catalogue (`orchestrator/intentCatalog.js`), pas seulement les 4 personas de l'exemple donné.

### Une exigence non négociable : des mots-clés réellement reconnus

Le Copilot route par recouvrement lexical (`LexicalIntentRouter`, hors-ligne, sans LLM — voir `INTENT_CLASSIFIER.md`), avec une règle stricte : correspondance de TOKEN EXACT, jamais une racine ("fiches" au pluriel ne matche PAS le mot-clé "fiche" au singulier), et en cas d'égalité de score entre deux intentions, la première déclarée dans le catalogue l'emporte. Chaque message du corpus a donc été VÉRIFIÉ contre le vrai `DEFAULT_INTENT_CATALOG` (un script de diagnostic ad hoc, pas une resimulation manuelle) pour router vers l'intention annoncée — plusieurs collisions réelles ont été trouvées et corrigées pendant la construction du corpus (ex. "KPI" est un mot-clé à la fois de `commercial_contacts` ET `dashboard` ; "compte" est un mot-clé `users` qui apparaît accidentellement dans "combien de... compte..."). C'est une propriété RÉELLE du routeur de production, pas une limite de ce corpus — voir `INTENT_CLASSIFIER.md`/`TOOL_ROUTER.md` pour le même routeur documenté ailleurs.

## Tier 1 — intention, Agent, Tools, permissions, contexte (500 scénarios)

Pour CHAQUE scénario, contre le VRAI code (jamais une resimulation) :

1. **Intention attendue** — le VRAI `IntentDetector` (`createLexicalIntentDetector`), avec le VRAI `DEFAULT_INTENT_CATALOG`.
2. **Contexte attendu** — `intent.requiresTools`/`requiresRag`, lus directement sur l'entrée réelle du catalogue.
3. **Agent attendu + permission attendue** — les 11 VRAIS Agents (`agents/manifest.js::loadDefaultAgents`, construits avec de simples collaborateurs factices — aucun modèle LLM réel n'est nécessaire pour vérifier le ROUTAGE), et `isAuthorized()` (le VRAI prédicat de permission, partagé par `PermissionManager`/`BaseAgent`) contre le VRAI `requiredRoles` de l'Agent trouvé.
4. **AI Tools attendus** — pour une intention avec un Agent dédié (11 des 14), l'ensemble `allowedToolNames` du VRAI Agent (fixe, indépendant du message — la vérité la plus stable) ; pour les 3 intentions SANS Agent dédié (`users`, `hr`, `por_promesh`, voir `agents/manifest.js`), le VRAI `ToolRouter.select()`.
5. **Permission attendue au niveau Tool** — pour les scénarios qui ciblent une action sensible (`toolCheck`), `isAuthorized()` contre la transcription du manifeste MCP.

### Pourquoi une transcription du manifeste Tools plutôt que le vrai fichier

Le vrai `src/ai/mcp/tools/index.js` charge les 74 VRAIS `ServiceBackedTool`, qui chargent les VRAIS services métier CRM, qui chargent Sequelize (donc une configuration de base de données) — inutilisable dans une suite de tests rapide et hors-ligne (déjà la même limite documentée dans `test/ai.orchestrator.pipeline.test.js`, qui mocke le même module à plus petite échelle). `copilotToolReference.js` transcrit `{requiredRoles, allowedEmails}` pour les 74 Tools, extraits directement des fichiers source réels au moment de la rédaction — si cette transcription dérive de la réalité, les suites `test/ai.mcp.tools.*.test.js` (qui chargent le vrai manifeste avec une DB de test) le détecteraient déjà pour les modules qu'elles couvrent.

Les Agents, en revanche, N'ONT PAS cette limite : `BaseAgent` ne dépend que de `chatModel`/`workflowEngine` (aucune dépendance DB) — Tier 1 construit donc les 11 VRAIS Agents, sans transcription.

## Tier 2 — réponse cohérente, bout-en-bout (échantillon représentatif)

Un scénario représentatif PAR INTENTION (14), repris tel quel du corpus — jamais un message inventé pour l'occasion —, exécuté via un VRAI `AIManager` (mêmes classes réelles qu'en production : `ConversationManager`, `IntentDetector`, `AgentRouter` + les 11 vrais Agents, `ToolRouter`, `WorkflowManager`, `ResponseBuilder`). Un modèle de langage FACTIQUE tient lieu d'`ILlmProvider` (même technique que `test/ai.agents.*.test.js` partout ailleurs dans le kernel — aucun fournisseur réel n'est câblé par défaut, décision Sprint 0).

"Réponse cohérente" est vérifié comme :
- le tour se termine SANS exception ;
- l'enveloppe `ResponseBuilder` est bien formée (tous les champs du bon type — `citations`/`toolCalls`/`suggestions`/`dataQuality` sont des tableaux, `followUpQuestion`/`explanation` sont `string|null`) ;
- le bon `mode`/`agent` (quand un Agent est attendu) ;
- l'historique de conversation est journalisé avec le message ORIGINAL (jamais une version enrichie/modifiée) ;
- pour un scénario de refus de permission : `mode: "error"`, `answer: null`, un message qui ne fuite aucun détail interne (`AgentPermissionError`, un message jugé sûr — voir `responseBuilder.js`).

### Pourquoi un échantillon, pas les 500 scénarios bout-en-bout

Une fois le CÂBLAGE prouvé correct pour une intention donnée (le Tier 2 le prouve), il s'applique UNIFORMÉMENT à toute variation du message qui route vers la même intention (le Tier 1 le prouve, pour les 500). Répéter le test bout-en-bout 500 fois exécuterait le même chemin de code 500 fois avec seulement le message d'entrée qui change — aucune garantie supplémentaire, seulement du temps de test perdu. C'est le même principe de non-redondance déjà appliqué ailleurs dans ce kernel (voir par exemple `BUSINESS_REASONING.md`, qui teste chaque RÈGLE isolément plutôt que de re-tester la combinatoire complète à chaque fois).

## Ce qui n'est PAS validé ici (limite assumée)

- **Le contenu exact d'une réponse en langage naturel** — aucun fournisseur LLM réel n'est câblé (Sprint 0). `expectedResponseHint` (par scénario) documente ce qu'une bonne réponse devrait faire une fois un LLM réel branché — un point de départ pour une future suite de validation avec un vrai modèle, pas une promesse tenue par CES tests.
- **Le contenu réel des données CRM** — tous les Tools sont factices dans ce corpus ; la validation porte sur le CÂBLAGE (quelle intention, quel Agent, quels Tools, quelles permissions), pas sur l'exactitude des données métier elles-mêmes (déjà couverte par les suites `test/ai.mcp.tools.*.test.js`, `test/modules.*` etc., par service).
- **Les 3 intentions sans Agent dédié** (`users`/`hr`/`por_promesh`) sont bien incluses dans les 18 scénarios représentatifs du Tier 2 (chemin `WorkflowManager` générique, pas `AgentRouter`) — mais avec un chatModel factice qui répond toujours `final_answer` directement, le choix RÉEL entre Tool-calling et repli RAG (`intent.requiresTools` sans Tool pertinent trouvé) n'est pas exercé ici ; il est déjà couvert par `test/ai.orchestrator.workflowManager.test.js`.

## Lancer la validation

```bash
npx jest test/ai.validation.copilotScenarios.test.js test/ai.validation.copilotEndToEnd.test.js
```
