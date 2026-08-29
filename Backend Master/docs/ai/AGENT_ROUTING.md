# Agent Routing — compréhension sémantique, action vs explication, matrice complète

Suite de `docs/ai/INTENT_ROUTING.md` (règle "intention explicite > contexte d'écran", scores de confiance, ambiguïté). Ce document couvre ce qui a changé depuis : la distinction explicite **explication (comment faire) vs action (faire)** pour un même verbe, la 19e intention réelle (`meetings`) et son 16e Agent (`meeting_agent`), et le contrat `{intent, entity, action, mode, confidence, agent, tool}` complet. Voir `AI-Business-Copilot/11_MEETING_AGENT_FIX.md` pour la cause exacte, les fichiers modifiés et les résultats des deux régressions.

**Décision d'architecture, énoncée dès le départ (même discipline que `INTENT_ROUTING.md`)** : `entity`/`action`/`mode` ne sont pas un second système de classification parallèle à `intent`. Ce sont des LECTURES, dérivées mécaniquement de l'intention déjà résolue et du texte du message — jamais un second moteur de décision concurrent qui pourrait diverger du premier.

## 1. Le chemin complet, de Flutter à la réponse

```
Flutter (copilot_chat_screen.dart / copilot_dashboard_view.dart)
  → POST /ai-copilot/chat  (ou WebSocket ai-copilot:send)
  → aiCopilotBridge.service.js::sendMessageAsActingUser()
      · formatPageContext(pageContext)              — construit le préfixe d'écran, si fourni
      · getContextGateDetector().detect(message)     — teste le message SEUL (garde §2)
      · si le message seul porte déjà un signal réel → préfixe PAS ajouté
  → AIManager.handleMessage()                        (src/ai/orchestrator/aiManager.js)
      1. promptInjectionGuard.scan()
      2. ConversationContextResolver.resolve()        — références/reformulations (§ConversationContext)
      3. IntentDetector.detect()                      — { name, entities, confidence, ambiguous, alternateIntent, ... }
      4. si intent.ambiguous → clarification (jamais un Agent choisi au hasard)
      5. isAuthorized(intent.requiredRoles/allowedEmails, user)  — permission au niveau INTENTION
      6. AgentRouter.select(intent) → AgentRegistry.findHandler()
      7a. si un Agent existe → agent.execute() → BaseAgent (system prompt + Tools autorisés, isAuthorized() au niveau AGENT)
      7b. sinon → ToolRouter.select() + WorkflowManager.run() (users/hr/por_promesh, aucun Agent dédié)
      8. chaque Tool MCP vérifie SA PROPRE permission (isAuthorized() au niveau TOOL) avant tout accès Repository/Sequelize/PostgreSQL
      9. ResponseBuilder.build() — réponse structurée, JAMAIS une exception qui remonte
  → _audit() (auditLog, best-effort) — voir §7 Sécurité/Observabilité
  → réponse JSON/WebSocket → Flutter (affiche réponse / clarification / confirmation / erreur)
```

Rien de cette chaîne n'a été reconstruit : `IntentDetector`/`AgentRouter`/`ToolRouter`/`isAuthorized`/`BaseAgent` sont exactement les mêmes composants que `INTENT_ROUTING.md` documente déjà. Les changements de cette passe : **une 19e intention** (`meetings`), **un 16e Agent** (`meeting_agent`), et une lecture additive `entity`/`action`/`mode` sur l'intention déjà résolue.

## 2. INTENTION EXPLICITE > ENTITÉ > ACTION > CONTEXTE DE PAGE

Ordre de priorité demandé, tel qu'il est réellement appliqué :

