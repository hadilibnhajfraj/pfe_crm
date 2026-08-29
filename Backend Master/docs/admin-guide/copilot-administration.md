# Guide administrateur — Copilot IA (AI Business Copilot)

Ce guide s'adresse à la personne qui configure, active et supervise le Copilot IA en production ou en démonstration — pas à l'utilisateur métier qui lui parle (voir `docs/user-guide/06-utiliser-le-copilot-ia.md`). Il décrit uniquement ce qui est réellement configurable/observable aujourd'hui, contre le vrai code — jamais une capacité à venir présentée comme déjà livrée.

## 1. Activer le kernel IA

Le kernel IA (`src/ai/`) est chargé au démarrage du serveur mais **totalement inerte tant qu'il n'est pas explicitement activé** — un principe de sécurité par défaut respecté dans tout le kernel : "absent/false" désactive toujours, jamais l'inverse.

| Variable (`.env`) | Rôle | Défaut |
|---|---|---|
| `AI_COPILOT_ENABLED` | Interrupteur maître. `false`/absent → `AiManager.isEnabled()`/`isRoleAllowed()` renvoient toujours `false`, quel que soit l'appelant. | `false` |
| `AI_COPILOT_ROLES_ALLOWED` | Liste de rôles séparés par des virgules autorisés à utiliser le Copilot une fois activé (ex. `admin,superadmin`). Vide = tous les rôles authentifiés autorisés. | `admin,superadmin` |
| `AI_LLM_PROVIDER` | Fournisseur LLM réel, désormais CONSOMMÉ (`src/ai/services/providers/`). Valeurs supportées : `openai` (API Chat Completions, aussi compatible Azure OpenAI/gateways OpenAI-compatibles) ou `anthropic` (API Messages). Vide = Copilot inerte pour toute réponse en langage naturel (`NotConfiguredError`, jamais un crash — le reste du kernel, dont `GET /ai-dashboard`, continue de fonctionner normalement). Toute autre valeur fait échouer le DÉMARRAGE avec un message explicite. | vide |
| `AI_LLM_MODEL` | Modèle à utiliser chez ce fournisseur (ex. `gpt-4o-mini`, `claude-3-5-sonnet-latest`). | vide |
| `AI_LLM_API_KEY` | Clé d'API du fournisseur. **Ne jamais committer de vraie clé** — voir le constat de sécurité déjà documenté sur ce fichier. | vide |

Rôles CRM existants (`src/models/User.js`) : `user`, `commercial`, `accueil`, `admin`, `superadmin`, `superadmin2`, `responsable_logistique_achat`. Le "tiers admin" utilisé par le kernel IA (`ADMIN_TIER_ROLES`) regroupe `admin`/`superadmin`/`superadmin2`.

## 2. Ce qui est réellement exposé en HTTP/WebSocket aujourd'hui

**Deux points de montage** (`src/app.js`) :

- `app.use("/ai-dashboard", aiDashboardRoutes)` — lecture seule, 3 routes, rate-limit 60/min :
  - `GET /ai-dashboard` — snapshot complet (7 domaines + résumé 6 catégories).
  - `GET /ai-dashboard/:domain` — un domaine (`projects`/`sales`/`maintenance`/`kpi`/`hr`/`industrial`/`quality`), `400` si invalide.
  - `GET /ai-dashboard/insights/:category` — une catégorie agrégée (`alerts`/`risks`/`anomalies`/`recommendations`/`forecasts`/`dataQuality`), `400` si invalide.
- `app.use("/ai-copilot", aiCopilotRoutes)` — **le moteur conversationnel réel**, gardé par `authRequired` PUIS par `AI_COPILOT_ENABLED`/`AI_COPILOT_ROLES_ALLOWED` (503/403) :
  - `POST /ai-copilot/chat` — `{message, conversationId?}` → l'enveloppe complète de `ResponseBuilder` (rate-limit 20/min, plus strict que le dashboard car chaque appel déclenche un vrai appel LLM).
  - `GET /ai-copilot/conversations` — liste des conversations de l'appelant (rate-limit 60/min).
  - `GET /ai-copilot/conversations/:id` — historique d'une conversation, `404` si elle n'appartient pas à l'appelant.
  - **WebSocket** (`src/socket.js`, canal `ai-copilot:*`) : `ai-copilot:send` en entrée, `ai-copilot:typing`/`ai-copilot:chunk`/`ai-copilot:complete`/`ai-copilot:error` en sortie — voir `src/modules/ai-copilot/AI_COPILOT_HTTP.md` pour le contrat complet et pourquoi le "chunking" n'est PAS un vrai streaming LLM.

