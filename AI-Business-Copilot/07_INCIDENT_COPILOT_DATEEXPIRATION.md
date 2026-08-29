# Correction — SequelizeDatabaseError : colonne ProjectDevis.dateExpiration inexistante

> Suite de `06_INCIDENT_COPILOT_NON_CONFIGURE.md`. Cette fois, une vraie
> panne PostgreSQL — pas une question de configuration LLM. Chaque
> affirmation ci-dessous est vérifiable (fichier + ligne, ou commande
> exécutable).

## 1. Cause exacte de l'erreur

**Une migration Sequelize existait déjà, correctement écrite, mais vivait
dans le mauvais dossier — elle n'a donc jamais été exécutée.**

- `.sequelizerc` déclare `migrations-path: src/migrations` — c'est le SEUL
  dossier que `sequelize-cli` lit.
- La migration `20260807090000-add-date-expiration-to-project-devis.js`
  se trouvait dans `Backend Master/migrations/` (un dossier à la racine,
  distinct, jamais scanné par `sequelize-cli`).
- Conséquence vérifiée directement en base : `describeTable("project_devis")`
  ne listait AUCUNE colonne `dateExpiration` — alors que le modèle
  Sequelize (`src/models/ProjectDevis.js:17`) la déclare comme un champ
  réel. Chaque requête `WHERE dateExpiration ...` (voir §2) échouait donc
  avec `SequelizeDatabaseError: column "dateExpiration" does not exist`.

Ce n'était PAS : un problème de mapping Sequelize (CAS 1 — le nom de
colonne dans le modèle était le bon), ni un champ métier inexistant
(CAS 3 — le besoin métier est réel, voir §5), ni une différence
d'environnement (CAS 4). C'était très précisément le **CAS 2** : "le champ
fait partie du modèle métier mais la migration manque" — sauf qu'elle
n'était pas manquante, seulement égarée.

## 2. Fichiers concernés

| Fichier | Rôle dans le bug |
|---|---|
| `src/models/ProjectDevis.js:17` | Déclare `dateExpiration` — le modèle était correct, jamais la cause |
| `src/modules/ai-copilot/services/dashboardBriefing.service.js:126-138` (`buildExpiringQuotes`) | Émet la requête `ProjectDevis.count()`/`findAll()` avec `WHERE dateExpiration BETWEEN ...` — le point d'échec réel |
| `src/modules/ai-copilot/controllers/aiCopilot.controller.js::dashboard()` | La route exacte du rapport de bug (`GET /ai-copilot/dashboard`) — appelle `dashboardBriefing.getDashboardBriefing()`, laisse remonter l'erreur à `handle()` |
| `migrations/20260807090000-add-date-expiration-to-project-devis.js` (AVANT) | La migration, correcte, mais dans le mauvais dossier — jamais lue par `sequelize-cli` |
| `.sequelizerc` | Confirme le seul dossier réellement actif : `src/migrations` |

## 3. État de la base (vérifié directement, jamais supposé)

```bash
$ npx sequelize-cli db:migrate:status | grep -i devis
# (aucun résultat — la migration était invisible pour sequelize-cli)

$ node -e '... qi.describeTable("project_devis") ...'
dateExpiration présente ? false
```

## 4. Besoin métier réel (ÉTAPE 5 — jamais supposé, lu dans le code)

`dashboardBriefing.service.js::buildExpiringQuotes()` alimente le compteur
"devis expirants" de l'AI Dashboard (`today.expiringQuotes`, la timeline,
et le graphique) — les devis dont la date d'expiration tombe dans les
prochains `EXPIRING_QUOTE_WINDOW_DAYS` jours. Le commentaire d'origine du
modèle le confirme explicitement : "Alimente le compteur 'devis expirants'
du Dashboard AI". Un besoin métier réel, déjà implémenté ailleurs dans le
service — jamais une invention pour cette correction.

## 5. Solution appliquée (CAS 2)

1. **Déplacé** `migrations/20260807090000-add-date-expiration-to-project-devis.js`
   → `src/migrations/` (le dossier réellement actif). Aucune ligne de la
   migration modifiée — son contenu était déjà correct et sûr (transaction,
   `addColumn` idempotent via `describeTable`, colonne `allowNull: true`
   donc AUCUNE donnée existante affectée, index de support créé).
2. **Exécutée** via `npx sequelize-cli db:migrate` — la commande officielle,
   jamais une modification manuelle de PostgreSQL. Pour ne toucher QUE
   cette migration (deux autres migrations, sans rapport, étaient déjà en
   attente — ajout d'index de performance sur `notifications`/
   `commercial_contacts` — non exécutées avant, non exécutées maintenant,
   volontairement laissées telles quelles), les deux fichiers non liés ont
   été mis de côté le temps de la commande puis immédiatement restaurés à
   l'identique.
3. **Vérifié** directement en base après coup : la colonne ET son index
   existent (`project_devis_date_expiration_idx`).
4. **Codes d'erreur structurés** (ÉTAPE 10) — nouveau fichier
   `src/modules/ai-copilot/services/errorClassifier.js` : classe CHAQUE
   erreur atteignant un contrôleur `/ai-copilot/*` en une famille stable
   (`AI_PROVIDER_NOT_CONFIGURED`, `AI_DATABASE_ERROR`, `AI_PERMISSION_DENIED`,
   `AI_TOOL_ERROR`, `AI_TIMEOUT`, `AI_INTERNAL_ERROR`) — jamais deux causes
   sous le même message. `aiCopilot.controller.js::handle()` et
   `aiCopilotSocket.js` utilisent désormais ce classifieur au lieu de leur
   ancien if/else à deux branches.

