"use strict";

// Tests mcp/server/start.js::createServer() in isolation from the real
// 73-tool registry (and whatever network/SMTP side effects loading every
// real CRM service transitively triggers) — same no-real-dependency
// discipline as test/aiDashboardBridge.service.test.js, one level down:
// here we verify createServer()'s OWN wiring logic (security pipeline
// defaults), not the tools it loads (covered by test/ai.mcp.tools.*).

const mockToolRegistry = { list: () => [] };
jest.mock("../src/ai/tools", () => ({
  ToolRegistry: jest.fn(() => mockToolRegistry),
}));

// NOTE: start.js pulls `defaultToolFactories` from `mcp/tools` (the 73
// concrete, service-backed factories) — a DIFFERENT module from the
// generic `ai/tools` (`ToolRegistry`/`ServiceBackedTool`) mocked above,
// despite the similar require path.
jest.mock("../src/ai/mcp/tools", () => ({
  defaultToolFactories: [],
}));

jest.mock("../src/ai/mcp/toolLoader", () => ({
  ToolLoader: jest.fn().mockImplementation(() => ({ loadInto: jest.fn() })),
}));

const fakeRateLimiter = { consume: jest.fn() };
const fakeAuditLog = { record: jest.fn() };
const mockCreateSecurityPipeline = jest.fn(() => ({ rateLimiter: fakeRateLimiter, auditLog: fakeAuditLog }));
jest.mock("../src/ai/security", () => ({ createSecurityPipeline: mockCreateSecurityPipeline }));

const { createServer } = require("../src/ai/mcp/server/start");
const { McpServer } = require("../src/ai/mcp/server/mcpServer");

beforeEach(() => jest.clearAllMocks());

describe("mcp/server/start.js::createServer — security wiring", () => {
  test("by default, wires a real McpServer with rateLimiter/auditLog from security/pipeline.js (createSecurityPipeline())", () => {
    const server = createServer();
    expect(server).toBeInstanceOf(McpServer);
    expect(mockCreateSecurityPipeline).toHaveBeenCalledTimes(1);
    expect(server.rateLimiter).toBe(fakeRateLimiter);
    expect(server.auditLog).toBe(fakeAuditLog);
  });

  test("passing rateLimiter/auditLog explicitly overrides the default and never calls createSecurityPipeline()", () => {
    const customRateLimiter = { consume: jest.fn() };
    const server = createServer({ rateLimiter: customRateLimiter, auditLog: null });
    expect(mockCreateSecurityPipeline).not.toHaveBeenCalled();
    expect(server.rateLimiter).toBe(customRateLimiter);
    expect(server.auditLog).toBeNull();
  });

  test("explicit { rateLimiter: null, auditLog: null } opts out of both (backward compatible)", () => {
    const server = createServer({ rateLimiter: null, auditLog: null });
    expect(mockCreateSecurityPipeline).not.toHaveBeenCalled();
    expect(server.rateLimiter).toBeNull();
    expect(server.auditLog).toBeNull();
  });

  test("always builds the toolRegistry via ToolLoader + defaultToolFactories, regardless of the security options", () => {
    const { ToolLoader } = require("../src/ai/mcp/toolLoader");
    createServer();
    expect(ToolLoader).toHaveBeenCalledWith([]);
  });
});
