# Proactive AI — le Copilot ne doit plus attendre une question

Ce document décrit le sous-système `src/ai/proactive/` : le Copilot surveille désormais **Projets, Pipeline, Ventes, Maintenance, RH, Industrial et KPI (Dashboard)** — les 6 domaines demandés, plus Ventes en bonus — **sans qu'un utilisateur pose une question**, et pousse une alerte réelle (e-mail + notification in-app + événement temps réel) dès qu'un risque est détecté, avec **les 5 volets demandés** : une notification (l'envoi lui-même), une analyse (les faits bruts), une explication (le texte qui les résume), une suggestion (une recommandation), et — quand c'est possible en toute sécurité — un **workflow réellement confirmable et exécutable**, jamais exécuté sans validation explicite. Point d'entrée : `src/cron/proactiveAiMonitor.job.js`, désactivé par défaut (`AI_PROACTIVE_MONITORING_ENABLED=false`).

## Pourquoi un NOUVEAU sous-système, pas une extension de l'existant

Deux sous-systèmes existaient déjà et se rapprochaient de cette demande — l'audit préalable à la première passe a été décisif pour ne rien dupliquer :

- **`src/ai/dashboard/`** (Dashboard IA, 7 analyseurs de domaine — `projects`/`pipeline`/`sales`/`maintenance`/`hr`/`industrial`/`kpi`) produit déjà 4 catégories utiles (`alerts`/`risks`/`anomalies`/`recommendations`) en bonne forme structurée — mais est **strictement PULL** : reconstruit à chaque requête `GET /ai-dashboard/...`, jamais programmé, jamais poussé. Réutilisé tel quel ici (`createDashboardPipeline`, jamais reconstruit).
- **`src/ai/automations/`** (8 automatisations) existe, est testé, mais **n'est appelé nulle part en dehors de ses propres tests**. Aucune n'envoie une alerte accompagnée d'une analyse ET d'une explication ET d'une suggestion ET d'un workflow confirmable dans un seul objet cohérent.

Ni l'un ni l'autre n'était câblé à un scheduler. `src/ai/proactive/` est donc un troisième sous-système, au même niveau que `dashboard/`/`automations/` (jamais imbriqué dans l'un ou l'autre), qui les RÉUTILISE tous les deux plutôt que de recalculer une détection de risque.

## Les 6 domaines demandés → où ils sont réellement détectés

| Domaine demandé | Détecté par | Pourquoi |
|---|---|---|
| Projets | `ProjectAttentionAnalyzer` (`reasoning/`, Business Reasoning) | Déjà le moteur le plus riche pour les projets — 6 dimensions notées, dont **activités** (`activite`) et **échéances** (`echeance`) — pas des modules séparés, ce sont des FACETTES d'un projet dans ce modèle de données |
| Pipeline | `DomainAnalyzer` (`dashboard/`), domaine `pipeline` | Déjà réel, déjà testé — étapes bloquées/opportunités stagnantes |
| Maintenance | `DomainAnalyzer`, domaine `maintenance` | Interventions critiques en attente |
| RH | `DomainAnalyzer`, domaine `hr` | Demandes RH en attente/anomalies |
| Industrial | `DomainAnalyzer`, domaine `industrial` | Non-conformités Probar/Promesh |
| Dashboard (KPI) | `DomainAnalyzer`, domaine `kpi` | Indicateurs globaux hors seuil |
| *Ventes (bonus, hors périmètre demandé)* | `DomainAnalyzer`, domaine `sales` | Déjà couvert avant l'extension à 6 domaines — conservé, retirer n'apportait rien |

Aucune deuxième logique de scoring n'a été écrite — `proactiveMonitor.js` ORCHESTRE ces moteurs existants (`domains: ["pipeline", "sales", "maintenance", "hr", "industrial", "kpi"]` passé tel quel à `DashboardService.getSnapshot()`, plus `ProjectAttentionAnalyzer` séparément pour les projets), il ne les remplace ni ne les recalcule.

## Le cycle : détecter → construire l'alerte → envoyer (3 responsabilités, 3 fichiers + 1 store)

```
ProjectAttentionAnalyzer ──┐
                            ├──► ProactiveMonitor.detectAlerts() ──► ProactiveAlert[] ──► AlertDispatcher.dispatch()
DomainAnalyzer (x6) ────────┘         (détection SEULE,                                    (envoi + PROPOSITION de
                                        jamais un envoi)                                     workflow, jamais
                                                                                              d'exécution)
                                                                                                    │
                                                                                                    ▼
                                                                                      ProactiveActionStore (par
                                                                                      destinataire, TTL 48h)
                                                                                                    │
                                                              POST /ai-copilot/proactive/:id/confirm│ (HTTP, utilisateur)
                                                                                                    ▼
                                                                              aiCopilotBridge.service.js exécute
                                                                              RÉELLEMENT le Tool, via l'actingUser
                                                                              du CONFIRMANT (jamais celui du cron)
```

- **`proactiveMonitor.js`** — `ProactiveMonitor.detectAlerts()` ne fait QUE détecter, ne connaît AUCUN Tool d'écriture (structurellement inatteignable — pas un nom whitelisté, un objet qui n'est physiquement jamais passé au constructeur). Seuls les projets `"critique"`/`"elevee"` déclenchent une alerte (`ALERT_PRIORITIES`) — `"moyenne"`/`"faible"` restent visibles à la demande (`ProjectAgent`, intention `projects`) mais ne méritent pas une interruption non sollicitée. Côté Dashboard IA, seules les catégories `alerts`/`risks`/`anomalies` deviennent des alertes (`RISK_CATEGORIES`) — `recommendations`/`forecasts`/`dataQuality` restent des insights consultables, jamais poussés seuls.
- **`proactiveAnswerBuilder.js`** — fonctions pures qui transforment un risque déjà détecté en `ProactiveAlert {domain, subject, severity, analysis, explanation, suggestion, suggestedActions, workflowTemplate, context}` :
  - `analysis` — les faits BRUTS déjà calculés (`{score, priority, factors}` pour un projet ; `{type, metric, value, category}` pour un domaine Dashboard IA) — un artefact structuré distinct, jamais mélangé au texte.
  - `explanation` — la même chose en français lisible (les raisons déjà calculées, jamais reformulées par un modèle de langage).
  - `suggestion` — un TEXTE de recommandation : pour les projets, `DIMENSION_RECOMMENDATIONS` (`reasoning/businessAnalyzer.js`, déjà réel, une phrase par dimension déclenchée, dédupliquée) ; pour les 6 autres domaines, l'ensemble des `recommendations` déjà calculées dans le MÊME instantané `DomainAnalyzer` (aucun appariement 1-pour-1 avec le risque n'existe dans les données — présenté honnêtement comme les recommandations du domaine, pas LA solution de CE risque précis).
  - `suggestedActions` — pour les projets uniquement, les libellés de `SuggestionEngine.suggestForFactors()` (Smart Suggestions, déjà réel, permission-filtré) — de simples chaînes, informationnelles ; `[]` pour les autres domaines.
  - `workflowTemplate` — voir section dédiée ci-dessous. `null` la plupart du temps : jamais un Tool appelé avec des données inventées.
