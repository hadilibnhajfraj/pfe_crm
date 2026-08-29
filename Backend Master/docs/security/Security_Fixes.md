# Security_Fixes.md — Journal des correctifs appliqués

Chaque entrée référence le fichier modifié, ce qui a changé, et pourquoi. Voir `Security_Report.md` pour le détail gravité/impact/risque de chaque problème, et `Security_Test_Plan.md` pour les tests correspondants.

---

## 1. Secrets — `.env.example` assaini

**Fichier** : `Backend Master/.env.example`

Toutes les valeurs réelles (base de données, SMTP, superadmins, Google OAuth, clés JWT/MFA) remplacées par des placeholders explicites (`your_db_password`, `REPLACE_WITH_A_LONG_RANDOM_SECRET...`, etc.). Deux lignes commentées contenant un compte Gmail réel + un mot de passe d'application Google supprimées.

**Pourquoi** : ce fichier est commité dans git et lu par quiconque clone le dépôt — il ne doit jamais contenir de secret réel. Voir `Security_Report.md` §1 pour l'action de rotation externe requise (non exécutable par du code).

---

## 2. Endpoints critiques non authentifiés

| Fichier | Changement |
|---|---|
| `src/routes/client.routes.js` | `authRequired` + `requireRole("admin","superadmin","superadmin2")` + limiteur de débit horaire (`express-rate-limit`) + limite de taille multer (20MB) ajoutés à `POST /import-csv` et `POST /import-factures` |
| `src/routes/notifications.routes.js` | `authRequired` ajouté à `POST /send-email` |
| `src/routes/geocode.routes.js` | `authRequired` + limiteur de débit (30/min) ajoutés à `GET /geocode` ; cache mémoire plafonné à 500 entrées avec éviction FIFO (`MAX_CACHE_ENTRIES`) |

**Pourquoi** : ces trois routes étaient entièrement joignables sans authentification (voir `Security_Report.md` §4.1–§4.2).

---

## 3. IDOR — contrôle de propriété manquant

