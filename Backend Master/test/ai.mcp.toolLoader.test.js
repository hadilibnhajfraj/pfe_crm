"use strict";

const { ToolLoader } = require("../src/ai/mcp/toolLoader");
const { ToolRegistry } = require("../src/ai/tools");
const { ConfigurationError } = require("../src/ai/utils/errors");

function fakeTool(name) {
  return { name, description: "d", inputSchema: {}, execute: async () => ({}) };
}

describe("ToolLoader.loadInto", () => {
  test("registers every valid tool built by its factories", () => {
    const registry = new ToolRegistry();
    const loader = new ToolLoader([() => fakeTool("a"), () => fakeTool("b")]);
    loader.loadInto(registry);
    expect(registry.list().map((t) => t.name).sort()).toEqual(["a", "b"]);
  });

  test("rejects a tool missing a required member (name/description/inputSchema/execute)", () => {
    const registry = new ToolRegistry();
    const incomplete = { name: "broken", description: "d" }; // no inputSchema/execute
    const loader = new ToolLoader([() => incomplete]);
    expect(() => loader.loadInto(registry)).toThrow(ConfigurationError);
  });

  test("rejects a factory that is not a function", () => {
    const registry = new ToolRegistry();
    const loader = new ToolLoader([fakeTool("not-a-factory")]);
    expect(() => loader.loadInto(registry)).toThrow(ConfigurationError);
  });

  test("empty factory list loads nothing and does not throw", () => {
    const registry = new ToolRegistry();
    expect(() => new ToolLoader([]).loadInto(registry)).not.toThrow();
    expect(registry.list()).toEqual([]);
  });

  test("loading the same tool name twice surfaces ToolRegistry's own duplicate guard", () => {
    const registry = new ToolRegistry();
    const loader = new ToolLoader([() => fakeTool("dup"), () => fakeTool("dup")]);
    expect(() => loader.loadInto(registry)).toThrow();
  });
});