1. **Intention explicite** — `IntentDetector` (lexical, déterministe) choisit la route sur le CONTENU du message. Une question procédurale ("Comment...") l'emporte TOUJOURS sur un nom de domaine mentionné dans la même phrase (`documentation_question` est la première entrée du catalogue — voir `INTENT_ROUTING.md §2`).
2. **Entité** — dérivée des mêmes mots-clés déjà matchés (`intentConfidence.js::ENTITY_BY_INTENT_KEY`), jamais un second classement : `"project"`, `"meeting"`, `"commercial_contact"`, etc.
3. **Action** — dérivée du message par une lecture simple (verbe d'action présent = `CREATE`/`UPDATE`/`DELETE`/`QUERY`, voir §4), jamais un Agent différent choisi sur cette seule base.
4. **Contexte de page** — n'intervient QUE si le message seul ne porte AUCUN signal (repli `general_chat`) — voir `INTENT_ROUTING.md §2/§3`, mécanisme inchangé par cette passe, qui se généralise automatiquement à `meetings` (vérifié, §6).

## 3. Taxonomie demandée → intentions réelles (mise à jour)

| Taxonomie demandée | Intention réelle | Agent |
|---|---|---|
| `HELP_HOW_TO`, `HELP_NAVIGATION`, `DOCUMENTATION` | `documentation_question` | `crm_assistant_agent` |
| `INFORMATION` | `documentation_question` (si procédural) ou l'intention du domaine (si factuel — ex. `projects`) | selon le cas |
| `SEARCH` | `advanced_search` | `advanced_search_agent` |
| `PROJECT_QUERY`, `PROJECT_ANALYSIS` | `projects` | `project_agent` |
| `KPI_QUERY`, `KPI_ANALYSIS` | `dashboard` | `kpi_agent` |
| `CLIENT_QUERY`, `CONTACT_QUERY`, `COMMERCIAL_QUERY` | `commercial_contacts` | `commercial_agent` |
| `MEETING_QUERY`, `MEETING_CREATE`, `APPOINTMENT_QUERY`, `APPOINTMENT_CREATE` | **`meetings`** (nouveau — un seul module réel, `googleCalendar`, sert les deux notions) | **`meeting_agent`** (nouveau) |
| `ACTION_REQUEST`, `CREATE_REQUEST`, `UPDATE_REQUEST`, `DELETE_REQUEST` | l'intention du domaine concerné (ex. `projects` pour "Crée un projet", `meetings` pour "Programmer une réunion") — jamais une intention générique "action" séparée du domaine, sauf `automation` pour un enchaînement MULTI-modules explicite | l'Agent du domaine |
| `RECOMMENDATION` | `recommendation` | `recommendation_agent` |
| `DATA_QUALITY` | `data_quality` | `data_quality_agent` |
| `UNKNOWN` | `general_chat` | `assistant_agent` |

`MEETING_QUERY`/`APPOINTMENT_QUERY` fusionnés en une seule intention `meetings` : il n'existe qu'UN SEUL module Tool réel (`mcp/tools/googleCalendar/`) pour les réunions ET les rendez-vous — un rendez-vous et une réunion sont techniquement le même objet (`create_calendar_event`) dans ce CRM. Séparer l'intention aurait dupliqué le même Agent pour un distinguo qui n'existe nulle part côté données.

## 4. Analyse sémantique — `{intent, entity, action, mode, confidence, agent, tool}`

`IntentDetector.detect()` retourne déjà `{name, entities, confidence, ambiguous, alternateIntent, moduleKey, ...}` (voir `INTENT_ROUTING.md §4`). `entity`/`action`/`mode` demandés à l'étape 4 sont des LECTURES supplémentaires, dérivées sans nouveau moteur :

- **`entity`** = `intent.entities[0]` (déjà réel — `intentConfidence.js`).
- **`action`** : lu directement dans le message, par présence d'un verbe d'action reconnu (`créer`/`crée`, `ajouter`/`ajoute`, `modifier`/`modifie`, `supprimer`/`supprime`, `programmer`, `planifier`, `réserver`, `annuler`) → `CREATE`/`UPDATE`/`DELETE` ; absent → `QUERY`. Pas un nouveau champ persistant : une lecture au moment du log/observabilité (§7), jamais une DÉCISION de routage supplémentaire — c'est `IntentDetector`/`AgentRouter` qui décident, `action` ne fait que documenter POURQUOI a posteriori.
- **`mode`** : `EXPLANATION` si `intent.name === "documentation_question"`, `INTERACTIVE_ACTION` si l'intention résolue possède un Agent dont l'exécution peut appeler un Tool d'ÉCRITURE (ex. `meetings`, `projects` en mutation), `QA` sinon (RAG/lecture seule).
- **`agent`** = `AgentRouter.select(intent).name`, `tool` = les noms réels appelés (`outcome.toolSteps[].tool`), déjà journalisés (§7) — jamais un second calcul.

Exemple vérifié contre le vrai `IntentDetector` :
```
"Comment créer un projet ?"
→ { intent: "documentation_question", entity: "project", action: "CREATE", mode: "EXPLANATION", confidence: 0.95, agent: "crm_assistant_agent" }

"Programmer une réunion"
→ { intent: "meetings", entity: "meeting", action: "CREATE", mode: "INTERACTIVE_ACTION", confidence: 0.90, agent: "meeting_agent" }
```

## 5. Explication vs Action — la même paire de mots, deux intentions différentes

| Message | Intention | Mode |
|---|---|---|
| "Comment créer un projet ?" | `documentation_question` | `EXPLANATION` — jamais de création |
| "Je veux créer un projet." / "Crée un projet." | `projects` | `INTERACTIVE_ACTION` — le tour-calling de `project_agent` collecte les infos nécessaires |
| "Comment programmer une réunion ?" | `documentation_question` | `EXPLANATION` |
| "Programmer une réunion" | `meetings` | `INTERACTIVE_ACTION` — `meeting_agent` demande sujet/début/fin avant `create_calendar_event` |

Mécanisme, pas une heuristique séparée : `documentation_question` est enregistrée EN PREMIER dans le catalogue (`intentCatalog.js`) — sur une égalité de score lexical (`"comment"` vs le mot-clé du domaine), elle gagne TOUJOURS. Vérifié pour "Comment programmer une réunion ?" (égalité réelle : `documentation_question`=1 pour "comment", `meetings`=1 pour "réunion") — `documentation_question` l'emporte, palier de confiance PRIORITÉ PROCÉDURALE (0.95, voir `intentConfidence.js`).

**Étape 7 (« ne pas exécuter une création sur une question ») déjà garantie structurellement, pas par une règle de prompt fragile** : une question "Comment...?" ne route JAMAIS vers `meeting_agent`/`project_agent` (les Agents qui peuvent écrire) — elle route vers `crm_assistant_agent`, qui n'a AUCUN Tool autorisé (`allowedToolNames: []`, voir `CRM_ASSISTANT.md`). Il est donc IMPOSSIBLE, par construction, qu'une question procédurale déclenche une écriture — pas une promesse de prompt, une impossibilité architecturale.

## 6. MeetingAgent (16e Agent)

`src/ai/agents/meetingAgent.js` — BaseAgent standard (même mécanique que `MaintenanceAgent`/`ProjectAgent`), intention exclusive `meetings`, 4 Tools déjà réels (`mcp/tools/googleCalendar/`, construits pour `AutomationAgent`, réutilisés tels quels, aucun nouveau Tool) :

| Tool | Rôle |
|---|---|
| `get_calendar_status` | Vérifie que le compte Google Calendar de l'utilisateur est connecté AVANT de tenter une création. |
| `create_calendar_event` | Crée l'événement — champs RÉELLEMENT exigés : `summary`, `startDateTime`, `endDateTime` (voir Joi schema du Tool). |
| `update_calendar_event` | Modifie un événement existant. |
| `delete_calendar_event` | Annule un événement. |

**Écart honnête avec la demande initiale** : l'étape 8 demandait de collecter "date, heure, durée, **participants**, sujet". Le Tool réel `create_calendar_event` n'a **aucun champ participants** (vérifié dans son schéma Joi). Le prompt système de `meeting_agent` interdit donc explicitement d'affirmer pouvoir enregistrer des participants — inventer ce champ aurait violé "ne pas inventer une fonctionnalité qui n'existe pas côté serveur", la même discipline déjà appliquée à `docs/user-guide/01-creer-un-projet.md` dans l'incident précédent.

Permissions : ouvertes au niveau Agent (`requiredRoles: []`) — les 4 Tools eux-mêmes n'ont aucune restriction de rôle, mais scoient TOUJOURS `userId = actingUser.id` (jamais le calendrier d'un autre utilisateur, voir `googleCalendar.service.js`).

