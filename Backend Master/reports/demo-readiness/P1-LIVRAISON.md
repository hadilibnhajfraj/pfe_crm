# Périmètre P1 — livraison du 12/10/2026

Changements locaux appliqués et testés. Le serveur n'a pas été démarré, le script de réinitialisation n'a été exécuté sur aucune base, aucune donnée n'a été écrite.

Ce document remplace le dossier `proposed/` et la partie « compatibilité UUID » de `RAPPORT.md` : le contournement `demo-uuid-compat.js` n'est plus nécessaire, la correction est faite dans le code du Copilot.

## 1. Fichiers

Diff complet : [P1.diff](P1.diff) (42 fichiers modifiés, 88 lignes ajoutées, 45 retirées, plus les fichiers nouveaux).

| Fichier | Nature |
|---|---|
| `src/ai/mcp/uuidSchema.js` | nouveau — règle unique de validation d'un UUID |
| `src/ai/mcp/validationManager.js` | modifié — l'utilisateur agissant passe par la règle partagée |
| 40 fichiers sous `src/ai/mcp/tools/` | modifiés — 44 champs d'identifiant passent par la règle partagée |
| `scripts/demo/demo-guard.js` | nouveau — garde-fou du mode démonstration |
| `scripts/demo/reset-demo-passwords.js` | nouveau — réinitialisation des neuf comptes, simulation par défaut |
| `package.json` | modifié — deux scripts ajoutés : `demo:start`, `demo:passwords` |
| `test/ai.mcp.uuidSchema.test.js`, `test/demoGuard.test.js`, `test/demoResetPasswords.test.js`, `test/fixtures/demoGuard/` | nouveaux — tests |

Non touchés : `.env`, migrations, `src/app.js`, `src/db.js`, tâches planifiées, RAG, ContextBuilder, historique, AgentRuntime, routes du Copilot, l'autre copie du dépôt.

### Copilot — ce qui change exactement

Dans chacun des 41 fichiers, une seule substitution :

```diff
+const { uuidString } = require("../../uuidSchema");
-      ownerId: Joi.string().guid({ version: "uuidv4" }).optional(),
+      ownerId: uuidString().optional(),
```

`uuidString()` accepte tout UUID au format canonique, versions 1 à 8 (dont 4 et 5). Restent refusés : une chaîne quelconque, un UUID sans tirets, entre accolades, entouré d'espaces, de version 0 ou de variante hors RFC 4122. Le type d'erreur Joi (`string.guid`) et son message sont conservés.

Le contrôle d'accès n'est pas modifié : `McpServer` valide toujours l'utilisateur puis appelle `PermissionManager.assertCanCall` avant l'outil, et les 40 outils gardent leur déclaration `requiredRoles`.

## 2. Tests exécutés

Aucun n'écrit dans une base. Les tests du garde-fou lisent la base de démonstration (`SELECT current_database()` en transaction `READ ONLY`) ; tous les autres n'ouvrent aucune connexion.

| Suite | Tests | Résultat |
|---|---|---|
| `test/ai.mcp.uuidSchema.test.js` (nouveau) | 35 | réussis |
| `test/demoResetPasswords.test.js` (nouveau) | 24 | réussis |
| `test/demoGuard.test.js` (nouveau) | 21 | réussis |
| Suites existantes du MCP, de la validation du Copilot et des comptes du lot (24 fichiers) | 3 329 | réussis |
| **Total** | **3 409** | **0 échec** |

Commande : `npx jest test/ai.mcp.uuidSchema.test.js test/demoResetPasswords.test.js test/demoGuard.test.js --runInBand --forceExit`

**Non exécutés** : le reste de la suite Jest (elle utilise la base persistante `cbigestionnairepfe_test`), `test/ai.mcp.tools.getPersonalKpiSummary.dbRegression.test.js` pour la même raison, le démarrage du serveur, toute question réelle au Copilot, et le script de réinitialisation sur une base.

## 3. Preuve des garde-fous de base de données

`test/demoGuard.test.js` lance le garde-fou dans un processus séparé, avec un script d'inspection à la place du CRM.

| Cas | Résultat |
|---|---|
| Configuration visant `cbigestionnairepfe` | refus, code 1, aucune connexion ouverte |
| Hôte distant | refus |
| `NODE_ENV=production` | refus |
| La connexion aboutit à `cbigestionnairepfe`, `…_demo_test`, `…_test`, `CBIGESTIONNAIREPFE_DEMO`, `…_demo2` | refus dans les 5 cas |
| Connexion de contrôle impossible | refus |
| Refus avant le chargement du CRM | aucune trace de démarrage du CRM |
| Base de démonstration | accepté ; la connexion du CRM répond `cbigestionnairepfe_demo` |
| `.env` rechargé comme dans `src/app.js` | `DB_NAME` et `DATABASE_URL` restent sur la démo |
| Six fichiers de tâches chargés, interrupteurs remis à `true` | 6 demandes ignorées, 0 tâche créée |
| Transport d'e-mail demandé sur un serveur SMTP | transport en mémoire, aucun envoi |
| Une connexion du CRM vise une autre base en cours d'exécution | arrêt du processus |
| Traces | aucun mot de passe, aucune URL de connexion |

