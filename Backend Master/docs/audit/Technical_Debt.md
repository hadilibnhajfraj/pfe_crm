# Technical_Debt.md — Inventaire complet

Compilation de tout ce qui a été trouvé (et pour partie corrigé) pendant les quatre passes d'audit de cette session. Chaque ligne indique si l'élément a été **corrigé** ou reste **ouvert**, et pointe vers le document source pour le détail.

## 1. Sécurité (voir `docs/security/`)

| Dette | Statut | Priorité si ouverte |
|---|---|---|
| Secrets réels commités dans `.env.example` | **Corrigé** dans le dépôt (fichier assaini) — **rotation externe des identifiants réels toujours requise**, hors portée du code | **Critique** |
| Endpoints critiques sans authentification (import clients, envoi d'e-mail, géocodage) | **Corrigé** | — |
| IDOR (kanban, actions de projet, commentaires de maintenance) | **Corrigé** | — |
| Socket.IO sans authentification | **Corrigé** côté serveur — mise à jour du client Flutter requise | **Majeur** (ouvert côté client) |
| Injection de prompt via résultats d'outils non filtrés | **Corrigé** | — |
| Mass assignment sur 4 Tools IA d'écriture | **Corrigé** | — |
| Contournement de symlink RAG | **Corrigé** | — |
| Rotation des refresh tokens absente | **Ouvert** | Majeur |
| Téléchargement de pièces jointes non authentifié (`/uploads/*`) | **Ouvert** | Majeur |
| Fuite de données cross-role (`list_projects`, KPI personnel) | **Ouvert** — décision produit requise | Majeur |
| Rate limiters en mémoire (bloquant multi-instance) | **Ouvert** | Majeur |
| Seconde voie JWT non documentée (`verifyToken.js`/`JWT_SECRET`) | **Ouvert** | Mineur |
| Mots de passe par défaut en dur dans les scripts de seed | **Ouvert** | Mineur |

## 2. Performance (voir `docs/performance/`)

| Dette | Statut | Priorité si ouverte |
|---|---|---|
| Bug de déduplication `followup.job.js` (12M lignes générées) | **Corrigé** | — |
| Index manquants (`notifications`, `commercial_contacts`, `project_reminders`) | **Corrigé** | — |
| Cache kanban non invalidé sur 5 chemins d'écriture | **Corrigé** | — |
| Compression HTTP absente | **Corrigé** | — |
| N+1 dans `services/scheduler.js` | **Ouvert** — trop risqué à corriger sans pouvoir tester les effets de bord réels | Majeur |
| Aucun cache sur les endpoints de dashboard/KPI (8-20 requêtes par appel) | **Ouvert** | Majeur |
| `commercial_contacts` non paginé, jointures dupliquant les lignes | **Ouvert** | Mineur |
| Export Excel synchrone bloquant l'event loop | **Ouvert** | Mineur |
| PostgreSQL non tuné (valeurs d'usine) | **Ouvert** — action infra, pas du code | Majeur |
| Transactions manquantes sur les écritures multi-étapes (HR, maintenance) | **Ouvert** | Mineur |

## 3. Nouveau dans cette passe finale

| Dette | Statut | Priorité si ouverte |
|---|---|---|
| `.env` local pointait vers une base de données inexistante (`cbitunisiaGestionnaires` au lieu de `cbitunisiaGestionnaire`), bloquant 5 suites de tests depuis le début de la session | **Corrigé** — a débloqué 3 suites entièrement et révélé un vrai problème (ligne suivante) | — |
| 2 suites de tests MFA supposent `MFA_ENABLED=true`, alors que le `.env` local a `MFA_ENABLED=false` — 21 tests échouent pour cette raison, jamais vérifié avant cette session (le typo `DB_NAME` empêchait même de le découvrir) | **Ouvert** — nécessite une décision (harmoniser l'environnement de test ou faire porter `MFA_ENABLED=true` par les tests eux-mêmes) | Majeur |
| Aucun pipeline CI/CD pour le backend | **Corrigé partiellement** — un workflow GitHub Actions minimal a été ajouté (`.github/workflows/backend-ci.yml`), **non vérifié en exécution réelle** (impossible de déclencher GitHub Actions depuis cet environnement) | Mineur (vérification à faire) |
| Aucune configuration Docker | **Ouvert** | Majeur |
| Aucun outil d'observabilité (APM, métriques, tracing) | **Ouvert** | Majeur |
| 75 fichiers utilisent `console.log`/`console.error` directement plutôt que `utils/logger.js` | **Ouvert** | Mineur |
| Aucun linter/formatter installé (ni ESLint ni Prettier) | **Ouvert** | Majeur |
| Aucune spécification API (OpenAPI/Swagger) | **Ouvert** | Mineur |
| Frontend Flutter : 1 seul fichier de test dans tout le projet | **Ouvert** | Majeur |
| Fichiers de routes morts et incohérents (`routes/upload .js` avec une espace dans le nom, jamais require()) | **Ouvert** (nettoyage optionnel, aucun risque live) | Mineur |

## 4. Ce qui n'EST PAS de la dette (vérifié sain, à ne pas re-questionner sans nouvelle preuve)

- SQL Injection, Command Injection, SSRF, Unsafe Deserialization : aucune instance trouvée.
- 0 marqueur `TODO`/`FIXME`/`XXX`/`HACK` dans tout `src/` — absence de dette explicitement signalée par l'équipe (positif, ou signe qu'aucune convention de marquage n'a jamais été utilisée — les deux lectures sont possibles).
- `npm audit` : 22 vulnérabilités, toutes préexistantes dans des dépendances transitives, aucune nouvelle introduite par les correctifs de cette session (vérifié à chaque étape).
- Le kernel IA (`src/ai/`) a une couverture de tests mesurée à ~92% (statements) — largement au-dessus du reste du projet.

## 5. Total estimé (ordre de grandeur, pas un chiffrage précis)

- **Éléments corrigés cette session** : 20+ (détail dans `docs/security/Security_Fixes.md` et `docs/performance/Optimization_Report.md`).
- **Éléments ouverts, priorité Majeure** : 12.
- **Éléments ouverts, priorité Mineure** : 7.
- **Éléments ouverts, priorité Critique restante** : 1 (rotation des secrets exposés — action externe, pas du code).

Voir `Improvement_Roadmap.md` pour la traduction de cet inventaire en plan d'action séquencé.
