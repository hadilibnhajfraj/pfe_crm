"use strict";

const { DomainAnalyzer } = require("./domainAnalyzer");

// Défauts "meilleur effort" (voir projectsAnalyzer.js pour le même
// avertissement) : list_pipeline_stages renvoie les DÉFINITIONS d'étapes
// (id/name/order), pas le volume d'opportunités par étape — ces règles
// portent donc sur la cohérence de la structure du pipeline elle-même, pas
// sur son remplissage.
const DEFAULT_DATA_SOURCES = [{ key: "stages", listToolName: "list_pipeline_stages" }];

function buildDefaultRules() {
  return {
    dataQuality: [
      ({ data }) =>
        data.stages
          .filter((stage) => !stage.name || stage.order === undefined || stage.order === null)
          .map((stage) => ({ type: "missing_field", stageId: stage.id, message: `L'étape "${stage.id}" a un nom ou un ordre manquant.` })),
    ],
    anomalies: [
      ({ data }) => {
        const orders = data.stages.map((stage) => stage.order).filter((order) => order !== undefined && order !== null);
        const duplicates = orders.filter((order, index) => orders.indexOf(order) !== index);
        return [...new Set(duplicates)].map((order) => ({ type: "duplicate_stage_order", order, message: `Plusieurs étapes du pipeline partagent le même ordre (${order}).` }));
      },
    ],
    recommendations: [
      ({ data }) =>
        data.stages.length > 1 && new Set(data.stages.map((stage) => stage.order)).size !== data.stages.length
          ? { type: "reorder_pipeline", message: "Des étapes du pipeline ont un ordre en conflit — envisager un réordonnancement." }
          : null,
    ],
  };
}

function createPipelineAnalyzer({ tools = [], dataSources = DEFAULT_DATA_SOURCES, rules, requiredRoles = [], allowedEmails = [] } = {}) {
  return new DomainAnalyzer({
    domain: "pipeline",
    tools,
    dataSources,
    rules: rules || buildDefaultRules(),
    requiredRoles,
    allowedEmails,
  });
}

module.exports = { createPipelineAnalyzer, buildDefaultRules, DEFAULT_DATA_SOURCES };
