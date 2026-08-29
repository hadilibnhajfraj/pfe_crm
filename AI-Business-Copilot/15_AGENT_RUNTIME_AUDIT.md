# Audit de la couche commune d'exécution des Agents

> Suite de `13_LLM_QUOTA_ROOT_CAUSE.md`/`14_PROJECT_ANALYSIS_ROUTING.md`.
> Cette passe ne traite plus agent par agent : elle audite le runtime
> PARTAGÉ (`BaseAgent`/`ToolCallingChain`/`QaChain`/`LlmProviderChatModel`)
> et prouve, test par test, quelle couche est réellement en cause pour
> `crm_assistant_agent`, `project_agent` et `meeting_agent`. Router/Intent
> Detector non modifiés. Aucun nouvel Agent créé. Flutter non touché. RBAC
> jamais contourné.

## ARCHITECTURE

```
Flutter → POST /ai-copilot/chat (ou WS ai-copilot:send)
  → aiCopilotBridge.service.js::sendMessageAsActingUser()      [OK]
  → AIManager.handleMessage()                                   [OK]
      → IntentDetector.detect()                                 [OK]
      → AgentRouter.select() → AgentRegistry.findHandler()       [OK]
      → Agent.execute()  ←── COUCHE COMMUNE (voir ci-dessous)
          → BaseAgent._run()
              → ToolCallingChain.invoke()  (project_agent/meeting_agent/kpi_agent)
                  ou QaChain.invoke()      (crm_assistant_agent)
                      → RagContextBuilder.buildContext() → IRetriever   [OK]
                      → Tool.execute() → Service → Repository → Sequelize/PostgreSQL  [OK, 1 bug trouvé et corrigé — voir plus bas]
                  → LlmProviderChatModel._generate() → OpenAiProvider._completeOnce()  [FAIL — voir CAUSE EXACTE]
      → ResponseBuilder.build()                                  [OK]
  → _audit() (observabilité)                                     [OK]
→ Flutter (non testé dans cette passe, backend uniquement)
```

## COUCHE COMMUNE RESPONSABLE

`src/ai/agents/baseAgent.js::BaseAgent` — la SEULE classe d'exécution
partagée par les 16 Agents (`crm_assistant_agent`/`project_agent`/
`meeting_agent`/`kpi_agent` compris, confirmé par lecture : les 4
`extends BaseAgent`, aucune classe "AgentRuntime"/"AgentExecutor" séparée
n'existe dans ce kernel). `execute()` → `_run()` (par défaut : Tool-calling
si des Tools sont autorisés, sinon `qaChain`) → `LangChainWorkflowEngine`
→ `LlmProviderChatModel` → `ILlmProvider` (`OpenAiProvider`, seul
fournisseur configuré). Le message générique "n'a pas pu traiter cette
demande" vient d'un seul et même endroit : `BaseAgent._fallbackAnswer()`
(`baseAgent.js:196`), déclenché par le `catch` de `execute()`
(`baseAgent.js:138-172`).

## CAUSE EXACTE — DEUX causes distinctes, pas une seule

**1. Cause PRINCIPALE, commune aux 3 agents rapportés** : le quota OpenAI
est toujours épuisé (`insufficient_quota`/`credit_balance_exhausted`),
déjà diagnostiqué dans `13_LLM_QUOTA_ROOT_CAUSE.md`, reproduit une 4e fois
dans cette passe (TEST 1) — cause externe, aucun bug de code.

**2. Cause SECONDAIRE, réelle, propre à `project_agent`, découverte dans
cette passe** : `project.service.js::listProjects()` ignorait
SILENCIEUSEMENT le paramètre `mine` quand il arrivait comme un VRAI
booléen JavaScript (`{mine: true}`) plutôt que la chaîne `"true"`. Le Tool
MCP `list_projects` déclare `mine: Joi.boolean()` — un appel LLM réel
produit donc naturellement `{"mine": true}` (JSON), jamais la chaîne
`"true"`. Conséquence : **même une fois le quota OpenAI restauré, "donne
moi les projets associés à Hadil" (ou toute question de type "mes
projets") aurait listé TOUS les projets (185 observés en test direct) au
lieu des 17 projets réels de l'utilisateur** — un vrai bug de périmètre de
données, indépendant du LLM, qui serait resté invisible même après
correction du quota.

## ERREUR RÉELLE

Cause 1 (commune) :
```json
{"error":{"message":"You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.","type":"insufficient_quota","code":"credit_balance_exhausted"}}
```

