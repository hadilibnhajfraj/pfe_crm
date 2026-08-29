# Performance_Report.md — CRM CBI Tunisia + AI Business Copilot

**Date** : 2026-07-31
**Méthode** : ce rapport combine trois sources de données, chacune identifiée explicitement à chaque constat :
1. **Mesures réelles** — requêtes `EXPLAIN ANALYZE` exécutées directement contre la base de développement réelle (PostgreSQL 17, base `cbitunisiaGestionnaire`, accessible localement), avant/après chaque correctif d'indexation.
2. **Analyse statique du code** — lecture directe des services/repositories/contrôleurs pour les motifs N+1, la pagination, le cache, les transactions.
3. **Estimations architecturales (module IA)** — calculées à partir du code réel de construction des prompts (taille du prompt système, nombre d'outils, config RAG), PAS à partir d'un historique de facturation réel : **aucun fournisseur LLM n'est câblé dans ce système** (`AI_LLM_PROVIDER` vide — décision Sprint 0 non prise). Voir `Cost_Analysis.md` §0 pour ce que cela implique.

---

## 0. Découverte majeure : un bug de production actif expliquait la quasi-totalité du problème de performance mesuré

En inspectant la base de données réelle pour établir une base de référence, la table `notifications` s'est révélée contenir **12 034 648 lignes** (3 Go sur disque), dont **12 034 227** (99,997 %) appartenaient à un seul type d'événement (`FOLLOWUP_MISSING`) pour un seul utilisateur, générées à un rythme pouvant atteindre **2 579 lignes par minute**.

**Cause racine identifiée et corrigée** : `src/cron/followup.job.js::checkFollowup()` s'exécute **chaque minute** (`node-cron`) et, pour chaque contact commercial sans e-mail ou sans relance planifiée le jour même, créait une nouvelle notification (et envoyait un **véritable e-mail**) à **chaque tick**, indéfiniment, tant que la situation sous-jacente n'était pas corrigée manuellement — aucune déduplication n'existait. Voir `Optimization_Report.md` §1 pour le correctif complet.

Cette découverte change la lecture de tout le reste de l'audit : la majorité des lenteurs mesurables aujourd'hui provenaient d'**un seul bug**, pas d'un problème d'architecture généralisé. Une fois corrigé, l'essentiel des autres constats de cette passe relèvent de la **préparation à la montée en charge** (indexes manquants sur des tables encore petites, absence de cache sur des endpoints de dashboard, non-adaptation à un déploiement multi-instance) plutôt que de lenteurs déjà visibles en production à l'échelle actuelle.

---

## 1. Ce qui a été mesuré réellement (pas estimé)

| Requête | Avant | Après | Facteur |
|---|---|---|---|
| `GET /notifications` (liste paginée, triée par date, utilisateur le plus chargé) | **1366,989 ms** (Parallel Seq Scan sur 12M lignes) | **0,124 ms** (Index Scan) | **≈ 11 000×** |
| Requête de déduplication `FOLLOWUP_MISSING` (nouveau correctif) | non testée avant (n'existait pas) | **0,211 ms** (Index Scan) | — |
| Sous-requête corrélée `project_reminders` (compteur "relances à venir" par projet, 253 projets) | 0,750 ms | 0,836 ms | **négligeable à l'échelle actuelle** — voir §2 |

Détail complet des commandes et des plans d'exécution (`EXPLAIN ANALYZE`) dans `Benchmark.md`.

## 2. Honnêteté méthodologique — tous les correctifs n'ont pas un gain mesurable aujourd'hui

Deux catégories bien distinctes de correctifs d'indexation ont été appliquées :
- **`notifications`** : gain massif et immédiatement mesurable, parce que la table est déjà énorme (12M lignes, à cause du bug ci-dessus).
- **`commercial_contacts.createdBy`, `project_reminders(projectId, dateRelance)`** : corrects structurellement (la colonne était filtrée sans index, une contrainte de clé étrangère ne crée PAS d'index en PostgreSQL), mais **le gain mesuré est nul aujourd'hui** — ces tables ne contiennent que 485 et 7 lignes respectivement, et PostgreSQL choisit à raison un scan séquentiel plutôt qu'un index sur un si petit volume. Ces correctifs sont **préventifs** : ils évitent que le même problème que `notifications` ne se reproduise silencieusement quand ces tables grossiront. Voir `Benchmark.md` pour les plans d'exécution complets, avant ET après.

## 3. Constat d'infrastructure — PostgreSQL local non tuné

`shared_buffers = 16 384` (16 Mo — **valeur d'usine par défaut**) et `work_mem = 4096` (4 Mo — également la valeur par défaut) sur l'instance PostgreSQL locale. `autovacuum` est actif mais `last_autovacuum`/`last_autoanalyze` étaient NULL sur `notifications` avant le nettoyage — l'autovacuum n'arrivait probablement pas à suivre le rythme d'insertion du bug (2500+ lignes/minute en pointe). Ce n'est PAS un correctif de code : la configuration serveur PostgreSQL (`postgresql.conf`) doit être ajustée par l'équipe infra pour un déploiement réel — voir `Scalability_Report.md` §3 pour des valeurs recommandées.

## 4. Backend / API (hors module IA) — synthèse

Voir `Optimization_Report.md` pour le détail fichier par fichier. En résumé :
- **Corrigé** : bug de déduplication (§0), 3 index manquants, incohérence de cache kanban, absence de compression HTTP.
- **Documenté, non corrigé** (risque de casser un comportement métier réel sans pouvoir le tester en toute sécurité dans cet environnement, ou ampleur dépassant une correction ponctuelle) : N+1 dans `services/scheduler.js` (relance automatique), absence de cache sur les endpoints de dashboard/KPI (10 à 20 requêtes par appel, recalculées à chaque fois), liste `commercial_contacts` non paginée avec jointures dupliquant les lignes, export Excel synchrone bloquant l'event loop, transactions manquantes sur les écritures multi-étapes de `maintenance-requests`/`hr-requests`.

## 5. Module IA — synthèse

Aucun fournisseur LLM n'étant câblé, il n'y a **aucun coût réel mesurable aujourd'hui**. L'analyse porte donc sur l'architecture de construction des prompts : le prompt système (liste des Tools disponibles) est retransmis intégralement à **chaque tour** de la boucle de tool-calling (jusqu'à `maxToolCalls=5` tours), et `AutomationAgent` (le seul Agent sans liste blanche de Tools) enverrait, dans le pire cas, la description des **73 Tools MCP** à chaque tour — estimé à ≈ 9400 tokens de prompt système répétés pour une seule conversation à 5 tours. Voir `Cost_Analysis.md` pour le calcul complet et les optimisations proposées.

## 6. Scalabilité — synthèse

Le système n'est **pas prêt aujourd'hui** pour "plusieurs centaines d'utilisateurs simultanés" servis par **plusieurs instances** du backend (le déploiement multi-instance étant la façon réaliste d'atteindre cette échelle) : Socket.IO n'a aucun adaptateur Redis (les rooms vivent en mémoire par processus — un événement émis depuis l'instance A n'atteint jamais un client connecté à l'instance B), et les limiteurs de débit (`express-rate-limit`) utilisent le stockage mémoire par défaut (chaque instance compte indépendamment). Une seule instance, elle, peut probablement absorber une charge modérée une fois les correctifs de cette passe appliqués — voir `Scalability_Report.md` pour l'analyse complète et un plan de montée en charge par étapes.

## 7. Liste complète des livrables

- `Performance_Report.md` — ce document.
- `Optimization_Report.md` — chaque optimisation appliquée, fichier par fichier, avec justification.
- `Benchmark.md` — chaque mesure avant/après avec la commande exacte utilisée.
- `Cost_Analysis.md` — estimation architecturale du coût/usage de tokens IA (aucune donnée de facturation réelle n'existe).
- `Scalability_Report.md` — état de préparation à la montée en charge, plan par étapes.
