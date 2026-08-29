"use strict";

// Verifies the bridge's own responsibilities in isolation — the
// req.user -> actingUser mapping and the McpServer singleton — against
// FAKE createServer()/createDashboardPipeline() (jest.mock), never a real
// MCP server or Sequelize models. Mirrors the no-real-dependency discipline
// used everywhere else in this kernel's test suite (see e.g.
// test/ai.dashboard.pipeline.test.js).

const mockMcpServer = { name: "fake-mcp-server" };
const mockCreateServer = jest.fn(() => mockMcpServer);
jest.mock("../src/ai/mcp/server/start", () => ({ createServer: mockCreateServer }));

const mockDashboardService = { getSnapshot: jest.fn(async () => ({ ok: true })), getDomainSnapshot: jest.fn(async () => ({ ok: true })) };
const mockCreateDashboardPipeline = jest.fn(() => ({ dashboardService: mockDashboardService }));
jest.mock("../src/ai/dashboard/pipeline", () => ({ createDashboardPipeline: mockCreateDashboardPipeline }));

const REQ_USER = { sub: "u1", role: "admin", email: "a@b.com" };

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe("aiDashboardBridge.service — actingUser mapping", () => {
  test("toActingUser maps {sub, role, email} to {id, role, email}", () => {
    const bridge = require("../src/modules/ai-dashboard/services/aiDashboardBridge.service");
    expect(bridge.toActingUser(REQ_USER)).toEqual({ id: "u1", role: "admin", email: "a@b.com" });
  });

  test("getSnapshot builds the pipeline with the mapped actingUser and delegates to dashboardService.getSnapshot", async () => {
    const bridge = require("../src/modules/ai-dashboard/services/aiDashboardBridge.service");
    await bridge.getSnapshot(REQ_USER);
    expect(mockCreateDashboardPipeline).toHaveBeenCalledWith({ mcpServer: mockMcpServer, actingUser: { id: "u1", role: "admin", email: "a@b.com" } });
    expect(mockDashboardService.getSnapshot).toHaveBeenCalledWith({ actingUser: { id: "u1", role: "admin", email: "a@b.com" } });
  });

  test("getDomainSnapshot forwards the domain and delegates to dashboardService.getDomainSnapshot", async () => {
    const bridge = require("../src/modules/ai-dashboard/services/aiDashboardBridge.service");
    await bridge.getDomainSnapshot(REQ_USER, "projects");
    expect(mockDashboardService.getDomainSnapshot).toHaveBeenCalledWith("projects", { actingUser: { id: "u1", role: "admin", email: "a@b.com" } });
  });
});

describe("aiDashboardBridge.service — McpServer singleton", () => {
  test("createServer() is called only once across multiple requests", async () => {
    const bridge = require("../src/modules/ai-dashboard/services/aiDashboardBridge.service");
    await bridge.getSnapshot(REQ_USER);
    await bridge.getSnapshot({ ...REQ_USER, sub: "u2" });
    await bridge.getDomainSnapshot(REQ_USER, "kpi");
    expect(mockCreateServer).toHaveBeenCalledTimes(1);
  });

  test("a fresh pipeline (and dashboardService) is built PER call, even though the McpServer is shared", async () => {
    const bridge = require("../src/modules/ai-dashboard/services/aiDashboardBridge.service");
    await bridge.getSnapshot(REQ_USER);
    await bridge.getSnapshot(REQ_USER);
    expect(mockCreateDashboardPipeline).toHaveBeenCalledTimes(2);
  });
});

describe("aiDashboardBridge.service — DOMAIN_NAMES", () => {
  test("re-exports the 7 domain names from the kernel manifest", () => {
    const bridge = require("../src/modules/ai-dashboard/services/aiDashboardBridge.service");
    expect(bridge.DOMAIN_NAMES.sort()).toEqual(["projects", "pipeline", "sales", "maintenance", "hr", "industrial", "kpi"].sort());
  });
});
