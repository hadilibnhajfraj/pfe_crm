"use strict";

// Lot 6 — RH : une fiche par salarié, à laquelle les demandes se rattachent.
//
// employees : nouvelle table, créée VIDE. Aucun salarié n'est créé par cette
// migration, ni automatiquement quand un utilisateur dépose une demande : le
// rattachement ou la création d'une fiche est un geste explicite du
// responsable RH.
//
// hr_requests : + employeeId FACULTATIF. Une demande sans salarié rattaché
// reste traitable. Les colonnes employeeNom, employeePrenom… sont conservées :
// elles gardent l'état du salarié au moment de la demande (utilisé par le PDF).
// Les valeurs historiques du statut (en_attente, acceptee, refusee, traitee)
// ne sont PAS renommées. Trois valeurs s'ajoutent : brouillon, en_revue,
// annulee. Les codes normalisés (DRAFT, SUBMITTED, IN_REVIEW, APPROVED,
// REJECTED, CANCELLED, COMPLETED) sont calculés par l'API.
//
// Idempotente. down supprime la table et les colonnes, et s'arrête si des
// salariés existent ou si une demande porte un statut ajouté par ce lot.

const NEW_STATUSES = ["brouillon", "en_revue", "annulee"];

module.exports = {
  async up(queryInterface) {
    const run = (sql, options = {}) => queryInterface.sequelize.query(sql, options);
    for (const value of NEW_STATUSES) await run(`ALTER TYPE "enum_hr_requests_statut" ADD VALUE IF NOT EXISTS '${value}'`);

    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => run(sql, { transaction });
      await q(`CREATE TABLE IF NOT EXISTS "employees" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID UNIQUE REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
        "matricule" VARCHAR(60),
        "nom" VARCHAR(120) NOT NULL,
        "prenom" VARCHAR(120),
        "qualification" VARCHAR(255),
        "departement" VARCHAR(255),
        "service" VARCHAR(255),
        "email" VARCHAR(255),
        "telephone" VARCHAR(40),
        "dateEmbauche" DATE,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdBy" UUID REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
        "dataStatus" "enum_data_status" NOT NULL DEFAULT 'REAL',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS "employees_matricule_unique" ON "employees" ("matricule") WHERE "matricule" IS NOT NULL`);
      await q(`CREATE INDEX IF NOT EXISTS "employees_nom_prenom" ON "employees" ("nom", "prenom")`);

      await q(
        `ALTER TABLE "hr_requests"
           ADD COLUMN IF NOT EXISTS "employeeId" UUID REFERENCES "employees" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
           ADD COLUMN IF NOT EXISTS "description" TEXT,
           ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ`
      );
      await q(`CREATE INDEX IF NOT EXISTS "hr_requests_employee_id" ON "hr_requests" ("employeeId")`);
    });
  },

  async down(queryInterface) {
    const one = async (sql) => (await queryInterface.sequelize.query(sql))[0][0];
    if ((await one(`SELECT to_regclass('public.employees') IS NOT NULL AS exists`)).exists) {
      const { n } = await one(`SELECT COUNT(*)::int AS n FROM "employees"`);
      if (n) throw new Error(`${n} salarié(s) existent : annulation refusée pour ne perdre aucune donnée.`);
    }
    const { n: used } = await one(`SELECT COUNT(*)::int AS n FROM "hr_requests" WHERE statut::text IN ('${NEW_STATUSES.join("', '")}')`);
    if (used) throw new Error(`${used} demande(s) portent un statut ajouté par ce lot : annulation refusée.`);
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP INDEX IF EXISTS "hr_requests_employee_id"`);
      await q(`ALTER TABLE "hr_requests" DROP COLUMN IF EXISTS "employeeId", DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "cancelledAt"`);
      await q(`DROP TABLE IF EXISTS "employees"`);
    });
  },
};
