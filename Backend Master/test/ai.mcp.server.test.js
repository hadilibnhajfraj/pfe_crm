"use strict";

const Joi = require("joi");
const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry, ServiceBackedTool } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { ErrorCodes } = require("../src/ai/mcp/jsonRpc");

const VALID_USER = { id: "11111111-1111-4111-8111-111111111111", role: "user" };
const ADMIN_USER = { id: "22222222-2222-4222-8222-222222222222", role: "admin" };

function buildServer(tools = [], extra = {}) {
  const toolRegistry = new ToolRegistry();
  tools.forEach((tool) => toolRegistry.register(tool));
  return new McpServer({
    name: "test-server",
    version: "0.0.0",
    toolRegistry,
    permissionManager: new PermissionManager(),
    validationManager: new ValidationManager(),
    errorHandler: new ErrorHandler(),
    ...extra,
  });
}

// A fake tool standing in for a real, service-backed one — the point of
// these tests is the MCP protocol plumbing (McpServer + its collaborators),
// not any concrete CRM tool (those are covered by ai.mcp.tools.test.js).
function echoTool({ name = "echo_tool", requiredRoles = [], run } = {}) {
  return new ServiceBackedTool({
    name,
    description: "Echoes its input, standing in for a real service-backed tool.",
    inputSchema: Joi.object({ message: Joi.string().required() }),
    requiredRoles,
    run: run || (async (input) => ({ echoed: input.message })),
  });
}

describe("McpServer.listen", () => {
  function fakeTransport() {
    let onMessage;
    return {
      start: jest.fn((handler) => {
        onMessage = handler;
      }),
      send: jest.fn(),
      // Test helper, not part of IServerTransport — simulates the transport
      // receiving one raw line and invoking the handler start() registered.
      simulateMessage(message, parseError = null) {
        onMessage(message, parseError);
      },
    };
  }

  test("starts the transport and forwards every non-notification response to transport.send()", async () => {
    const server = buildServer();
    const transport = fakeTransport();
    server.listen(transport);
    expect(transport.start).toHaveBeenCalledTimes(1);

    transport.simulateMessage({ jsonrpc: "2.0", id: 1, method: "ping" });
    await Promise.resolve();
    await Promise.resolve();

    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({ id: 1, result: {} }));
  });

  test("a notification (no id) never reaches transport.send()", async () => {
    const server = buildServer();
    const transport = fakeTransport();
    server.listen(transport);

    transport.simulateMessage({ jsonrpc: "2.0", method: "ping" });
    await Promise.resolve();
    await Promise.resolve();

    expect(transport.send).not.toHaveBeenCalled();
  });

  test("a transport-level parse error is converted to a PARSE_ERROR response via errorHandler, without calling handleMessage", async () => {
    const server = buildServer();
    const transport = fakeTransport();
    server.listen(transport);

    transport.simulateMessage(null, new Error("malformed JSON"));

    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: ErrorCodes.PARSE_ERROR }) }));
  });
});

describe("McpServer.handleMessage — protocol methods", () => {
  test("initialize returns protocol/server metadata", async () => {
    const server = buildServer();
    const response = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(response.result.serverInfo).toEqual({ name: "test-server", version: "0.0.0" });
    expect(response.result.capabilities).toEqual({ tools: {} });
  });

  test("ping returns an empty result", async () => {
    const server = buildServer();
    const response = await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "ping" });
    expect(response.result).toEqual({});
  });

  test("a notification (no id) never produces a response", async () => {
    const server = buildServer();
    const response = await server.handleMessage({ jsonrpc: "2.0", method: "ping" });
    expect(response).toBeNull();
  });

  test("an unknown method returns METHOD_NOT_FOUND", async () => {
    const server = buildServer();
    const response = await server.handleMessage({ jsonrpc: "2.0", id: 3, method: "not/a/method" });
    expect(response.error.code).toBe(ErrorCodes.METHOD_NOT_FOUND);
  });

  test("a malformed envelope returns INVALID_REQUEST, best-effort id echoed back", async () => {
    const response = await buildServer().handleMessage({ jsonrpc: "1.0", id: 4, method: "ping" });
    expect(response.error.code).toBe(ErrorCodes.INVALID_REQUEST);
    expect(response.id).toBe(4);
  });
});

describe("McpServer.handleMessage — tools/list", () => {
  test("lists every registered tool with name/description/inputSchema", async () => {
    const server = buildServer([echoTool()]);
    const response = await server.handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/list" });
    expect(response.result.tools).toEqual([
      {
        name: "echo_tool",
        description: expect.any(String),
        inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
      },
    ]);
  });
});

