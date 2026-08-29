# Diagnostic — pourquoi crm_assistant_agent et meeting_agent échouent après un routage correct

> Suite de `11_MEETING_AGENT_FIX.md` (routage confirmé correct : les deux
> agents attendus sont bien sélectionnés). Cette passe ne touche NI le
> Router NI l'IntentDetector — aucun bug de routage n'a été identifié, donc
> aucune modification n'y a été faite, conformément à la consigne. Diagnostic
> pur, avec preuves reproductibles (offline pour le RAG/la conversation,
> en direct pour la cause finale).

## CRM ASSISTANT

**Cause exacte** : aucun bug dans `crm_assistant_agent`, son prompt, ou le
pipeline RAG. La cause réelle est externe : le fournisseur OpenAI renvoie
un `429` (quota épuisé) sur CHAQUE appel, reproduit 3 fois de suite dans
cette session (`10_INTENT_ROUTING_FIX.md`, `11_MEETING_AGENT_FIX.md`, et à
nouveau ici), avec retry contrôlé (2 tentatives, `withControlledRetry`)
échouant systématiquement. `BaseAgent.execute()` capture cette erreur et
renvoie la réponse dégradée générique — **le comportement attendu**, pas
un bug (voir `09_INCIDENT_KPI_AGENT.md`, qui a construit exactement ce
filet de sécurité). Le vrai problème AVANT cette passe : la cause réelle
était invisible dans les logs serveur (voir §Étape 1 ci-dessous) — corrigé.

**Fichier** : aucun fichier de `crm_assistant_agent` modifié (`src/ai/agents/crmAssistantAgent.js`
inchangé — vérifié correct par diagnostic, pas par correction).

**Fonction** : `qaChain.invoke()` (`src/ai/langchain/chains/qaChain.js`) →
`RagContextBuilder.buildContext()` (`src/ai/langchain/context/ragContextBuilder.js`)
→ `RagRetrievalService.retrieve()` → `LlmProviderChatModel._generate()` →
`OpenAiProvider._completeOnce()` (**c'est ICI, précisément, que l'échec se
produit** — confirmé par la vraie stack technique, voir §Étape 1).

**Correction** : aucune correction de logique métier nécessaire (rien n'est
cassé). Deux corrections d'OBSERVABILITÉ, pour que la vraie cause soit
visible la PROCHAINE fois sans re-diagnostiquer à la main :
1. `src/ai/utils/secretRedaction.js` — `redact(err)` construisait un
   `new Error(...)` dont la stack pointait vers la fonction de redaction
   elle-même, jamais vers l'origine réelle de l'erreur ; et perdait
   silencieusement `.cause` (la cause réelle enveloppée par `WorkflowError`).
   Corrigé : la VRAIE stack (redactée par précaution) et `.cause`
   (récursivement redacté) sont désormais préservés.
