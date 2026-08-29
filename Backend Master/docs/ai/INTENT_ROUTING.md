# Intent Routing — taxonomie, règles, priorité, matrice Agent/Intent, tests

Ce document répond à la demande de `AI-Business-Copilot/10_INTENT_ROUTING_FIX.md` (étape 17) : documenter comment le Copilot choisit un Agent à partir de l'intention réelle de l'utilisateur, la règle de priorité "intention > contexte d'écran", et la matrice complète Agent/Intent.

**Décision d'architecture, énoncée dès le départ** : la taxonomie à 18 noms demandée (`HELP_HOW_TO`, `PROJECT_ANALYSIS`, `KPI_QUERY`, ...) n'a pas été construite comme un second système de classification en parallèle du catalogue réel. Le kernel possède déjà une taxonomie de 18 intentions, un `IntentDetector` lexical déterministe, 15 Agents spécialisés et un corpus de 550 scénarios de validation déjà éprouvé (`test/fixtures/copilotValidationScenarios.js`, `COPILOT_VALIDATION.md`). Dupliquer cette classification aurait introduit deux sources de vérité pouvant diverger silencieusement — la règle du projet ("ne jamais construire un système parallèle") s'applique directement ici. La taxonomie demandée est donc **mappée** ci-dessous sur les intentions réelles, et le bug de routage a été corrigé **dans** ce système existant, jamais à côté.

## 1. Mapping taxonomie demandée → intentions réelles du catalogue

`src/ai/orchestrator/intentCatalog.js::DEFAULT_INTENT_CATALOG` (18 entrées réelles) :

| Taxonomie demandée | Intention réelle (`intent.name`) | Agent réel |
|---|---|---|
| `HELP_HOW_TO`, `HELP_NAVIGATION`, `DOCUMENTATION` | `documentation_question` | `crm_assistant_agent` |
| `PROJECT_QUERY`, `PROJECT_ANALYSIS` | `projects` | `project_agent` |
| `KPI_QUERY`, `KPI_ANALYSIS` | `dashboard` | `kpi_agent` |
| `COMMERCIAL_QUERY`, `COMMERCIAL_ANALYSIS`, `CLIENT_QUERY` | `commercial_contacts` | `commercial_agent` |
| `MAINTENANCE_QUERY` | `maintenance` | `maintenance_agent` |
| `INDUSTRIAL_QUERY` | `industrial` | `industrial_agent` |
| `HR_QUERY` | `hr` | *(aucun — `ToolRouter`, voir §6)* |
| `REPORT_QUERY` | `reporting` | `reporting_agent` |
| `DATA_QUALITY` | `data_quality` | `data_quality_agent` |
| `RECOMMENDATION` | `recommendation` | `recommendation_agent` |
| `ACTION_REQUEST` | `automation` (actions enchaînées) ou l'intention du module concerné (ex. `projects` pour "déplace le projet X") | `automation_agent` ou l'Agent du module |
| `UNKNOWN` | `general_chat` (repli par défaut) | `assistant_agent` |
| *(non demandé explicitement, déjà réel)* | `users`, `por_promesh`, `pipeline`, `notifications`, `advanced_search`, `business_analysis` | `pipeline_agent`/`notification_agent`/`advanced_search_agent`/`business_analyst_agent`, ou `ToolRouter` pour `users`/`por_promesh` |

Aucune intention n'a été renommée : `intent.name` reste la clé technique stable (`documentation_question`, pas `HELP_HOW_TO`) consommée par `AgentRouter`/`ToolRouter`/le corpus de validation — renommer aurait cassé les 550 scénarios déjà validés pour un bénéfice cosmétique.

## 2. Règle prioritaire — intention explicite > contexte d'écran

**Cause du bug rapporté** (voir le rapport d'incident pour le détail complet) : le préfixe de contexte d'écran ("[Contexte d'écran actuellement affiché : le tableau de bord.]") était **toujours** concaténé devant le message, avant même que l'intention soit détectée. Ses propres mots ("tableau", "bord") sont scorés par le même routeur lexical que le message de l'utilisateur — sur un message ne portant qu'un seul mot-clé net ("comment"), le préfixe (2 mots-clés) l'emportait.

**Correction** (`src/modules/ai-copilot/services/aiCopilotBridge.service.js::sendMessageAsActingUser`) : avant de préfixer, un second appel — bon marché, déterministe, hors-ligne — au VRAI `IntentDetector` teste le message SEUL. S'il porte déjà un signal réel (n'importe quelle intention autre que `general_chat`), le préfixe n'est PAS ajouté : le message atteint `AIManager` inchangé, donc l'intention explicite ne peut jamais être diluée par le contexte d'écran.

