# Improvement_Roadmap.md — Plan d'action séquencé

Basé sur `Technical_Debt.md`. Chaque étape indique l'effort estimé (S/M/L — small/medium/large, ordre de grandeur, pas un chiffrage précis) et ce qui la bloque.

---

## Étape 0 — Actions externes immédiates (avant toute autre chose)

Ne peuvent pas être faites par du code. À faire en parallèle de tout le reste.

1. **Rotation de tous les secrets exposés** (DB, SMTP, superadmins, OAuth Google, JWT/MFA) — voir `docs/security/Security_Report.md` §1. **Bloquant absolu avant toute exposition externe du dépôt ou mise en production.**
2. **Vérifier la visibilité réelle du dépôt GitHub** et qui y a eu accès.
3. **Décider du fournisseur LLM** (Sprint 0, déjà identifié dans le code lui-même) — bloque toute utilisation réelle du module IA.

## Étape 1 — Corriger ce qui est sûr et rapide (effort S, haute valeur)

1. Harmoniser `MFA_ENABLED` entre l'environnement de test et les suites `mfa.*.test.js` (nouveau constat de cette passe) — soit forcer `MFA_ENABLED=true` dans les tests eux-mêmes, soit documenter clairement la dépendance.
2. Vérifier en réel que le workflow CI ajouté (`.github/workflows/backend-ci.yml`) s'exécute correctement sur GitHub (non vérifiable depuis cet environnement).
3. Installer et configurer ESLint + Prettier (config minimale, pas de réécriture du code existant dans un premier temps — juste empêcher la régression future).
4. Migrer progressivement les 75 fichiers en `console.log` direct vers `utils/logger.js`, en commençant par les chemins de code les plus sensibles (auth, paiement le cas échéant, module IA déjà fait).

## Étape 2 — Corriger ce qui est important mais nécessite un peu plus de soin (effort M)

1. Ajouter un cache court (30-60s) sur les endpoints de dashboard/KPI, en répliquant le pattern déjà prouvé et corrigé de `kanban.service.js::_stageCache`.
2. Paginer `GET /commercial-contacts`, restreindre les colonnes sélectionnées, séparer les `include` `hasMany`.
3. Ajouter des transactions Sequelize sur les écritures multi-étapes de `maintenance-requests`/`hr-requests` (pattern déjà présent et correct dans `project.service.js::moveStage()` à répliquer).
4. Mettre en place un contrôleur de téléchargement authentifié pour les pièces jointes (`/uploads/*`) — nécessite une coordination avec le client Flutter.
5. Écrire une spécification OpenAPI/Swagger, au moins pour les routes les plus utilisées.
6. Ajouter des tests au frontend Flutter (aujourd'hui : 1 seul fichier).

## Étape 3 — Investissement structurel (effort L, nécessaire avant "plusieurs centaines d'utilisateurs")

1. **Provisionner un serveur Redis** — prérequis commun à trois besoins déjà identifiés dans le code (adaptateur Socket.IO, store `express-rate-limit`, mémoire conversationnelle du module IA — cette dernière est déjà prête côté code, seule la configuration manque).
2. Adaptateur Redis pour Socket.IO (`@socket.io/redis-adapter`).
3. Store Redis pour `express-rate-limit` (`rate-limit-redis`).
4. Rotation des refresh tokens avec détection de réutilisation (token-family/jti).
5. Tuning PostgreSQL (`shared_buffers`, `work_mem`, `effective_cache_size`) selon la RAM réelle de la machine cible — action infra, pas du code.
6. Conteneurisation (Docker + docker-compose pour le développement local ; image de production séparée).
7. Mise en place d'un outil d'observabilité (APM + métriques + tracing) — le choix précis (Sentry, Datadog, stack Prometheus/Grafana open-source) dépend du budget/de l'hébergement cible, non tranché ici.
8. Décision produit sur la portée `list_projects`/KPI personnel entre commerciaux.
9. Une fois un fournisseur LLM choisi (Étape 0.3) : activer le prompt caching natif du fournisseur, appliquer `ToolRouter` au chemin `BaseAgent` pour réduire le nombre de Tools envoyés par tour (voir `docs/performance/Cost_Analysis.md`).

## Étape 4 — Continu, pas une étape ponctuelle

- Surveiller `last_autovacuum`/`last_autoanalyze` sur les tables à forte écriture (leçon directe de cette session).
- Étendre la couverture de tests du CRM historique (aujourd'hui non quantifiée précisément, contrairement au module IA à ~92%).
- Documenter au fil de l'eau chaque nouveau module selon le standard déjà établi par `src/ai/README.md`.

---

## Ordre recommandé, en une phrase par audience

- **Pour un jury académique / une démonstration** : Étape 0.3 (choisir un fournisseur LLM, même un modèle gratuit/local, pour rendre le Copilot IA démontrable) est la seule chose qui manque vraiment.
- **Pour une recette utilisateur (UAT)** : Étapes 0 et 1 complètes, plus la vérification manuelle du workflow CI.
- **Pour une préproduction** : Étapes 0, 1, 2 complètes.
- **Pour une production réelle à l'échelle visée ("plusieurs centaines d'utilisateurs simultanés")** : les 4 étapes, dans l'ordre, sans en sauter aucune — voir `Release_Readiness.md` pour le détail par palier.