Cause 2 (`project_agent` uniquement — silencieuse, aucune exception levée,
c'est ça le problème) :
```
listProjects({mine: true}, "516f6dca-...") → total: 185   (AVANT correction — faux : tous les projets)
listProjects({mine: true}, "516f6dca-...") → total: 17    (APRÈS correction — correct : ses projets)
```

## FICHIER

- `src/ai/services/providers/openAiProvider.js` (cause 1, ligne 77 — déjà identifié dans `13_LLM_QUOTA_ROOT_CAUSE.md`).
- `src/modules/projects/services/project.service.js` (cause 2, ligne 22, fonction `listProjects`).

## FONCTION

`OpenAiProvider._completeOnce()` ; `project.service.js::listProjects()`
(nouvelle fonction utilitaire `isTruthyFlag()` ajoutée dans le même
fichier).

## AGENTS AFFECTÉS

- **Les 4** (`crm_assistant_agent`/`project_agent`/`meeting_agent`/`kpi_agent`) par la cause 1 (LLM Provider) — confirmé : TEST 3 (agent minimal générique, sans logique métier) échoue EXACTEMENT pareil.
- **`project_agent` seul**, en plus, par la cause 2 — corrigée, vérifiée contre la vraie base de données (17 projets exacts pour le compte réellement signalé).

## CORRECTION EFFECTUÉE

**Couche commune (LLM Provider)** : aucune correction de code possible ici
— cause externe (quota/billing). Observabilité déjà renforcée dans
`13_LLM_QUOTA_ROOT_CAUSE.md` (corps de réponse réel désormais journalisé).

**`project.service.js`** (UNE seule correction, jamais dupliquée dans
chaque agent — conforme à la consigne) :
```diff
- const mine = query.mine === "true" || query.myProjects === "true";
+ const mine = isTruthyFlag(query.mine) || isTruthyFlag(query.myProjects);
  ...
- isArchived: query.isArchived === "true",
+ isArchived: isTruthyFlag(query.isArchived),
```
où `isTruthyFlag(v) = v === true || v === "true"` — accepte les DEUX
formes (chaîne Express existante ET booléen JSON du Tool MCP), jamais une
régression pour les appelants existants (`project.controller.js`/
`kanban.controller.js`, vérifiés par leurs tests de route, toujours verts).
**Note honnête, hors périmètre de cette passe** : le même motif existe
aussi dans `kanban.service.js::getKanbanBoard()` (`mine === "true"`) —
laissé INTACT : cette fonction n'est appelée QUE depuis
`kanban.controller.js` avec un vrai `req.query.mine` (toujours une
chaîne), jamais depuis un Tool MCP — pas un bug atteignable par le Copilot,
donc pas touché (« ne pas modifier ce qui n'est pas lié au problème »).

## Statut

| Vérification | Résultat |
|---|---|
| LLM_PROVIDER | **FAIL** — quota OpenAI épuisé (`insufficient_quota`/`credit_balance_exhausted`), cause externe |
| RAG | **PASS** — 5 citations réelles retournées pour "Comment créer un projet ?", contexte correctement construit |
| AGENT RUNTIME | **PASS** — `BaseAgent`/`ToolCallingChain`/`QaChain` fonctionnent correctement ; l'échec se produit exactement au même point (`OpenAiProvider._completeOnce`) pour un agent minimal SANS logique métier, prouvant que le runtime commun n'est pas en cause |
| CRM ASSISTANT | **FAIL** (bloqué par LLM_PROVIDER) — code vérifié correct indépendamment (RAG réel de bout en bout testé avec un `chatModel` scripté, `test/ai.diagnosis.crmAssistantAgent.realRag.test.js`, déjà vert) |
| PROJECT AGENT | **FAIL** (bloqué par LLM_PROVIDER) — **+ 1 bug réel trouvé et corrigé** (`mine` booléen ignoré), vérifié contre la vraie base de données après correction |
| MEETING AGENT | **FAIL** (bloqué par LLM_PROVIDER) — code vérifié correct indépendamment (conversation à 6 tours avec mémoire réelle, `test/ai.diagnosis.meetingAgent.conversation.test.js`, déjà vert) |
| KPI AGENT | **FAIL** (bloqué par LLM_PROVIDER) — Tool `get_dashboard_kpis` testé directement contre la vraie base de données : PASS (17 projets, cohérent avec la correction `project_agent`) |
| TOOLS | **PASS** — `list_projects` (corrigé + revérifié), `get_dashboard_kpis`, les 4 Tools `googleCalendar` (déjà vérifiés en `11_MEETING_AGENT_FIX.md`) |
| RBAC | **PASS** — `isAuthorized()` correct pour le rôle `user` ; le scope `ownerId`/`mine` est maintenant réellement appliqué (avant la correction, son ABSENCE d'effet aurait exposé les projets de TOUS les utilisateurs à un rôle `user` demandant "mes projets" — un vrai problème de périmètre de données, maintenant corrigé) |
| FLUTTER | **Non testé** (consigne : backend uniquement dans cette passe, aucun fichier touché) |

## Matrice des Tools

| Agent | Tool | Test | Résultat |
|---|---|---|---|
| `crm_assistant_agent` | *(aucun — RAG uniquement)* | Retrieval réel, contexte réel | PASS |
| `project_agent` | `list_projects` | Appel direct réel (`{mine:true}`, compte réel) | **PASS après correction** (185 → 17, correct) |
| `kpi_agent` | `get_dashboard_kpis` | Appel direct réel (compte réel) | PASS (17, cohérent) |
| `meeting_agent` | `get_calendar_status`/`create_calendar_event`/`update_calendar_event`/`delete_calendar_event` | Conversation scriptée à 6 tours (`11_MEETING_AGENT_FIX.md`) | PASS |

## TEST MATRIX (étape 17)

| # | Test | Résultat | Erreur exacte |
|---|---|---|---|
| 1 | LLM direct ("Reply OK") | **FAIL** | `LlmProviderUnavailableError` — `insufficient_quota`/`credit_balance_exhausted` |
| 2 | RAG direct ("Comment créer un projet ?") | **PASS** | — (5 citations, contexte de 1308 caractères) |
| 3 | Agent minimal (Tool trivial, sans logique métier) | **FAIL** | Même erreur qu'au test 1, exactement au même point de la stack |
| 4 | CRM Assistant ("Comment créer un projet ?") | **FAIL** (bout-en-bout) / PASS (code, RAG isolé du LLM) | Idem test 1 |
| 5 | Project Agent (Tool `list_projects`, "mes projets") | **FAIL avant correction, PASS après** | `mine` booléen silencieusement ignoré (aucune exception — un bug de LOGIQUE, pas une erreur levée) |
| 6 | Meeting Agent (collecte d'informations) | **PASS** (code, conversation scriptée) / FAIL (bout-en-bout, LLM réel) | Idem test 1 pour le bout-en-bout |
| 7 | KPI Agent (Tool `get_dashboard_kpis`) | **PASS** (Tool direct) / FAIL (bout-en-bout, LLM réel) | Idem test 1 pour le bout-en-bout |

## TESTS APRÈS CORRECTION

```
npm test (suite complète)
Test Suites: 2 failed, 178 passed, 180 total
Tests:       21 failed, 5073 passed, 5094 total
```
+1 suite, +52 tests nets (`test/project.service.listProjects.test.js`,
nouveau, 3 tests contre la VRAIE base de données — aucun mock — dont la
vérification exacte du compte réellement signalé : 17 projets, jamais 185).
Les 21 échecs restants sont exclusivement `test/mfa.test.js`/
`test/mfa.dedup.test.js` — préexistants, sans aucun rapport.

## Note secondaire — qualité RAG (constatée, non corrigée dans cette passe)

En testant le RAG contre le corpus COMPLET de production (`DEFAULT_CORPUS_ROOTS`,
47 documents/1445 chunks — `docs/`, `AI-Business-Copilot/`, PDF
d'architecture), le document remonté en 1ère position pour "Comment créer
un projet ?" est désormais `docs/ai/INTENT_ROUTING.md` (un document
d'ingénierie interne sur le routage du Copilot, qui cite abondamment cette
question en exemple) plutôt que `docs/user-guide/01-creer-un-projet.md`
(le vrai guide utilisateur). Ceci n'est PAS la cause des échecs rapportés
(le RAG reste fonctionnel, retourne des citations réelles, ne lève aucune
exception) mais dégraderait la PERTINENCE des réponses du CRM Assistant une
fois le LLM disponible. Non corrigé ici (hors périmètre : aucun agent ne
"échoue" à cause de ceci) — signalé pour un futur passage dédié au
périmètre du corpus RAG.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# La correction (project.service.js)
git diff -- src/modules/projects/services/project.service.js

# Test dédié, vraie base de données
npx jest test/project.service.listProjects.test.js --verbose

# Régression complète
npm test
```
