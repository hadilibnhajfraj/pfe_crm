# Security_Test_Plan.md — Tests de sécurité et de régression

## 1. Méthodologie de test

Ce dépôt n'a pas de base de données de test isolée (voir `test/auth.resetPassword.test.js`, qui utilise la base de dev réelle) — cet environnement d'exécution n'a **aucune connexion PostgreSQL disponible**. Les nouveaux tests écrits pour cet audit suivent donc le style déjà utilisé par la suite `test/ai.*` de ce dépôt : routeur monté isolément (Express + `supertest`), dépendances (modèles Sequelize, middlewares) **mockées explicitement** plutôt qu'une vraie base — rapide, déterministe, exécutable dans n'importe quel environnement (y compris CI sans base de données provisionnée). Quand un module transitively requiert `src/db.js` (qui lève si les variables `DB_*` sont absentes, mais ne se connecte jamais réellement à la construction), `require("dotenv").config()` est appelée explicitement en tête de fichier de test.

Cette approche diverge du seul autre style de test HTTP présent dans ce dépôt (`test/auth.resetPassword.test.js`, `test/mfa.test.js`, ... — intégration sur base réelle) : ces derniers **ne peuvent pas être exécutés dans cet environnement** (`SequelizeConnectionError`, préexistant, sans rapport avec cet audit) et n'ont donc pas servi de modèle direct, bien que le module `auth.routes.js` testé ici (`test/auth.routes.signup.test.js`) partage le même fichier source.

## 2. Résultat final

```
Suite complète (npx jest --runInBand --forceExit) :
  112 suites — 107 réussies, 5 échecs (préexistants, sans rapport, base de données réelle indisponible)
  1278 tests — 1240 réussis, 38 échecs (mêmes 5 suites : mfa.test.js, mfa.dedup.test.js,
                                          mfa.disabled.test.js, auth.resetPassword.test.js,
                                          emailQueue.service.test.js)
  0 régression introduite par cet audit.
  +53 nouveaux tests (9 nouveaux fichiers), 0 échec parmi eux.

npm audit : 22 vulnérabilités (1 low, 7 moderate, 14 high) — identique avant/après,
            toutes préexistantes (dépendances transitives), aucune nouvelle introduite
            (aucune dépendance npm ajoutée par cet audit).
```

## 3. Nouveaux fichiers de test (cette passe)

| Fichier | Couvre | Tests |
|---|---|---|
| `test/client.routes.test.js` | Auth + rôle requis sur `import-csv`/`import-factures` | 5 |
| `test/notifications.routes.test.js` | Auth requis sur `send-email` | 2 |
| `test/geocode.routes.test.js` | Auth requis + plafond du cache mémoire (éviction FIFO) | 3 |
| `test/kanban.routes.test.js` | `requireOwnerOrAdmin` réellement câblé sur la route (pas juste testé isolément) | 2 |
| `test/projectAction.routes.test.js` | `requireProjectOwnerOrAdmin` câblé sur get/delete | 3 |
| `test/project.policy.test.js` | `canEdit`/`requireOwnerOrAdmin`/`requireProjectOwnerOrAdmin` en isolation (mock du modèle `Project`) | 10 |
| `test/socket.test.js` | `_authenticate` (accepte/rejette un token), câblage `io.use()`, la room rejointe est toujours la propre room vérifiée du socket | 5 |
| `test/auth.routes.signup.test.js` | Mot de passe faible rejeté / fort accepté à l'inscription | 2 |
| `test/upload.middleware.test.js` | `fileFilter` accepte les images, rejette `.svg/.html/.php/.exe` ; `handleUploadError` renvoie un 400 JSON propre | 21 |

Fichier modifié : `test/ai.mcp.tools.maintenance.test.js` — assertion mise à jour pour la nouvelle signature de `addComment()` (5 arguments au lieu de 3).

## 4. Tests de sécurité du module IA (rappel — passe précédente)

Déjà livrés et passants avant cet audit CRM-wide, non refaits ici :
- `test/ai.rag.sourceGuard.test.js` (+4 tests symlink), `test/ai.rag.ingestionService.test.js` (+1 test symlink)
- `test/ai.mcp.tools.industrial.test.js`, `test/ai.mcp.tools.porPromesh.test.js` (+4 tests mass assignment)
- `test/ai.mcp.server.start.test.js` (nouveau, 4 tests — câblage sécurité par défaut de `createServer()`)
- `test/ai.security.e2e.test.js` (15 tests — scénario bout-en-bout des 8 piliers de sécurité du module IA)
- Suite complète `test/ai.security.*.test.js` (rate limiting, audit, prompt injection guard, secret redaction)

Voir le rapport d'audit du module IA (artefact publié séparément dans cette session) pour le détail complet de cette passe.

## 5. Ce qui N'A PAS pu être testé dans cet environnement

- **Tout ce qui nécessite une connexion PostgreSQL réelle** : le comportement bout-en-bout de `addComment()` (maintenance) contre une vraie base, les migrations, toute requête Sequelize réellement exécutée. Mitigé par : (a) mock explicite et vérification de l'appel exact des fonctions concernées, (b) `test/project.policy.test.js` couvre `canEdit`/`requireOwnerOrAdmin`/`requireProjectOwnerOrAdmin` avec un modèle `Project` mocké représentatif.
- **Le comportement réseau réel de Socket.IO** : `socket.io-client` n'est pas une dépendance de ce projet — `test/socket.test.js` mocke entièrement la classe `Server` de `socket.io` et invoque directement les callbacks capturés (`io.use()`, `io.on("connection", ...)`) plutôt que d'ouvrir une vraie connexion WebSocket. Recommandation : ajouter `socket.io-client` en devDependency pour un test d'intégration réel du handshake si cette route devient critique.
- **Rotation/révocation réelle des secrets** (§1 de `Security_Report.md`) — action opérationnelle externe, pas un test automatisable.
- **La mise à jour du client Flutter** pour l'authentification Socket.IO — aucun code Dart modifié ni testé dans ce passage.

## 6. Recommandations de tests complémentaires (non réalisés, proposés)

- Test d'intégration réel (base de test dédiée, pas la base de dev) pour `addComment()`/`moveStageFast`/project-actions, une fois qu'une base de test isolée existe pour ce dépôt (actuellement absente — voir §1).
- Test de pénétration manuel ciblé sur `POST /auth/refresh` (rejeu de refresh token) une fois la rotation implémentée.
- Test de charge sur `GET /utils/geocode` et les deux endpoints d'import pour valider les limiteurs de débit sous trafic réel (les tests actuels valident le câblage, pas la tenue en charge).
- Audit dédié du webhook Google Calendar entrant (validation de signature) — non couvert par cette passe.

## 7. Comment exécuter

```bash
# Suite complète
npx jest --runInBand --forceExit

# Uniquement les nouveaux tests de cette passe
npx jest test/client.routes.test.js test/notifications.routes.test.js test/geocode.routes.test.js \
         test/kanban.routes.test.js test/projectAction.routes.test.js test/project.policy.test.js \
         test/socket.test.js test/auth.routes.signup.test.js test/upload.middleware.test.js \
         --runInBand --forceExit

# npm audit
npm audit
```
