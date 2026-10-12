# Rôles v2, contacts, projets, machines : rapport des modifications

**Statut : code prêt, migrations NON exécutées.** Aucune commande `db:migrate` n'a été lancée et aucune instruction DDL n'a été exécutée sur la base. La sauvegarde logique de l'état « avant » se trouve dans ce dossier.

## 0. Sauvegarde logique (état avant migration, 2026-09-28)

| Fichier | Contenu |
|---|---|
| `users_roles_avant_migration.csv` | 71 utilisateurs : id, role, isActive, createdAt (sans e-mail) |
| `commercial_contacts_affectations_avant_migration.csv` | 485 contacts : id, createdBy, commercialId, createdAt |
| `projects_owner_avant_migration.csv` | 253 projets : id, ownerId, createdAt |
| `diagnostic_contacts_485.csv` | classement : 473 affectations héritées de `createdBy`, 12 ambiguës, 0 cohérente, 0 invalide |
| `etat_schema_avant_migration.json` | ENUM `enum_users_role`, DEFAULT, nombre d'utilisateurs par rôle, migrations appliquées |

Nombre d'utilisateurs par rôle lors de la sauvegarde : user 64 · commercial 2 · accueil 1 · superadmin 2 · superadmin2 1 · responsable_logistique_achat 1 · admin 0.

**Correction importante : comptes de test dans la base.** Parmi les comptes `user`, **seuls 8 sont de vrais utilisateurs**. Les autres sont des comptes `reset-test-…@example.com` (actifs, rôle `user`) que le test `test/auth.resetPassword.test.js` laissait derrière lui à chaque exécution de la suite.
- 56 existaient avant ces travaux.
- 3 ont été ajoutés par les exécutions de la suite pendant ces travaux (2 exécutions complètes, puis 1 exécution isolée). La base compte donc aujourd'hui **59 comptes de test et 67 comptes `user`**.
- Le défaut du test est corrigé : `createTestUser()` enregistre désormais l'e-mail pour le nettoyage, et une nouvelle exécution laisse bien 59 comptes.
- **Aucun compte n'a été supprimé.** Après la migration, ces 59 comptes deviendront `commercial` et resteront proposés comme destinataires d'affectation (`GET /users/commercials`), exactement comme aujourd'hui. Leur suppression ou désactivation reste à décider (voir section 6).

## 1. Ordre de mise en production

1. Arrêter le backend.
2. `npm run db:migrate` (depuis `Backend Master/`). Les 6 migrations en attente s'appliquent dans l'ordre :
   - `20260731000100-add-notifications-perf-indexes.js` (antérieure, en attente)
   - `20260731000200-add-performance-indexes-contacts-reminders.js` (antérieure, en attente)
   - `20260815120000-add-copilot-meeting-to-calendar-event-syncs-enum.js` (antérieure, en attente)
   - `20260928090000-create-machines-and-link-production.js` (machines)
   - `20260929090000-rename-user-roles.js` (**rôles v2**)
   - `20260929090100-add-assigned-by-to-commercial-contacts.js` (**assignedBy / assignedAt**)
3. Exécuter les requêtes SQL de vérification (section 5).
4. Redémarrer le backend, puis déployer le build Flutter.
5. Chaque utilisateur se reconnecte **une fois** : un ancien access token (sans `rv: 2`) reçoit un 401 `ROLE_VERSION_OUTDATED`.

Le code et les migrations vont ensemble. Tant que les migrations ne sont pas appliquées, le nouveau code ne fonctionne pas sur l'ancienne base : les valeurs d'ENUM `commercial_sedentaire` et les colonnes `assignedBy`, `assignedAt` et `machineId` sont absentes.

Retour arrière : `npx sequelize-cli db:migrate:undo` trois fois (assignedBy, puis rôles, puis machines), puis retour au code précédent. Le `down()` des rôles effectue les renommages inverses, sans perte de données.

## 2. Code complet des migrations

### 20260929090000-rename-user-roles.js