describe("McpServer.handleMessage — tools/call happy path", () => {
  test("executes the tool and returns its output as MCP content", async () => {
    const server = buildServer([echoTool()]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER },
    });
    expect(response.result.isError).toBe(false);
    expect(JSON.parse(response.result.content[0].text)).toEqual({ echoed: "hi" });
  });

  test("passes actingUser through to the tool's execution context", async () => {
    let seenUser;
    const server = buildServer([
      echoTool({
        run: async (_input, { actingUser }) => {
          seenUser = actingUser;
          return {};
        },
      }),
    ]);
    await server.handleMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: ADMIN_USER },
    });
    expect(seenUser).toEqual(ADMIN_USER);
  });
});

describe("McpServer.handleMessage — tools/call failure paths", () => {
  test('missing "name" is INVALID_PARAMS', async () => {
    const server = buildServer([echoTool()]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { arguments: {}, actingUser: VALID_USER },
    });
    expect(response.error.code).toBe(ErrorCodes.INVALID_PARAMS);
  });

  test("unknown tool name is TOOL_NOT_FOUND", async () => {
    const server = buildServer([echoTool()]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "does_not_exist", actingUser: VALID_USER },
    });
    expect(response.error.code).toBe(ErrorCodes.TOOL_NOT_FOUND);
  });

  test("no actingUser at all is PERMISSION_DENIED, not a generic error", async () => {
    const server = buildServer([echoTool()]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "echo_tool", arguments: { message: "hi" } },
    });
    expect(response.error.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  test("actingUser present but malformed is INVALID_PARAMS, checked before permission", async () => {
    const server = buildServer([echoTool()]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: { id: "not-a-uuid", role: "user" } },
    });
    expect(response.error.code).toBe(ErrorCodes.INVALID_PARAMS);
  });

  test("actingUser well-formed but role not allowed is PERMISSION_DENIED", async () => {
    const server = buildServer([echoTool({ requiredRoles: ["admin"] })]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER },
    });
    expect(response.error.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  test("invalid business input is VALIDATION_ERROR, only reached once permission passes", async () => {
    const server = buildServer([echoTool()]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: { name: "echo_tool", arguments: {}, actingUser: VALID_USER },
    });
    expect(response.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
  });

  test("a bare Error thrown by the tool becomes TOOL_EXECUTION_ERROR, message not leaked verbatim", async () => {
    const server = buildServer([
      echoTool({
        run: async () => {
          throw new Error("internal db connection string leaked");
        },
      }),
    ]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER },
    });
    expect(response.error.code).toBe(ErrorCodes.TOOL_EXECUTION_ERROR);
    expect(response.error.message).not.toContain("connection string");
  });

  test("a CRM-style {status,message} error thrown by the tool keeps its HTTP-status semantics (403 -> PERMISSION_DENIED)", async () => {
    const server = buildServer([
      echoTool({
        run: async () => {
          // eslint-disable-next-line no-throw-literal
          throw { status: 403, message: "Vous ne pouvez accéder qu'à vos propres demandes" };
        },
      }),
    ]);
    const response = await server.handleMessage({
      jsonrpc: "2.0",
      id: 15,
      method: "tools/call",
      params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER },
    });
    expect(response.error.code).toBe(ErrorCodes.PERMISSION_DENIED);
    expect(response.error.message).toBe("Vous ne pouvez accéder qu'à vos propres demandes");
  });
});

