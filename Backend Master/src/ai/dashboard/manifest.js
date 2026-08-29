"use strict";

const { createProjectsAnalyzer } = require("./projectsAnalyzer");
const { createPipelineAnalyzer } = require("./pipelineAnalyzer");
const { createSalesAnalyzer } = require("./salesAnalyzer");
const { createMaintenanceAnalyzer } = require("./maintenanceAnalyzer");
const { createHrAnalyzer } = require("./hrAnalyzer");
const { createIndustrialAnalyzer } = require("./industrialAnalyzer");
const { createKpiAnalyzer } = require("./kpiAnalyzer");

// Manifeste explicite des 7 analyseurs de domaine demandés — même
// discipline que mcp/tools/index.js::defaultToolFactories,
// agents/manifest.js et automations/manifest.js : une liste réviewable, pas
// une découverte automatique de fichiers.
const defaultAnalyzerFactories = [
  createProjectsAnalyzer,
  createPipelineAnalyzer,
  createSalesAnalyzer,
  createMaintenanceAnalyzer,
  createHrAnalyzer,
  createIndustrialAnalyzer,
  createKpiAnalyzer,
];

// Retourne une Map domaine -> instance, comme
// automations/manifest.js::createDefaultAutomations — un analyseur de
// domaine n'est jamais choisi par intention détectée, on demande
// explicitement "projects" ou "kpi", jamais un routage conversationnel.
function createDefaultAnalyzers(deps) {
  const analyzers = defaultAnalyzerFactories.map((factory) => factory(deps));
  return new Map(analyzers.map((analyzer) => [analyzer.domain, analyzer]));
}

// Les 7 noms de domaine, calculés une fois sans le moindre Tool/actingUser
// (chaque factory accepte `{}` — construire un DomainAnalyzer ne fait
// aucune I/O) : utile à la couche HTTP pour valider un paramètre `:domain`
// AVANT de construire un pipeline complet (voir
// modules/ai-dashboard/controllers/aiDashboard.controller.js).
const DOMAIN_NAMES = defaultAnalyzerFactories.map((factory) => factory({}).domain);

module.exports = { defaultAnalyzerFactories, createDefaultAnalyzers, DOMAIN_NAMES };
