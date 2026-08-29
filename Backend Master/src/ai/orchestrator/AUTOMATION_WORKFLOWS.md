# Automation Agent — proposer, jamais exécuter sans confirmation explicite

Ce document décrit l'évolution d'`AutomationAgent` (intention `automation`, déjà existant) : d'un exécuteur immédiat ("décompose la demande en étapes et les exécute") vers un cycle en 3 temps — **proposer → confirmer/annuler → exécuter** — où AUCUNE action n'atteint plus jamais un vrai Tool sans une confirmation explicite de l'utilisateur. Point d'entrée : `agents/automationAgent.js`, l'état "en attente" : `orchestrator/pendingActionStore.js`, mise en mots : `reasoning/automationAnswerBuilder.js`.

## Les 5 actions demandées — pas 5 chemins de code séparés

`AssistantAgent`/`KpiAgent`/`AdvancedSearchAgent` etc. détectent leur domaine via des marqueurs locaux (mots-clés) parce que leur périmètre est fixe et connu à l'avance. `AutomationAgent` est différent par nature : c'est le SEUL Agent construit pour traverser N'IMPORTE QUEL module (`moduleKey: null`, `allowedToolNames: null`). Le mécanisme reste donc EXACTEMENT celui d'avant : `IPlanner` (`LlmPlanner`, déjà livré) décompose la demande et choisit lui-même, parmi les VRAIS Tools disponibles, lesquels appeler :

| Action demandée | Tool réel choisi par le Planner |
|---|---|
| Création d'activité | `create_project_action` (**nouveau**, voir ci-dessous) |
| Création de rappel | `create_project_action`, avec `dateRelance` renseigné |
| Création de rendez-vous | `create_calendar_event` (déjà existant, module Google Calendar) |
| Préparation d'un email | `send_notification_email` (déjà existant — voir la nuance ci-dessous) |
| Génération d'un rapport | `get_dashboard_kpis` (déjà existant, module Dashboard) |

Ce qui change n'est PAS "comment on choisit le Tool" (inchangé, toujours le Planner) mais "quand on l'appelle" — voir le cycle ci-dessous.

## Le vrai gap comblé : `create_project_action`

Ni "création d'activité" ni "création de rappel" n'avaient de Tool MCP dédié (`SMART_SUGGESTIONS.md` documentait déjà cet écart pour les Smart Suggestions). Vérifié : `modules/project-actions/services/projectAction.service.js::createAction(projectId, body, userId)` crée l'activité (`ProjectAction`) ET, SI `dateRelance` est fourni, le rappel associé (`ProjectReminder`, dans la MÊME transaction) — dans ce CRM, un rappel n'est JAMAIS un enregistrement indépendant, toujours l'attribut d'une activité. Un seul nouveau Tool (`mcp/tools/projectActions/createProjectActionTool.js`) couvre donc les deux actions demandées, sans fabriquer un second concept qui n'existe pas dans le modèle de données réel. `requiredRoles: []` — la vraie route HTTP (`POST /:id/actions`) est gardée par `authRequired` seul, sans restriction de rôle ; ce Tool n'est donc ni plus ni moins permissif que la production.

Cette fermeture de gap profite aussi à **Smart Suggestions** (`suggestionCatalog.js`) : `create_activity`/`create_reminder` référencent désormais ce Tool réel (`toolName: "create_project_action"`) au lieu d'une permission codée en dur séparément — une seule source de vérité, comme `schedule_meeting`/`notify_team` déjà.

## "Préparation d'un email" — une nuance assumée

`send_notification_email` ENVOIE immédiatement (et crée la notification en base) — aucun Tool de simple BROUILLON n'existe. Plutôt que d'inventer un tel Tool, la "préparation" EST le cycle proposer/confirmer lui-même : le Planner produit un plan référençant `send_notification_email` avec un sujet/corps déjà rédigés, l'utilisateur voit ce contenu EXACT dans la proposition (voir plus bas), et l'envoi réel n'a lieu qu'à la confirmation — la confirmation devient structurellement la validation du brouillon, sans Tool supplémentaire.

## Le cycle en 3 étapes

### 1. Proposer (`_propose`)
`planner.plan(message, {availableTools})` produit des étapes ; celles référençant un Tool réellement disponible deviennent une **proposition**, stockée dans `PendingActionStore` pour CETTE conversation — **jamais exécutée à ce stade**. La réponse décrit chaque étape en détail (Tool, paramètres exacts, raison) et demande explicitement : *« Répondez « confirme » pour exécuter, ou « annule » pour abandonner. »*

### 2. Confirmer ou annuler
Le tour suivant est vérifié contre `PendingActionStore.peek(conversationId)` :
- **« confirme »/« confirmer »** → `_executeConfirmed` : la proposition est retirée (`consume`, un seul usage possible) puis SEULEMENT ALORS exécutée réellement, étape par étape, via `LangChainWorkflowEngine` (même mécanisme `{type:"tool",...}` qu'avant).
- **« annule »/« annuler »** → la proposition est retirée sans jamais être exécutée.
- **Ni l'un ni l'autre** (nouvelle demande) → la proposition en attente est silencieusement REMPLACÉE par la nouvelle (jamais empilée — une seule action en attente par conversation à la fois, voir `pendingActionStore.js`).

Ces deux mots sont ceux que le Copilot demande LUI-MÊME à l'utilisateur (`automationAnswerBuilder.js::buildProposalAnswer`) — jamais "oui"/"non", trop génériques pour des mots-clés globaux (voir `intentCatalog.js`, l'intention `automation` les ajoute EXACTEMENT tels quels).