| Fichier | Changement |
|---|---|
| `src/modules/projects/policies/project.policy.js` | Nouvelle fonction exportée `requireProjectOwnerOrAdmin` (même logique que `requireOwnerOrAdmin`, mais lit `req.params.projectId` au lieu de `req.params.id` — pour les routeurs montés sous `/projects/:projectId/...`). `requireOwnerOrAdmin` elle-même **non modifiée** (aucun risque de régression sur ses 2 sites d'appel existants) |
| `src/modules/kanban/routes/kanban.routes.js` | `requireOwnerOrAdmin` ajouté à `PUT /projects/:id/stage`, avant `ctrl.moveStageFast` |
| `src/modules/project-actions/routes/projectAction.routes.js` | `router.use(requireProjectOwnerOrAdmin)` ajouté (protège get/create/update/delete/retry-sync d'un coup) |
| `src/modules/maintenance-requests/services/maintenanceRequest.service.js` | `addComment()` : signature étendue à `(senderId, senderRole, requestId, messageText, senderEmail)`, appelle désormais `_canAccess()` avant toute écriture — identique à `getById`/`getComments`/`getHistory` |
| `src/modules/maintenance-requests/controllers/maintenanceRequest.controller.js` | Appel à `svc.addComment()` mis à jour avec les nouveaux arguments (`req.user.role`, `req.user.email`) |
| `src/ai/mcp/tools/maintenance/addMaintenanceCommentTool.js` | Appel à `maintenanceService.addComment()` mis à jour — hérite automatiquement du contrôle d'accès désormais appliqué par le service |

**Pourquoi** : voir `Security_Report.md` §4.3.

---

## 4. Socket.IO — authentification du handshake

**Fichier** : `src/socket.js`

- Nouvelle fonction `_authenticate(socket, next)` (exportée pour les tests) : vérifie `socket.handshake.auth.token` via `verifyAccessToken` (le même utilitaire que `authRequired`), attache `socket.user = {id, role, email}`.
- `io.use(_authenticate)` enregistré dans `init()`.
- Le handler `connection` fait désormais `socket.join(\`user:${socket.user.id}\`)` automatiquement (identité vérifiée), plutôt que de faire confiance à un `userId` fourni par le client.
- L'événement `join` legacy est conservé mais devient un no-op pour tout id différent de `socket.user.id` (rétrocompatible pour un client qui rejoint sa propre room, inoffensif sinon).

**Pourquoi** : voir `Security_Report.md` §4.6. **Action externe requise** : le client Flutter doit envoyer `auth: { token }` à la connexion — non fait ici (aucun code Dart modifié).

---

## 5. Injection de prompt — résultats d'outils et historique non filtrés

| Fichier | Changement |
|---|---|
| `src/ai/langchain/chains/toolCallingChain.js` | Constructeur accepte `promptInjectionGuard = null` ; le résultat de chaque appel d'outil est scanné (`scan(String(output)).sanitizedText`) avant d'être réinjecté comme `HumanMessage` — le `steps` retourné au caller garde la valeur originale non modifiée |
| `src/ai/orchestrator/workflowManager.js` | `promptInjectionGuard` accepté et transmis à sa `ToolCallingChain` |
| `src/ai/agents/baseAgent.js` | `promptInjectionGuard` accepté ; `_historyText()` scanne l'historique de conversation avant de le renvoyer ; `_run()` transmet le guard à sa `ToolCallingChain` |
| `src/ai/agents/reportingAgent.js` | Sa propre `ToolCallingChain` (workflow à 2 étapes) reçoit également `promptInjectionGuard` |
| `src/ai/agents/{assistant,search,project,commercial,pipeline,kpi,maintenance,industrial,notification,automation}Agent.js` (10 fichiers) | Chaque factory `createXAgent()` accepte et transmet `promptInjectionGuard = null` à `BaseAgent`/sous-classe |
| `src/ai/orchestrator/pipeline.js` | `promptInjectionGuard` désormais transmis à `loadDefaultAgents()` (deps) et à `new WorkflowManager()` — une seule instance partagée, appliquée à toutes les surfaces |

**Pourquoi** : voir `Security_Report.md` §5.4. Comportement strictement inchangé quand `promptInjectionGuard` est omis (`= null` partout).

---

## 6. Divers

| Fichier | Changement | Pourquoi |
|---|---|---|
| `src/routes/auth.routes.js` | `POST /auth/signup` utilise `isStrongPasswordForReset` au lieu de `isStrongPassword` | §4.8 — mot de passe faible accepté à l'inscription |
| `src/middleware/upload.js` | `fileFilter` (liste blanche `.png/.jpg/.jpeg/.webp/.gif`) + `handleUploadError` (réponse JSON 400 propre) ajoutés | §4.10 — aucune restriction de type de fichier |
| `src/middleware/upload.middleware.js` | Idem `upload.js` (`fileFilter` + `handleUploadError` attaché comme propriété) | §4.10 |
| `src/routes/users.routes.js` | `upload.handleUploadError` ajouté après `upload.single("avatar")` sur `PUT /me/profile` | Réponse propre en cas de rejet de fichier |
| `src/services/googleCalendar.service.js` | `axios` remplacé par `axios.create({ timeout: 15000 })` — un seul point de configuration pour les 6 appels du fichier | §4.11 — timeouts manquants |
| `src/routes/projectComments.routes.js` | Import cassé (`../middleware/auth`, inexistant) corrigé vers `authRequired` (`auth.middleware.js`) ; `req.user.id` → `req.user.sub` (forme réelle du payload JWT) | §4.12 — fichier mort mais cassé/non authentifié, landmine pour une réactivation future |
| `src/routes/projectTimeline.routes.js` | `authRequired` ajouté | §4.12 |

---

## 7. Module IA — rappel des correctifs de la passe précédente (contexte)

Ces correctifs ont été appliqués et testés lors d'un audit dédié du module IA réalisé plus tôt dans cette même session (non refaits ici, juste rappelés pour la traçabilité globale) :

- `src/ai/rag/sourceGuard.js` / `src/ai/rag/ingestion/directoryScanner.js` — résolution `realpath` + rejet des symlinks (contournement de symlink RAG).
- `src/ai/mcp/tools/industrial/{create,update}IndustrialRecordTool.js`, `src/ai/mcp/tools/porPromesh/{create,update}PorPromeshTool.js` — retrait de `.unknown(true)` (mass assignment).
- `src/ai/mcp/server/start.js` — `createServer()` câble `rateLimiter`/`auditLog` par défaut.
- `src/ai/mcp/server/mcpServer.js`, `src/ai/security/pipeline.js` — imports corrigés pour utiliser les barrels de sous-système plutôt que des fichiers internes.
- `src/ai/utils/tokenize.js` (nouveau) — extraction de `tokenize()` partagé, retiré de la dépendance cachée sur `rag/embeddings/hashingEmbeddingProvider.js`.
- `src/modules/ai-dashboard/controllers/aiDashboard.controller.js` — `console.error` remplacé par le logger redacté du kernel.

---

## 8. Ce qui n'a PAS été corrigé, et pourquoi

| Sujet | Raison de ne pas corriger automatiquement |
|---|---|
| Sous-tableaux POR PROMESH (`.unknown(true)`) | Fermeture complète nécessite ~5 sous-validateurs supplémentaires — effort disproportionné pour ce passage, risque plus faible (RBAC déjà en place) |
| `list_projects` / KPI personnel cross-role | Comportement partagé avec une route HTTP live — décision produit, pas un bug isolé au module IA |
| Rotation/détection de réutilisation des refresh tokens | Changement d'architecture (token-family/jti) plus large qu'un correctif ponctuel |
| Délimiteur `wrapAsUntrusted()` non nonce | Amélioration proposée, pas une régression introduite ; risque non déterministe |
| Seconde voie JWT (`verifyToken.js`) | Fonctionnellement isolée (un seul endpoint Metabase), pas une faille active aujourd'hui |
| `routes/upload .js` (fichier mort, nom avec espace) | Jamais require() nulle part — aucun risque live, nettoyage optionnel |