**Point d'attention permissions** : `middleware/moduleAccessGuard.js` n'inclut ni `/ai-dashboard` ni `/ai-copilot` dans les préfixes autorisés pour `responsable_logistique_achat` — ce rôle reste donc sans accès au Copilot malgré des Tools (maintenance/industriel/POR PROMESH) qui le concernent directement ; à revoir si ce rôle doit un jour l'utiliser.

## 3. Le manifeste MCP (AI Tools)

74 Tools réels (`src/ai/mcp/tools/index.js`), répartis par module : `maintenance` (15), `porPromesh` (10), `users` (9), `hr` (9), `pipeline` (6), `industrial` (5), `notifications` (5), `dashboard` (4), `googleCalendar` (4), `commercialContacts` (3), `projects` (3), `projectActions` (1).

Chaque Tool déclare son propre `requiredRoles` (et parfois `allowedEmails`, logique OR — utilisé pour des comptes désignés par e-mail plutôt que par rôle, ex. un contact maintenance/RH spécifique) directement dans son fichier source (`src/ai/mcp/tools/<module>/<toolName>.js`) — il n'existe pas de tableau centralisé de permissions à maintenir séparément ; pour vérifier ou changer la permission d'un Tool, modifier ce Tool précis, jamais un fichier de config parallèle.

## 4. RAG — comment le Copilot connaît la documentation

Le RAG indexe des documents réels (jamais un contenu fabriqué). Racines de corpus par défaut (`src/ai/rag/reindex.js`) :

```
Backend Master/docs/                       ← inclut docs/user-guide/, docs/admin-guide/
Backend Master/GOOGLE_CALENDAR_SETUP.md
Backend Master/src/ai/README.md
AI-Business-Copilot/                       ← dossier frère, feuille de route
CRM_Architecture_Complète.pdf
```

Extensions acceptées (`src/ai/rag/sourceGuard.js`) : `.md`/`.markdown`/`.txt`/`.pdf`/`.puml`/`.plantuml`/`.uml`. Chemins de code métier (`src/models/`, `src/modules/`, `src/routes/`, etc.) explicitement bloqués — le RAG ne peut jamais indexer du code source ou des secrets de configuration.

**`node src/ai/rag/reindex.js` reste un script de démo/smoke-test manuel** — mais `modules/ai-copilot/services/aiCopilotBridge.service.js` fait maintenant CE QUE CE SCRIPT DÉMONTRAIT : il appelle `ingestionService.ingestDirectories(DEFAULT_CORPUS_ROOTS)` une seule fois, au premier message reçu par le process (partagé par tous les appels suivants, jamais réingéré). Toujours un `InMemoryVectorStore` volatil — tout est reperdu à chaque redémarrage du serveur ; un `IVectorStore` persistant resterait à câbler si le volume de documents le justifie un jour.

**Pour ajouter un document à la base de connaissance du Copilot** : il suffit de l'ajouter sous `docs/` (ou l'une des autres racines ci-dessus) avec une extension acceptée, puis de réindexer. Aucune étape supplémentaire.

## 5. Proactive AI — surveillance et alertes automatiques

Le Copilot peut surveiller projets/ventes/activités/échéances/interventions/KPI sans qu'une question soit posée, et pousser une alerte réelle (e-mail + notification in-app + événement Socket.IO `"proactive-ai-alert"`) dès qu'un risque critique ou élevé est détecté. Voir `src/ai/proactive/PROACTIVE_AI.md` pour l'architecture complète.

| Variable (`.env`) | Rôle | Défaut |
|---|---|---|
| `AI_PROACTIVE_MONITORING_ENABLED` | Interrupteur DÉDIÉ (indépendant de `AUTO_EMAIL_JOBS_ENABLED`, qui gouverne les crons métier classiques — relance/suivi/renouvellement de canal Google Calendar). | `false` |

Câblage : `src/cron/proactiveAiMonitor.job.js`, planifié `0 7 * * *` (**7h00, heure Tunis**, `timezone: "Africa/Tunis"`) via `node-cron` — le même mécanisme que les 4 autres crons du dépôt, jamais une nouvelle dépendance de scheduling. Si `AI_PROACTIVE_MONITORING_ENABLED` est absent/`false`, le cron n'est simplement pas enregistré (log explicite au démarrage, aucune erreur).

Destinataires : tous les comptes admin-tier actifs (`admin`/`superadmin`/`superadmin2`), résolus à chaque cycle via `list_users_by_role` — jamais une liste codée en dur. L'identité agissante du cycle (nécessaire pour que les Tools de lecture fonctionnent) est le premier compte admin-tier actif trouvé ; sans aucun compte admin-tier actif, le cycle est ignoré proprement.

**Ce que ce mécanisme NE fait PAS** (limites assumées, voir `PROACTIVE_AI.md`) : pas de ciblage par propriétaire de projet (tout va aux admin-tier), pas de fréquence configurable par rôle, pas de déduplication entre deux cycles (un risque encore présent le lendemain redéclenche une alerte identique).

