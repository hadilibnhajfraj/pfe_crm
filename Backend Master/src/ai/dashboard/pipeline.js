"use strict";

const { NotConfiguredError } = require("./errors");
const { createMcpToolAdapters } = require("../langchain/tools");
const { createDefaultAnalyzers } = require("./manifest");
const { DashboardService } = require("./dashboardService");

/**
 * Composition root for the AI Dashboard subsystem (mirrors
 * automations/pipeline.js, agents/manifest.js and every other pipeline.js in
 * this kernel): wires the 7 domain analyzers over the SAME LangChain Tool
 * adapters Agents/Automations use (`createMcpToolAdapters` — see
 * langchain/tools/mcpToolAdapter.js), never a parallel calling convention.
 *
 * Requires a real `mcpServer` and `actingUser` — every Tool call this
 * pipeline can ever make is fixed to that one CRM identity at construction
 * time (same rule as every other pipeline in this kernel: "le Copilot agit
 * toujours au nom de l'utilisateur connecté, jamais avec des privilèges
 * élevés"). Because an HTTP request carries a DIFFERENT `actingUser` on
 * every call, callers are expected to build a fresh pipeline PER REQUEST
 * from one long-lived `mcpServer` singleton — see
 * modules/ai-dashboard/services/aiDashboardBridge.service.js, and note that
 * `createMcpToolAdapters`/`DomainAnalyzer` construction performs no I/O, so
 * doing this on every request is cheap.
 */
function createDashboardPipeline({ mcpServer, actingUser } = {}) {
  if (!mcpServer) {
    throw new NotConfiguredError("createDashboardPipeline requires a McpServer (mcpServer)");
  }
  if (!actingUser) {
    throw new NotConfiguredError("createDashboardPipeline requires an actingUser");
  }

  const tools = createMcpToolAdapters({ mcpServer, actingUser });
  const analyzers = createDefaultAnalyzers({ tools });
  const dashboardService = new DashboardService({ analyzers });

  return { tools, analyzers, dashboardService };
}

module.exports = { createDashboardPipeline };