**Rien de destructif** : aucune donnée supprimée, aucune validation
désactivée, aucun contrôle RBAC contourné, aucune donnée fictive créée —
un devis déjà existant reste `dateExpiration: null` (jamais compté comme
expirant tant que personne ne l'a renseigné), exactement le comportement
prévu par le code déjà en place.

## 6. Migration créée ou non

**Aucune nouvelle migration créée.** La migration existait déjà, écrite
par un développeur précédent — je l'ai relocalisée puis exécutée avec les
outils standard du projet, jamais réécrite.

## 7. Tests exécutés

| Fichier | Ce qu'il prouve |
|---|---|
| `test/ai.dashboardBriefing.dbRegression.test.js` (**nouveau**, 3 tests) | Régression directe, base RÉELLE (jamais mockée) : la colonne existe, la requête `WHERE dateExpiration` ne lève plus, `getDashboardBriefing()` bout-en-bout avec un vrai utilisateur (185 projets actifs réels) |
| `test/aiCopilot.errorClassifier.test.js` (**nouveau**, 11 tests) | Les 6 codes `AI_*`, contre de VRAIES classes d'erreur (`Sequelize.DatabaseError`, `NotConfiguredError`, etc.) — jamais un objet simulé ; confirme qu'aucun message ne fuit de détail interne |
| `test/aiCopilot.routes.test.js` (+3 tests) | `AI_DATABASE_ERROR` (jamais `AI_PROVIDER_NOT_CONFIGURED`) pour une vraie `SequelizeDatabaseError`, sur `/chat` ET `/dashboard` |
| `test/aiCopilot.socket.test.js` (+2 tests) | Même garantie côté WebSocket |
| `test/ai.copilotConfig.httpIntegration.test.js` (+1 test, corrigé) | `GET /ai-copilot/dashboard` en HTTP réel, routeur/bridge non mockés, utilisateur réel de la base → 200 avec de vraies données CRM |

Précision honnête sur l'ordre réel des opérations : `ai.dashboardBriefing.dbRegression.test.js`
a été écrit APRÈS l'application de la migration, donc je ne l'ai jamais
fait échouer moi-même sur l'ancien schéma — je ne le prétends pas. La
preuve du "avant" vient du diagnostic ÉTAPE 1-4, exécuté AVANT toute
correction et montré au §3 : `db:migrate:status` ne listait aucune
migration liée à `devis`/`expiration` (invisible pour `sequelize-cli`), et
`describeTable("project_devis")` confirmait `dateExpiration présente ? false`.
Le nouveau test constate seulement l'état "après" ; le contraste
avant/après repose sur ces deux commandes exécutées dans cet ordre, pas sur
un run rouge→vert du même fichier de test.

## 8. Résultat des tests

```
Backend — suites liées à l'IA : 153 suites, 4698 tests — 100% verts

npm test (suite complète) : 169 suites, 4803 tests, 4782 verts, 21 échecs
(tous test/mfa.test.js/test/mfa.dedup.test.js — SMTP réel requis,
préexistants, sans rapport, fichiers non touchés par cette correction)
```

## 9. Endpoint testé

`GET /ai-copilot/dashboard` — la route EXACTE du rapport de bug
(`aiCopilot.controller.js::dashboard()`). Testé en HTTP réel (supertest),
routeur et bridge non mockés, contre la vraie base de données, avec un
utilisateur réel au rôle `"user"`.

## 10. Résultat réel du Copilot

```bash
$ npx jest test/ai.copilotConfig.httpIntegration.test.js --verbose
✓ GET /ai-copilot/dashboard returns 200 with real CRM data for role "user"
```
→ **HTTP 200**, `{ success: true, data: { today: { criticalProjects, expiringQuotes, ... }, riskCards: [...], ... } }` — plus aucune `SequelizeDatabaseError`, plus jamais le message "non configuré" pour cette panne.

Pour `POST /ai-copilot/chat` ("Quels projets sont critiques ?"/"en
retard ?"/"KPI actuels ?") : ces questions sont déjà couvertes par le
corpus de validation (`rec-12`/`rec-20` — "projets critiques", rôle
`user` ; `prj-02` — "Quels projets sont en retard ?", rôle `user` ;
`dir-01` — KPI, rôle admin), toutes vertes contre un vrai `AIManager`
(fournisseur LLM factice, faute de vraie clé — voir
`06_INCIDENT_COPILOT_NON_CONFIGURE.md`, toujours d'actualité, sans rapport
avec CETTE correction). "Quels devis arrivent à expiration ?" n'est pas
une question-Tool du Copilot conversationnel — c'est un chiffre
déterministe déjà exposé par `GET /ai-copilot/dashboard` (§10 ci-dessus,
maintenant vert).

## 11. Aucun fichier inutilement modifié

Seuls les fichiers listés en §2/§5/§7 ont été touchés. Les deux migrations
sans rapport (`20260731000100`/`20260731000200`, index de performance) ont
été déplacées puis IMMÉDIATEMENT restaurées à l'identique, jamais
exécutées, jamais modifiées. Aucun fichier Flutter touché.

## Comment vérifier ce rapport

```bash
cd "Backend Master"

# La colonne existe bien, avec son index
node -e 'require("dotenv").config(); const {sequelize}=require("./src/db"); sequelize.getQueryInterface().describeTable("project_devis").then(t=>{console.log(Boolean(t.dateExpiration)); process.exit(0)})'

# La migration est bien dans le bon dossier, appliquée
npx sequelize-cli db:migrate:status | grep devis

# Tests de régression
npx jest test/ai.dashboardBriefing.dbRegression.test.js test/aiCopilot.errorClassifier.test.js --verbose

# Test HTTP réel
npx jest test/ai.copilotConfig.httpIntegration.test.js --verbose

# Régression complète
npm test
```