```js
"use strict";

// Vocabulaire des rôles v2 (voir src/constants/roles.js) :
//   "user"       → "commercial"             (64 comptes : commerciaux terrain, responsables des projets)
//   "commercial" → "commercial_sedentaire"  (2 comptes : créateurs des 485 contacts)
//
// Stratégie : RENAME VALUE sur l'ENUM, sans aucun UPDATE sur users.
// PostgreSQL stocke une valeur d'ENUM par son OID, pas par son libellé :
// renommer le libellé change la valeur de TOUTES les lignes concernées en
// une seule opération atomique — aucun risque de double transformation
// (user → commercial → commercial_sedentaire), aucune ligne réécrite.
// L'ordre est imposé : "commercial" doit d'abord être libéré avant que
// "user" puisse prendre ce nom.
//
// RENAME VALUE est transactionnel (PostgreSQL ≥ 10) : les deux renommages
// et le nouveau DEFAULT sont appliqués ensemble ou pas du tout.
//
// Idempotent : si l'ENUM est déjà en v2 (commercial_sedentaire présent,
// user absent), up() ne fait rien. down() rétablit exactement l'état
// précédent (renommages inverses, ordre inverse) — aucune perte de données.
//
// Après cette migration, tout access token émis avant le déploiement est
// rejeté (claim rv, voir utils/tokens.js) : chaque utilisateur se
// reconnecte une fois et reçoit un token portant son rôle v2.

const TYPE = "enum_users_role";

async function labels(queryInterface, transaction) {
  const rows = await queryInterface.sequelize.query(
    `SELECT e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = :type
      ORDER BY e.enumsortorder`,
    { replacements: { type: TYPE }, type: queryInterface.sequelize.QueryTypes.SELECT, transaction }
  );
  return rows.map((r) => r.enumlabel);
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const current = await labels(queryInterface, transaction);

      if (current.includes("commercial_sedentaire") && !current.includes("user")) {
        return; // déjà en v2
      }
      if (!current.includes("user") || !current.includes("commercial") || current.includes("commercial_sedentaire")) {
        throw new Error(
          `[rename-user-roles] État inattendu de ${TYPE} : [${current.join(", ")}] — migration interrompue, aucune modification.`
        );
      }

      await queryInterface.sequelize.query(
        `ALTER TYPE public.${TYPE} RENAME VALUE 'commercial' TO 'commercial_sedentaire'`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TYPE public.${TYPE} RENAME VALUE 'user' TO 'commercial'`,
        { transaction }
      );
      // Le DEFAULT existant référence déjà la valeur renommée (OID) ; il est
      // réécrit explicitement pour que le schéma soit lisible sans ambiguïté.
      await queryInterface.sequelize.query(
        `ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'commercial'::public.${TYPE}`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const current = await labels(queryInterface, transaction);

      if (current.includes("user") && !current.includes("commercial_sedentaire")) {
        return; // déjà en v1
      }
      if (!current.includes("commercial") || !current.includes("commercial_sedentaire") || current.includes("user")) {
        throw new Error(
          `[rename-user-roles] État inattendu de ${TYPE} : [${current.join(", ")}] — rollback interrompu, aucune modification.`
        );
      }

      await queryInterface.sequelize.query(
        `ALTER TYPE public.${TYPE} RENAME VALUE 'commercial' TO 'user'`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TYPE public.${TYPE} RENAME VALUE 'commercial_sedentaire' TO 'commercial'`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'user'::public.${TYPE}`,
        { transaction }
      );
    });
  },
};
```

### 20260929090100-add-assigned-by-to-commercial-contacts.js

```js
"use strict";

// Traçabilité de l'affectation d'un contact commercial — même convention que
// maintenance_requests (assignedBy + assignedAt) :
//   commercialId = commercial (role "commercial") AUQUEL le contact est affecté (inchangé)
//   assignedBy   = utilisateur QUI a réalisé l'affectation (commercial_sedentaire ou admin)
//   assignedAt   = date de cette affectation
//
// Colonnes ajoutées nullable et SANS backfill : les 485 affectations
// existantes (commercialId) sont conservées telles quelles et gardent
// assignedBy = NULL / assignedAt = NULL, leur auteur historique n'étant pas
// connu. Seules les affectations réalisées après cette migration (POST
// /commercial-contacts/assign) renseignent ces deux colonnes.

