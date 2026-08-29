# Optimization_Report.md — Journal des optimisations

Chaque entrée : fichier(s), changement, pourquoi. Voir `Benchmark.md` pour les mesures avant/après réelles quand elles existent, `Performance_Report.md` pour le contexte gravité/impact.

---

## 1. Correctif racine — déduplication du cron de relance (le plus important)

**Fichier** : `src/cron/followup.job.js::checkFollowup()`

- Nouveau : une requête (`Notification.findAll({where: {type: "FOLLOWUP_MISSING", createdAt: {gte: today}}, attributes: ["commercialContactId"]})`) exécutée **une fois** en tête de fonction, chargée dans un `Set` pour un lookup O(1).
- Les deux branches qui créaient une notification `FOLLOWUP_MISSING` (contact sans e-mail, contact sans relance planifiée) vérifient désormais ce `Set` **avant** d'envoyer l'e-mail ET avant de créer la notification — les deux sont sautés si le contact a déjà été notifié aujourd'hui.
- `commercialContactId` est désormais renseigné sur ces deux créations (absent auparavant), condition nécessaire pour que la déduplication fonctionne.

**Pourquoi** : ce cron tourne chaque minute. Sans garde-fou, un contact resté dans un état "problématique" (pas d'e-mail, pas de relance) génère une notification ET un e-mail réel à chaque tick — confirmé en base réelle : 12+ millions de lignes sur ~80 jours pour un seul cas non résolu. Un seul rappel par jour et par contact est fonctionnellement équivalent et supprime la croissance non bornée.

**Effet mesuré** : indirect — ce correctif arrête la CAUSE ; l'effet (table de 3 Go, requêtes lentes) est traité par le correctif d'indexation ci-dessous, mesuré en réel dans `Benchmark.md`.

---

## 2. Index PostgreSQL manquants

**Fichier** : `src/migrations/20260731000100-add-notifications-perf-indexes.js` (nouveau), `src/models/Notification.js`

- `notifications(userId, createdAt)` — sert `GET /notifications` (liste paginée triée par date).
- `notifications(type, createdAt)` — sert la nouvelle requête de déduplication de `followup.job.js`.

**Mesuré** : 1366,989 ms → 0,124 ms sur la requête de liste (voir `Benchmark.md`).

**Fichier** : `src/migrations/20260731000200-add-performance-indexes-contacts-reminders.js` (nouveau), `src/models/CommercialContact.js`, `src/models/ProjectReminder.js`

- `commercial_contacts(createdBy)` — filtrait déjà `commercialId` (index existant), mais `createdBy` (le filtre "mes contacts") n'avait qu'une contrainte de clé étrangère, pas d'index — une FK ne crée jamais d'index automatiquement en PostgreSQL.
- `project_reminders(projectId, dateRelance)` — table sans aucun index au-delà de sa clé primaire, interrogée par sous-requête corrélée à chaque ligne de la liste de projets/kanban.

**Mesuré** : gain négligeable aujourd'hui (485 et 7 lignes respectivement — PostgreSQL choisit correctement un scan séquentiel à ce volume). Correctif préventif — voir `Performance_Report.md` §2 pour l'honnêteté méthodologique sur ce point.

**Action manuelle requise** : ces migrations doivent être exécutées (`npx sequelize-cli db:migrate`) sur chaque environnement — appliquées directement à la base de développement locale via `psql` pour permettre la mesure réelle dans ce passage, mais pas encore via le mécanisme de migration standard (le `.env` local pointe vers un nom de base inexistant, `cbitunisiaGestionnaires` au pluriel, alors que la vraie base s'appelle `cbitunisiaGestionnaire` au singulier — vérifiez et corrigez ce `DB_NAME` avant de lancer `db:migrate`).

---

## 3. Incohérence de cache — compteurs de kanban parfois obsolètes jusqu'à 60s

**Fichiers** : `src/modules/kanban/services/kanban.service.js`, `src/modules/projects/services/project.service.js`, `src/modules/pipeline/services/pipelineStage.service.js`

- `invalidateStageCache` (anciennement `_invalidateStageCache`, privée) est désormais exportée par `kanban.service.js`.
- `project.service.js::moveStage()` (le chemin "déplacement complet", avec journal d'activité) l'appelle après le commit de sa transaction — auparavant, seul `moveStageFast()` (le chemin "drag-and-drop rapide") invalidait le cache.
- `pipelineStage.service.js::createStage/updateStage/deleteStage/reorderStages` l'appellent tous après leur commit respectif — auparavant, aucune de ces 4 opérations n'invalidait le cache.

**Pourquoi** : `_stageCache` (TTL 60s) mémorise le nombre de projets par étape. Toute mutation qui change `pipelineStageId` d'un projet, ou qui crée/renomme/supprime/réordonne une étape elle-même, doit invalider ce cache — sinon l'UI peut afficher des compteurs faux pendant jusqu'à 60 secondes après une action réelle.

---

## 4. Compression HTTP

**Fichier** : `src/app.js`, `package.json` (nouvelle dépendance `compression`)

- `app.use(compression())` ajouté juste après `helmet()`.

**Pourquoi** : aucune compression gzip/brotli n'existait sur les réponses JSON — coûteux en bande passante et en latence perçue pour les listes non paginées et les clients mobiles (Flutter) sur réseau contraint. Coût CPU négligeable (le module `compression` désactive automatiquement la compression sous le seuil de 1 Ko et pour les réponses déjà compressées).

---

## 5. Optimisations proposées, non appliquées automatiquement (et pourquoi)

| Optimisation | Fichier(s) | Pourquoi non appliquée dans ce passage |
|---|---|---|
| Regrouper le N+1 de `scheduler.js` (une requête par projet pour trouver sa dernière action) en une seule requête | `src/services/scheduler.js:32-41` | Ce cron déclenche de VRAIS effets de bord (création d'action, synchronisation Google Calendar, envoi d'e-mail réel) sur un processus métier réel ("relance automatique après 48h d'inactivité"). Une réécriture risque de subtilement changer quel projet est sélectionné/relancé, sans pouvoir être testée de bout en bout en toute sécurité dans cet environnement (voir l'incident évité en §6). Documenté comme optimisation prioritaire pour une prochaine passe, avec tests d'intégration dédiés. |
| Cache court (30-60s) sur les endpoints de dashboard/KPI (`dashboard.service.js`, `adminDashboard.service.js`, `commercialContactKpi.service.js` — 8 à 20 requêtes par appel, aucune mise en cache) | `src/modules/dashboard/`, `src/modules/admin-dashboard/`, `src/modules/commercial-contacts/services/commercialContactKpi.service.js` | Périmètre trop large pour ce passage (plusieurs dizaines de requêtes à travers 3 modules) ; le pattern `_stageCache` déjà présent dans `kanban.service.js` (et déjà réparé §3) est un modèle direct et sûr à répliquer — recommandé comme prochaine étape à effort/risque faible. |
| Paginer `GET /commercial-contacts`, restreindre les colonnes, séparer les `include` `hasMany` (`separate: true`) pour éviter la duplication de lignes par produit cartésien | `src/routes/commercial_contacts.routes.js:301-315` | Changement de contrat d'API potentiellement visible par le client Flutter (pagination) — nécessite une coordination client/serveur, hors périmètre technique de cette passe. |
| Décharger la génération Excel (`projectExport.controller.js`) vers une file/worker | `src/modules/projects/controllers/projectExport.controller.js` | Changement d'architecture (file d'attente ou worker thread) plus large qu'un correctif ponctuel ; à faible volume actuel (253 projets), l'impact est mesuré comme non urgent — voir `Benchmark.md`. |
| Transactions sur les écritures multi-étapes de `maintenance-requests`/`hr-requests` | `src/modules/maintenance-requests/services/maintenanceRequest.service.js`, `src/modules/hr-requests/services/hrRequest.service.js` | Correction de fiabilité plus que de performance pure ; le pattern correct existe déjà ailleurs dans le code (`project.service.js::moveStage()`) — à répliquer, mais chaque fonction concernée doit être revue individuellement pour ne pas changer la sémantique d'erreur actuelle. |
| Adaptateur Redis pour Socket.IO + store Redis pour `express-rate-limit` (bloquants pour le multi-instance) | `src/socket.js`, `src/routes/auth.routes.js` | Nécessite un serveur Redis provisionné et une nouvelle dépendance npm (`@socket.io/redis-adapter`, `rate-limit-redis`) — décision d'infrastructure, voir `Scalability_Report.md`. |
| Réduire le coût de prompt du module IA (filtrer les Tools envoyés à `AutomationAgent` via `ToolRouter`, ou activer le prompt caching natif une fois un fournisseur choisi) | `src/ai/agents/automationAgent.js`, `src/ai/langchain/chains/toolCallingChain.js` | Aucun fournisseur LLM n'est câblé — impossible de valider empiriquement un changement de comportement de prompt sans API réelle à interroger. Voir `Cost_Analysis.md` pour le détail et la recommandation. |

## 6. Incident évité pendant cet audit

En testant `followup.job.js` par un `require()` direct (pour vérifier que le fichier se charge sans erreur de syntaxe), le processus a réellement déclenché le cron (`AUTO_EMAIL_JOBS_ENABLED=true` dans le `.env` local) avant d'être arrêté manuellement dès que le risque a été identifié. Aucun e-mail en boucle n'a été envoyé (le correctif de déduplication était déjà en place à ce moment, donc le comportement observé était celui, correct, d'un seul cycle légitime). **Leçon retenue et appliquée pour le reste de cet audit** : plus aucun fichier de service/cron n'a été exécuté directement — toute vérification est passée par des tests Jest avec dépendances mockées (voir `test/followupJob.dedup.test.js`).
