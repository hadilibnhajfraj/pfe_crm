"use strict";

// Lot 1 — Nature de la donnée (REAL / TEST / REVIEW_REQUIRED) sur les tables
// des modules industriels et internes.
//
// Colonne ajoutée avec la valeur par défaut REAL : aucune ligne existante ne
// change de sens. Le marquage TEST / REVIEW_REQUIRED des lignes recensées dans
// TEST_DATA_REVIEW.md est fait ensuite par scripts/restructureDataApply.js
// (journalisé dans data_change_log), jamais par cette migration.
//
// Idempotente (IF NOT EXISTS). Réversible : down retire les colonnes puis le
// type, qui échoue volontairement si une table créée par un lot ultérieur
// l'utilise encore (annuler les lots dans l'ordre inverse).

const TABLES = ["por_promesh", "industrial_records", "recuperable_fiches", "maintenance_requests", "hr_requests", "archive_requests"];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_data_status') THEN
          CREATE TYPE "enum_data_status" AS ENUM ('REAL', 'TEST', 'REVIEW_REQUIRED');
        END IF;
      END $$;`);
      for (const table of TABLES) {
        await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "dataStatus" "enum_data_status" NOT NULL DEFAULT 'REAL'`);
        await q(`CREATE INDEX IF NOT EXISTS "${table}_data_status" ON "${table}" ("dataStatus")`);
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      for (const table of TABLES) {
        await q(`DROP INDEX IF EXISTS "${table}_data_status"`);
        await q(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "dataStatus"`);
      }
      await q(`DROP TYPE IF EXISTS "enum_data_status"`);
    });
  },
};
