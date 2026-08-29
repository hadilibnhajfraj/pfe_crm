"use strict";

const Joi = require("joi");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { McpError, ToolValidationError } = require("../src/ai/mcp/errors");

describe("ValidationManager.validateEnvelope", () => {
  const vm = new ValidationManager();

  test("accepts a well-formed JSON-RPC request", () => {
    const value = vm.validateEnvelope({ jsonrpc: "2.0", id: "1", method: "ping", params: {} });
    expect(value.method).toBe("ping");
  });

  test("accepts a notification (no id)", () => {
    expect(() => vm.validateEnvelope({ jsonrpc: "2.0", method: "ping" })).not.toThrow();
  });

  test("rejects a wrong jsonrpc version", () => {
    expect(() => vm.validateEnvelope({ jsonrpc: "1.0", method: "ping" })).toThrow(McpError);
  });

  test("rejects a missing method", () => {
    expect(() => vm.validateEnvelope({ jsonrpc: "2.0", id: "1" })).toThrow(McpError);
  });

  test("rejects a non-object message", () => {
    expect(() => vm.validateEnvelope("not-an-object")).toThrow(McpError);
    expect(() => vm.validateEnvelope(null)).toThrow(McpError);
  });
});

describe("ValidationManager.validateActingUser", () => {
  const vm = new ValidationManager();

  test("allows absence — permission concern, not validation (see PermissionManager)", () => {
    expect(() => vm.validateActingUser(undefined)).not.toThrow();
    expect(() => vm.validateActingUser(null)).not.toThrow();
  });

  test("accepts a well-formed actingUser", () => {
    expect(() =>
      vm.validateActingUser({ id: "11111111-1111-4111-8111-111111111111", role: "commercial" })
    ).not.toThrow();
  });

  test("rejects a malformed actingUser (bad uuid)", () => {
    expect(() => vm.validateActingUser({ id: "not-a-uuid", role: "commercial" })).toThrow(McpError);
  });

  test("rejects an actingUser missing role", () => {
    expect(() => vm.validateActingUser({ id: "11111111-1111-4111-8111-111111111111" })).toThrow(McpError);
  });
});

describe("ValidationManager.validateToolInput", () => {
  const vm = new ValidationManager();
  const tool = { name: "sample_tool", inputSchema: Joi.object({ id: Joi.string().required() }) };

  test("returns validated/coerced value on success", () => {
    expect(vm.validateToolInput(tool, { id: "abc" })).toEqual({ id: "abc" });
  });

  test("strips unknown keys instead of failing", () => {
    expect(vm.validateToolInput(tool, { id: "abc", extra: "nope" })).toEqual({ id: "abc" });
  });

  test("throws ToolValidationError naming the tool on invalid input", () => {
    expect(() => vm.validateToolInput(tool, {})).toThrow(ToolValidationError);
  });

  test("a tool with no inputSchema accepts anything unmodified", () => {
    const openTool = { name: "no_schema_tool" };
    const input = { anything: true };
    expect(vm.validateToolInput(openTool, input)).toBe(input);
  });
});
