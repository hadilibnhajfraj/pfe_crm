"use strict";

const { v4: uuidv4 } = require("uuid");

// Référentiel Machines (PROBAR + PROMESH dans une seule table) et lien
// machineId des fiches de production.
//
// 1. Crée `machines` et y insère les 8 machines initiales
//    (PROBAR-01..04, PROMESH-01..04) — idempotent.
// 2. Ajoute `machineId` (FK → machines.id) à industrial_records, por_promesh
//    et recuperable_fiches. La colonne texte `machine` est CONSERVÉE : elle
//    reste la valeur échangée avec l'API, Flutter et le Copilot ; machineId
//    en est dérivé côté serveur (hook models/helpers/machineLink.js).
// 3. Reprise des fiches existantes, même règle que utils/machineRef.js :
//    un préfixe PROBAR/PROMESH explicite fixe le type, sinon une valeur
//    purement numérique prend le type du module ; numéro = entier final.
//    Données observées avant migration : "1".."3" (PROBAR, POR),
//    "1" (récupérables), NULL (Mélange), "PROMESH — Machine 1" (maintenance).
// 4. recuperable_fiches.machineId passe NOT NULL (le validateur a toujours
//    imposé machine ∈ "1".."4" et module ∈ PROBAR/PROMESH).

const INITIAL_MACHINES = ["PROBAR", "PROMESH"].flatMap((typeMachine) =>
  [1, 2, 3, 4].map((numero) => ({
    code: `${typeMachine}-${String(numero).padStart(2, "0")}`,
    nom: `Machine ${typeMachine} ${numero}`,
    typeMachine,
    numero,
  }))
);

const LINKED_TABLES = ["industrial_records", "por_promesh", "recuperable_fiches"];

// Type par défaut d'une valeur purement numérique, par table.
const DEFAULT_TYPE_SQL = {
  industrial_records: `CASE WHEN t.module = 'probar' THEN 'PROBAR' END`,
  por_promesh: `'PROMESH'`,
  recuperable_fiches: `t.module::text`,
};

function backfillSql(table) {
  return String.raw`
    UPDATE "${table}" t
    SET "machineId" = m.id
    FROM machines m
    WHERE t."machineId" IS NULL
      AND t.machine IS NOT NULL
      AND m."typeMachine"::text = COALESCE(
            upper(substring(t.machine from '(?i)\m(probar|promesh)\M')),
            CASE WHEN t.machine ~ '^\s*\d+\s*$' THEN ${DEFAULT_TYPE_SQL[table]} END
          )
      AND m.numero = substring(t.machine from '(\d+)\s*$')::int`;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [[{ exists }]] = await queryInterface.sequelize.query(
        `SELECT to_regclass('public.machines') IS NOT NULL AS exists`,
        { transaction }
      );

      if (!exists) {
        await queryInterface.createTable(
          "machines",
          {
            id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
            code: { type: Sequelize.STRING(30), allowNull: false, unique: true },
            nom: { type: Sequelize.STRING(120), allowNull: false },
            typeMachine: { type: Sequelize.ENUM("PROBAR", "PROMESH"), allowNull: false },
            numero: { type: Sequelize.INTEGER, allowNull: false },
            statut: { type: Sequelize.ENUM("ACTIVE", "INACTIVE"), allowNull: false, defaultValue: "ACTIVE" },
            description: { type: Sequelize.TEXT, allowNull: true },
            createdAt: { type: Sequelize.DATE, allowNull: false },
            updatedAt: { type: Sequelize.DATE, allowNull: false },
          },
          { transaction }
        );
      }

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS machines_type_numero_unique ON machines ("typeMachine", numero)`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS machines_statut ON machines (statut)`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE machines DROP CONSTRAINT IF EXISTS machines_numero_positive;
         ALTER TABLE machines ADD CONSTRAINT machines_numero_positive CHECK (numero >= 1)`,
        { transaction }
      );

      const now = new Date();
      for (const machine of INITIAL_MACHINES) {
        await queryInterface.sequelize.query(
          `INSERT INTO machines (id, code, nom, "typeMachine", numero, statut, "createdAt", "updatedAt")
           VALUES (:id, :code, :nom, :typeMachine, :numero, 'ACTIVE', :now, :now)
           ON CONFLICT ("typeMachine", numero) DO NOTHING`,
          { replacements: { id: uuidv4(), ...machine, now }, transaction }
        );
      }

      for (const table of LINKED_TABLES) {
        const columns = await queryInterface.describeTable(table, { transaction });
        if (!columns.machineId) {
          await queryInterface.addColumn(
            table,
            "machineId",
            {
              type: Sequelize.UUID,
              allowNull: true,
              references: { model: "machines", key: "id" },
              onUpdate: "CASCADE",
              onDelete: "RESTRICT",
            },
            { transaction }
          );
        }
        await queryInterface.sequelize.query(
          `CREATE INDEX IF NOT EXISTS ${table}_machine_id ON "${table}" ("machineId")`,
          { transaction }
        );
        await queryInterface.sequelize.query(backfillSql(table), { transaction });
      }

      // SQL direct : changeColumn({ references }) ajouterait une 2e FK.
      await queryInterface.sequelize.query(
        `ALTER TABLE recuperable_fiches ALTER COLUMN "machineId" SET NOT NULL`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of LINKED_TABLES) {
        await queryInterface.sequelize.query(
          `DROP INDEX IF EXISTS ${table}_machine_id`,
          { transaction }
        );
        const columns = await queryInterface.describeTable(table, { transaction });
        if (columns.machineId) {
          await queryInterface.removeColumn(table, "machineId", { transaction });
        }
      }
      await queryInterface.dropTable("machines", { transaction });
      await queryInterface.sequelize.query(
        `DROP TYPE IF EXISTS "enum_machines_typeMachine"; DROP TYPE IF EXISTS "enum_machines_statut";`,
        { transaction }
      );
    });
  },
};