## 7. Matrice de routage complète (19 intentions, 16 Agents)

| Intention | Agent | Tools (whitelist) | Permissions Agent |
|---|---|---|---|
| `documentation_question` | `crm_assistant_agent` | Aucun (RAG) | Ouvert |
| `general_chat` | `assistant_agent` | Aucun (RAG) | Ouvert |
| `projects` | `project_agent` | `list_projects`, `move_project_stage`, `assign_project_owner`, `create_project_action` | Ouvert |
| `pipeline` | `pipeline_agent` | `list_pipeline_stages`, ... | Ouvert |
| `commercial_contacts` | `commercial_agent` | `get_commercial_contact_kpi`, ... | commercial/admin/superadmin/superadmin2 |
| `maintenance` | `maintenance_agent` | `create_maintenance_request`, ... | Ouvert |
| `notifications` | `notification_agent` | `list_my_notifications`, ... | Ouvert |
| `industrial` | `industrial_agent` | `list_industrial_records`, ... | Ouvert |
| `dashboard` | `kpi_agent` | `get_dashboard_kpis`, `get_user_dashboard`, `get_professional_dashboard`, `get_legacy_dashboard_kpis` | Ouvert |
| `reporting` | `reporting_agent` | Mêmes Tools que `kpi_agent` | Ouvert |
| **`meetings`** | **`meeting_agent`** | `get_calendar_status`, `create_calendar_event`, `update_calendar_event`, `delete_calendar_event` | Ouvert |
| `automation` | `automation_agent` | Multi-module | Ouvert |
| `business_analysis` | `business_analyst_agent` | Multi-module | Ouvert |
| `recommendation` | `recommendation_agent` | Multi-module | Ouvert |
| `data_quality` | `data_quality_agent` | `list_projects` (lecture seule) | Ouvert |
| `advanced_search` | `advanced_search_agent` | Multi-module | Ouvert |
| `users` | *(aucun)* | `ToolRouter` | Selon le Tool |
| `hr` | *(aucun)* | `ToolRouter` | Selon le Tool |
| `por_promesh` | *(aucun)* | `ToolRouter` | Selon le Tool |

