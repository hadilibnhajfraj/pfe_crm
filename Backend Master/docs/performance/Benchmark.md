# Benchmark.md — Mesures avant/après

Toutes les mesures ci-dessous ont été prises directement contre la base de développement réelle (PostgreSQL 17, base `cbitunisiaGestionnaire`, accessible en local sur `127.0.0.1:5432`) via `psql` et `EXPLAIN (ANALYZE, BUFFERS)`. Aucune de ces valeurs n'est simulée ou estimée. Environnement : Windows, PostgreSQL 17, `shared_buffers=16MB`/`work_mem=4MB` (config par défaut, non tunée — voir `Scalability_Report.md`).

---

## 1. Contexte — volumétrie réelle de la base au moment de l'audit

| Table | Lignes (COUNT réel) | Taille sur disque |
|---|---|---|
| `notifications` | 12 034 648 | 3064 MB |
| `commercial_contacts` | 485 | 376 kB |
| `projects` | 253 | 512 kB |
| `project_actions` | 3 059 | 1040 kB |
| `project_reminders` | 7 | (négligeable) |
| `hr_requests` | 3 | — |
| `maintenance_requests` | 2 | — |
| `users` | 23 | 11 MB |

`SELECT relname, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze FROM pg_stat_user_tables WHERE relname='notifications';` → **toutes les colonnes NULL** avant nettoyage — confirme que les statistiques du planificateur de requêtes étaient totalement obsolètes sur cette table (l'estimation `n_live_tup` de PostgreSQL affichait 285 170 lignes quand le vrai total en était 12 034 648).

---

## 2. `GET /notifications` — requête de liste paginée (le constat le plus significatif)

**Requête réelle** (celle exécutée par `notifications.routes.js` via Sequelize `findAndCountAll`) :
```sql
SELECT * FROM notifications
WHERE "userId" = 'b7c50110-31de-4d2c-96b4-5a117c9e262a'
ORDER BY "createdAt" DESC
LIMIT 10 OFFSET 0;
```

### AVANT (aucun index sur `createdAt`, ni composite avec `userId`)
```
Limit  (actual time=1327.788..1366.575 rows=10 loops=1)
  Buffers: shared hit=364 read=235107
  -> Gather Merge (Workers Launched: 2)
     -> Sort  (Sort Method: top-N heapsort)
        -> Parallel Seq Scan on notifications
              Filter: ("userId" = ...)
              Rows Removed by Filter: 113
Planning Time: 3.608 ms
Execution Time: 1366.989 ms
```
**235 107 blocs lus depuis le disque**, balayage séquentiel parallèle de la table entière (12M lignes) pour ne renvoyer que 10 lignes.

### APRÈS `CREATE INDEX notifications_user_id_created_at ON notifications ("userId", "createdAt")` + `ANALYZE`
```
Limit  (actual time=0.092..0.095 rows=10 loops=1)
  Buffers: shared hit=2 read=4
  -> Index Scan Backward using notifications_user_id_created_at on notifications
        Index Cond: ("userId" = ...)
Planning Time: 3.163 ms
Execution Time: 0.124 ms
```
**6 blocs lus** (au lieu de 235 471), scan d'index direct.

**Résultat : 1366,989 ms → 0,124 ms — facteur ≈ 11 024×.**

---

## 3. Requête de déduplication `FOLLOWUP_MISSING` (nouveau correctif, `followup.job.js`)

```sql
SELECT "commercialContactId" FROM notifications
WHERE type='FOLLOWUP_MISSING' AND "createdAt" >= '2026-07-31 00:00:00';
```
Après `CREATE INDEX notifications_type_created_at ON notifications (type, "createdAt")` :
```
Index Scan using notifications_type_created_at on notifications
  Index Cond: ((type = 'FOLLOWUP_MISSING') AND ("createdAt" >= ...))
Execution Time: 0.211 ms
```
Sans cet index, cette requête (introduite par le correctif de déduplication, exécutée chaque minute) aurait balayé la table entière — non mesuré "avant" car la requête n'existait pas avant ce correctif ; l'index a été créé dans le même mouvement que le correctif de code, par construction.

---

## 4. `project_reminders` — sous-requête corrélée (gain non mesurable à l'échelle actuelle)

**Requête réelle** (`project.repository.js::UPCOMING_REMINDERS_ATTR`, exécutée une fois par ligne de projet affichée) :
```sql
SELECT id, (
  SELECT COUNT(*)::int FROM project_reminders
  WHERE "projectId" = "Project".id AND "dateRelance" >= NOW()
) AS "upcomingRemindersCount"
FROM projects AS "Project";
```

### AVANT (aucun index sur `project_reminders`)
```
Seq Scan on projects "Project"  (actual time=0.029..0.698 rows=253 loops=1)
  SubPlan 1
    -> Aggregate (actual time=0.002..0.002 rows=1 loops=253)
       -> Seq Scan on project_reminders (actual time=0.001..0.001 rows=0 loops=253)
Execution Time: 0.750 ms
```

### APRÈS `CREATE INDEX project_reminders_project_id_date_relance ON project_reminders ("projectId", "dateRelance")` + `ANALYZE`
```
Seq Scan on projects "Project"  (actual time=0.027..0.782 rows=253 loops=1)
  SubPlan 1
    -> Aggregate (actual time=0.003..0.003 rows=1 loops=253)
       -> Seq Scan on project_reminders (actual time=0.001..0.001 rows=0 loops=253)
Execution Time: 0.836 ms
```

**Résultat : 0,750 ms → 0,836 ms — aucune amélioration mesurable.** PostgreSQL continue de choisir un `Seq Scan` sur `project_reminders` (7 lignes au total) plutôt que l'index nouvellement créé — comportement **correct** du planificateur : un scan séquentiel de 7 lignes est intrinsèquement plus rapide qu'un accès par index à ce volume. L'index reste néanmoins la bonne décision structurelle pour le jour où cette table (actuellement 7 lignes, mais liée aux 3059 `project_actions`) grossira significativement. Voir `Performance_Report.md` §2.

---

## 5. `commercial_contacts.createdBy` — index créé, gain non mesuré isolément

Toutes les 485 lignes de `commercial_contacts` partagent actuellement le même `createdBy` (données de développement/démo) — une requête `WHERE "createdBy" = X` sur ce jeu de données a une sélectivité de 100 %, ce qui ne permet pas une comparaison avant/après significative (le plan choisi resterait un scan séquentiel dans les deux cas, à raison, quel que soit l'index). L'index a été créé pour la même raison structurelle que `project_reminders` — corriger l'absence d'index sur une colonne de filtre réel avant que le volume de données réel (production) ne rende le scan séquentiel coûteux.

---

## 6. Suite de tests — temps d'exécution (mesure indirecte de charge CPU du code applicatif)

```
npx jest --runInBand --forceExit
Test Suites: 108 passed, 5 failed (préexistants, base de données réelle indisponible dans cet environnement de test)
Tests:       1244 passed, 38 failed (mêmes 5 suites)
Time:        ≈ 27-30 s pour 1282 tests (constant avant/après cette passe d'optimisation — aucune régression de temps d'exécution introduite)
```

## 7. `npm audit` — avant/après

```
Avant : 22 vulnérabilités (1 low, 7 moderate, 14 high)
Après : 22 vulnérabilités (1 low, 7 moderate, 14 high) — inchangé
```
Une seule dépendance ajoutée dans ce passage (`compression`, package officiel de l'équipe Express) — aucune nouvelle vulnérabilité introduite.

## 8. Ce qui n'a pas pu être benchmarké dans cet environnement

- **Temps de réponse HTTP de bout en bout** (latence réseau + Express + Sequelize + rendu JSON) — nécessiterait de démarrer le serveur réel (`server.js`), ce qui a été jugé trop risqué dans cet environnement (`AUTO_EMAIL_JOBS_ENABLED=true` dans le `.env` local déclencherait de vrais crons avec de vrais effets de bord — voir `Optimization_Report.md` §6, l'incident déjà évité une fois pendant cet audit). Les mesures ci-dessus portent donc sur le temps d'exécution PostgreSQL pur, la composante dominante du temps de réponse pour les requêtes concernées.
- **Charge/débit sous plusieurs centaines d'utilisateurs simultanés réels** (test de charge type `autocannon`/`k6`) — nécessiterait un serveur démarré (même contrainte que ci-dessus) et une infrastructure de test dédiée. Voir `Scalability_Report.md` pour une estimation raisonnée en l'absence de test de charge réel.
- **Coût/latence réel des appels au fournisseur LLM** — aucun fournisseur n'est câblé, voir `Cost_Analysis.md`.
