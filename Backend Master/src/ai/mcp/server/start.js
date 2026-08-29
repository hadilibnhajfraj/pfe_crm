"use strict";

// Standalone MCP server entry point: `node src/ai/mcp/server/start.js`.
// This is its own process, NOT mounted into app.js/Express — an MCP host
// (an orchestrator process, a Claude-Desktop-style client) launches it and
// speaks JSON-RPC 2.0 over stdio. See ../../README.md and
// AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md §5.1/§8.
//
// Every Tool wired below calls an existing module service — see
// ../tools/index.js and test/ai.mcp.tools.policy.test.js, which fails the
// build if a tool file ever requires Sequelize or a model directly.

require("dotenv").config();
require("../../../models/associations");

const { McpServer } = require("./mcpServer");
const { StdioTransport } = require("./stdioTransport");
const { ToolRegistry } = require("../../tools");
const { ToolLoader } = require("../toolLoader");
const { PermissionManager } = require("../permissionManager");
const { ValidationManager } = require("../validationManager");
const { ErrorHandler } = require("../errorHandler");
const { defaultToolFactories } = require("../tools");
const { createMcpLogger } = require("../logger");
const { createSecurityPipeline } = require("../../security");

const logger = createMcpLogger("start");

// `rateLimiter`/`auditLog` default to a freshly-built `security/pipeline.js`
// pipeline (in-memory store — see that file's own doc comment on when to
// pass a shared Redis-backed one instead) rather than staying unset: this
// factory is THE single construction point for every real McpServer this
// process builds — the stdio entrypoint below, AND
// modules/ai-dashboard/services/aiDashboardBridge.service.js's singleton
// (the one HTTP surface that exists today) — so leaving them optional-and-
// unset here would leave every real deployment unprotected by default.
// Pass `{ rateLimiter: null, auditLog: null }` explicitly to opt back out.
function createServer({ rateLimiter, auditLog } = {}) {
  const toolRegistry = new ToolRegistry();
  new ToolLoader(defaultToolFactories).loadInto(toolRegistry);

  const needsDefaultSecurity = rateLimiter === undefined || auditLog === undefined;
  const security = needsDefaultSecurity ? createSecurityPipeline() : null;

  return new McpServer({
    name: "crm-cbi-tunisia-mcp-server",
    version: "0.1.0",
    toolRegistry,
    permissionManager: new PermissionManager(),
    validationManager: new ValidationManager(),
    errorHandler: new ErrorHandler(),
    rateLimiter: rateLimiter !== undefined ? rateLimiter : security.rateLimiter,
    auditLog: auditLog !== undefined ? auditLog : security.auditLog,
  });
}

if (require.main === module) {
  createServer().listen(new StdioTransport());
  process.on("SIGINT", () => {
    logger.info("shutting down (SIGINT)");
    process.exit(0);
  });
}

module.exports = { createServer };