const TABLE = "commercial_contacts";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const columns = await queryInterface.describeTable(TABLE, { transaction });

      if (!columns.assignedBy) {
        await queryInterface.addColumn(
          TABLE,
          "assignedBy",
          {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          { transaction }
        );
      }
      if (!columns.assignedAt) {
        await queryInterface.addColumn(TABLE, "assignedAt", { type: Sequelize.DATE, allowNull: true }, { transaction });
      }

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS commercial_contacts_assigned_by ON "${TABLE}" ("assignedBy")`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS commercial_contacts_assigned_by`, { transaction });
      const columns = await queryInterface.describeTable(TABLE, { transaction });
      if (columns.assignedAt) await queryInterface.removeColumn(TABLE, "assignedAt", { transaction });
      if (columns.assignedBy) await queryInterface.removeColumn(TABLE, "assignedBy", { transaction });
    });
  },
};
```

## 3. Tests

```bash
cd "Backend Master"
npx jest --runInBand --forceExit test/roles.tokensRoleVersion.test.js test/auth.refresh.roleReload.test.js test/migrations.rolesV2.test.js test/auth.routes.signup.test.js test/commercialContacts.rolesV2.routes.test.js test/rbac.rolesV2.routes.test.js test/machines.routes.test.js test/models.machineLink.test.js test/utils.machineRef.test.js
npm test   # suite complète
```

Résultat avant migration de la base : **221 suites réussies sur 230, 5948 tests réussis**.
- **5 suites** échouaient déjà avant ces modifications : `mfa`, `mfa.dedup`, `calendarEventSync.copilotMeeting`, `meetingAgent.liveCreate`, `porPromeshAgent.integration`. Elles ont été vérifiées sur le code d'origine.
- **3 suites** d'intégration sur la vraie base attendent la migration : `commercialAgent.relanceAction`, `projectAgent.describeQuery`, `projectAgent.ownerNameQuery`. PostgreSQL répond `valeur en entrée invalide pour le enum enum_users_role : « commercial_sedentaire »`, car la valeur n'existe qu'après la migration.

## 4. Scénarios de validation (après migration)

| # | Vérification | Couverture |
|---|---|---|
| 1-3 | Connexion commercial / commercial_sedentaire / responsable_logistique_achat | manuel ; jeton `rv:2` : `roles.tokensRoleVersion.test.js` |
| 4 | Création d'un projet par un commercial | `rbac.rolesV2.routes.test.js` + manuel |
| 5 | 403 à la création de projet pour commercial_sedentaire | `rbac.rolesV2.routes.test.js` |
| 6 | Le sédentaire voit tous les contacts | `commercialContacts.rolesV2.routes.test.js` |
| 7 | Le commercial voit ses contacts (affectés, créés, relancés) | idem |
| 8 | Affectation par le sédentaire (assignedBy ≠ commercialId) | idem + SQL G |
| 9 | Refus d'affecter à un commercial_sedentaire | idem |
| 10 | Ajout / modification d'une machine par le RLA | `machines.routes.test.js` + manuel |
| 11-12 | Fiche industrielle saisie et reliée à une machine | `models.machineLink.test.js` + SQL F |
| 13 | Droits administrateur (rôles : superadmin uniquement) | `rbac.rolesV2.routes.test.js` |
| 14 | Anciens jetons rejetés ; le refresh relit le rôle en base | `roles.tokensRoleVersion` + `auth.refresh.roleReload` |
| 15 | Copilot : outils contacts réservés à commercial_sedentaire et aux admins | `ai.validation.copilotScenarios.test.js`, `ai.mcp.tools.commercialContacts.test.js` |

## 5. Requêtes SQL de vérification (après `db:migrate`)

```sql
-- A. Rôles : commercial = nombre de "user" juste avant la migration (67 le 2026-09-28, dont 59 comptes de test)
--    · commercial_sedentaire 2 · accueil 1 · superadmin 2 · superadmin2 1 · responsable_logistique_achat 1 · aucun "user"
SELECT role, COUNT(*) FROM public.users GROUP BY role ORDER BY role;

