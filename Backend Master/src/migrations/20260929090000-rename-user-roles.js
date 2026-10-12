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
