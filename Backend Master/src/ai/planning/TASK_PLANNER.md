# Task Planner — demandes composées en plusieurs étapes (Phase 3)

> « Trouve mes projets en cours sans relance depuis 30 jours et prépare une relance pour chacun. »

## Le cycle

| # | Étape | Où | Écrit en base ? |
|---|---|---|---|
| 1 | Comprendre la demande | `TaskPlanner.detect/plan` (réutilise `entityExtractor.js` de la Phase 1) | non |
| 2 | Construire le plan READ → ANALYZE → WRITE | `TaskPlanner.plan` (`PlanStep`) | non |
| 3 | Exécuter la lecture | `PlanExecutor.runRead` → Tool MCP réel (`list_projects`, `get_my_commercial_contacts`) | non |
| 4 | Analyser les résultats | `TaskPlanner.analyze` (filtre déterministe : statut, « sans relance depuis N jours ») | non |
| 5 | Préparer les écritures | `TaskPlanner.prepareWrites` (une par ligne lue, 20 max.) | non |
| 6 | Afficher le résumé | `reasoning/taskPlanAnswerBuilder.js` | non |
| 7 | Demander confirmation | `ConfirmationManager.request` → `PendingActionStore` partagé (15 min, usage unique) | non |
| 8 | Exécuter après « confirme » | relecture du périmètre, puis `PlanExecutor.runWrites` → `create_project_action` / `schedule_commercial_contact_relance` | **oui** |
| 9 | Retourner le résultat réel | chaque action : identifiant de l'enregistrement créé, ou refus/échec/délai réel | — |

« annule » retire le plan sans rien exécuter. Toute autre question pendant l'attente suit le routage normal ; le plan reste confirmable jusqu'à expiration.

## Composants

- `planStep.js` — `PlanStep` (read / analyze / write) et son cycle de statuts.
- `executionContext.js` — `ExecutionContext` : utilisateur authentifié, délais (15 s par étape, 60 s par plan), identifiants réellement lus.
- `taskPlanner.js` — `TaskPlanner` : détection, plan, analyse, préparation.
- `confirmationManager.js` — `ConfirmationManager` : sur le `PendingActionStore` **existant** (même instance qu'AutomationAgent/MeetingAgent), type `task_plan`, lié à l'utilisateur.
- `planExecutor.js` — `PlanExecutor` : appels de Tools avec délai, classification (denied / timeout / failed), échec partiel.
- `toolContracts.js` — ce qu'un résultat de Tool doit contenir pour être cru.
- `agents/taskPlannerAgent.js` — l'Agent qui enchaîne le tout (intention `multi_step_task`).

Réutilisés sans duplication : `PendingActionStore`, le routage du tour de confirmation de l'`AIManager` (`_resolvePendingAgentIntent`), les adaptateurs MCP, `entityExtractor`, l'index de permissions des Tools.

## Règles absolues — où elles sont garanties

- **Le LLM n'autorise jamais** : chaque appel passe par l'adaptateur MCP lié à l'utilisateur authentifié → `PermissionManager`. La vérification préalable (`toolPermissionIndex`, rôles déclarés par le Tool) évite seulement de proposer une action que le serveur refuserait.
- **Le LLM n'invente aucun résultat** : il n'est pas appelé dans ce parcours. Les textes sont construits à partir des sorties des Tools.
- **Chaque donnée métier vient d'un Tool** : une lecture dont une ligne n'a pas d'UUID est rejetée entièrement ; une écriture n'est « réussie » que si le Tool renvoie l'enregistrement créé (`{ ok:false }` ou `{ success:true }` sans identifiant = échec).
- **Chaque écriture est confirmée** : `_prepare` n'appelle aucun Tool d'écriture ; seul `_executeConfirmed` le fait, après `ConfirmationManager.take()` (propriétaire vérifié, usage unique, non expiré).
- **Cibles** : une écriture ne vise qu'un identifiant renvoyé par la relecture faite au moment de la confirmation. Un projet réaffecté entre-temps, ou une cible injectée dans le plan, n'est pas écrit. Nécessaire car `projectAction.service.createAction` ne vérifie pas lui-même le propriétaire du projet (comportement de la route HTTP existante, non modifié).

## Portée volontairement étroite

Détecté seulement si la demande combine une source (projets, contacts), une action d'écriture explicite (« prépare/crée/programme une relance|un rappel|une activité|un appel|une visite ») et une portée multiple (« pour chacun », « mes projets »…). Vérifié sur les 571 messages du corpus de validation : aucun n'est capté. « Programme une relance pour le contact Ahmed » ou « Relance les clients. » gardent leur routage actuel.

## Limites

- Actions prises en charge : relance/rappel, appel, visite, activité sur les projets ; relance sur les contacts.
- 100 lignes lues au plus par le Tool, 20 écritures au plus par plan.
- Une écriture en délai dépassé a pu aboutir côté serveur : c'est signalé, jamais masqué.
- Le plan en attente est en mémoire : il est perdu au redémarrage du serveur.

## Tests

- `test/ai.planning.units.test.js` — détection, plan, analyse, dates, décisions, ConfirmationManager, contrats, exécuteur (timeouts, cible forgée, échec partiel, délai global).
- `test/ai.orchestrator.multiStepTask.test.js` — bout en bout avec les vraies fabriques de Tools derrière un vrai `McpServer` : plan simple, multi-étapes, échec de Tool, permission refusée (vérification préalable, serveur, rôle retiré avant confirmation, autre utilisateur), confirmation, annulation, échec partiel, timeout, résultats hallucinés.
