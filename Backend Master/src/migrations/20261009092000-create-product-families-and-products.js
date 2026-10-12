"use strict";

// Lot 3 — Familles de produits et référentiel des produits.
//
// product_families : PROBAR et PROMESH, et rien d'autre. Ces deux valeurs ne
// sont pas inventées : elles existent déjà dans les énumérations
// machines.typeMachine et projects.productFamily. Les deux insertions sont
// journalisées dans data_change_log.
//
// products : table créée VIDE, prête pour un lot ultérieur. Aucune référence
// produit n'est créée sans source métier.
//
// Idempotente (IF NOT EXISTS, ON CONFLICT DO NOTHING). down supprime les deux
// tables et s'arrête si `products` contient des lignes. Le journal
// data_change_log n'est jamais effacé.

const BATCH = "MIG-20261009092000";
const FAMILIES = ["PROBAR", "PROMESH"];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, replacements) => queryInterface.sequelize.query(sql, { transaction, replacements });
      await q(`CREATE TABLE IF NOT EXISTS "product_families" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" VARCHAR(30) NOT NULL UNIQUE,
        "name" VARCHAR(120) NOT NULL,
        "description" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await q(`CREATE TABLE IF NOT EXISTS "products" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "familyId" UUID NOT NULL REFERENCES "product_families" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
        "code" VARCHAR(60) NOT NULL UNIQUE,
        "name" VARCHAR(255) NOT NULL,
        "reference" VARCHAR(120),
        "description" TEXT,
        "unit" VARCHAR(20),
        "active" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await q(`CREATE INDEX IF NOT EXISTS "products_family_id" ON "products" ("familyId")`);

      for (const code of FAMILIES) {
        const [inserted] = await q(`INSERT INTO "product_families" ("code", "name") VALUES (:code, :code) ON CONFLICT ("code") DO NOTHING RETURNING "id"`, { code });
        if (!inserted.length) continue;
        await q(
          `INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, old_value, new_value, source, reason, confidence, operation, executed_by)
           VALUES (:batch, 'product_families', :id, 'code', NULL, :code, CAST(:source AS jsonb), :reason, 'HIGH', 'INSERT', 'DATA_AGENT')`,
          {
            batch: BATCH,
            id: inserted[0].id,
            code,
            source: JSON.stringify({ type: "CRM_database", columns: ["machines.typeMachine", "projects.productFamily"], value: code }),
            reason: "famille de produit déjà présente dans les énumérations du CRM",
          }
        );
      }
    });
  },

  async down(queryInterface) {
    const [[{ exists }]] = await queryInterface.sequelize.query(`SELECT to_regclass('public.products') IS NOT NULL AS exists`);
    if (exists) {
      const [[{ n }]] = await queryInterface.sequelize.query(`SELECT COUNT(*)::int AS n FROM "products"`);
      if (n) throw new Error(`${n} produit(s) existent : annulation refusée pour ne perdre aucune donnée.`);
    }
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP TABLE IF EXISTS "products"`);
      await q(`DROP TABLE IF EXISTS "product_families"`);
    });
  },
};