## 6. Sécurité — les 8 piliers déjà en place

Le kernel IA embarque son propre sous-système de sécurité (`src/ai/security/`), testé indépendamment (`test/ai.security.*.test.js`) : limitation de débit, contrôle d'entrée, garde anti-injection de prompt, rédaction de secrets avant toute sortie/journalisation, configuration centralisée, et un journal d'audit (`AuditLog`).

**Le journal d'audit n'est pas un modèle Sequelize** — c'est une classe (`src/ai/security/auditLog.js`) construite sur un `IKeyValueStore` (Redis en production, en mémoire en dev/test). Chaque entrée : `at` (horodatage ISO), `actorId`, `actorRole`, `action`, `resource`, `outcome` (`allowed`/`denied`/`success`/`failure`/`flagged`), `metadata` (passé par une fonction de rédaction avant persistance — un secret n'apparaît jamais dans une entrée d'audit). Rétention par défaut : 10 000 entrées ou 90 jours.

**Aucun endpoint admin n'expose ce journal aujourd'hui**, même après la construction de `modules/ai-copilot/` — la seule lecture possible reste programmatique, via `auditLog.list({ limit })`. Un futur `GET /ai-copilot/audit` (admin-tier uniquement) resterait à ajouter si une consultation depuis l'interface d'administration devient nécessaire — un choix produit délibérément laissé de côté dans cette passe (le rate-limiter et l'audit sont bien actifs et partagés entre le `McpServer` et l'orchestrateur, seule leur CONSULTATION via HTTP manque).

## 7. Tests — valider une installation avant une démonstration

Corpus de validation complet : `test/fixtures/copilotValidationScenarios.js` (500 conversations réalistes, une par question testée contre le vrai code — intention/Agent/Tools/permissions/contexte). Lancer avant toute démonstration :

```bash
npx jest test/ai.validation.copilotScenarios.test.js test/ai.validation.copilotEndToEnd.test.js
```

Tests dédiés à la couche de livraison HTTP/WebSocket (`modules/ai-copilot/`) — fournisseurs LLM, bridge, routes, index de conversations, chunker, canal temps réel :

```bash
npx jest test/ai.services.llmProviders.test.js test/aiCopilotBridge.service.test.js test/aiCopilot.routes.test.js test/aiCopilot.conversationIndex.test.js test/aiCopilot.streamingChunker.test.js test/aiCopilot.socket.test.js
```

Pour l'ensemble de la suite de tests du kernel IA (tous les fichiers `test/ai.*.test.js` — orchestrateur, Agents, MCP, RAG, sécurité, proactivité, etc.) :

```bash
npx jest --runInBand --forceExit "test/ai\."
```

Pour la suite complète du backend (aucun script `npm run test:ai` dédié n'existe — seul `npm test` lance tout) :

```bash
npm test
```

## 8. Checklist avant une démonstration professionnelle

1. `AI_COPILOT_ENABLED=true`, `AI_COPILOT_ROLES_ALLOWED` restreint aux rôles pertinents pour la démo.
2. `AI_LLM_PROVIDER` (`openai` ou `anthropic`) + `AI_LLM_MODEL` + `AI_LLM_API_KEY` renseignés — sans ça, `POST /ai-copilot/chat` répond `503` proprement, jamais une réponse fabriquée.
3. Décider si `AI_PROACTIVE_MONITORING_ENABLED=true` est pertinent pour la démo (une alerte réelle part par e-mail — à activer en connaissance de cause, pas par défaut sur un environnement partagé).
4. `npx jest test/ai.validation.copilotScenarios.test.js test/ai.validation.copilotEndToEnd.test.js` vert, plus la suite `modules/ai-copilot/` listée en §7.
5. Vérifier que le client (app Flutter) pointe vers la bonne base URL (`ApiConfig.baseUrl`/`wsBaseUrl`) et envoie bien le JWT dans le handshake Socket.IO (`auth: { token }`) — sans ça la connexion temps réel échoue silencieusement côté serveur (fail closed, voir `socket.js::_authenticate`).

## Voir aussi

- `docs/user-guide/06-utiliser-le-copilot-ia.md` — le même Copilot, du point de vue de l'utilisateur métier.
- `src/ai/README.md` — documentation technique complète du kernel (architecture, les 15 Agents, MCP, RAG, LangChain, sécurité).
- `src/modules/ai-copilot/AI_COPILOT_HTTP.md` — contrat REST/WebSocket complet de la couche de livraison.
- `src/ai/proactive/PROACTIVE_AI.md`, `src/ai/orchestrator/COPILOT_VALIDATION.md`, `src/ai/orchestrator/WORKFLOW.md` — détails référencés ci-dessus.
- `AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md` — la feuille de route complète.