-- B. ENUM : attendu commercial, commercial_sedentaire, accueil, admin, superadmin, responsable_logistique_achat, superadmin2
SELECT t.typname, e.enumlabel
FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'enum_users_role'
ORDER BY e.enumsortorder;

-- C. DEFAULT : attendu 'commercial'::enum_users_role
SELECT column_default FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'role';

-- D. Aucun utilisateur inversé : les 2 anciens "commercial" sont bien les sédentaires,
--    c'est-à-dire les créateurs des 485 contacts (attendu : une seule ligne, commercial_sedentaire, 485)
SELECT u.role, COUNT(*) FROM public.commercial_contacts c
JOIN public.users u ON u.id = c."createdBy" GROUP BY u.role;

-- E. Les 485 affectations sont conservées telles quelles, sans auteur connu
--    (attendu : 485 · 485 · 0, à comparer avec commercial_contacts_affectations_avant_migration.csv)
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE "commercialId" = "createdBy") AS heritees_de_createdby,
       COUNT(*) FILTER (WHERE "assignedBy" IS NOT NULL) AS avec_auteur
FROM public.commercial_contacts;

-- F. Machines : 8 enregistrements, et fiches reliées
SELECT code, "typeMachine", numero, statut FROM public.machines ORDER BY "typeMachine", numero;
SELECT 'industrial' t, COUNT(*) FILTER (WHERE "machineId" IS NOT NULL) liees, COUNT(*) total FROM public.industrial_records
UNION ALL SELECT 'por', COUNT(*) FILTER (WHERE "machineId" IS NOT NULL), COUNT(*) FROM public.por_promesh
UNION ALL SELECT 'recup', COUNT(*) FILTER (WHERE "machineId" IS NOT NULL), COUNT(*) FROM public.recuperable_fiches;

