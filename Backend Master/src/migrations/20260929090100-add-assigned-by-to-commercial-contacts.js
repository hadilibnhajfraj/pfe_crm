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