### 3. Expiration (15 minutes)
Une proposition trop ancienne n'est plus honorée (`PendingActionStore`, `ttlMs`) — une confirmation tardive répond honnêtement qu'il n'y a plus rien en attente plutôt que d'exécuter une action que l'utilisateur a probablement oubliée.

## Pourquoi un `PendingActionStore` séparé, pas la mémoire de conversation

`IConversationMemory` existe déjà (historique de chat), mais rien n'y modélise une action EN ATTENTE avec un cycle de vie propre (consommation unique, expiration). Réutiliser la mémoire de conversation pour cela aurait mélangé deux responsabilités distinctes. `PendingActionStore` est construit UNE SEULE FOIS dans `orchestrator/pipeline.js` (comme `SuggestionEngine`) et partagé par `AutomationAgent` pour toute la durée du process — reconstruire l'orchestrateur à chaque appel effacerait toute proposition en attente.

## Garantie structurelle, pas une promesse de prompt

Le `SYSTEM_PROMPT` d'`AutomationAgent` demande au modèle de ne jamais exécuter sans confirmation, mais ce n'est PAS ce qui protège l'utilisateur : `_propose()` n'appelle physiquement JAMAIS `tool.invoke()` ni `workflowEngine.run()` — seul `_executeConfirmed()` le fait, et cette méthode n'est atteinte QUE si `PendingActionStore.peek()` renvoie une action ET que le message contient un marqueur de confirmation. Même discipline que `DataQualityAgent` (`ALLOWED_TOOL_NAMES` sans Tool d'écriture) : la garantie est dans le CODE, vérifiable par des tests, pas dans le comportement espéré d'un modèle de langage.

## Ce qui n'a pas été fait (délibérément)

- **Un vrai Tool de brouillon d'email** — voir la nuance ci-dessus ; la confirmation joue déjà ce rôle.
- **Des propositions empilées/multiples par conversation** — une seule à la fois, plus simple à raisonner pour l'utilisateur ("la dernière chose que je vous ai proposée") ; une nouvelle demande remplace silencieusement l'ancienne non confirmée.
- **"oui"/"non" comme synonymes de confirme/annule** — le Copilot contrôle le mot qu'il demande lui-même (« confirme »/« annule »), donc n'a besoin de reconnaître QUE celui-là ; ajouter des synonymes génériques aurait élargi le mot-clé du catalogue d'intentions à une portion énorme de conversation sans rapport.
- **Persistance inter-process** — `PendingActionStore` est en mémoire, comme `InMemoryConversationMemory` ; une proposition ne survit pas à un redémarrage du serveur (acceptable pour une fenêtre de confirmation de quelques minutes).

## Tests

- `test/ai.mcp.tools.projectActions.test.js` : le nouveau Tool `create_project_action` — permission ouverte (matches la vraie route), délégation exacte au service, schéma Joi.
- `test/ai.orchestrator.pendingActionStore.test.js` : propose/peek/consume, portée par conversation (jamais de fuite), remplacement (jamais empilé), expiration (TTL).
- `test/ai.reasoning.automationAnswerBuilder.test.js` : chaque texte (proposition, exécution, annulation, cas limites) — jamais un texte qui prétend avoir agi sans avoir réellement agi.
- `test/ai.agents.automationAgent.test.js` : le cycle complet en isolation — proposer sans jamais appeler de Tool, confirmer déclenche l'exécution réelle exactement une fois, annuler n'exécute jamais rien, cas limites (confirmation isolée sans rien en attente, absence de `conversationId`, remplacement d'une proposition non confirmée, Tool devenu indisponible entre la proposition et la confirmation), permission admin-tier inchangée.
- `test/ai.automation.confirmationFlow.test.js` : le cycle bout-en-bout avec un VRAI `AIManager` sur deux tours de conversation réels (le seul moyen de prouver qu'aucune exécution n'a lieu avant confirmation) — y compris l'absence de fuite entre conversations et l'expiration de la fenêtre de confirmation.
- `test/ai.orchestrator.suggestionEngine.test.js`/`suggestionCatalog.js` : mis à jour pour la fermeture du gap `create_activity`/`create_reminder` → `create_project_action`.
- `test/ai.orchestrator.responseBuilder.test.js`/`ai.orchestrator.aiManager.test.js`/`ai.orchestrator.pipeline.test.js` : le nouveau champ `pendingAction` de l'enveloppe de réponse, et le câblage du `PendingActionStore` partagé.
- `test/fixtures/copilotValidationScenarios.js` (+7 scénarios, `aut-11`..`aut-17`) et les deux suites `ai.validation.copilotScenarios.test.js`/`ai.validation.copilotEndToEnd.test.js` — voir `COPILOT_VALIDATION.md`.
