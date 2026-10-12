"use strict";

// Journal des corrections de données (scripts/crmDataApply.js) : une ligne par
// valeur modifiée, ou par cas volontairement laissé tel quel, de façon à
// retrouver — et au besoin annuler — exactement chaque modification.
//
//   operation  : INSERT | UPDATE | MERGE | SKIPPED | REVIEW_REQUIRED
//   confidence : HIGH | MEDIUM | LOW
//   source     : d'où vient la nouvelle valeur (table, ligne, colonne, valeur)
//   batch_id   : identifiant du lot (une exécution = une transaction)
//
// Table autonome : aucune clé étrangère, aucune table existante modifiée.

const TABLE = "data_change_log";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        TABLE,
        {
          id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
          batch_id: { type: Sequelize.STRING(64), allowNull: false },
          table_name: { type: Sequelize.STRING(64), allowNull: false },
          record_id: { type: Sequelize.STRING(64), allowNull: false },
          column_name: { type: Sequelize.STRING(64), allowNull: false },
          old_value: { type: Sequelize.TEXT, allowNull: true },
          new_value: { type: Sequelize.TEXT, allowNull: true },
          source: { type: Sequelize.JSONB, allowNull: false },
          reason: { type: Sequelize.TEXT, allowNull: false },
          confidence: { type: Sequelize.STRING(16), allowNull: false },
          operation: { type: Sequelize.STRING(16), allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
          executed_by: { type: Sequelize.STRING(128), allowNull: false },
        },
        { transaction }
      );
      await queryInterface.addIndex(TABLE, ["table_name", "record_id"], { name: "data_change_log_table_record", transaction });
      await queryInterface.addIndex(TABLE, ["batch_id"], { name: "data_change_log_batch", transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE "${TABLE}"
           ADD CONSTRAINT data_change_log_operation_check CHECK (operation IN ('INSERT', 'UPDATE', 'MERGE', 'SKIPPED', 'REVIEW_REQUIRED')),
           ADD CONSTRAINT data_change_log_confidence_check CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW'))`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE);
  },
};
