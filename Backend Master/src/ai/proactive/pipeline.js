"use strict";

const { NotConfiguredError } = require("./errors");
const { createMcpToolAdapters } = require("../langchain/tools");
const { createDashboardPipeline } = require("../dashboard/pipeline");
const { SuggestionEngine } = require("../orchestrator/suggestionEngine");
const { ProactiveMonitor } = require("./proactiveMonitor");
const { AlertDispatcher } = require("./alertDispatcher");
const { getProactiveActionStore } = require("./proactiveActionStore");

/**
 * Composition root for the Proactive AI subsystem (mirrors
 * automations/pipeline.js and dashboard/pipeline.js exactly): wires
 * `ProactiveMonitor` (detection, reuses `DashboardService` — never a second
 * `mcpServer`/Tool-adapter construction) and `AlertDispatcher` (delivery)
 * over the SAME LangChain Tool adapters every other pipeline in this kernel
 * uses.
 *
 * Requires a real `mcpServer` and `actingUser` — same rule as
 * `createDashboardPipeline`/`createAutomationsPipeline`: every Tool call is
 * fixed to one CRM identity at construction time. Because this subsystem is
 * driven by a CRON job rather than an HTTP request, `actingUser` here is a
 * resolved real admin-tier CRM user (see `cron/proactiveAiMonitor.job.js`),
 * never a synthetic identity — the same "le Copilot agit toujours au nom
 * d'un utilisateur réel" rule as everywhere else in this kernel.
 *
 * `toolPermissionIndex` (for `SuggestionEngine`, Smart Suggestions — Prepared
 * Actions on the projects domain) is built from the SAME Tool adapters,
 * never a second reading of the MCP manifest — same discipline as
 * `orchestrator/pipeline.js::buildToolPermissionIndex`.
 *
 * `actionStore` (`getProactiveActionStore()`, `proactiveActionStore.js`) is
 * a process-wide SINGLETON, not built fresh per pipeline call — a workflow
 * proposed on one cron cycle must still be confirmable later via the
 * `POST /ai-copilot/proactive/:workflowId/confirm` HTTP endpoint
 * (`aiCopilotBridge.service.js`), which never goes through this pipeline at
 * all.
 */
function createProactivePipeline({ mcpServer, actingUser, emitToUser = null } = {}) {
  if (!mcpServer) {
    throw new NotConfiguredError("createProactivePipeline requires a McpServer (mcpServer)");
  }
  if (!actingUser) {
    throw new NotConfiguredError("createProactivePipeline requires an actingUser");
  }

  const tools = createMcpToolAdapters({ mcpServer, actingUser });
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

  const { dashboardService } = createDashboardPipeline({ mcpServer, actingUser });

  const toolPermissionIndex = new Map(tools.map((tool) => [tool.name, { requiredRoles: tool.requiredRoles || [], allowedEmails: tool.allowedEmails || [] }]));
  const suggestionEngine = new SuggestionEngine({ toolPermissionIndex });

  const monitor = new ProactiveMonitor({
    dashboardService,
    listProjectsTool: toolByName.get("list_projects"),
    suggestionEngine,
    actingUser,
  });

  const dispatcher = new AlertDispatcher({
    notifyTool: toolByName.get("send_notification_email"),
    emitToUser,
    actionStore: getProactiveActionStore(),
  });

  return { tools, dashboardService, monitor, dispatcher, listUsersByRoleTool: toolByName.get("list_users_by_role") };
}

module.exports = { createProactivePipeline };
