# Scalability_Report.md — Préparation à « plusieurs centaines d'utilisateurs simultanés »

## 1. Ce que « plusieurs centaines d'utilisateurs simultanés » implique concrètement

Un seul processus Node.js (single-threaded pour le code JavaScript, malgré l'I/O asynchrone) peut souvent absorber quelques dizaines à ~100 requêtes/seconde pour une API CRUD raisonnablement optimisée — mais « plusieurs centaines d'utilisateurs simultanés » avec des pics d'usage réalistes (connexions le matin, rafraîchissements de dashboard, exports) dépasse généralement ce qu'**une seule instance** peut garantir de façon fiable. La conclusion structurante de cet audit est donc : **le passage à plusieurs instances du backend derrière un répartiteur de charge n'est pas une option lointaine, c'est le chemin réaliste vers cet objectif** — et le système, tel qu'audité, **n'y est pas prêt** sur deux points précis, tous deux bloquants.

## 2. Bloquants pour un déploiement multi-instance (à résoudre AVANT de dupliquer le processus)

### 2.1 Socket.IO — état en mémoire par processus
`src/socket.js` construit `new Server(httpServer, {...})` sans aucun adaptateur (`@socket.io/redis-adapter` ou équivalent). Les "rooms" (`user:<id>`) vivent dans la mémoire du seul processus Node qui a accepté la connexion WebSocket. **Conséquence concrète** : si l'instance A crée une notification pour un utilisateur connecté à l'instance B (cas normal dans un déploiement à plusieurs instances derrière un répartiteur), l'utilisateur ne reçoit **jamais** l'événement temps réel — silencieusement, sans erreur.
**Action requise** : provisionner un serveur Redis (déjà nécessaire pour le point suivant et pour la mémoire conversationnelle du module IA — un seul serveur Redis peut servir les trois usages) et installer `@socket.io/redis-adapter`.

### 2.2 Limiteurs de débit en mémoire
`express-rate-limit` (utilisé sur `/auth/*`, `/api/clients/import-*`, `/utils/geocode`, `/ai-dashboard`) utilise son `MemoryStore` par défaut — chaque instance compte les tentatives indépendamment. **Conséquence concrète** : avec 4 instances, la limite réelle effective devient `max × 4`, et un utilisateur peut se voir bloqué sur une instance tout en étant encore autorisé sur une autre (comportement incohérent, pas juste "moins strict").
**Action requise** : `rate-limit-redis` (ou équivalent) pointé vers le même serveur Redis que ci-dessus.

### 2.3 Cache mémoire kanban (`_stageCache`)
`kanban.service.js::_stageCache` (TTL 60s, corrigé pour l'invalidation dans ce passage — voir `Optimization_Report.md` §3) reste un cache **par processus**. En multi-instance, chaque instance a sa propre copie, avec sa propre horloge d'expiration — un déplacement de projet sur l'instance A n'invalide pas le cache de l'instance B, qui peut donc rester incohérent jusqu'à 60s après un changement fait ailleurs. Risque mineur (les données affichées restent "presque à jour"), mais à connaître.

### 2.4 Mémoire conversationnelle du module IA
`src/ai/memory/inMemoryKeyValueStore.js` est le store par défaut — documenté explicitement comme "dev/test uniquement" dans le code du kernel. Un `RedisKeyValueStore` existe déjà et est prêt (`src/ai/memory/redis/`) — **vérifier qu'un déploiement réel sélectionne bien ce dernier** avant toute mise à l'échelle horizontale du module IA (aujourd'hui non exposé en HTTP en dehors du dashboard, donc pas encore un blocage actif, mais le sera dès qu'un module conversationnel sera livré).

## 3. PostgreSQL — configuration à revoir avant montée en charge

Constaté en réel sur l'instance locale (`SHOW ...`) :

| Paramètre | Valeur actuelle | Remarque |
|---|---|---|
| `shared_buffers` | 16 MB | Valeur d'usine par défaut — beaucoup trop faible pour une base avec une table de plusieurs Go |
| `work_mem` | 4 MB | Valeur d'usine par défaut |
| `effective_cache_size` | 512 MB | Valeur d'usine par défaut |
| `max_connections` | 100 | Le pool applicatif (`max:10` par instance, `src/db.js`) laisse de la marge, mais à recalculer si le nombre d'instances augmente (`10 × nombre d'instances` doit rester < `max_connections`, avec de la marge pour les connexions d'administration/migration) |
| `autovacuum` | activé, seuils par défaut | Confirmé insuffisant en pratique sur `notifications` avant le correctif du bug racine (§0 de `Performance_Report.md`) — à surveiller à nouveau après la mise en production du correctif |

**Ceci n'est pas un correctif de code** — c'est un ajustement `postgresql.conf` à faire par l'équipe infrastructure, dimensionné selon la RAM réelle du serveur de production (des règles empiriques standard existent : `shared_buffers` ≈ 25 % de la RAM, `effective_cache_size` ≈ 50-75 % de la RAM). Ne pas appliquer une valeur générique sans connaître la machine cible réelle.

## 4. Pool de connexions Sequelize

`src/db.js` : `{ max: 10, min: 0, acquire: 30000, idle: 10000 }`. Raisonnable pour une seule instance à charge modérée — chaque requête devenue rapide (grâce aux correctifs d'index, §voir `Benchmark.md`) libère sa connexion presque immédiatement, donc 10 connexions peuvent servir un débit de requêtes bien supérieur à 10 requêtes/seconde. **À revalider par un test de charge réel** avant de considérer ce chiffre comme définitif à l'échelle "plusieurs centaines d'utilisateurs" — non fait dans ce passage (voir `Benchmark.md` §8, démarrer le serveur réel a été jugé trop risqué dans cet environnement à cause d'`AUTO_EMAIL_JOBS_ENABLED=true`).

## 5. Ce qui NE bloque PAS la montée en charge (déjà correct)

- Les mots de passe sont hachés avec un coût bcrypt raisonnable (12), pas de goulot d'étranglement CPU anormal identifié sur le chemin de login.
- `emailQueue.service.js` a déjà un mécanisme de retry/backoff pour les échecs SMTP temporaires — voir cependant `Optimization_Report.md` pour la nuance sur la première tentative (synchrone dans le chemin de requête).
- Les modules du kernel IA (`mcp/`, `security/`) sont déjà conçus autour d'un port `IKeyValueStore` substituable (mémoire ↔ Redis) — la bascule vers Redis, une fois faite, ne nécessite aucun changement de code applicatif, seulement un changement de configuration (`createRedisMemoryPipeline()` déjà implémenté et testé).

## 6. Plan de montée en charge recommandé, par étapes

1. **Immédiat, déjà fait dans ce passage** : correctif du bug de notifications, indexation, cache kanban, compression HTTP.
2. **Avant le premier déploiement multi-instance** : adaptateur Redis pour Socket.IO, store Redis pour `express-rate-limit`, confirmation que le module IA (si exposé) utilise `RedisKeyValueStore`.
3. **Avant un test de charge réel** : corriger le `DB_NAME` du `.env` local (actuellement pointé vers une base inexistante), tuner `postgresql.conf` selon la RAM de la machine cible, puis exécuter un test de charge (`autocannon`/`k6`) contre un environnement dédié (jamais contre la base de développement contenant de vraies données).
4. **Avant la mise en production à grande échelle** : cache court sur les endpoints de dashboard/KPI (proposé, non implémenté — voir `Optimization_Report.md` §5), pagination de `commercial_contacts`, décharge de la génération Excel vers un worker/une file.
5. **Continu** : surveiller `last_autovacuum`/`last_autoanalyze` sur les tables à forte écriture (leçon directe de cet audit — `notifications` n'avait jamais été analysée avant que ce constat ne soit fait manuellement).
