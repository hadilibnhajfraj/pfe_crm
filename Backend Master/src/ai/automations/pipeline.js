"use strict";

const { NotConfiguredError } = require("./errors");
const { createMcpToolAdapters } = require("../langchain/tools");
const { createDefaultAutomations } = require("./manifest");

/**
 * Composition root for the automations subsystem (mirrors manager/index.js,
 * mcp/server/start.js::createServer(), rag/pipeline.js, langchain/pipeline.js,
 * orchestrator/pipeline.js and agents/manifest.js): wires the 8 requested
 * automations over the SAME LangChain Tool adapters Agents use
 * (`createMcpToolAdapters` — see langchain/tools/mcpToolAdapter.js), never a
 * parallel calling convention.
 *
 * Requires a real `mcpServer` and `actingUser` — every Tool call this
 * pipeline can ever make is fixed to that one CRM identity at construction
 * time (same rule as `createLangChainPipeline`/`createAiOrchestrator`: "le
 * Copilot agit toujours au nom de l'utilisateur connecté, jamais avec des
 * privilèges élevés"). Whatever `actingUser` is passed to
 * `automation.run({actingUser, ...})` later only gates whether THAT caller
 * may trigger the automation (see BaseAutomation) — it does not change which
 * identity the underlying Tool calls execute as. In practice, run this
 * pipeline's automations with the same `actingUser` it was built with.
 */
function createAutomationsPipeline({ mcpServer, actingUser } = {}) {
  if (!mcpServer) {
    throw new NotConfiguredError("createAutomationsPipeline requires a McpServer (mcpServer)");
  }
  if (!actingUser) {
    throw new NotConfiguredError("createAutomationsPipeline requires an actingUser");
  }

  const tools = createMcpToolAdapters({ mcpServer, actingUser });
  const automations = createDefaultAutomations({ tools });

  return { tools, automations };
}

module.exports = { createAutomationsPipeline };
