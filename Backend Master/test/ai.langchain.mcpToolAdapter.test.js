"use strict";

const Joi = require("joi");
const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry, ServiceBackedTool } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapter, createMcpToolAdapters } = require("../src/ai/langchain/tools");

const USER = { id: "11111111-1111-4111-8111-111111111111", role: "user" };
const ADMIN = { id: "22222222-2222-4222-8222-222222222222", role: "admin" };

function buildMcpServer(tools) {
  const toolRegistry = new ToolRegistry();
  tools.forEach((tool) => toolRegistry.register(tool));
  return new McpServer({
    name: "test",
    version: "0.0.0",
    toolRegistry,
    permissionManager: new PermissionManager(),
    validationManager: new ValidationManager(),
    errorHandler: new ErrorHandler(),
  });
}

function echoTool(overrides = {}) {
  return new ServiceBackedTool({
    name: "echo_tool",
    description: "Echoes its input",
    inputSchema: Joi.object({ message: Joi.string().required() }),
    requiredRoles: [],
    run: async (input) => ({ echoed: input.message }),
    ...overrides,
  });
}

describe("createMcpToolAdapter", () => {
  test("produces a LangChain tool exposing the same name/description as the MCP tool", () => {
    const mcpServer = buildMcpServer([echoTool()]);
    const adapted = createMcpToolAdapter({ mcpServer, toolDescriptor: echoTool(), actingUser: USER });
    expect(adapted.name).toBe("echo_tool");
    expect(adapted.description).toBe("Echoes its input");
  });

  test("invoking the adapted tool runs the real MCP tool end to end and returns its JSON output as text", async () => {
    const mcpServer = buildMcpServer([echoTool()]);
    const adapted = createMcpToolAdapter({ mcpServer, toolDescriptor: mcpServer.toolRegistry.get("echo_tool"), actingUser: USER });
    const result = await adapted.invoke({ message: "hello" });
    expect(JSON.parse(result)).toEqual({ echoed: "hello" });
  });

  test("permission denial (wrong role) surfaces as a thrown error, not a silent empty result", async () => {
    const mcpServer = buildMcpServer([echoTool({ requiredRoles: ["admin"] })]);
    const adapted = createMcpToolAdapter({
      mcpServer,
      toolDescriptor: mcpServer.toolRegistry.get("echo_tool"),
      actingUser: USER, // not admin
    });
    await expect(adapted.invoke({ message: "hi" })).rejects.toThrow(/not allowed/i);
  });

  test("admin actingUser is allowed through an admin-only tool", async () => {
    const mcpServer = buildMcpServer([echoTool({ requiredRoles: ["admin"] })]);
    const adapted = createMcpToolAdapter({
      mcpServer,
      toolDescriptor: mcpServer.toolRegistry.get("echo_tool"),
      actingUser: ADMIN,
    });
    await expect(adapted.invoke({ message: "hi" })).resolves.toContain("hi");
  });

  test("business validation errors (Joi) surface as a thrown error too", async () => {
    const mcpServer = buildMcpServer([echoTool()]);
    const adapted = createMcpToolAdapter({ mcpServer, toolDescriptor: mcpServer.toolRegistry.get("echo_tool"), actingUser: USER });
    // schema requires `message`; DynamicStructuredTool's own passthrough
    // schema allows an empty object through to the MCP server, where
    // ValidationManager (Joi) is what actually rejects it.
    await expect(adapted.invoke({})).rejects.toThrow();
  });

  test("actingUser is fixed at construction — the tool never accepts a different identity at call time", async () => {
    const mcpServer = buildMcpServer([echoTool({ requiredRoles: ["admin"] })]);
    const adapted = createMcpToolAdapter({
      mcpServer,
      toolDescriptor: mcpServer.toolRegistry.get("echo_tool"),
      actingUser: ADMIN,
    });
    // invoke() only accepts the tool's declared schema (message) — there is
    // no parameter through which a caller could smuggle a different user.
    await expect(adapted.invoke({ message: "hi", actingUser: USER })).resolves.toBeDefined();
  });
});

describe("createMcpToolAdapters", () => {
  test("builds one LangChain tool per tool currently in the registry", () => {
    const mcpServer = buildMcpServer([echoTool(), echoTool({ name: "second_tool" })]);
    const adapters = createMcpToolAdapters({ mcpServer, actingUser: USER });
    expect(adapters.map((t) => t.name).sort()).toEqual(["echo_tool", "second_tool"]);
  });

  test("returns an empty array when the registry has no tools", () => {
    const mcpServer = buildMcpServer([]);
    expect(createMcpToolAdapters({ mcpServer, actingUser: USER })).toEqual([]);
  });
});