-- G. Après une affectation de test : l'auteur est un sédentaire (ou admin) et le destinataire un commercial
SELECT c.id, ua.role AS role_auteur, uc.role AS role_destinataire, c."assignedAt"
FROM public.commercial_contacts c
JOIN public.users ua ON ua.id = c."assignedBy"
JOIN public.users uc ON uc.id = c."commercialId"
ORDER BY c."assignedAt" DESC LIMIT 10;
```

## 6. Points restant à décider (non modifiés)

1. **59 comptes de test `reset-test-…@example.com`** (actifs, rôle `user`, bientôt `commercial`). Suppression ou désactivation à valider. Requête d'inventaire, en lecture seule :
   `SELECT id, email, "isActive", "createdAt" FROM public.users WHERE email LIKE 'reset-test-%@example.com' ORDER BY "createdAt";`
2. **`GET /commercial-contacts/:id`** et les routes de modification d'un contact ne filtrent pas par rôle : un utilisateur connecté qui connaît l'identifiant d'un contact peut l'ouvrir. La règle A s'applique à la **liste**. Ces routes ont été laissées inchangées, conformément à la consigne « ne pas modifier les autres règles de visibilité sans vérifier ».
3. **Outils Copilot des contacts** : réservés à `commercial_sedentaire` et aux admins, comme l'étaient les anciens outils du rôle `commercial`. Le commercial terrain n'y accède toujours pas par le Copilot, mais consulte ses contacts dans l'interface.
4. **Menu Production** : les sous-menus « Machine 1 à 4 » restent fixes. Une machine ajoutée (PROBAR-05…) est accessible depuis l'écran Machines (bouton « Ouvrir la production »).

---

## 7. Corrections avant migration (2026-09-28, second passage)

Aucune migration n'a été lancée et le schéma n'a pas été modifié. La seule écriture en base est la désactivation des comptes de test (colonne `isActive`).

### 7.1 Comptes de test désactivés (données, pas de schéma)

- Comptes identifiés par le motif exact `^reset-test-[a-z-]+-[0-9]+@example\.com$` : **59** comptes, tous actifs avant l'opération. La liste complète figure dans `comptes_test_desactives.csv` (id, email, role, isActive_avant).
- Transaction contrôlée : **59 lignes mises à jour, `isActive = false`**, et aucune suppression. L'opération aurait été annulée si le nombre différait de 59.
- Vérification avant/après : les **15 autres utilisateurs** sont strictement inchangés (id, email, role, isActive et updatedAt comparés).
- Effets :
  - la connexion est refusée (contrôle existant de `/auth/signin`) ;
  - **nouveau** : `/auth/refresh` refuse un compte désactivé (401), ce qui empêche de prolonger une session ouverte ;
  - ces comptes n'apparaissent plus dans `GET /users/commercials` (filtre `isActive` existant) ;
  - l'affectation d'un contact exige un destinataire actif ;
  - **nouveau** : le choix du commercial d'une relance exige aussi un compte actif (route et service Copilot).
- Défaut corrigé : `test/auth.resetPassword.test.js` ne laisse plus de compte derrière lui.

Contrôle SQL : `SELECT count(*) FILTER (WHERE "isActive") AS actifs, count(*) AS total FROM users WHERE email ~ '^reset-test-[a-z-]+-[0-9]+@example\.com$';` (attendu : 0 · 59).

### 7.2 Accès à un contact : politique centralisée (règle A)

Nouveau fichier `src/modules/commercial-contacts/policies/contactAccess.policy.js`. Il sert de règle unique pour :
- la liste ;
- `GET /:id` et `GET /:id/actions` ;
- `POST /:id/actions` ;
- `PUT /:id` ;
- `POST /:id/relances` et `PUT /:id/relances/:relanceId` ;
- `DELETE /:id` ;
- l'outil Copilot `schedule_commercial_contact_relance`.

Les 4 contrôles « admin ou créateur » recopiés dans les routes ont été remplacés par cette politique.

| Rôle | Consulter | Gérer (modifier, actions, relances) | Supprimer |
|---|---|---|---|
| admin / superadmin / superadmin2 | tous | tous | tous |
| commercial_sedentaire | tous | tous | tous |
| accueil | tous (vue historique de la liste conservée) | ses contacts créés | ses contacts créés |
| commercial | affectés + suivis via relance + créés | idem | créés uniquement |
| autre rôle (ex. responsable_logistique_achat) | 403 | 403 | 403 |

Un contact inexistant ou un identifiant non UUID renvoie 404, jamais une erreur PostgreSQL.

### 7.3 Machines dynamiques (Flutter et validateur)

- **Catalogue unique** `lib/forms/industrial/service/machine_catalog.dart`, alimenté par `GET /machines`. Il sert au menu Production, à la vue d'une ligne, au filtre et aux indicateurs de la liste POR, au formulaire récupérables et aux listes d'équipements de maintenance (formulaire et boîte de dialogue). Aucune liste « 1 à 4 » ne subsiste.
- **Menu Production** : machines ACTIVES regroupées par PROBAR / PROMESH, libellées par leur code (PROBAR-05…). Le menu est mis à jour immédiatement après un ajout, une modification ou un changement de statut dans l'écran Machines.
- **Backend** :
  - le validateur des récupérables accepte tout numéro de machine, l'existence et l'état actif étant vérifiés par le hook `linkMachine` ;
  - `GET /machines` (**liste seulement**) est ouvert à tout utilisateur connecté, pour alimenter la liste des équipements d'une demande de maintenance, ouverte à tous. Le détail et toute écriture restent réservés au responsable logistique et aux admins.
- Hors périmètre : les 4 lignes de mesure L1 à L4 du contrôle qualité PROBAR sont des lignes de mesure, pas des machines ; elles restent inchangées.

### 7.4 Modèle de production vérifié

`User —createdBy→ IndustrialRecord / PorPromesh / RecuperableFiche —machineId→ Machine`. Aucune colonne ni association entre `User` et `Machine`.

### 7.5 Ordre des migrations : inchangé (section 1)

Aucune nouvelle migration n'a été ajoutée par ce second passage.
