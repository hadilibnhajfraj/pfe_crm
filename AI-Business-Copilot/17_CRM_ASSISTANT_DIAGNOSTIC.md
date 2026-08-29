=== CRM ASSISTANT DIAGNOSTIC ===

**Agent** : `crm_assistant_agent`

**Intent** : `documentation_question`

**Entity** : `project`

**Action** : (lecture seule — `mode = READ_ONLY`, jamais `createProject`)

**Étape qui échoue** : l'appel HTTP au fournisseur LLM
(`OpenAiProvider._completeOnce()`), **pas** le routage, **pas** le RAG,
**pas** le Context Builder, **pas** `crm_assistant_agent` lui-même.
Reproduit une 5e fois dans cette session (incidents 12/13/15/16/17),
identique à chaque fois.

**Erreur réelle** :
```json
{"error":{"message":"You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.","type":"insufficient_quota","code":"credit_balance_exhausted"}}
```

**Fichier** : `src/ai/services/providers/openAiProvider.js`, ligne 77.

**Fonction** : `OpenAiProvider._completeOnce()`.

**Cause** : le compte OpenAI associé à `AI_LLM_API_KEY` (`.env`) n'a plus
de crédit. Externe, confirmé en direct à l'instant (voir §TESTS, LLM :
FAIL) — **conformément à l'étape 3 de la demande, le diagnostic s'arrête
ici pour la couche LLM : aucune modification de code ne peut réparer un
compte sans crédit.**

**Correction** : aucune correction de code de `crm_assistant_agent`
n'était nécessaire ni possible pour CE symptôme — vérifié exhaustivement
(voir §TESTS) que chaque couche EN AMONT du LLM (routage, RAG, Context
Builder, structure de sortie, sécurité) est correcte et prête à fonctionner
dès que le compte aura du crédit. Une seule amélioration réelle apportée
dans cette passe, à `crm_assistant_agent` uniquement (aucune autre couche
touchée) : le prompt système contenait déjà, de fait, la garantie
"n'effectue aucune écriture" (architecturale : `allowedToolNames: []`) mais
ne le disait pas explicitement dans son propre texte — ajouté pour la
défense en profondeur (`crmAssistantAgent.js`, 3 lignes ajoutées).
**Action réelle requise, hors de ce backend** : ajouter du crédit sur
https://platform.openai.com/settings/organization/billing/.

## Trace complète (étape 1/2)

```
Flutter → POST /ai-copilot/chat
  → aiCopilotBridge.service.js::sendMessageAsActingUser()          [OK]
  → AIManager.handleMessage()                                       [OK]
      → IntentDetector.detect() → documentation_question (0.95)     [OK]
      → isAuthorized() → aucune restriction                         [OK]
      → AgentRouter.select() → crm_assistant_agent                  [OK]
      → BaseAgent.execute() → _run() → qaChain.invoke()             [OK]
          → RagContextBuilder.buildContext() → IRetriever           [OK — 5 citations réelles]
          → QaChain : ChatPromptTemplate → LlmProviderChatModel     [ÉCHOUE ICI]
              → OpenAiProvider._completeOnce() → axios POST         [FAIL — 429 insufficient_quota]
      → catch (baseAgent.js:138) → classifyAgentError() → [AI_LLM_ERROR]
      → logger.error(... conversationId=..., err) — stack RÉELLE, jamais masquée (voir 12_AGENT_FAILURE_DIAGNOSIS.md)
      → _fallbackAnswer() → réponse dégradée générique, jamais une exception qui fuite
  → Flutter reçoit mode:"agent", answer dégradée
```
Le catch qui produit le message générique est `BaseAgent.execute()`
(`baseAgent.js:138-172`) — déjà instrumenté (incident 12) pour journaliser
`[code] ... (conversationId=...) : message` + la VRAIE stack (jamais
masquée depuis la correction de `secretRedaction.js`, voir
`12_AGENT_FAILURE_DIAGNOSIS.md`). Aucune clé/JWT/mot de passe/secret n'est
jamais journalisé (vérifié par `test/ai.security.secretRedaction.test.js`).

## Format de sortie (étape 7)

`BaseAgent._run()` renvoie `{ answer: string, citations: Citation[],
toolSteps: object[] }` — le MÊME contrat pour les 16 Agents, `AIManager`
attend exactement cette forme (`ResponseBuilder.build()`). Aucune
incompatibilité de schéma — confirmé par lecture et par
`test/ai.diagnosis.crmAssistantAgent.realRag.test.js` (le vrai
`agent.execute()` retourne bien `answer`/`citations` correctement remplis
quand le LLM répond).

## Vraie structure du formulaire Flutter (étape 9, déjà vérifiée et corrigée — 10_INTENT_ROUTING_FIX.md)

