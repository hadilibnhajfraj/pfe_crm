const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ProjectDevis = sequelize.define(
  "ProjectDevis",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },

    nomDevis: { type: DataTypes.STRING(200), allowNull: false },
    fileUrl: { type: DataTypes.STRING(500), allowNull: false },
    mimeType: { type: DataTypes.STRING(100), allowNull: false },
    originalName: { type: DataTypes.STRING(255), allowNull: true },
    // Facultatif — absent tant que personne ne l'a renseigné (voir la
    // migration 20260807090000). Alimente le compteur "devis expirants" du
    // Dashboard AI (modules/ai-copilot/services/dashboardBriefing.service.js).
    dateExpiration: { type: DataTypes.DATEONLY, allowNull: true },
  },
  { tableName: "project_devis", timestamps: true }
);

module.exports = ProjectDevis;