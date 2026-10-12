"use strict";

const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

// Référentiel unique des machines de production PROBAR et PROMESH (une seule
// table, `typeMachine` distingue les deux familles). Les 8 machines initiales
// (PROBAR-01..04, PROMESH-01..04) sont insérées par la migration
// 20260928090000-create-machines-and-link-production.js — ce sont des
// données, jamais des classes. Une machine n'est jamais supprimée (elle est
// référencée par l'historique des fiches) : on la passe en INACTIVE.
const Machine = sequelize.define(
  "Machine",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    nom: { type: DataTypes.STRING(120), allowNull: false },
    typeMachine: { type: DataTypes.ENUM("PROBAR", "PROMESH"), allowNull: false },
    // Numéro de la machine dans sa famille — c'est la valeur "1".."4" que
    // les écrans de production envoient dans le champ `machine` des fiches.
    numero: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    statut: {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },
    description: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "machines",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["code"] },
      { unique: true, fields: ["typeMachine", "numero"], name: "machines_type_numero_unique" },
      { fields: ["statut"] },
    ],
  }
);

module.exports = Machine;