Vérifié contre `Dash Master Toolkit/lib/forms/view/project_form_screen.dart`
(pas supposé) : un VRAI assistant en **5 étapes** — Général, Détails,
Contacts, Localisation, Action — avec 3 types de projet
(Project/Revendeur/Applicateur). Documenté dans
`docs/user-guide/01-creer-un-projet.md`, déjà ingéré par le RAG. **Jamais
les 9 étapes génériques de l'exemple de la demande** ("Ouvrez Projects...
Configurez les actions...") — ces 9 étapes ne correspondent pas à l'écran
réel du CRM, donc jamais affirmées (le prompt l'interdit explicitement).

## === TESTS ===

| Couche | Résultat |
|---|---|
| **LLM** | **FAIL** — `429 insufficient_quota`/`credit_balance_exhausted`, reproduit en direct à l'instant |
| **RAG** | **PASS** — `retrieve("comment créer un nouveau projet")` → 5 citations réelles, dont `"Comment créer un projet dans le CRM"` |
| **ContextBuilder** | **PASS** — `contextText` de 1303 caractères, gabarit `[1]...[5]` correct, extrait réel du guide présent |
| **CRM Assistant** | **PASS** (code) / FAIL (bout-en-bout, bloqué uniquement par LLM) — `test/ai.diagnosis.crmAssistantAgent.realRag.test.js`, 4/4 verts, chaîne complète RAG→prompt→LLM(scripté)→réponse prouvée correcte |
| **Output Parser** | **PASS** — `StringOutputParser`/`{answer, citations}` conformes, aucune incompatibilité de schéma |
| **Flutter** | **Non testé** (backend uniquement dans cette passe, conformément à l'étape 15) |

## Sécurité (étape 13)

`crm_assistant_agent` a `allowedToolNames: []` — **structurellement
incapable** d'appeler le moindre Tool MCP, donc incapable de tout
INSERT/UPDATE/DELETE, quelle que soit la question posée. Ce n'est pas une
promesse du prompt (bien que le prompt le dise désormais aussi
explicitement, voir CORRECTION) : c'est une garantie architecturale,
vérifiée par `test/ai.agents.crmAssistantAgent.test.js` ("un Tool
disponible n'est jamais appelé — répond toujours via qaChain").

## Fichiers modifiés

- `src/ai/agents/crmAssistantAgent.js` — 3 lignes ajoutées au prompt (défense en profondeur explicite, aucun comportement changé).
- `test/ai.agents.crmAssistantAgent.test.js` — +2 tests verrouillant ce texte.

**Aucun autre fichier touché** — IntentDetector/AgentRouter/Flutter/KPI
Agent/Meeting Agent/Project Agent non modifiés (consigne respectée : aucune
dépendance directe démontrée qui l'aurait justifié).

## Note honnête — trouvée pendant l'audit RAG, non corrigée (hors périmètre)

Contre le corpus RAG COMPLET de production (`docs/`, `AI-Business-Copilot/`,
PDF — 47 documents/1445+ chunks), le document remonté en 1ère position pour
cette question est désormais `docs/ai/INTENT_ROUTING.md` (documentation
technique interne sur le routage du Copilot, qui cite abondamment cette
question en exemple) plutôt que `docs/user-guide/01-creer-un-projet.md` (le
vrai guide). Déjà signalé dans `15_AGENT_RUNTIME_AUDIT.md`. Le RAG reste
fonctionnel (5 citations réelles, aucune exception) — c'est une question de
PERTINENCE du classement, pas une panne. Corriger proprement demanderait de
donner à `crm_assistant_agent` un retriever dédié, scopé à
`docs/user-guide/` (distinct du retriever partagé avec `assistant_agent`)
— une vraie modification d'architecture partagée
(`orchestrator/pipeline.js`/`agents/manifest.js`/`aiCopilotBridge.service.js`),
donc délibérément PAS faite dans cette passe (consigne : le problème ciblé
est `crm_assistant_agent`, pas une refonte du RAG partagé — et "ne pas
recréer le RAG"). Signalé ici pour une passe dédiée si souhaité.

## === TEST FINAL ===

**Question** : "comment créer un nouveau projet"

**Réponse** :
```
Désolé, crm_assistant_agent n'a pas pu traiter cette demande pour le moment. Merci de réessayer ou de reformuler.
```
Inchangée par rapport à avant cette passe — **attendu et honnête** : la
cause est externe (quota OpenAI), aucune ligne de code de
`crm_assistant_agent` ne peut produire une réponse sans un fournisseur LLM
disponible. Une fois le crédit ajouté sur le compte OpenAI, la MÊME
question, avec le MÊME code déjà vérifié à chaque étage (routage/RAG/
contexte/sortie), produira une procédure réelle en 5 étapes basée sur
`docs/user-guide/01-creer-un-projet.md`.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# LLM direct — reproduit la cause exacte
node -e "
require('dotenv').config();
const { createLlmProvider } = require('./src/ai/services/providers');
createLlmProvider({ provider: process.env.AI_LLM_PROVIDER, model: process.env.AI_LLM_MODEL, apiKey: process.env.AI_LLM_API_KEY })
  .complete([{ role: 'user', content: 'Réponds uniquement par OK.' }])
  .then(r => console.log('PASS:', r))
  .catch(e => console.log('FAIL:', e.name, e.message));
"

# RAG + ContextBuilder + CRM Assistant, chaîne complète
npx jest test/ai.diagnosis.crmAssistantAgent.realRag.test.js test/ai.agents.crmAssistantAgent.test.js --verbose

# Régression complète
npm test
```