- **`alertDispatcher.js`** — `AlertDispatcher.dispatch(alerts, recipients)` envoie réellement, par les 2 SEULS canaux réels de ce kernel :
  1. `send_notification_email` (Tool MCP réel, admin-tier) — un e-mail réel ET une notification in-app (**la "notification"** des 5 volets demandés — ce n'est pas un champ sur l'alerte, c'est cet envoi lui-même).
  2. `emitToUser` (`src/socket.js`) — un événement dédié `"proactive-ai-alert"`, filtrable côté client, jamais un flux générique à haute fréquence.
  Pour CHAQUE destinataire, si `alert.workflowTemplate` existe, une proposition DISTINCTE est enregistrée dans `ProactiveActionStore` (voir ci-dessous) et le payload envoyé au client contient `workflow: {id, label, reason, status: "pending_confirmation"}` — jamais `tool`/`input` (les détails d'exécution restent internes, résolus seulement à la confirmation). Un envoi qui échoue est consigné dans `errors`, jamais bloquant pour les autres envois.

## Le workflow — la 5ᵉ sortie demandée, réellement confirmable et exécutable

**Condition stricte avant qu'un `workflowTemplate` existe** (`buildWorkflowTemplate()`, `proactiveAnswerBuilder.js`) : la suggestion doit être `create_activity` ou `create_reminder` — les DEUX SEULES dont le Tool sous-jacent (`create_project_action`, voir `suggestionCatalog.js`) n'a besoin d'AUCUNE donnée qu'on ne possède pas déjà (`projectId` + la raison déjà calculée par `ProjectAttentionAnalyzer`). `prepare_email`/`schedule_meeting`/`notify_team` exigeraient de deviner un destinataire, un horaire ou un message — **jamais fabriqués** : ces domaines/suggestions restent `workflowTemplate: null`, seulement une suggestion textuelle.

**`ProactiveActionStore`** (`proactiveActionStore.js`) réutilise TEL QUEL `orchestrator/pendingActionStore.js` — déjà réel, déjà testé, déjà la seule pièce qui rend une confirmation possible ailleurs dans ce kernel (`AutomationAgent`, confirmation en conversation) — jamais une deuxième implémentation. Différences volontaires par rapport à l'usage chat :
- clé = un `workflowId` (un par `[alerte, destinataire]`, généré à l'envoi), jamais un `conversationId` — il n'y a pas de conversation quand le cron déclenche une alerte ;
- TTL 48h (contre 15 min en conversation) — une alerte proactive est consultée plus tard dans la journée, pas dans la minute qui suit.

**Confirmation** — `POST /ai-copilot/proactive/:workflowId/confirm` (voir `AI_COPILOT_HTTP.md`) : `aiCopilotBridge.service.js::confirmProactiveWorkflow()` vérifie que l'appelant est EXACTEMENT le destinataire à qui ce `workflowId` a été proposé (sinon `null`, jamais une exécution "au nom de" quelqu'un d'autre), consomme la proposition (jamais ré-exécutable), puis appelle RÉELLEMENT le Tool via `McpServer.handleMessage({method:"tools/call", params:{name, arguments, actingUser}})` — avec l'`actingUser` du CONFIRMANT (mappé depuis son propre JWT), jamais l'identité admin-tier synthétique du cron. **Rejet** — `POST /ai-copilot/proactive/:workflowId/reject` : consomme la proposition SANS jamais rien exécuter.

## Qui reçoit l'alerte

Tous les comptes admin-tier actifs (`list_users_by_role({role:"admin"})`, résolu à chaque cycle — jamais une liste codée en dur qui pourrait dériver). L'identité AGISSANTE du cycle lui-même (`actingUser`, nécessaire pour que les Tools de lecture fonctionnent) est le premier compte admin-tier actif trouvé en base (résolution Sequelize DIRECTE, mais dans `cron/proactiveAiMonitor.job.js` — un point d'ENTRÉE/bootstrap, pas du code sous `src/ai/`, donc hors du périmètre de la règle "l'IA n'accède jamais directement à Sequelize" vérifiée par `test/ai.proactive.policy.test.js`, qui ne scanne que `src/ai/proactive/`). Sans compte admin-tier actif, le cycle est ignoré proprement (jamais une identité fabriquée). **Cette identité cron n'exécute jamais rien** — voir section workflow ci-dessus : seule l'identité du confirmant, au moment de la confirmation HTTP, exécute quoi que ce soit.

## Câblage — le MÊME pattern que les 4 crons déjà existants, un garde-fou DÉDIÉ

`src/cron/proactiveAiMonitor.job.js` suit EXACTEMENT le pattern déjà en place dans tout le dépôt (`node-cron`, `require()` au chargement de `app.js`, effet de bord = enregistrement du planning) — jamais une nouvelle bibliothèque de scheduling introduite. Planifié quotidiennement à 7h00 (heure Tunis), avant le début de la journée de travail. Gardé par **`AI_PROACTIVE_MONITORING_ENABLED`** — un interrupteur DÉDIÉ, distinct de `AUTO_EMAIL_JOBS_ENABLED`. **Désactivé par défaut** dans `.env.example` ; le vrai `.env` de ce dépôt ne définit pas cette variable non plus (donc désactivé aussi en pratique) — activer la surveillance réelle est une décision opérationnelle délibérée, hors périmètre de cette passe.

## Ce qui n'a pas été fait (délibérément)

- **Aucune "suggestion"/"workflow" spécifique par risque pour les domaines Dashboard IA** (pipeline/ventes/maintenance/RH/industrial/kpi) — `DomainAnalyzer` ne lie formellement aucune recommandation à un risque précis dans ses données ; inventer un tel appariement aurait été une fabrication. Le `workflowTemplate` exécutable n'existe QUE pour les projets (voir section dédiée) — les 6 autres domaines restent volontairement au stade "suggestion textuelle", jamais un Tool deviné.
- **Pas de persistance des workflows au-delà de 48h, ni d'endpoint pour les lister** — un `workflowId` n'arrive QUE par le push Socket.IO au moment de l'alerte ; un destinataire non connecté à ce moment-là (ou après expiration du TTL) n'a aucun moyen de retrouver ce workflow précis. Une extension raisonnable (persister dans la ligne `Notification`, ou un endpoint `GET /ai-copilot/proactive` listant les workflows en attente), pas construite dans cette passe.
- **Pas de ciblage par propriétaire de projet** — toutes les alertes vont aux admin-tier, jamais spécifiquement au propriétaire (`ownerId`) du projet concerné.
- **Pas de fréquence configurable par rôle** — un seul cycle quotidien, un seul destinataire type (admin-tier).
- **Pas de suppression de doublons entre deux cycles** — un risque encore présent le lendemain redéclenche une nouvelle alerte identique (et un nouveau `workflowId` distinct de la veille).

## Tests

- `test/ai.proactive.answerBuilder.test.js` : `analysis`/`explanation`/`suggestion`/`suggestedActions`/`workflowTemplate` pour chacune des 2 sources (projets/`DomainAnalyzer`), déduplication des recommandations, conditions strictes de construction d'un `workflowTemplate`, jamais un texte/Tool fabriqué quand rien n'est disponible.
- `test/ai.proactive.monitor.test.js` : seules les priorités critique/elevee deviennent des alertes, les 6 domaines Dashboard IA sont bien tous interrogés, seules les catégories alerts/risks/anomalies deviennent des alertes, dégradation gracieuse, jamais un Tool d'écriture accessible.
- `test/ai.proactive.dispatcher.test.js` : les 2 canaux réels appelés avec les bons champs, jamais bloquant sur un échec partiel, N alertes × M destinataires, workflow proposé PAR destinataire (jamais partagé), payload client sans tool/input.
- `test/ai.proactive.actionStore.test.js` : réutilisation réelle de `PendingActionStore`, TTL 48h honoré, aucune collision entre workflows.
- `test/ai.proactive.pipeline.test.js` : garde-fous `NotConfiguredError`, réutilisation de `createDashboardPipeline`, `actionStore` bien injecté dans le dispatcher, bout-en-bout via un VRAI `McpServer.handleMessage()` factice.
- `test/ai.proactive.policy.test.js` : aucune référence directe à Sequelize/un service CRM/le manifeste MCP/SQL brut/HTTP sortant dans `src/ai/proactive/` (la réutilisation de `orchestrator/pendingActionStore.js`, un utilitaire générique sans dépendance, reste autorisée — non couverte par ces motifs interdits).
- `test/ai.proactive.cronJob.test.js` : orchestration du point d'entrée cron, Sequelize/McpServer entièrement mockés.
- `test/aiCopilotBridge.service.test.js`, describe "Proactive AI" : `confirmProactiveWorkflow`/`rejectProactiveWorkflow` — exécution avec l'actingUser du confirmant, consommation unique, jamais confirmable par un autre destinataire, erreur du Tool propagée honnêtement.
- `test/aiCopilot.routes.test.js` : `POST /ai-copilot/proactive/:workflowId/confirm|reject`, gate identique aux autres routes, 404 sans distinction (expiré/inconnu/pas le bon destinataire).
