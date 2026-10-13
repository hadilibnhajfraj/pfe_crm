# Préparation de la soutenance du 16/10/2026 — diagnostic, garde-fous proposés, tests

Rédigé le 12/10/2026. Phases A à E de la mission.

## 1. Conclusion

**Rien n'a été appliqué.** Le diagnostic est fait, trois fichiers sont proposés et testés, et ils attendent votre autorisation.

- **Aucun backend ne tourne** : rien n'écoute sur le port 4000 et aucun processus Node n'est actif.
- **Démarrer le backend tel quel écrirait dans la base réelle** : le `.env` la désigne, et le démarrage lui-même écrit (synchronisations, création d'un compte, tâches planifiées).
- **L'erreur `id` du Copilot est expliquée et reproduite** : les identifiants du lot de démonstration sont des UUID de version 5 ; le Copilot exige la version 4. Avec un compte `demo.*`, tout appel d'outil est refusé. L'erreur `email` est déjà corrigée dans le code.
- **9 comptes `demo.*` sur 10 ne peuvent pas se connecter** ; une méthode de réinitialisation bcrypt est prête, testée en simulation seulement.
- **La base réelle n'a reçu aucune écriture** pendant ce travail (section 8).

Fichiers proposés : `reports/demo-readiness/proposed/` ; diff : [DIFF.patch](proposed/DIFF.patch).

## 2. Phase A — diagnostic

### 2.1 Port 4000 et dossier réel du backend

| Point | Constat |
|---|---|
| Port 4000 | Aucun processus en écoute ; aucun `node.exe` en cours |
| Ce dépôt | `Documents\sj_final_pfe\source code\Backend Master`, `PORT=4000`, base du `.env` : `cbigestionnairepfe` |
| Autre copie | `Documents\codecanyon-…\source code\Backend Master`, `PORT=4000` aussi, base du `.env` : `cbitunisiaGestionnaire` ; tâches planifiées activées |
| Application Flutter | Adresse fixe `http://localhost:4000` (`lib/core/config/api_config.dart`) |

**Risque** : les deux backends visent le même port. L'application parlera à celui qui démarre le premier, quelle que soit sa base. L'autre copie est suivie par un dépôt Git dont la racine est `C:\Users\bhfha` (le dossier personnel entier) ; je n'y ai rien modifié.

Fichiers non commités : j'en compte 190 dans ce dépôt (`git status -uall`), pas 374 ; l'écart vient peut-être de l'autre copie. Aucun n'a été touché : seuls `reports/demo-data-quality/` et `reports/demo-readiness/` sont nouveaux.

### 2.2 Configuration de connexion

- `src/db.js` construit la connexion à partir de `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. **`DATABASE_URL` n'est pas lue par le CRM** ; seuls des scripts annexes l'utilisent (`check-demo-login.js`).
- `src/app.js` appelle `dotenv.config()` en première ligne. dotenv ne remplace jamais une variable déjà définie : **une variable posée sur le processus prime sur le `.env`**. C'est le mécanisme utilisé par le garde-fou proposé, et la raison pour laquelle le `.env` ne suffit pas à dire quelle base est utilisée.
- `config/database.js` (Sequelize CLI, migrations) lit les mêmes variables : une migration lancée sans précaution viserait la base réelle.
- Les tests Jest basculent sur `<DB_NAME>_test` (`test/setupTestEnv.js`).

### 2.3 Points d'entrée capables d'écrire

| Famille | Volume | Remarque |
|---|---|---|
| Démarrage du serveur (`start()` dans `src/app.js`) | 4 opérations | `syncCompaniesFromProjects`, `syncPeopleFromProjects`, `ensureSuperadmin2` (dont un `ALTER TYPE`), reprise de la file d'e-mails |
| Routes HTTP d'écriture | 114 | POST, PUT, PATCH, DELETE |
| Outils du Copilot qui écrivent | 41 sur 85 | création d'action, déplacement d'étape, validation de fiche, etc. |
| Tâches planifiées | 6 | voir 2.4 |
| Scripts et seeders | environ 25 | `scripts/*.js`, `src/scripts/*.js`, `src/seeders/*.js`, `nfr/` |
| Lecture qui écrit | 1 | une fiche de déchets passe à « clôturée » à la consultation après son délai |
| Connexion | 1 | `/auth/signin` écrit `refreshTokenHash` dans `users` |

Sur la base de démonstration, le démarrage ne créerait rien aujourd'hui : 0 société et 0 personne à lier, 0 e-mail en attente, compte superadmin2 déjà présent, valeur d'énumération déjà là (vérifié en lecture seule).

**Origine du compte `issam@gmail.com`** : `src/scripts/bootstrapSuperadmin2.js` le crée à chaque démarrage sur toute base où il manque, avec un mot de passe écrit en clair dans le fichier. Il a été créé dans la démo le 10/10 à 21:16, au premier démarrage du backend sur cette base.

### 2.4 Tâches planifiées

| Fichier | Fréquence | Effet | Interrupteur |
|---|---|---|---|
| `src/services/scheduler.js` | chaque minute | crée une action « Relance » sur tout projet sans action depuis 48 h | `AUTO_EMAIL_JOBS_ENABLED` |
| `src/cron/followup.job.js` | chaque minute | e-mails de suivi et notifications `FOLLOWUP_MISSING` | `AUTO_EMAIL_JOBS_ENABLED` |
| `src/cron/checkProjects.js` | chaque heure | archive les projets sans ingénieur après l'échéance | `AUTO_EMAIL_JOBS_ENABLED` et `AUTO_ARCHIVE_ENABLED` |
| `src/cron/projectCron.js` | 08:00 | relance par e-mail, notification, écrit `lastRelanceAt` ; archivage si activé | `AUTO_EMAIL_JOBS_ENABLED` (+ `AUTO_ARCHIVE_ENABLED`) |
| `src/cron/googleCalendarChannelRenewal.job.js` | 03:00 | renouvelle les canaux Google Calendar | `AUTO_EMAIL_JOBS_ENABLED` |
| `src/cron/proactiveAiMonitor.job.js` | 07:00 | alertes du Copilot par e-mail et notification | `AI_PROACTIVE_MONITORING_ENABLED` |

`src/services/reminderService.js` contient une septième tâche, mais il n'est chargé nulle part et dépend d'un module absent : code mort.

Le `.env` actuel porte `AUTO_EMAIL_JOBS_ENABLED=true`. La relance automatique de `scheduler.js` n'a rien créé dans la démo uniquement parce que le compte désigné par `SUPERADMIN_EMAIL` n'y existe pas.

Clôture automatique : il n'y a pas de tâche planifiée. La clôture des fiches de déchets se fait à la lecture (`recuperable.service.js`). Les 20 fiches ont une échéance au 16/10/2026, jour de la soutenance : à vérifier ce jour-là avant de les montrer.

### 2.5 Authentification

- `POST /auth/signin` (`src/routes/auth.routes.js`) : adresse au format `x@y.z`, mot de passe de 8 à 72 caractères, compte actif, puis `bcrypt.compare`. Pas de MFA sur ce chemin.
- Hachage : `bcrypt.hash(…, 12)` partout (inscription, réinitialisation, seeders).
- Jeton : `{ sub, email, role, rv }` ; l'identifiant est dans `sub`, pas dans `id`.
- Les adresses `@cbi_tunisia.com` passent le contrôle de format de la connexion.

### 2.6 Création de projet et autorisations

- Route réelle : `POST /projects` dans `src/routes/projects.routes.js` (l. 1597), protégée par `authRequired` puis `requireRole(commercial, admin, superadmin, superadmin2)`.
- `commercial_sedentaire` reçoit 403 de `requireRole` ; `responsable_logistique_achat` reçoit 403 plus tôt, de `moduleAccessGuard`, qui ne lui ouvre que les modules de production.
- Validation : nom unique par propriétaire (409 sinon), latitude et longitude obligatoires pour le modèle « project », règles famille / diamètre.
- La création ajoute une ligne `projects` et une ligne `user_projects` (permission « owner »).
- À noter : `PUT /projects/:id/status` (routeur modulaire) n'a pas de contrôle de rôle propre. Hors périmètre, signalé seulement.

### 2.7 Copilot — erreur de validation `id` / `email`

**Cause de l'erreur `id` : confirmée.** `src/ai/mcp/validationManager.js` (l. 24) exige `Joi.string().guid({ version: "uuidv4" })` pour l'utilisateur connecté. Le générateur du lot (`scripts/demo-seeder/lib/random.js`, `stableUuid`) produit des UUID de version 5.

| Table | Version des identifiants |
|---|---|
| `users` (10 comptes `demo.*`) | 5 |
| `users` (`issam@gmail.com`) | 4 |
| `projects`, `project_actions`, `commercial_contacts`, relances, `companies`, `engineers`, `por_promesh`, `industrial_records` | 5 |
| `pipeline_stages`, `machines`, `notifications` | 4 |

Reproduit hors base : `Invalid actingUser: "id" must be a valid GUID` pour `demo.commercial01`, accepté pour un identifiant de version 4. Conséquence : avec un compte `demo.*`, **aucun outil du Copilot ne s'exécute**. La même contrainte figure 44 fois dans 40 outils (identifiant de projet, de contact, de fiche…) : même avec un compte en version 4, tout outil recevant un identifiant du lot échouerait.

C'est pourquoi le Copilot fonctionne avec `issam@gmail.com` et pas avec les comptes de démonstration.

**Erreur `email` : déjà corrigée.** Le même fichier accepte désormais toute adresse de forme `x@y` (commit « fixer copilot »). Vérifié : `demo.commercial01@cbi_tunisia.com` passe. Reste un cas : l'outil `send_notification_email` valide son destinataire avec `Joi.string().email()`, qui refuse `cbi_tunisia.com` ; sans conséquence si aucun e-mail n'est envoyé en démonstration.

**Historique** : les conversations sont gardées en mémoire du processus (`conversationIndex.service.js`). Un redémarrage du backend les efface : ne pas redémarrer entre la préparation et la soutenance si l'historique doit être montré.

### 2.8 Notifications existantes

300 lignes, toutes de type `FOLLOWUP_MISSING`, toutes non lues, créées par `followup.job.js` en deux passes le 10/10 (21:17 et 23:13), 150 par passe : 95 « Email manquant » et 55 « Relance manquante ». Chaque notification existe donc en double. Destinataires : 8 comptes (106 pour chacun des deux sédentaires, 10 à 20 par commercial, 0 pour l'admin et la production). **Aucune n'a été supprimée ni modifiée.**

### 2.9 Risques

| # | Risque | Gravité | Fichiers |
|---|---|---|---|
| R1 | Démarrage sur la base réelle par défaut | critique | `.env`, `src/db.js` |
| R2 | Deux backends sur le port 4000, bases différentes | élevée | les deux `.env`, `api_config.dart` |
| R3 | Tâches planifiées actives : écritures et e-mails automatiques | élevée | `src/cron/*`, `src/services/scheduler.js` |
| R4 | Copilot inutilisable avec les comptes `demo.*` | élevée | `src/ai/mcp/validationManager.js`, 40 outils |
| R5 | 9 comptes sans mot de passe utilisable | élevée | données `users` |
| R6 | Mots de passe en clair dans des fichiers du dépôt | moyenne | `src/scripts/bootstrapSuperadmin2.js`, `check-demo-login.js` |
| R7 | Historique du Copilot perdu au redémarrage | moyenne | `conversationIndex.service.js` |
| R8 | Fiches de déchets à échéance le jour de la soutenance | faible | `recuperable.service.js` |

## 3. Phase B — lancement de démonstration proposé

Deux fichiers nouveaux. Aucun fichier existant n'est modifié ; `npm start` et `npm run dev` gardent exactement leur comportement.

```
node -r ./scripts/demo/demo-guard.js -r ./scripts/demo/demo-uuid-compat.js src/app.js
```

**`scripts/demo/demo-guard.js`** — préchargé avant le CRM :

1. prend la cible dans `scripts/demo-seeder/demo.config.json`, pas dans le `.env` ;
2. refuse si le nom n'est pas exactement `cbigestionnairepfe_demo`, si l'hôte n'est pas local, ou si `NODE_ENV=production` ;
3. fixe les variables du processus (`DB_*`, `DATABASE_URL`), qui priment sur le `.env` ;
4. ouvre une connexion de contrôle et lit `current_database()` **avant** que le CRM se charge ;
5. contrôle de la même façon chaque connexion ouverte ensuite par le CRM ;
6. désactive tâches planifiées, archivage automatique, surveillance proactive et envoi d'e-mails ;
7. n'écrit aucun secret dans les traces.

**`scripts/demo/demo-uuid-compat.js`** — réponse à R4, pour ce processus seulement : Joi accepte tout UUID bien formé, quelle que soit sa version. Aucun fichier du Copilot n'est modifié ; une chaîne qui n'est pas un UUID reste refusée. Il refuse de se charger sans le garde-fou.

Ce second fichier est un contournement, pas une correction : il modifie le comportement d'une bibliothèque au chargement. Je le recommande pour la soutenance parce qu'il ne touche ni au Copilot ni à la production. La correction durable serait d'accepter toute version d'UUID dans `validationManager.js` et les 40 outils ; elle modifie le code du Copilot et demande votre accord séparé.

Facultatif : deux raccourcis dans `package.json` (`demo:start`, `demo:passwords`), montrés dans le diff, non appliqués.

## 4. Phase C — comptes de démonstration

| Compte | Rôle | Actif | Mot de passe utilisable |
|---|---|---|---|
| `demo.commercial01@cbi_tunisia.com` | commercial | oui | oui |
| `demo.commercial02` à `06@cbi_tunisia.com` | commercial | oui | non |
| `demo.commercial_sedentaire01` et `02@cbi_tunisia.com` | commercial_sedentaire | oui | non |
| `demo.admin01@cbi_tunisia.com` | admin | oui | non |
| `demo.responsable_logistique_achat01@cbi_tunisia.com` | responsable_logistique_achat | oui | non |

Les 10 comptes sont inscrits au registre du lot. Les 9 comptes bloqués portent tous la même valeur de 15 caractères en majuscules, qui n'est pas une empreinte.

**`scripts/demo/reset-demo-passwords.js`** — méthode proposée :

- périmètre : comptes inscrits au registre du lot **et** dont l'adresse commence par `demo.` ; arrêt s'il n'y en a pas exactement 10 ou si l'un est inactif ;
- par défaut, seuls les 9 comptes sans empreinte valide sont traités ; `--all` inclut `demo.commercial01` ;
- mot de passe lu dans la variable `DEMO_ACCOUNT_PASSWORD`, jamais affiché ni enregistré ; bcrypt de coût 12, comme le CRM ;
- sans option : simulation dans une transaction en lecture seule ;
- écriture seulement avec `--apply --batch=DEMO-demo-powerbi-v1-s20261010` ;
- une seule transaction ; seule la colonne `passwordHash` change ; contrôle que rien d'autre n'a bougé dans `users` ; vérification par `bcrypt.compare` avant validation ; inscription au registre avec valeurs masquées ;
- refus si `current_database()` n'est pas `cbigestionnairepfe_demo`.

Choix à faire : un mot de passe commun aux 10 comptes (recommandé, plus simple en soutenance, donc `--all`) ou seulement les 9 comptes bloqués.

## 5. Résultats des tests

Tous exécutés sans démarrer le serveur, sans écriture, sans connexion à la base réelle.

| Test | Attendu | Résultat |
|---|---|---|
| G1 — garde-fou sur la démo, puis rechargement du `.env` | base `cbigestionnairepfe_demo` ; variables inchangées | conforme : `DB_NAME` et `DATABASE_URL` restent sur la démo, interrupteurs à `false` |
| G2 — configuration visant la base réelle | refus sans connexion | refus, code 1 |
| G3 — la connexion de contrôle répond un autre nom (simulé) | refus | refus, code 1 |
| G4 — une connexion du CRM vise une autre base (simulé sur le crochet réel) | refus | refus, code 1 |
| G5 — `NODE_ENV=production` | refus | refus, code 1 |
| G6 — hôte distant | refus | refus, code 1 |
| G7 — compatibilité UUID chargée sans garde-fou | refus | refus, code 1 |
| G8 — tâches planifiées, compteur à la place de `node-cron` | 0 avec le garde-fou | 0 ; témoin interrupteurs remis à `true` : 6 |
| U1 — utilisateur `demo.*` sans compatibilité | refus (état actuel) | `"id" must be a valid GUID` |
| U1 — même utilisateur avec garde-fou et compatibilité | accepté ; non-UUID refusé | conforme |
| P1 — réinitialisation en simulation | 10 comptes listés, 9 à traiter, rien d'écrit | conforme |
| P2 — `--apply` sans confirmation du lot | refus | refus, code 1 |
| P3 — `--apply` sans mot de passe fourni | refus avant connexion | refus, code 1 |

**Non testé** : le démarrage complet du serveur, une connexion réelle par l'API, une question au Copilot, l'écriture des mots de passe. Ces essais écrivent dans la démo ou supposent les fichiers en place ; ils attendent votre autorisation.

## 6. Phase D — plan de validation fonctionnelle

À dérouler après autorisation, backend lancé par la commande de la section 3. Remplacer `$T` par le jeton reçu à la connexion.

| # | Test | Méthode | Attendu | Écrit dans la démo |
|---|---|---|---|---|
| D1 | Connexion de chaque compte | `POST /auth/signin` pour les 10 comptes | 200 et un jeton, rôle exact | oui : `refreshTokenHash` |
| D2 | Mauvais mot de passe | `POST /auth/signin` | 401 | non |
| D3 | Identité et rôle | `GET /me` | `sub`, `email`, `role` du compte | non |
| D4 | Droits du responsable production | `GET /projects` | 403 (`moduleAccessGuard`) ; `GET /por-promesh` : 200 | non |
| D5 | Consultation des projets | `GET /projects` en commercial puis en admin | commercial : ses 13 ou 14 projets ; admin : 80 | non |
| D6 | Création refusée au sédentaire | `POST /projects` | 403 | non |
| D7 | Création par un commercial | `POST /projects` avec un nom préfixé DEMO | 201, puis 409 au second envoi | **oui : autorisation distincte requise** |
| D8 | Copilot, question CRM | `POST /ai-copilot/chat` : « Combien de projets par statut entre avril et septembre 2026 ? » | pas d'erreur de validation ; chiffres de la requête K03 | non |
| D9 | Copilot, outil avec identifiant du lot | question sur un projet nommé | réponse, pas de `valid GUID` | non |
| D10 | Copilot, historique | `GET /ai-copilot/conversations` après D8 | la conversation apparaît | non (mémoire) |
| D11 | Copilot, RAG | `GET /ai-copilot/documents` | liste sans erreur | non |
| D12 | Aucune notification automatique | compter `notifications` avant le lancement, puis après 5 minutes | 300 et 300 | non |
| D13 | Cohérence des KPI | `GET /dashboard/kpis` en admin, comparé à K01, K02, K06 | 80 projets, 14 gagnés, 5 perdus | non |
| D14 | Base réelle intacte | relevé `pg_stat_database` avant et après | compteurs de lignes identiques | non |

Références chiffrées : `reports/demo-data-quality/validation-queries.sql`.

## 7. Fichiers proposés à la modification

| Fichier | Nature | État |
|---|---|---|
| `scripts/demo/demo-guard.js` | nouveau | proposé, testé, non installé |
| `scripts/demo/demo-uuid-compat.js` | nouveau | proposé, testé, non installé |
| `scripts/demo/reset-demo-passwords.js` | nouveau | proposé, testé en simulation, non installé |
| `package.json` | 2 lignes de raccourcis, facultatif | non modifié |

Aucun fichier existant du CRM, du Copilot ou de la configuration n'est modifié par cette proposition. Le diff complet est dans [DIFF.patch](proposed/DIFF.patch).

## 8. Preuve que la base réelle est restée inchangée

Je ne me suis jamais connecté à `cbigestionnairepfe`. Les compteurs d'activité de PostgreSQL, lus depuis la base de démonstration, le confirment :

| Base | Relevé | Sessions | Lignes insérées | Lignes modifiées | Lignes supprimées |
|---|---|---|---|---|---|
| `cbigestionnairepfe` | 10:15 UTC | 0 | 13 827 | 5 837 | 4 317 |
| `cbigestionnairepfe` | 10:24 UTC | 0 | 13 827 | 5 837 | 4 317 |
| `cbigestionnairepfe_demo` | 10:15 UTC | 2 | 29 077 | 1 511 | 270 |
| `cbigestionnairepfe_demo` | 10:24 UTC | 2 | 29 077 | 1 511 | 270 |

Les trois compteurs d'écriture sont identiques sur les deux bases. Le nombre de transactions validées de la base réelle a augmenté de 20 sans aucune session ouverte ni ligne écrite ; je n'en ai pas identifié la source (maintenance automatique de PostgreSQL ou pgAdmin, qui était ouvert, sont les explications probables).

Sur la démo : 11 comptes, 80 projets, 300 actions, 300 notifications, 2 192 lignes au registre, dernière modification de `users` le 10/10 à 23:15 — tout est identique au début de la mission. `.env` : inchangé (daté du 11/10 à 17:53).

Limite de la preuve : elle couvre la durée de ce travail. Elle ne dit rien d'écritures antérieures.

## 9. Actions restant à autoriser

| # | Action | Écrit où |
|---|---|---|
| 1 | Installer les trois fichiers dans `scripts/demo/` | dépôt, fichiers nouveaux |
| 2 | Ajouter les deux raccourcis à `package.json` (facultatif) | dépôt, 2 lignes |
| 3 | Réinitialiser les mots de passe : 9 comptes, ou les 10 avec `--all` ; vous fournissez le mot de passe par la variable `DEMO_ACCOUNT_PASSWORD` | démo, `users.passwordHash` et registre |
| 4 | Démarrer le backend de démonstration et dérouler D1 à D6 et D8 à D14 | démo, `refreshTokenHash` à la connexion |
| 5 | Test D7 : création réelle d'un projet par l'API | démo, 2 lignes |
| 6 | Correction durable de la validation UUID dans le code du Copilot | code du Copilot |
| 7 | Notifications : aucune action sans autorisation distincte | — |

Restent ouvertes depuis l'audit des données : `lastRelanceAt` vide sur 80 projets, 4 revendeurs au statut contraire à leur étape, relances planifiées toutes échues.
