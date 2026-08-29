"use strict";

const { BaseAutomation } = require("../src/ai/automations/baseAutomation");
const { AutomationError, UnknownAutomationToolError, AutomationPermissionError, ConfigurationError } = require("../src/ai/automations/errors");

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

const USER = { id: "u1", role: "user" };
const ADMIN = { id: "a1", role: "admin" };

describe("BaseAutomation construction", () => {
  test("requires a name", () => {
    expect(() => new BaseAutomation({ allowedToolNames: ["t"] })).toThrow(ConfigurationError);
  });

  test("requires a non-empty allowedToolNames", () => {
    expect(() => new BaseAutomation({ name: "x", allowedToolNames: [] })).toThrow(ConfigurationError);
    expect(() => new BaseAutomation({ name: "x" })).toThrow(ConfigurationError);
  });
});

class TestAutomation extends BaseAutomation {
  constructor(opts) {
    super({ name: "test_automation", allowedToolNames: ["allowed_tool"], ...opts });
  }

  async _execute(context) {
    return this._impl(context);
  }
}

describe("BaseAutomation.run — permissions", () => {
  test("throws AutomationPermissionError (not swallowed) for a role outside requiredRoles", async () => {
    const automation = new TestAutomation({ requiredRoles: ["admin"] });
    automation._impl = async () => ({ actions: [], errors: [] });
    await expect(automation.run({ actingUser: USER })).rejects.toThrow(AutomationPermissionError);
  });

  test("allows an authorized role through to _execute", async () => {
    const automation = new TestAutomation({ requiredRoles: ["user"] });
    automation._impl = async () => ({ actions: [{ ok: true }], errors: [] });
    const result = await automation.run({ actingUser: USER });
    expect(result.success).toBe(true);
    expect(result.actions).toEqual([{ ok: true }]);
  });

  test("an unauthenticated actingUser is denied even with requiredRoles: []", async () => {
    const automation = new TestAutomation({});
    automation._impl = async () => ({ actions: [], errors: [] });
    await expect(automation.run({ actingUser: null })).rejects.toThrow(AutomationPermissionError);
  });
});

describe("BaseAutomation.run — result envelope", () => {
  test("resolves to {success, automation, actions, errors, startedAt, finishedAt} on the happy path", async () => {
    const automation = new TestAutomation({});
    automation._impl = async () => ({ actions: [{ a: 1 }], errors: [] });
    const result = await automation.run({ actingUser: USER });
    expect(result).toMatchObject({ success: true, automation: "test_automation", actions: [{ a: 1 }], errors: [] });
    expect(typeof result.startedAt).toBe("string");
    expect(typeof result.finishedAt).toBe("string");
  });

  test("success is false whenever _execute reports at least one error, without throwing", async () => {
    const automation = new TestAutomation({});
    automation._impl = async () => ({ actions: [], errors: [{ message: "item failed" }] });
    const result = await automation.run({ actingUser: USER });
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ message: "item failed" }]);
  });

  test("gestion des erreurs: an unexpected throw from _execute is absorbed into the errors array, never propagated", async () => {
    const automation = new TestAutomation({});
    automation._impl = async () => {
      throw new Error("bug");
    };
    const result = await automation.run({ actingUser: USER });
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  test("an AutomationError's message is preserved as-is; a bare Error's message is replaced with a generic one", async () => {
    const withAutomationError = new TestAutomation({});
    withAutomationError._impl = async () => {
      throw new AutomationError("specific, safe message");
    };
    const r1 = await withAutomationError.run({ actingUser: USER });
    expect(r1.errors[0].message).toBe("specific, safe message");

    const withBareError = new TestAutomation({});
    withBareError._impl = async () => {
      throw new TypeError("Cannot read property 'x' of undefined");
    };
    const r2 = await withBareError.run({ actingUser: USER });
    expect(r2.errors[0].message).toBe("Unexpected automation failure.");
  });
});

describe("BaseAutomation._callTool", () => {
  test("parses the Tool's JSON string response", async () => {
    const automation = new TestAutomation({ tools: [tool("allowed_tool", async () => ({ x: 1 }))] });
    await expect(automation._callTool("allowed_tool", {})).resolves.toEqual({ x: 1 });
  });

  test("throws UnknownAutomationToolError for a Tool outside allowedToolNames", async () => {
    const automation = new TestAutomation({ tools: [tool("allowed_tool", async () => ({}))] });
    await expect(automation._callTool("some_other_tool", {})).rejects.toThrow(UnknownAutomationToolError);
  });

  test("throws UnknownAutomationToolError when the allowed Tool wasn't actually supplied", async () => {
    const automation = new TestAutomation({ tools: [] });
    await expect(automation._callTool("allowed_tool", {})).rejects.toThrow(UnknownAutomationToolError);
  });

  test("forwards the input to tool.invoke", async () => {
    const t = tool("allowed_tool", async (input) => ({ echoed: input }));
    const automation = new TestAutomation({ tools: [t] });
    await automation._callTool("allowed_tool", { a: 1 });
    expect(t.invoke).toHaveBeenCalledWith({ a: 1 });
  });
});