2. `src/ai/agents/baseAgent.js::execute()` — le `conversationId` (corrélation
   d'un tour) est désormais explicitement dans le message de log, en plus du
   code de classification déjà présent depuis `09_INCIDENT_KPI_AGENT.md`.

**Tests** : `test/ai.security.secretRedaction.test.js` (+4, stack/cause
préservés) ; `test/ai.agents.baseAgent.test.js` (+3, log enrichi vérifié
avec un logger espionné) ; `test/ai.diagnosis.crmAssistantAgent.realRag.test.js`
(**nouveau**, 4 tests — pipeline RAG RÉEL de bout en bout, `chatModel` seul
factice, voir §RAG ci-dessous).

## MEETING AGENT

**Cause exacte** : identique à CRM Assistant — même `429` OpenAI, même
mécanisme de dégradation, aucun bug dans `meeting_agent` lui-même. Le
comportement conversationnel demandé (poser des questions, mémoriser,
confirmer avant de créer) était déjà correctement CÂBLÉ dans le prompt et
l'architecture (`ToolCallingChain`, `ConversationManager`) mais n'avait
JAMAIS été vérifié bout-en-bout depuis sa création dans `11_MEETING_AGENT_FIX.md`
— fait dans cette passe (voir §Tests).

**Fichier** : `src/ai/agents/meetingAgent.js` — **prompt renforcé**, aucune
autre modification (Tools/intention/permissions inchangés).

**Fonction** : `ToolCallingChain.invoke()` (`src/ai/langchain/chains/toolCallingChain.js`)
→ même chaîne d'appel LLM que CRM Assistant → même point d'échec réel
(`OpenAiProvider._completeOnce()`).

**Correction** : le prompt système ne mentionnait pas explicitement la
phrase de confirmation attendue ("Confirmez-vous...?") ni le fait de poser
les questions UNE PAR UNE. Renforcé (additif, aucun Tool/intention/
permission changé) :
```diff
- "Avant de créer un événement, tu dois obtenir : le sujet de la réunion,",
- "la date et l'heure de début, et la date et l'heure de fin (ou une durée",
- "permettant de la calculer). Si l'une de ces informations manque, ne",
- "l'invente jamais : pose une question précise pour l'obtenir.",
+ "Avant de créer un événement, tu dois obtenir : le sujet de la réunion,",
+ "la date et l'heure de début, et la date et l'heure de fin (ou une durée",
+ "permettant de la calculer). Si une ou plusieurs informations manquent,",
+ "ne les invente jamais : pose UNE SEULE question à la fois pour obtenir",
+ "l'information manquante suivante, jamais plusieurs questions d'un coup.",
+ "Une fois toutes les informations réunies, récapitule-les clairement puis",
+ "demande explicitement : \"Confirmez-vous la création de cette réunion ?\".",
+ "N'appelle create_calendar_event QUE si l'utilisateur a répondu",
+ "positivement à cette question de confirmation, jamais avant.",
```

**Tests** : `test/ai.diagnosis.meetingAgent.conversation.test.js` (**nouveau**,
2 tests) — le test principal simule une VRAIE conversation en 6 tours avec
`ConversationManager`/`InMemoryConversationMemory` réels (jamais une
deuxième mémoire), un `chatModel` scripté tour par tour (seule dépendance
factice — le fournisseur LLM réel est indisponible, voir plus haut), et
prouve : (1) aucune création tant que sujet/début/fin ne sont pas connus,
(2) chaque réponse de l'utilisateur atteint bien le tour suivant via
l'historique réel, (3) un récapitulatif + une demande de confirmation
explicite avant tout appel de Tool, (4) `create_calendar_event` appelé avec
EXACTEMENT les 3 paramètres réels (`summary`/`startDateTime`/`endDateTime`)
— jamais un champ "participants" inventé (absent du Tool réel, voir
`11_MEETING_AGENT_FIX.md §6`) —, et SEULEMENT après confirmation.

## Étape 1 — ne plus masquer l'erreur (détail technique)

Avant cette passe, le code réel de classification (`[AI_LLM_ERROR]`, déjà
construit dans `09_INCIDENT_KPI_AGENT.md`) ET le message complet
atteignaient déjà les logs — mais **jamais la vraie stack technique** :
`redact(err)` remplaçait systématiquement la stack d'origine par une pile
factice pointant vers `secretRedaction.js` lui-même. Reproduit et corrigé,
preuve en direct (compte réel, avant/après) :

**Avant** (stack factice, inutile pour diagnostiquer) :
```
at redact (secretRedaction.js:60:27)
at Object.error (logger.js:19:104)
at BaseAgent.execute (baseAgent.js:155:19)
```

**Après** (stack réelle, jusqu'au point d'échec exact) :
```
at classifyProviderHttpError (services/providers/errors.js:73:58)
at OpenAiProvider._completeOnce (services/providers/openAiProvider.js:77:13)
at withControlledRetry (services/providers/retry.js:28:14)
at LlmProviderChatModel._generate (langchain/model/llmProviderChatModel.js:48:18)
... (cause complète également visible pour meeting_agent, via WorkflowError.cause)
```

Chaque log d'échec porte désormais, sans jamais exposer de secret
(clé API/JWT/mot de passe — `secretRedaction.js` inchangé sur ce plan) :
`agent` (préfixe de namespace du logger), `intent`, `conversationId`
(corrélation), le code de classification (`error type`), le message
complet, et la VRAIE stack + `.cause`.

## RAG — vérifié réellement, pas supposé (étape 3)

`test/ai.diagnosis.crmAssistantAgent.realRag.test.js`, contre le VRAI
pipeline (ingestion réelle de `docs/user-guide/`, `HashingEmbeddingProvider`/
`LexicalOverlapReranker` réels, aucun mock avant le `chatModel`) :

| Étape | Vérifié | Résultat |
|---|---|---|
| 1. Recherche documentaire | `retrievalService.retrieve("Comment créer un projet ?")` | 5 citations réelles retournées, jamais zéro |
| 2. Récupération des chunks | `context.citations` | Le guide `"Comment créer un projet dans le CRM"` en 1ère position |
| 3. Construction du contexte | `context.contextText` | Gabarit `[1]...[5]` + extrait réel du guide (« formulaire en 5 étapes ») |
| 4. Appel LLM | Le `chatModel` reçoit bien ce contexte réel dans son message humain | Confirmé (assertion sur le contenu réellement transmis) |
| 5. Génération de réponse | `agent.execute()` renvoie le texte du modèle + les citations réelles | Confirmé, sans exception |

**Le RAG ne retourne jamais zéro résultat pour cette question** — testé
aussi le cas contraire (question hors sujet) : le contexte le dit
explicitement plutôt que de rester silencieusement vide.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# La correction d'observabilité (stack réelle + conversationId)
git diff -- src/ai/utils/secretRedaction.js src/ai/agents/baseAgent.js src/ai/utils/agentErrorClassification.js

# Le prompt meeting_agent renforcé
git diff -- src/ai/agents/meetingAgent.js

# Diagnostic direct des deux agents (RAG réel, conversation réelle)
npx jest test/ai.diagnosis.crmAssistantAgent.realRag.test.js test/ai.diagnosis.meetingAgent.conversation.test.js --verbose

# Régression complète
npm test
```

## Statut par composant

| Composant | Statut | Preuve |
|---|---|---|
| **Router / IntentDetector** | **OK** (non modifié — aucun bug identifié, voir `11_MEETING_AGENT_FIX.md`) | Routage déjà confirmé correct par l'utilisateur ; corpus 550 scénarios vert |
| **LLM Provider (OpenAI)** | **KO** — quota épuisé (`429`), externe à ce backend | Stack technique réelle capturée 3 fois en direct, `classifyProviderHttpError`/`OpenAiProvider._completeOnce` |
| **RAG** | **OK** | `test/ai.diagnosis.crmAssistantAgent.realRag.test.js`, pipeline réel, 4/4 verts |
| **CRM Assistant** | **OK** (code) — bloqué uniquement par le LLM Provider KO | Prompt/permissions/RAG tous vérifiés directement, aucune exception dans le code de l'Agent lui-même |
| **Meeting Agent** | **OK** (code, prompt renforcé) — bloqué uniquement par le LLM Provider KO | `test/ai.diagnosis.meetingAgent.conversation.test.js`, 6 tours réels, 2/2 verts |
| **MCP** | **OK** | Les 4 Tools `googleCalendar` déjà testés (`test/ai.mcp.tools.googleCalendar.test.js`), scope `userId=actingUser.id` confirmé, jamais un paramètre inventé (vérifié dans le test de conversation) |
| **Conversation Memory** | **OK** | `ConversationManager`/`InMemoryConversationMemory` réels, aucune perte sur 6 tours, aucune deuxième mémoire créée |
| **Flutter** | **Non touché** (consigne respectée) | Aucun fichier `Dash Master Toolkit/` modifié dans cette passe |

**Action requise, hors périmètre de ce backend** : renouveler/augmenter le
quota OpenAI (ou configurer une clé avec un quota disponible) — c'est la
SEULE cause des deux échecs rapportés. Aucune ligne de code de
`crm_assistant_agent` ou `meeting_agent` n'empêche une réponse correcte une
fois le fournisseur LLM à nouveau disponible.
