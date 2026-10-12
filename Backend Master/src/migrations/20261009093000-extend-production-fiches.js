"use strict";

// Lot 4 — Fiches de production : informations communes, garde-fous et vue
// de lecture unifiée.
//
// PRÉREQUIS : lots 1 (dataStatus) et 3 (products).
//
// Ce que la base garantit ici : quantités >= 0, quantité rejetée <= quantité
// produite.
// Ce qui n'est PAS ici :
// - l'index unique (machine, date, poste) : il est dans on-hold/
//   20261009093500-add-production-unique-fiche-index.js et ne sera activé
//   que si la règle métier « une seule fiche par machine, date et poste »
//   est confirmée ;
// - « heure de fin > heure de début » : contrôlé par le service À LA
//   VALIDATION de la fiche. Un brouillon naît avec fin = début, et un poste
//   de nuit passe minuit : une contrainte en base rejetterait des fiches
//   légitimes.
//
// Aucune fiche existante n'est modifiée : toutes les colonnes sont nouvelles
// et vides. Les fiches PROBAR restent dans industrial_records.
//
// Idempotente. down retire la vue, les index, les contraintes et les colonnes.

const CHECKS = [
  ["por_promesh", "por_promesh_quantities_non_negative", `("productionM2" IS NULL OR "productionM2" >= 0) AND ("quantitePrevue" IS NULL OR "quantitePrevue" >= 0) AND ("quantiteRejetee" IS NULL OR "quantiteRejetee" >= 0)`],
  ["por_promesh", "por_promesh_rejected_lte_produced", `"quantiteRejetee" IS NULL OR "productionM2" IS NULL OR "quantiteRejetee" <= "productionM2"`],
  ["industrial_records", "industrial_records_quantities_non_negative", `("quantiteProduite" IS NULL OR "quantiteProduite" >= 0) AND ("quantitePrevue" IS NULL OR "quantitePrevue" >= 0) AND ("quantiteRejetee" IS NULL OR "quantiteRejetee" >= 0)`],
  ["industrial_records", "industrial_records_rejected_lte_produced", `"quantiteRejetee" IS NULL OR "quantiteProduite" IS NULL OR "quantiteRejetee" <= "quantiteProduite"`],
];

const VIEW = `CREATE OR REPLACE VIEW "production_fiches_v" AS
  SELECT 'PROMESH'::text AS "ligne", p."id" AS "ficheId", p."sequenceNumber"::text AS "numeroFiche", p."dateProduction" AS "date",
         p."poste"::text AS "poste", p."machineId", p."productId", p."operateur", p."operatorUserId", p."heureDebut", p."heureFin",
         p."quantitePrevue", p."productionM2" AS "quantiteProduite", 'm2'::text AS "unite", p."quantiteRejetee",
         p."status"::text AS "statut", CASE WHEN p."conformite" IS NULL THEN NULL ELSE p."conformite"::text = 'conforme' END AS "conforme",
         p."dataStatus", p."createdBy", p."createdAt"
    FROM "por_promesh" p
  UNION ALL
  SELECT 'PROBAR'::text, r."id", r."numeroFiche"::text, r."dateFiche", r."poste"::text, r."machineId", r."productId", r."operateur",
         r."operatorUserId", r."heureDebut", r."heureFin", r."quantitePrevue", r."quantiteProduite", NULL::text, r."quantiteRejetee",
         r."statut"::text, CASE WHEN r."statutQualite" IS NULL THEN NULL ELSE r."statutQualite"::text = 'ok' END,
         r."dataStatus", r."createdBy", r."createdAt"
    FROM "industrial_records" r
   WHERE r."module"::text = 'probar'`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      const count = async (sql) => (await q(sql))[0][0].n;

      // Contrôles préalables : la migration n'écrase ni ne corrige rien.
      const negative = (await count(`SELECT COUNT(*)::int AS n FROM "por_promesh" WHERE "productionM2" < 0`)) + (await count(`SELECT COUNT(*)::int AS n FROM "industrial_records" WHERE "quantiteProduite" < 0`));
      if (negative) throw new Error(`${negative} fiche(s) ont une quantité négative : à examiner avant de poser la contrainte.`);
      await q(
        `ALTER TABLE "por_promesh"
           ADD COLUMN IF NOT EXISTS "productId" UUID REFERENCES "products" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
           ADD COLUMN IF NOT EXISTS "operatorUserId" UUID REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
           ADD COLUMN IF NOT EXISTS "quantitePrevue" NUMERIC(12, 2),
           ADD COLUMN IF NOT EXISTS "quantiteRejetee" NUMERIC(12, 2)`
      );
      await q(
        `ALTER TABLE "industrial_records"
           ADD COLUMN IF NOT EXISTS "numeroFiche" INTEGER,
           ADD COLUMN IF NOT EXISTS "productId" UUID REFERENCES "products" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
           ADD COLUMN IF NOT EXISTS "operatorUserId" UUID REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
           ADD COLUMN IF NOT EXISTS "heureDebut" TIME,
           ADD COLUMN IF NOT EXISTS "heureFin" TIME,
           ADD COLUMN IF NOT EXISTS "quantitePrevue" NUMERIC(12, 2),
           ADD COLUMN IF NOT EXISTS "quantiteRejetee" NUMERIC(12, 2)`
      );
      for (const [table, name, definition] of CHECKS) {
        await q(`DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
            ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK (${definition});
          END IF;
        END $$;`);
      }
      await q(`CREATE INDEX IF NOT EXISTS "por_promesh_product_id" ON "por_promesh" ("productId")`);
      await q(`CREATE INDEX IF NOT EXISTS "industrial_records_product_id" ON "industrial_records" ("productId")`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS "industrial_records_numero_fiche_unique" ON "industrial_records" ("module", "numeroFiche") WHERE "numeroFiche" IS NOT NULL`);
      await q(VIEW);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP VIEW IF EXISTS "production_fiches_v"`);
      for (const index of ["industrial_records_numero_fiche_unique", "por_promesh_product_id", "industrial_records_product_id"]) {
        await q(`DROP INDEX IF EXISTS "${index}"`);
      }
      for (const [table, name] of CHECKS) await q(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`);
      await q(`ALTER TABLE "por_promesh" DROP COLUMN IF EXISTS "productId", DROP COLUMN IF EXISTS "operatorUserId", DROP COLUMN IF EXISTS "quantitePrevue", DROP COLUMN IF EXISTS "quantiteRejetee"`);
      await q(
        `ALTER TABLE "industrial_records" DROP COLUMN IF EXISTS "numeroFiche", DROP COLUMN IF EXISTS "productId", DROP COLUMN IF EXISTS "operatorUserId",
           DROP COLUMN IF EXISTS "heureDebut", DROP COLUMN IF EXISTS "heureFin", DROP COLUMN IF EXISTS "quantitePrevue", DROP COLUMN IF EXISTS "quantiteRejetee"`
      );
    });
  },
};
