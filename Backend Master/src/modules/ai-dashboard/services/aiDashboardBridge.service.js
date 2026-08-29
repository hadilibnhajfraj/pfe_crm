"use strict";

// Thin bridge between the HTTP layer (routes/controllers) and the AI
// kernel (src/ai/dashboard) — the ONLY file under modules/ai-dashboard/
// that touches src/ai/ at all, so the controller/routes stay ordinary
// Express code, easy to test with a mocked bridge (see
// test/aiDashboard.controller.test.js).
//
// Builds ONE McpServer for the whole process lifetime (same singleton
// pattern as src/db.js's `sequelize` instance) — expensive (loads all 73
// real Tool factories, which touch every business service). A fresh
// DashboardService is built PER REQUEST from that singleton, scoped to the
// calling user's own `actingUser` (see src/ai/dashboard/pipeline.js: Tool
// calls are fixed to one identity at construction, and every request here
// is a different user) — this is cheap (no I/O, see
// createMcpToolAdapters/DomainAnalyzer), so doing it on every request costs
// nothing.
const { createServer } = require("../../../ai/mcp/server/start");
const { createDashboardPipeline } = require("../../../ai/dashboard/pipeline");
const { DOMAIN_NAMES } = require("../../../ai/dashboard/manifest");

let mcpServerSingleton = null;

function getMcpServer() {
  if (!mcpServerSingleton) {
    mcpServerSingleton = createServer();
  }
  return mcpServerSingleton;
}

// req.user is the JWT payload set by middleware/auth.middleware.js:
// { sub, email, role } — never { id, ... }. The AI kernel's actingUser
// shape is { id, role, email }, so this mapping happens exactly once, here,
// rather than being re-derived (and possibly gotten wrong) in the
// controller.
function toActingUser(reqUser) {
  return { id: reqUser.sub, role: reqUser.role, email: reqUser.email };
}

function buildDashboardService(reqUser) {
  const actingUser = toActingUser(reqUser);
  return createDashboardPipeline({ mcpServer: getMcpServer(), actingUser }).dashboardService;
}

async function getSnapshot(reqUser) {
  return buildDashboardService(reqUser).getSnapshot({ actingUser: toActingUser(reqUser) });
}

async function getDomainSnapshot(reqUser, domain) {
  return buildDashboardService(reqUser).getDomainSnapshot(domain, { actingUser: toActingUser(reqUser) });
}

module.exports = { getSnapshot, getDomainSnapshot, DOMAIN_NAMES, toActingUser };
