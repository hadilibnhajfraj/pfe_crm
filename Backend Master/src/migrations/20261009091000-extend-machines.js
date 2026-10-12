"use strict";

// Lot 2 — Machines : fiche descriptive complète et états d'exploitation.
//
// Colonnes facultatives, toutes laissées vides : aucune de ces informations
// n'est connue aujourd'hui (`description` existe déjà). Trois statuts
// s'ajoutent à ACTIVE / INACTIVE ; aucune machine ne change de statut.
//
// Idempotente. down retire les colonnes. PostgreSQL ne sait pas retirer une
// valeur d'énumération : down s'arrête si une machine porte l'un des trois
// nouveaux statuts, et laisse sinon les valeurs dans le type (inoffensif :
// le validateur de l'application ne les accepte plus une fois le code annulé).

const NEW_STATUSES = ["EN_MAINTENANCE", "EN_PANNE", "HORS_SERVICE"];

module.exports = {
  async up(queryInterface) {
    const q = (sql, options = {}) => queryInterface.sequelize.query(sql, options);
    // ALTER TYPE ... ADD VALUE hors transaction : la valeur doit être validée
    // avant de pouvoir être utilisée.
    for (const value of NEW_STATUSES) await q(`ALTER TYPE "enum_machines_statut" ADD VALUE IF NOT EXISTS '${value}'`);
    await queryInterface.sequelize.transaction(async (transaction) => {
      await q(
        `ALTER TABLE "machines"
           ADD COLUMN IF NOT EXISTS "brand" VARCHAR(120),
           ADD COLUMN IF NOT EXISTS "model" VARCHAR(120),
           ADD COLUMN IF NOT EXISTS "serialNumber" VARCHAR(120),
           ADD COLUMN IF NOT EXISTS "productionLine" VARCHAR(60),
           ADD COLUMN IF NOT EXISTS "location" VARCHAR(255),
           ADD COLUMN IF NOT EXISTS "acquisitionDate" DATE`,
        { transaction }
      );
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS "machines_serial_number_unique" ON "machines" ("serialNumber") WHERE "serialNumber" IS NOT NULL`, { transaction });
    });
  },

  async down(queryInterface) {
    const [[{ n }]] = await queryInterface.sequelize.query(`SELECT COUNT(*)::int AS n FROM "machines" WHERE statut::text IN ('${NEW_STATUSES.join("', '")}')`);
    if (n) throw new Error(`${n} machine(s) portent un statut ajouté par ce lot : repassez-les en ACTIVE ou INACTIVE avant d'annuler.`);
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP INDEX IF EXISTS "machines_serial_number_unique"`);
      await q(
        `ALTER TABLE "machines"
           DROP COLUMN IF EXISTS "brand", DROP COLUMN IF EXISTS "model", DROP COLUMN IF EXISTS "serialNumber",
           DROP COLUMN IF EXISTS "productionLine", DROP COLUMN IF EXISTS "location", DROP COLUMN IF EXISTS "acquisitionDate"`
      );
    });
  },
};
