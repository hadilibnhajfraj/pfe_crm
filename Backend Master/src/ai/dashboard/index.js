"use strict";

// AI Dashboard: read-only, system-triggered analysis across 7 business
// domains (projects, pipeline, sales, maintenance, HR, industrial, KPI),
// producing 6 insight categories (alerts, recommendations, anomalies,
// forecasts, risks, data quality). Like Agents and Automations, this
// subsystem only ever touches CRM data through the existing MCP AI Tools —
// never a business service or Sequelize model directly. See
// Backend Master/src/ai/README.md ("Le Dashboard IA") for the architecture
// writeup, and test/ai.dashboard.policy.test.js for the mechanical
// guarantee (same rule as agents/, automations/, orchestrator/, langchain/,
// rag/ and memory/ — see those modules' policy tests for the symmetric
// rules elsewhere in the kernel).
const { IDomainAnalyzer } = require("./domainAnalyzer.interface");
const { DashboardError, UnknownAnalyzerToolError, DashboardPermissionError } = require("./errors");
const { createDashboardLogger } = require("./logger");
const { DomainAnalyzer, CATEGORIES } = require("./domainAnalyzer");
const { detectNumericOutliers, mean, stdDev } = require("./statsUtils");
const { createProjectsAnalyzer, DEFAULT_DATA_SOURCES: PROJECTS_DEFAULT_DATA_SOURCES } = require("./projectsAnalyzer");
const { createPipelineAnalyzer, DEFAULT_DATA_SOURCES: PIPELINE_DEFAULT_DATA_SOURCES } = require("./pipelineAnalyzer");
const { createSalesAnalyzer, DEFAULT_DATA_SOURCES: SALES_DEFAULT_DATA_SOURCES } = require("./salesAnalyzer");
const { createMaintenanceAnalyzer, DEFAULT_DATA_SOURCES: MAINTENANCE_DEFAULT_DATA_SOURCES } = require("./maintenanceAnalyzer");
const { createHrAnalyzer, DEFAULT_DATA_SOURCES: HR_DEFAULT_DATA_SOURCES } = require("./hrAnalyzer");
const { createIndustrialAnalyzer, DEFAULT_DATA_SOURCES: INDUSTRIAL_DEFAULT_DATA_SOURCES } = require("./industrialAnalyzer");
const { createKpiAnalyzer, DEFAULT_DATA_SOURCES: KPI_DEFAULT_DATA_SOURCES } = require("./kpiAnalyzer");
const { defaultAnalyzerFactories, createDefaultAnalyzers, DOMAIN_NAMES } = require("./manifest");
const { DashboardService } = require("./dashboardService");
const { createDashboardPipeline } = require("./pipeline");

module.exports = {
  IDomainAnalyzer,
  DashboardError,
  UnknownAnalyzerToolError,
  DashboardPermissionError,
  createDashboardLogger,
  DomainAnalyzer,
  CATEGORIES,
  detectNumericOutliers,
  mean,
  stdDev,
  createProjectsAnalyzer,
  PROJECTS_DEFAULT_DATA_SOURCES,
  createPipelineAnalyzer,
  PIPELINE_DEFAULT_DATA_SOURCES,
  createSalesAnalyzer,
  SALES_DEFAULT_DATA_SOURCES,
  createMaintenanceAnalyzer,
  MAINTENANCE_DEFAULT_DATA_SOURCES,
  createHrAnalyzer,
  HR_DEFAULT_DATA_SOURCES,
  createIndustrialAnalyzer,
  INDUSTRIAL_DEFAULT_DATA_SOURCES,
  createKpiAnalyzer,
  KPI_DEFAULT_DATA_SOURCES,
  defaultAnalyzerFactories,
  createDefaultAnalyzers,
  DOMAIN_NAMES,
  DashboardService,
  createDashboardPipeline,
};
