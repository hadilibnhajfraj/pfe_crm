"use strict";

const { DomainAnalyzer } = require("./domainAnalyzer");
const { detectNumericOutliers } = require("./statsUtils");

// Défauts "meilleur effort" (voir projectsAnalyzer.js pour le même
// avertissement) : la forme exacte des fiches renvoyées par
// list_industrial_records n'a pas été revérifiée — `requiredFields` et
// `quantityField` sont des noms plausibles, configurables au câblage réel.
const DEFAULT_DATA_SOURCES = [{ key: "records", listToolName: "list_industrial_records", listInput: {} }];
const DEFAULT_REQUIRED_FIELDS = ["reference", "quantity"];
const DEFAULT_QUANTITY_FIELD = "quantity";

function buildDefaultRules({ requiredFields = DEFAULT_REQUIRED_FIELDS, quantityField = DEFAULT_QUANTITY_FIELD, zScoreThreshold = 2 } = {}) {
  return {
    dataQuality: [
      ({ data }) =>
        data.records
          .filter((record) => requiredFields.some((field) => record[field] === undefined || record[field] === null))
          .map((record) => ({ type: "missing_field", recordId: record.id, message: `La fiche industrielle "${record.id}" a un champ requis manquant.` })),
    ],
    anomalies: [
      ({ data }) =>
        detectNumericOutliers(data.records, quantityField, { zScoreThreshold }).map(({ item, value, zScore }) => ({
          type: "quantity_outlier",
          recordId: item.id,
          value,
          zScore: Math.round(zScore * 100) / 100,
          message: `La fiche "${item.id}" a une valeur de "${quantityField}" (${value}) statistiquement inhabituelle.`,
        })),
    ],
    risks: [
      ({ data }) => {
        const incomplete = data.records.filter((record) => requiredFields.some((field) => record[field] === undefined || record[field] === null));
        return incomplete.length > 0
          ? { type: "unreliable_industrial_data", count: incomplete.length, message: `${incomplete.length} fiche(s) industrielle(s) incomplète(s) — fiabilité du reporting réduite.` }
          : null;
      },
    ],
  };
}

function createIndustrialAnalyzer({
  tools = [],
  dataSources = DEFAULT_DATA_SOURCES,
  rules,
  requiredFields,
  quantityField,
  zScoreThreshold,
  requiredRoles = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"],
  allowedEmails = [],
} = {}) {
  return new DomainAnalyzer({
    domain: "industrial",
    tools,
    dataSources,
    rules: rules || buildDefaultRules({ requiredFields, quantityField, zScoreThreshold }),
    requiredRoles,
    allowedEmails,
  });
}

module.exports = { createIndustrialAnalyzer, buildDefaultRules, DEFAULT_DATA_SOURCES, DEFAULT_REQUIRED_FIELDS, DEFAULT_QUANTITY_FIELD };