```
"Comment créer un projet ?"                     (seul)      → documentation_question   [le mot "comment" suffit]
"[Contexte : tableau de bord]\n\nComment créer un projet ?" → toujours documentation_question (préfixe jamais ajouté, la garde l'a bloqué)
```

## 3. Règle contextuelle — le contexte reste un signal secondaire

Le contexte d'écran continue d'aider quand le message seul est faible (`general_chat`, aucun mot-clé) : voir `test/aiCopilotBridge.service.test.js`, section "Context Awareness (pageContext)" et `test/fixtures/copilotValidationScenarios.js`, section "CONTEXT AWARENESS" (15 scénarios `ctx-01`..`ctx-15`). Exemple honnête déjà documenté : "Montre les ventes." (aucun mot-clé seul) + écran dashboard → absorbé par `dashboard`, jamais par hasard, jamais au détriment d'un signal net.

| Écran | Message | Intention réelle | Agent |
|---|---|---|---|
| Dashboard | "Quels projets sont critiques ?" | `dashboard` (le contexte dashboard renforce le signal KPI) | `kpi_agent` |
| Dashboard | "Comment créer un projet ?" | `documentation_question` (jamais écrasé par le contexte) | `crm_assistant_agent` |
| Project | "Pourquoi ce projet est en retard ?" | `projects` (marqueur d'attention "retard") | `project_agent` |
| Project | "Comment modifier ce projet ?" | `documentation_question` | `crm_assistant_agent` |

## 4. Score de confiance et entités — `IntentDetector.detect()`

Contrat étendu (additif, `src/ai/orchestrator/intentDetector.js`) :

```js
{
  name, moduleKey, requiresRag, requiresTools, description,
  requiredRoles, allowedEmails, relatedModules,
  confidence,      // nombre, voir les 4 paliers ci-dessous
  entities,        // string[], ex. ["project"]
  ambiguous,       // bool, presque toujours false — voir §5
  alternateIntent, // {name, description} | null
}
```

`agent` n'est délibérément **pas** un champ d'`IntentDetector` : `AgentRouter`/`AgentRegistry` restent seuls responsables de cette résolution (séparation des responsabilités déjà en place) — voir §6 pour retrouver l'Agent à partir de l'intention.

Quatre paliers de confiance, honnêtes plutôt qu'une courbe continue fabriquée (`src/ai/orchestrator/intentConfidence.js`) :

| Palier | Valeur | Condition réelle |
|---|---|---|
| REPLI | 0.30 | La route gagnante a un score lexical nul (aucun mot-clé du catalogue trouvé). |
| FAIBLE | 0.55 | Une autre route a égalé ou dépassé le score du gagnant (hors priorité procédurale). |
| FORTE | 0.90 | Le gagnant a un score strictement supérieur à toute autre route. |
| PRIORITÉ PROCÉDURALE | 0.95 | `documentation_question` l'emporte sur une égalité réelle — une victoire par règle explicite (§2), pas par hasard. |

```
"Comment créer un projet ?"      → { intent: "documentation_question", confidence: 0.95, entities: ["project"] }
"Quels projets sont critiques ?" → { intent: "projects",               confidence: 0.90, entities: ["project"] }
```

## 5. Ambiguïté — clarifier plutôt que deviner

`AIManager.handleMessage()` (étape ajoutée juste après la détection d'intention) : si `intent.ambiguous === true`, la réponse est `mode: "clarification"`, construite à partir des **deux** intentions réelles concurrentes (`intent.description` et `intent.alternateIntent.description`) — jamais un texte inventé. `AgentRouter`/`ToolRouter`/`WorkflowManager` ne sont pas appelés.

`ambiguous` est délibérément un signal étroit : il ne se déclenche que quand le message ENTIER ne contient qu'un seul mot-clé du catalogue, partagé par deux intentions (ex. "kpi", présent à la fois dans `commercial_contacts` et `dashboard`). Vérifié par simulation contre les 550 scénarios du corpus : **0 déclenchement inattendu** — un signal plus large (n'importe quelle égalité de score) aurait déclenché une clarification sur 39 scénarios déjà validés et correctement résolus par l'ordre délibéré du catalogue, une régression, pas une amélioration.

```
"Quels sont mes KPI ?" (seul, sans contexte d'écran)
→ { ambiguous: true, alternateIntent: { name: "dashboard", ... } }
→ mode: "clarification"
→ "Votre question peut correspondre à deux besoins différents : Contacts commerciaux et leurs
   indicateurs (KPI). ou Tableaux de bord et indicateurs clés (KPI). Pouvez-vous préciser votre demande ?"
```

## 6. Matrice Agent / Intent (complète, 18 intentions réelles)

| Intention (`intent.name`) | Agent (`agent.name`) | Tools autorisés | Permissions (rôle) |
|---|---|---|---|
| `documentation_question` | `crm_assistant_agent` | Aucun (RAG uniquement) | Ouvert |
| `general_chat` | `assistant_agent` | Aucun (RAG uniquement) | Ouvert |
| `projects` | `project_agent` | `list_projects`, `move_project_stage`, `assign_project_owner`, `create_project_action` | Ouvert (le Tool restreint les mutations) |
| `pipeline` | `pipeline_agent` | `list_pipeline_stages`, ... | Ouvert |
| `commercial_contacts` | `commercial_agent` | `get_commercial_contact_kpi`, ... | commercial/admin/superadmin/superadmin2 |
| `maintenance` | `maintenance_agent` | `create_maintenance_request`, ... | Ouvert (le Tool restreint les mutations) |
| `notifications` | `notification_agent` | `list_my_notifications`, ... | Ouvert |
| `industrial` | `industrial_agent` | `list_industrial_records`, ... | Ouvert |
| `dashboard` | `kpi_agent` | `get_dashboard_kpis`, `get_user_dashboard`, `get_professional_dashboard`, `get_legacy_dashboard_kpis` | Ouvert (le Tool restreint admin-tier) |
| `reporting` | `reporting_agent` | Mêmes Tools que `kpi_agent` | Ouvert (le Tool restreint admin-tier) |
| `automation` | `automation_agent` | Multi-module (`moduleKey: null`) | Ouvert |
| `business_analysis` | `business_analyst_agent` | Multi-module | Ouvert |
| `recommendation` | `recommendation_agent` | Multi-module | Ouvert |
| `data_quality` | `data_quality_agent` | `list_projects` (lecture seule uniquement) | Ouvert |
| `advanced_search` | `advanced_search_agent` | Multi-module | Ouvert |
| `users` | *(aucun)* | `ToolRouter` sélectionne parmi les Tools du module `users` | Selon le Tool |
| `hr` | *(aucun)* | `ToolRouter` sélectionne parmi les Tools du module `hr` | Selon le Tool (ex. `accept_hr_request` réservé aux rôles RH) |
| `por_promesh` | *(aucun)* | `ToolRouter` sélectionne parmi les Tools du module `porPromesh` | Selon le Tool |

Source : `src/ai/agents/manifest.js::defaultAgentFactories` (15 Agents) + `src/ai/orchestrator/intentCatalog.js`. Sélection des Tools (étape 9 de l'incident) : déjà pilotée par intention → module (`moduleKey`/`relatedModules`) → `ToolRouter` (classement lexical description-vs-message) → permissions (`isAuthorized`, au niveau Tool) — jamais par le seul écran actif (voir `orchestrator/toolRouter.js`, `TOOL_ROUTER.md`).

## 7. Exemples vérifiés contre le vrai `IntentDetector` (offline, déterministe)

Chaque ligne a été exécutée réellement (pas recopiée depuis la spécification) :

| Message | Intention | Confiance | Agent |
|---|---|---|---|
| "Comment créer un projet ?" | `documentation_question` | 0.95 | `crm_assistant_agent` |
| "Comment modifier un projet ?" | `documentation_question` | 0.95 | `crm_assistant_agent` |
| "Comment ajouter un client ?" | `documentation_question` | 0.90 | `crm_assistant_agent` |
| "Comment créer une activité ?" | `documentation_question` | 0.90 | `crm_assistant_agent` |
| "Comment créer un rendez-vous ?" | `documentation_question` | 0.90 | `crm_assistant_agent` |
| "Comment ajouter un contact ?" | `documentation_question` | 0.95 | `crm_assistant_agent` |
| "Comment envoyer un devis ?" | `documentation_question` | 0.90 | `crm_assistant_agent` |
| "Comment fonctionne le pipeline ?" | `documentation_question` | 0.90 | `crm_assistant_agent` |
| "Quels projets sont critiques ?" | `projects` | 0.90 | `project_agent` |
| "Quels sont mes KPI ?" (seul) | `commercial_contacts`, **ambigu** → clarification | 0.55 | *(clarification, aucun Agent)* |
| "Pourquoi mes projets sont en retard ?" | `projects` | 0.90 | `project_agent` |
| "Montre-moi mes projets." | `projects` | 0.90 | `project_agent` |
| "Résume ce projet." | `projects` | 0.90 | `project_agent` |
| "Quels clients dois-je relancer ?" | `general_chat` — lacune lexicale honnête ("relancer" ≠ "relance", voir `test/fixtures/copilotValidationScenarios.js` scénario `smart-04`) | 0.30 | `assistant_agent` |
| "Donne-moi les statistiques du mois." | `dashboard` | 0.90 | `kpi_agent` |
| **"donne-moi les instructions comment je peux créer un projet"** (le bug rapporté) | `documentation_question` | 0.95 | `crm_assistant_agent` |

## 8. Réponse "Comment créer un projet ?" — CRM Assistant

Le CRM Assistant (`crmAssistantAgent.js`, déjà construit avant cet incident — voir `src/ai/orchestrator/CRM_ASSISTANT.md`) répond exclusivement via RAG, sans aucun Tool (`allowedToolNames: []`), à partir de `docs/user-guide/01-creer-un-projet.md` — vérifié (et 3 inexactitudes corrigées dans cette passe) contre le vrai formulaire Flutter (`Dash Master Toolkit/lib/forms/view/project_form_screen.dart`). La procédure réelle est un **assistant en 5 étapes** — *Général, Détails, Contacts, Localisation, Action* — jamais les 9 étapes génériques données en exemple dans la demande initiale, qui ne correspondent pas à l'écran réel du CRM (l'instruction "ne pas inventer une étape non confirmée par le CRM réel" prime sur le format d'exemple). Voir le rapport d'incident pour le détail de la vérification live et hors-ligne.

## 9. Tests

- `test/ai.orchestrator.intentConfidence.test.js` — les 4 paliers de confiance, contre le vrai catalogue.
- `test/ai.orchestrator.intentDetector.test.js` — contrat `detect()` étendu (`confidence`/`entities`/`ambiguous`/`alternateIntent`).
- `test/ai.orchestrator.aiManager.test.js` — clarification déclenchée sur `intent.ambiguous`, jamais sur le cas normal, jamais d'appel à `AgentRouter`/`ToolRouter`/`WorkflowManager` pendant une clarification.
- `test/aiCopilotBridge.service.test.js` — la garde contexte-vs-intention (§2), sur 3 écrans (dashboard/projet/commercial) + le message exact du bug rapporté + un contre-exemple honnête (contexte toujours utile quand le message seul est faible).
- `test/fixtures/copilotValidationScenarios.js` (+`test/ai.validation.copilotScenarios.test.js`) — corpus étendu à 550 scénarios (+14 pour cet incident, dont le test de régression obligatoire `reg-01`), 5 assertions réelles chacun (intention, Agent, permission Agent, Tools attendus, permission Tool).
- `test/ai.rag.crmAssistantKnowledgeBase.test.js` — la récupération RAG retrouve bien `docs/user-guide/01-creer-un-projet.md` en 1ère position pour "Comment créer un projet ?", avec les 5 vraies étapes.

Détail chiffré complet (nombre de tests, tests réussis) : voir `AI-Business-Copilot/10_INTENT_ROUTING_FIX.md`.