Le contrôle a lieu dans un processus enfant terminé avant que la première ligne du CRM s'exécute, donc avant les synchronisations, `ensureSuperadmin2`, la reprise de la file d'e-mails et les tâches planifiées.

## 4. Preuve que les données sont intactes

Relevé en lecture seule avant et après tous les tests : strictement identique.

| Mesure | Avant | Après |
|---|---|---|
| Notifications | 300, 0 lue, dernière le 10/10 à 23:13 UTC | identique |
| Empreinte md5 du contenu de `notifications` | `e46d2726…5b7f` | identique |
| Empreinte md5 du contenu de `users` | `e6c4ecb1…9bf1` | identique |
| Registre, projets, actions, file d'e-mails | 2 192 / 80 / 300 / 0 | identique |
| `cbigestionnairepfe` : lignes insérées / modifiées / supprimées, sessions | 13 827 / 5 837 / 4 317, 0 | identique |
| `cbigestionnairepfe_demo` | 29 077 / 1 511 / 270 | identique |
| `cbigestionnairepfe_demo_test` | 1 008 / 56 / 228 | identique |
| `cbigestionnairepfe_test` | 36 109 / 2 974 / 2 698 | identique |

Les compteurs de la base réelle sont les mêmes depuis le premier relevé de la journée. `.env` : inchangé (11/10 à 17:53).

## 5. Lancer le mode démonstration (manuel)

1. Vérifier que le port est libre et que l'autre copie du backend n'est pas lancée :

   ```powershell
   Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
   ```

2. Depuis `Backend Master` :

   ```bash
   npm run demo:start
   ```

3. Lignes attendues, dans cet ordre, avant toute trace du CRM :

   ```
   [demo-guard] Base vérifiée : cbigestionnairepfe_demo sur 127.0.0.1:5432.
   [demo-guard] Neutralisés dans ce processus : tâches planifiées, archivage automatique, surveillance proactive, envoi d'e-mails.
   ```

   Puis `✅ DB connected` et `✅ API running on http://localhost:4000`. Une ligne `DÉMARRAGE REFUSÉ` signifie que rien n'a été lancé.

Ne pas utiliser `npm start` ni `npm run dev` pour la démonstration : ils lisent le `.env` et visent la base réelle.

À savoir : le démarrage exécute toujours les initialisations du CRM, mais sur la démo. Elles n'y créent rien aujourd'hui (aucune société ni personne à lier, compte superadmin2 déjà présent, file d'e-mails vide). La connexion d'un utilisateur écrit son jeton de rafraîchissement dans `users`.

## 6. Vérifier les comptes et le Copilot

Comptes — simulation, sans écriture (à lancer par vous ; je ne l'ai pas exécutée) :

```bash
npm run demo:passwords
```

Réinitialisation réelle, après votre décision. Le mot de passe est saisi dans la session et n'est jamais affiché :

```powershell
$env:DEMO_ACCOUNT_PASSWORD = Read-Host "Mot de passe de démonstration"
npm run demo:passwords -- --apply --batch=DEMO-demo-powerbi-v1-s20261010
Remove-Item Env:DEMO_ACCOUNT_PASSWORD
```

État des comptes en base (lecture seule, requête A16 de `reports/demo-data-quality/validation-queries.sql`).

Copilot, backend de démonstration lancé et comptes réinitialisés :

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:4000/auth/signin -ContentType "application/json" -Body (@{ email = "demo.commercial02@cbi_tunisia.com"; password = $env:DEMO_ACCOUNT_PASSWORD } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri http://localhost:4000/me -Headers $h
Invoke-RestMethod -Method Post -Uri http://localhost:4000/ai-copilot/chat -Headers $h -ContentType "application/json" -Body (@{ message = "Combien de projets par statut entre le 1er avril et le 30 septembre 2026 ?" } | ConvertTo-Json)
Invoke-RestMethod -Uri http://localhost:4000/ai-copilot/conversations -Headers $h
```

Attendu : plus aucune erreur `"id" must be a valid GUID` ; chiffres à comparer à la requête K03. Les noms des champs (`accessToken`, `message`) viennent du code des routes ; ces commandes n'ont pas été essayées contre le serveur en marche.

Absence de nouvelles notifications, après quelques minutes de fonctionnement :

```sql
SELECT count(*), max("createdAt") FROM notifications;   -- attendu : 300, 2026-10-10 23:13 UTC
```

## 7. Reste à décider

1. Exécuter la réinitialisation des neuf mots de passe.
2. Démarrer le backend de démonstration et dérouler la validation fonctionnelle (`RAPPORT.md`, section 6).
3. Création réelle d'un projet de test par l'API.
4. Notifications : aucune action sans autorisation distincte.
5. Données de l'audit : `lastRelanceAt` vide sur 80 projets, 4 revendeurs incohérents, relances planifiées échues.