## 7bis. `general_chat` ≠ `crm_assistant_agent` — jamais un fallback UNKNOWN vers CRM Assistant

Point clarifié suite à `AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md`
(étape 6 de cette passe) : quand aucune intention métier réelle n'est
détectée, la route par défaut est `general_chat` → **`assistant_agent`**
(un concierge générique, RAG uniquement) — **jamais** `crm_assistant_agent`
(le spécialiste "comment utiliser le CRM", intention `documentation_question`
uniquement). Les deux Agents sont distincts dans `agents/manifest.js` depuis
leur création — il n'existe aucun chemin de code où `general_chat` route
vers `crm_assistant_agent`. Le bug corrigé dans `14_PROJECT_ANALYSIS_ROUTING.md`
n'était donc jamais un "mauvais fallback UNKNOWN", mais une vraie collision
de score entre deux intentions RÉELLES et documentées
(`documentation_question` vs `projects`) — voir §7ter pour le mécanisme qui
la corrige.

## 7ter. "pourquoi CE projet est [état]" > documentation — l'override `projectAnalysisOverride.js`

`documentation_question` porte le mot-clé "pourquoi" (questions générales
sur le fonctionnement du CRM) et gagne toute égalité de score (priorité
procédurale, `10_INTENT_ROUTING_FIX.md`). Correct pour "Pourquoi certains
projets nécessitent-ils une validation supplémentaire ?" (une RÈGLE
générale) mais faux pour "Pourquoi CE projet est critique ?" (l'ÉTAT réel
d'une donnée précise). Un mot-clé de catalogue global ("critique" ajouté à
`projects`) a été essayé et REJETÉ : cassait `rec-12`/`rec-20`
(recommendation) et `mnt-14` (maintenance), qui mentionnent aussi
"critique" dans un tout autre sens — preuve calculée dans
`projectAnalysisOverride.js`.

**Correction retenue** : un override étroit, appliqué uniquement quand
`documentation_question` a déjà gagné ET que le message combine "pourquoi"
+ "projet(s)" + un mot d'état réel (critique/bloqué/risque — le même
vocabulaire que `ProjectAgent::ATTENTION_MARKERS`, jamais une seconde
liste). Bascule alors vers `projects`, avec un palier de confiance dédié
(0.90, "ANALYSE DE PROJET DÉLIBÉRÉE" — voir `intentConfidence.js`), une
victoire par règle explicite, pas un hasard d'égalité.

```
"pourquoi projet depot SBF est critique"
→ { intent: "projects", entity: "project", confidence: 0.90, agent: "project_agent" }
```

## 8. Exemples vérifiés (les 17 messages de l'étape 15, contre le vrai `IntentDetector`)

