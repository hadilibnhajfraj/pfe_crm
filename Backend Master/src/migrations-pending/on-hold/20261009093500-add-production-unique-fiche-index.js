"use strict";

// EN ATTENTE — à n'activer que si la règle métier est confirmée :
// « une seule fiche RÉELLE par machine, date et poste ».
//
// Ce fichier est dans on-hold/ pour qu'aucune commande db:migrate ne le
// trouve, même lancée sur le dossier migrations-pending.
//
// PRÉREQUIS : lot 1 (dataStatus), lot 4 (colonnes des fiches) et le marquage
// des données de test. L'index ne porte que sur les fiches REAL : la migration
// compte les doublons parmi elles et S'ARRÊTE s'il en reste, sans rien modifier.
//
// Idempotente. down supprime les deux index.

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      const count = async (sql) => (await q(sql))[0][0].n;
      const duplicates =
        (await count(`SELECT COUNT(*)::int AS n FROM (SELECT 1 FROM "por_promesh" WHERE "dataStatus" = 'REAL' GROUP BY "machineId", "dateProduction", "poste" HAVING COUNT(*) > 1) d`)) +
        (await count(`SELECT COUNT(*)::int AS n FROM (SELECT 1 FROM "industrial_records" WHERE "module" = 'probar' AND "dataStatus" = 'REAL' AND "machineId" IS NOT NULL AND "poste" IS NOT NULL GROUP BY "machineId", "dateFiche", "poste" HAVING COUNT(*) > 1) d`));
      if (duplicates) throw new Error(`${duplicates} groupe(s) de fiches REAL en double (même machine, date et poste) : index non créé.`);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS "por_promesh_machine_date_poste_real_unique" ON "por_promesh" ("machineId", "dateProduction", "poste") WHERE "dataStatus" = 'REAL'`);
      await q(
        `CREATE UNIQUE INDEX IF NOT EXISTS "industrial_records_probar_machine_date_poste_real_unique" ON "industrial_records" ("machineId", "dateFiche", "poste")
          WHERE "module" = 'probar' AND "dataStatus" = 'REAL' AND "machineId" IS NOT NULL AND "poste" IS NOT NULL`
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "por_promesh_machine_date_poste_real_unique"`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "industrial_records_probar_machine_date_poste_real_unique"`);
  },
};