describe("McpServer.handleMessage — rate limiting (security/rateLimiter.js, optional)", () => {
  test("without a rateLimiter, calls are never limited (fully backward compatible)", async () => {
    const server = buildServer([echoTool()]);
    for (let i = 0; i < 5; i++) {
      const response = await server.handleMessage({
        jsonrpc: "2.0",
        id: i,
        method: "tools/call",
        params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER },
      });
      expect(response.result.isError).toBe(false);
    }
  });

  test("once a rateLimiter is provided, exceeding its budget returns RATE_LIMIT_EXCEEDED, not TOOL_EXECUTION_ERROR", async () => {
    const { RateLimiter } = require("../src/ai/security/rateLimiter");
    const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");
    const rateLimiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 1, windowSeconds: 60 });
    const server = buildServer([echoTool()], { rateLimiter });

    const call = () =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER },
      });

    const first = await call();
    expect(first.result.isError).toBe(false);

    const second = await call();
    expect(second.error.code).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
  });

  test("a permission-denied call never consumes the rate-limit budget (only authorized calls do)", async () => {
    const { RateLimiter } = require("../src/ai/security/rateLimiter");
    const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");
    const rateLimiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 1, windowSeconds: 60 });
    const server = buildServer([echoTool({ requiredRoles: ["admin"] })], { rateLimiter });

    // Denied 3 times (wrong role) — none of these should count against the budget.
    for (let i = 0; i < 3; i++) {
      const denied = await server.handleMessage({
        jsonrpc: "2.0",
        id: 30 + i,
        method: "tools/call",
        params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER },
      });
      expect(denied.error.code).toBe(ErrorCodes.PERMISSION_DENIED);
    }

    const allowed = await server.handleMessage({
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: ADMIN_USER },
    });
    expect(allowed.result.isError).toBe(false);
  });

  test("different users get independent budgets for the same tool", async () => {
    const { RateLimiter } = require("../src/ai/security/rateLimiter");
    const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");
    const rateLimiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 1, windowSeconds: 60 });
    const server = buildServer([echoTool()], { rateLimiter });

    const callAs = (actingUser, id) => server.handleMessage({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "echo_tool", arguments: { message: "hi" }, actingUser } });

    expect((await callAs(VALID_USER, 50)).result.isError).toBe(false);
    expect((await callAs(ADMIN_USER, 51)).result.isError).toBe(false);
  });
});

describe("McpServer.handleMessage — audit logging (security/auditLog.js, optional)", () => {
  function buildAuditLog() {
    const { AuditLog } = require("../src/ai/security/auditLog");
    const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");
    return new AuditLog({ store: new InMemoryKeyValueStore() });
  }

  test("without an auditLog, no error occurs and nothing is recorded (fully backward compatible)", async () => {
    const server = buildServer([echoTool()]);
    await expect(
      server.handleMessage({ jsonrpc: "2.0", id: 60, method: "tools/call", params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER } })
    ).resolves.toBeDefined();
  });

  test("records a 'success' entry for a successful call", async () => {
    const auditLog = buildAuditLog();
    const server = buildServer([echoTool()], { auditLog });
    await server.handleMessage({ jsonrpc: "2.0", id: 61, method: "tools/call", params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER } });

    const entries = await auditLog.list();
    expect(entries).toEqual([expect.objectContaining({ actorId: VALID_USER.id, action: "tools/call", resource: "echo_tool", outcome: "success" })]);
  });

  test("records a 'denied' entry for a permission-denied call, never a 'success'", async () => {
    const auditLog = buildAuditLog();
    const server = buildServer([echoTool({ requiredRoles: ["admin"] })], { auditLog });
    await server.handleMessage({ jsonrpc: "2.0", id: 62, method: "tools/call", params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER } });

    const entries = await auditLog.list();
    expect(entries).toEqual([expect.objectContaining({ actorId: VALID_USER.id, resource: "echo_tool", outcome: "denied" })]);
  });

  test("records a 'failure' entry when the tool itself throws, without leaking the raw error into the audit trail's outcome", async () => {
    const auditLog = buildAuditLog();
    const server = buildServer(
      [
        echoTool({
          run: async () => {
            throw new Error("internal db connection string leaked");
          },
        }),
      ],
      { auditLog }
    );
    await server.handleMessage({ jsonrpc: "2.0", id: 63, method: "tools/call", params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER } });

    const entries = await auditLog.list();
    expect(entries[0]).toMatchObject({ outcome: "failure", resource: "echo_tool" });
  });

  test("records a 'denied' entry when the rate limit is exceeded", async () => {
    const { RateLimiter } = require("../src/ai/security/rateLimiter");
    const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");
    const auditLog = buildAuditLog();
    const rateLimiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 1, windowSeconds: 60 });
    const server = buildServer([echoTool()], { rateLimiter, auditLog });

    const call = (id) => server.handleMessage({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER } });
    await call(70);
    await call(71);

    const entries = await auditLog.list();
    expect(entries.map((e) => e.outcome)).toEqual(["success", "denied"]);
  });

  test("a failing auditLog.record() never breaks the actual tool call (audit is best-effort, not load-bearing)", async () => {
    const brokenAuditLog = { record: async () => { throw new Error("audit store unavailable"); } };
    const server = buildServer([echoTool()], { auditLog: brokenAuditLog });
    const response = await server.handleMessage({ jsonrpc: "2.0", id: 80, method: "tools/call", params: { name: "echo_tool", arguments: { message: "hi" }, actingUser: VALID_USER } });
    expect(response.result.isError).toBe(false);
  });
});