| Message | Intent | Confiance | Agent |
|---|---|---|---|
| "Comment créer un projet ?" | `documentation_question` | 0.95 | `crm_assistant_agent` |
| "d'accord pour créer un projet comment" | `documentation_question` | 0.95 | `crm_assistant_agent` |
| "Je veux créer un projet" | `projects` | 0.90 | `project_agent` |
| "Crée un projet" | `projects` | 0.90 | `project_agent` |
| "Comment modifier un projet ?" | `documentation_question` | 0.95 | `crm_assistant_agent` |
| "Modifier ce projet" | `projects` | 0.90 | `project_agent` |
| "Quels sont mes projets ?" | `projects` | 0.90 | `project_agent` |
| "Quels projets sont critiques ?" | `projects` (marqueur d'attention, voir `ProjectAttentionAnalyzer`) | 0.90 | `project_agent` |
| "Quels sont mes KPI ?" (seul) | `commercial_contacts`/`dashboard`, **ambigu** → clarification | 0.55 | *(clarification)* |
| "Comment programmer une réunion ?" | `documentation_question` | 0.95 | `crm_assistant_agent` |
| "Programmer une réunion" | **`meetings`** | 0.90 | **`meeting_agent`** |
| "Créer une réunion" | **`meetings`** | 0.90 | **`meeting_agent`** |
| "Planifier un rendez-vous" | **`meetings`** | 0.55 (égalité avec `automation` sur "planifier", tranchée par l'ordre du catalogue) | **`meeting_agent`** |
| "Comment ajouter un client ?" | `documentation_question` | 0.90 | `crm_assistant_agent` |
| "Ajouter un client" | `general_chat` — lacune lexicale honnête (le catalogue ne connaît que "contact", jamais "client"), hors périmètre de cet incident | 0.30 | `assistant_agent` |
| "Comment ajouter un contact ?" | `documentation_question` | 0.95 | `crm_assistant_agent` |
| "Pourquoi mes projets sont en retard ?" | `projects` (marqueur d'attention "retard") | 0.90 | `project_agent` |

## 9. Sécurité

- **RBAC jamais contourné** : 3 niveaux indépendants et déjà en place — intention (`intent.requiredRoles`/`allowedEmails`), Agent (`agent.requiredRoles`/`allowedEmails`), Tool (`isAuthorized()` au moment de l'exécution). `meeting_agent` n'ajoute aucune exception : ses 4 Tools scoient déjà `userId = actingUser.id` en dur côté service.
- **Aucune opération d'écriture sans confirmation** : `create_calendar_event`/`update_calendar_event`/`delete_calendar_event` passent par le même tool-calling LLM que tout Agent existant — le prompt système de `meeting_agent` exige un récapitulatif avant tout appel, même mécanisme que `IndustrialAgent`/`PipelineAgent` ("Confirme toujours les champs fournis avant une création"). Aucune donnée fictive : le prompt interdit explicitement d'inventer une date/heure/sujet manquant.
- **Aucune donnée fictive** : `meeting_agent` ne prétend jamais gérer un champ absent du Tool réel (participants) — voir §6.

## 10. Observabilité (étape 17)

`AIManager._audit()` (déjà existant, `security/auditLog.js`, best-effort — un échec d'écriture n'interrompt jamais un tour) journalise maintenant, pour CHAQUE tour, réussi ou non :

| Champ demandé | Champ réel (vocabulaire déjà existant, jamais renommé) |
|---|---|
| `correlationId` | `conversationId` (déjà l'identifiant qui traverse tout un tour HTTP/WebSocket/`ConversationManager`) |
| `userId` | `actor` (`{id, role}`) |
| `intent` | `resource` |
| `entity` | `metadata.entities` |
| `action` | *(dérivable du message, voir §4 — pas encore un champ persistant séparé)* |
| `confidence` | `metadata.confidence` |
| `agent` | `metadata.agent` |
| `tool` | `metadata.tools` (noms réels, dédupliqués, tirés de `outcome.toolSteps`) |
| `executionTime` | `metadata.executionTimeMs` |
| `status` | `outcome` (`"success"`/`"denied"`/`"failure"`/`"flagged"`) |

**Jamais journalisé** : le contenu du message, une clé API, un JWT, un mot de passe, un secret — `_audit()` ne reçoit QUE des métadonnées de routage, jamais le corps de la conversation ; la redaction structurelle (`secretRedaction.js`, déjà en place) protège en plus tout `logger.*` de ce fichier.

## 11. Tests

Voir `AI-Business-Copilot/11_MEETING_AGENT_FIX.md §4/§5` pour le décompte et les résultats complets. Fichiers clés :
- `test/ai.agents.meetingAgent.test.js` (nouveau) — identité, Tools, garanties du prompt (jamais de participants, sujet/début/fin obligatoires).
- `test/ai.agents.specialized.test.js` — `MeetingAgent` ajouté à la table des Agents "simples" déjà testés génériquement.
- `test/fixtures/copilotValidationScenarios.js` (+11 scénarios `reg-15`..`reg-25`) — dont les 2 régressions obligatoires.
- `test/aiCopilotBridge.service.test.js` (+3 tests) — la garde contexte-vs-intention protège `meetings` sur 3 écrans, sans aucune modification de la garde elle-même.
- `test/ai.orchestrator.aiManager.test.js` (2 tests mis à jour) — le nouveau contenu enrichi de `_audit()`.
