# AI Copilot HTTP/WebSocket delivery — `modules/ai-copilot/`

Client réel de ce contrat : l'application Flutter (`Dash Master Toolkit/lib/ai/`, voir son propre `README.md`) — un Floating Action Button présent sur toute page authentifiée, un panneau desktop (`endDrawer`) ou une feuille mobile (bottom sheet), jamais une page de chat séparée.

Ce document décrit le contrat RÉEL de la couche de livraison conversationnelle — la pièce qui manquait avant cette passe (voir `src/ai/README.md`, section "Ce que ce module ne fait pas" pour l'historique). Tout le raisonnement (intention, permissions, RAG, MCP, LangChain, explicabilité, suggestions) reste dans `src/ai/orchestrator/` (voir `WORKFLOW.md`) — ce module ne fait QUE le transport HTTP/WebSocket, l'authentification, le rate-limit, et deux besoins propres à la livraison qui n'existaient pas dans le kernel : un `conversationId` généré par défaut et un index "quelles conversations appartiennent à quel utilisateur".

## Où sont les fichiers

| Fichier | Rôle |
|---|---|
| `routes/aiCopilot.routes.js` | 6 routes REST, gardées par `authRequired` puis par le gate `AiManager` (`AI_COPILOT_ENABLED`/`AI_COPILOT_ROLES_ALLOWED`). |
| `controllers/aiCopilot.controller.js` | Traduit requête HTTP ↔ appel du bridge, jamais de logique métier ici. |
| `services/aiCopilotBridge.service.js` | Un des deux seuls fichiers de ce module qui touchent `src/ai/` — construit/partage les singletons (McpServer, pipeline RAG, sécurité, gate) et met en cache UN `createAiOrchestrator()` par utilisateur. Depuis Proactive AI, exécute aussi les workflows confirmés (`confirmProactiveWorkflow`/`rejectProactiveWorkflow`, voir `src/ai/proactive/proactiveActionStore.js`). |
| `services/dashboardBriefing.service.js` | L'autre fichier qui touche `src/ai/` — AI Dashboard : le briefing proactif (`GET /ai-copilot/dashboard`), voir sa propre section ci-dessous. Aucune dépendance LLM, volontairement séparé de la bridge ci-dessus. |
| `services/conversationIndex.service.js` | Petit index en mémoire `ownerId -> conversationId[]`, pour "Conversation History" côté client — jamais le contenu des messages (qui reste dans `ConversationManager`/`IConversationMemory`, inchangé). |
| `services/streamingChunker.js` | Découpe une réponse DÉJÀ COMPLÈTE en morceaux pour l'effet "streaming" côté WebSocket — voir la section Streaming ci-dessous. |
| `socket/aiCopilotSocket.js` | Couche temps réel : typing indicator + révélation en chunks + réponse complète, sur les rooms Socket.IO déjà authentifiées de `src/socket.js`. |

## REST — 3 routes, toutes sous `/ai-copilot`

Toutes nécessitent un JWT valide (`authRequired`) PUIS passent le gate `AI_COPILOT_ENABLED`/`AI_COPILOT_ROLES_ALLOWED` (503 si désactivé, 403 si le rôle n'est pas autorisé) — voir `docs/admin-guide/copilot-administration.md` pour la configuration.

### `POST /ai-copilot/chat`

```json
// Requête
{ "message": "Quels projets sont en retard ?", "conversationId": "optionnel", "pageContext": "optionnel — voir section Context Awareness" }

// Réponse 200 — l'enveloppe RÉELLE de ResponseBuilder (voir orchestrator/responseBuilder.js), inchangée
{
  "success": true,
  "data": {
    "conversationId": "...", "intent": "projects", "mode": "agent",
    "answer": "...", "explanation": "...", "explainability": {...},
    "pendingAction": null, "citations": [], "toolCalls": [],
    "suggestions": [], "dataQuality": [], "followUpQuestion": null,
    "agent": "project_agent", "generatedAt": "..."
  }
}
```

`conversationId` omis → généré côté serveur (`uuid`), renvoyé dans `data.conversationId` — le client doit le mémoriser pour les tours suivants (mémoire de conversation, voir `CONVERSATION_CONTEXT.md`). Un refus de permission (rôle non autorisé pour CETTE question précise) n'est PAS une erreur HTTP : `AIManager.handleMessage()` le retourne déjà sous forme de `mode: "error"` dans l'enveloppe, avec un message sûr — le contrôleur ne fait que le relayer avec un `200`. Seules deux vraies erreurs HTTP existent ici :
- `503` — `NotConfiguredError` (aucun `ILlmProvider` configuré, voir `AI_LLM_PROVIDER`).
- `500` — tout le reste (message générique, jamais l'erreur brute — voir `responseBuilder.js::buildErrorResponse`, même discipline reconduite ici).

`400` si `message` est absent/vide.

### `GET /ai-copilot/conversations?limit=20`

Liste (id, aperçu, intention, date de mise à jour) des conversations de l'appelant, triées de la plus récente à la plus ancienne — alimenté par `conversationIndex.service.js`, mis à jour après chaque tour réussi.

### `GET /ai-copilot/conversations/:id`

Historique complet des messages d'UNE conversation — `404` si l'appelant ne l'a jamais "touchée" lui-même (jamais une conversation d'un autre utilisateur, même si l'id est deviné).

### `GET /ai-copilot/dashboard` — AI Dashboard

Le briefing proactif affiché automatiquement à l'ouverture du Copilot — voir `services/dashboardBriefing.service.js`. **Aucune dépendance LLM** : contrairement à `/chat`, ne renvoie jamais `503 NotConfiguredError` — entièrement déterministe, réutilise les mêmes moteurs de règles que `ProjectAgent`/`DataQualityAgent`/`SuggestionEngine` (`src/ai/reasoning/`, `src/ai/orchestrator/suggestionEngine.js`), jamais une deuxième définition de "projet critique"/"qualité CRM" qui pourrait diverger.

```json
// Réponse 200
{
  "success": true,
  "data": {
    "generatedAt": "...",
    "greeting": { "firstName": "Khalil", "fullName": "Khalil Ben Ali" },
    "today": { "criticalProjects": 5, "expiringQuotes": 3, "urgentInterventions": 2, "clientsToFollowUp": 4 },
    "crmQuality": { "score": 96 },
    "riskCards": [{ "projectId": "...", "projectName": "Villa Sfax", "score": 24, "priority": "critique", "topReason": "Relance en retard de 12 jour(s)" }],
    "recommendationCards": [{ "id": "create_activity", "label": "Créer une activité", "reason": "..." }],
    "timeline": [{ "type": "project", "bucket": "today", "label": "Projet critique : Villa Sfax", "refId": "...", "date": null }],
    "chart": { "labels": ["Projets critiques", "Devis expirants", "Interventions urgentes", "Clients à relancer"], "values": [5, 3, 2, 4] }
  }
}
```

Comment chaque champ est réellement calculé (aucune donnée fabriquée) :

- **`greeting.firstName`** — `UserProfile.prenom` de l'appelant ; `null` (jamais une chaîne vide/inventée) si non renseigné, l'UI affiche alors "Bonjour 👋" sans nom.
- **`today.criticalProjects`** / **`riskCards`** — `ProjectAttentionAnalyzer.analyzeProjectAttention()` sur le même périmètre de projets que `ProjectAgent._runAttentionAnalysis()` (`list_projects` non archivés) ; `riskCards` = les 5 premiers projets de priorité `"critique"`, avec leur facteur le plus contributif (`topReason`) — jamais une raison générique.
- **`crmQuality.score`** — `DataQualityAnalyzer.analyzeDataQuality()` sur les mêmes projets (doublons, informations manquantes, emails/téléphones invalides, incohérences, etc.) — la même formule déjà utilisée par `DataQualityAgent`, jusque-là accessible uniquement via le chat.
- **`recommendationCards`** — `SuggestionEngine.suggestForFactors()` (même classe que celle utilisée par `ProjectAgent` pour les Smart Suggestions post-réponse), construit avec un `toolPermissionIndex` réel (`orchestrator/pipeline.js::buildToolPermissionIndex()`) : une recommandation adossée à un Tool MCP n'apparaît QUE si l'utilisateur courant est réellement autorisé à l'exécuter — jamais montrée sinon.
- **`today.expiringQuotes`** — nombre de `ProjectDevis` dont `dateExpiration` (voir migration `20260807090000-add-date-expiration-to-project-devis.js` — champ absent du modèle d'origine, ajouté pour cette fonctionnalité) tombe dans les 30 prochains jours, parmi les projets déjà chargés ci-dessus. Un devis existant sans `dateExpiration` renseignée n'est **jamais** compté comme expirant.
- **`today.urgentInterventions`** — `MaintenanceRequest` `urgence: "critique"` et encore ouverte (`en_attente`/`acceptee`/`en_cours`), **réservé aux gestionnaires de maintenance** (`isMaintenanceManager()`, même règle que `GET /maintenance-requests/stats`) : `null` (jamais `0`) pour tout autre rôle — distingue "aucune intervention urgente" de "vous n'avez pas le droit de voir ce chiffre".
- **`today.clientsToFollowUp`** — nombre de clients **distincts** (pas de lignes de relance) avec au moins une `CommercialContactRelance` `planifiee` et déjà due, scopé par `createdBy` pour tout rôle non admin — même règle que `GET /commercial-contacts/calendar/relances`.
- **`timeline`** — les mêmes éléments que ci-dessus, regroupés par échéance (`bucket`: `"today"`/`"week"`/`"later"`) plutôt que par catégorie ; les cartes de risque n'ont pas de date unique naturelle et sont donc toujours `"today"`.
- **`chart`** — dérivé des 4 mêmes compteurs de `today` (aucune nouvelle donnée), pour une lecture visuelle en plus des compteurs.

### `POST /ai-copilot/proactive/:workflowId/confirm` / `POST /ai-copilot/proactive/:workflowId/reject` — Proactive AI

Confirmer ou rejeter un workflow proposé par une alerte proactive (voir `src/ai/proactive/PROACTIVE_AI.md`) — reçu via l'événement WebSocket `proactive-ai-alert` (hors du namespace `ai-copilot:*`, voir plus bas), qui porte `workflow: {id, label, reason, status: "pending_confirmation"}` quand un workflow est proposé.

```json
// Réponse 200 — confirm
{ "success": true, "data": { "workflowId": "...", "label": "Créer un rappel", "domain": "projects", "subject": "...", "result": {...} } }

// Réponse 200 — reject
{ "success": true }
```

`confirm` EXÉCUTE réellement l'action (via `McpServer.handleMessage()`, avec l'`actingUser` de l'appelant — jamais celui du cron qui a détecté le risque) ; `reject` ne fait qu'écarter la proposition. `404` dans les 3 cas suivants, **jamais distingués** (pour ne jamais révéler qu'un workflow existe pour quelqu'un d'autre) : `workflowId` inconnu, expiré (TTL 48h), ou proposé à un autre utilisateur. Consommé une seule fois — une seconde confirmation/rejet du même `workflowId` renvoie aussi `404`.

## WebSocket — `src/socket.js`, un canal `ai-copilot:*` supplémentaire

Réutilise EXACTEMENT l'authentification/les rooms déjà en place (`user:${id}`, JWT dans le handshake) — voir `PROACTIVE_AI.md` pour le même principe côté alertes proactives. Câblé depuis `src/app.js` (jamais depuis `src/socket.js` lui-même — voir `socket/aiCopilotSocket.js`, en-tête du fichier, pour pourquoi ce choix délibéré : garder `socket.js` léger pour ses propres appelants qui n'ont pas besoin de charger tout le kernel IA/MCP).

| Sens | Événement | Payload |
|---|---|---|
| Client → serveur | `ai-copilot:send` | `{ message, conversationId?, pageContext? }` |
| Serveur → client | `ai-copilot:typing` | `{ conversationId }` — émis immédiatement |
| Serveur → client | `ai-copilot:chunk` | `{ conversationId, text }` — 1..N, voir Streaming |
| Serveur → client | `ai-copilot:complete` | l'enveloppe complète (même forme que la réponse REST) |
| Serveur → client | `ai-copilot:error` | `{ message }` — à la place de chunk/complete en cas d'échec |

### `proactive-ai-alert` — un événement DÉLIBÉRÉMENT hors du namespace `ai-copilot:*`

Émis par `src/ai/proactive/alertDispatcher.js` (jamais par `socket/aiCopilotSocket.js`) sur le MÊME canal `socket.js`/`emitToUser` — un type d'événement dédié et filtrable côté client plutôt qu'un flux générique à haute fréquence. Payload = un `ProactiveAlert` (voir `PROACTIVE_AI.md`) : `{domain, subject, severity, analysis, explanation, suggestion, suggestedActions, workflow, context}`, où `workflow` est soit `null`, soit `{id, label, reason, status: "pending_confirmation"}` — jamais `tool`/`input` (voir `POST /ai-copilot/proactive/:workflowId/confirm` ci-dessus pour la confirmation). Ce n'est PAS un aller-retour conversationnel : aucune requête client ne déclenche cet événement, seul le cron `proactiveAiMonitor.job.js` (désactivé par défaut, `AI_PROACTIVE_MONITORING_ENABLED`) le fait.

## Context Awareness — le Copilot sait où se trouve l'utilisateur

Le client (Flutter) peut joindre un champ optionnel `pageContext` à `POST /ai-copilot/chat` et à `ai-copilot:send`, décrivant l'écran actuellement affiché — projet, client, dashboard ou fiche industrielle. Ce n'est PAS un nouveau système de permissions ni un nouveau champ dans `AIManager`/l'orchestrateur : c'est un texte injecté par la couche de livraison AVANT que le message n'atteigne le kernel déjà validé (corpus de 500 scénarios), qui reste totalement inchangé.

**Forme du champ** (`{ screen, label?, data? }`, voir `services/pageContextFormatter.js`) :

```json
{
  "screen": "project",
  "label": "Villa Sfax",
  "data": { "client": "Comptoir X", "statut": "en_cours", "diametre": "200mm" }
}
```

`screen` doit être l'une de `project` / `client` / `dashboard` / `industrial` (une valeur inconnue est acceptée mais affichée telle quelle, jamais rejetée — voir `SCREEN_LABELS`). `label` et `data` sont libres et entièrement optionnels.

**Comment c'est transporté** — `aiCopilotBridge.service.js::sendMessageAsActingUser()` appelle `formatPageContext(pageContext)`, qui produit une phrase française du type :

```
[Contexte d'écran : l'utilisateur consulte actuellement la fiche d'un projet (Villa Sfax) — client : Comptoir X ; statut : en_cours.]
```

et la préfixe au message de l'utilisateur (`${contextPrefix}\n\n${message}`) avant l'appel à `orchestrator.aiManager.handleMessage()`. Si `pageContext` est absent, malformé, ou que `formatPageContext()` renvoie `null`, le message part inchangé — jamais d'erreur, jamais de blocage du tour.

**Limites volontaires** — `MAX_PREFIX_LENGTH = 800`, `MAX_DATA_ENTRIES = 12`, `MAX_VALUE_LENGTH = 120` (voir `pageContextFormatter.js`) : un `pageContext` anormalement volumineux est tronqué plutôt que de gonfler le prompt envoyé au LLM.

**Compromis assumé, pas caché** — `ConversationManager` mémorise donc le message PRÉFIXÉ par le contexte, pas le texte brut de l'utilisateur ; c'est délibéré (le contexte fait partie du tour tel qu'il a été traité) mais signifie que l'historique de conversation n'est plus un miroir exact de ce que l'utilisateur a tapé.

**Où c'est produit côté client** — voir `Dash Master Toolkit/lib/ai/README.md`, section "Context Awareness", pour les 4 écrans réels qui posent ce contexte (`project_form_screen.dart`, `commercial_contact_list_getx_screen.dart`, `dashboard_screen.dart`, `por_promesh_detail_screen.dart` / `probar_detail_screen.dart`) et le mécanisme d'inclusion automatique à chaque tour.

## Streaming — honnête sur ce que c'est vraiment

**Ce n'est PAS du vrai streaming token-par-token d'un LLM.** Aucun `ILlmProvider` de ce kernel n'implémente `stream()` (voir `services/providers/openAiProvider.js`/`anthropicProvider.js` : seul `complete()` est appelé, la réponse arrive entière). `streamingChunker.js` découpe cette réponse DÉJÀ COMPLÈTE en groupes de 3 mots, émis avec un court délai (35 ms par défaut) entre chaque `ai-copilot:chunk` — un effet de révélation progressive côté client, pas une génération incrémentale côté serveur. Documenté ainsi pour qu'aucune démonstration ne prétende le contraire. Implémenter un vrai streaming nécessiterait d'adapter `ILlmProvider.complete()` en un vrai `stream()` ET `LlmProviderChatModel`/les Chains LangChain pour consommer un flux — hors périmètre de cette passe (délivrance HTTP/WebSocket uniquement).

## Ce qui n'a pas été fait (délibérément)

- **Aucune persistance durable** — `conversationIndex.service.js` et la mémoire de conversation sous-jacente (`InMemoryConversationMemory`) sont volatiles, perdues au redémarrage. Un adaptateur SQL/Redis remplacerait les deux sans qu'aucun appelant ne change (même contrat de méthodes).
- **Un orchestrateur par utilisateur, mis en cache indéfiniment pour la durée du process** — nécessaire pour que l'historique/les automatisations en attente survivent entre deux messages (voir le commentaire de tête de `aiCopilotBridge.service.js`), mais signifie que la mémoire du process croît avec le nombre d'utilisateurs actifs distincts. Acceptable pour cette passe, pas un mécanisme d'éviction construit.
- **`responsable_logistique_achat` n'a pas accès à `/ai-copilot`** — `middleware/moduleAccessGuard.js` ne l'inclut pas dans les préfixes autorisés pour ce rôle, exactement la même limitation déjà documentée pour `/ai-dashboard` (voir `docs/admin-guide/copilot-administration.md`) — une décision produit à reprendre séparément, pas un oubli de câblage.
