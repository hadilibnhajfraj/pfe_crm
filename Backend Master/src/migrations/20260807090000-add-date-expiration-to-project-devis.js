"use strict";

// Ajoute une date d'expiration (facultative) à un devis — champ absent du
// modèle d'origine (ProjectDevis n'était qu'un enregistrement de fichier
// uploadé : nom/URL/type MIME, aucune notion de validité). Nécessaire pour
// que le Dashboard AI puisse calculer un compteur réel de "devis expirants"
// (voir modules/ai-copilot/services/dashboardBriefing.service.js) sans
// fabriquer une donnée qui n'existait pas — un devis existant reste
// `dateExpiration: null` (jamais compté comme expirant) tant que personne
// n'a renseigné sa date de validité.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const table = await queryInterface.describeTable("project_devis", { transaction });

      if (!table.dateExpiration) {
        await queryInterface.addColumn(
          "project_devis",
          "dateExpiration",
          { type: Sequelize.DATEONLY, allowNull: true },
          { transaction }
        );
      }

      await queryInterface.sequelize.query(
        'CREATE INDEX IF NOT EXISTS project_devis_date_expiration_idx ON "project_devis" ("dateExpiration")',
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex("project_devis", "project_devis_date_expiration_idx", { transaction });
      await queryInterface.removeColumn("project_devis", "dateExpiration", { transaction });
    });
  },
};
