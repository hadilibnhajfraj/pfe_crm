"use strict";

const { createDataQualityAutomation, DEFAULT_CHECKS } = require("../src/ai/automations/dataQualityAutomation");
const { AutomationPermissionError } = require("../src/ai/automations/errors");

const ADMIN = { id: "a1", role: "admin" };
const USER = { id: "u1", role: "user" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("DataQualityAutomation", () => {
  test("is restricted to admin-tier roles by default (list_users itself requires admin-tier)", async () => {
    const automation = createDataQualityAutomation({ tools: [tool("list_users", async () => [])] });
    await expect(automation.run({ actingUser: USER })).rejects.toThrow(AutomationPermissionError);
  });

  test("DEFAULT_CHECKS flags an active user with no role", async () => {
    const listTool = tool("list_users", async () => [
      { id: "u1", active: true, role: "user" },
      { id: "u2", active: true, role: null },
      { id: "u3", active: false, role: null },
    ]);
    const automation = createDataQualityAutomation({ tools: [listTool], checks: DEFAULT_CHECKS });

    const result = await automation.run({ actingUser: ADMIN });

    expect(result.actions).toEqual([{ check: "list_users", issue: { type: "missing_role", userId: "u2", message: expect.stringContaining("u2") } }]);
  });

  test("findIssues receives the FULL list at once (useful for duplicate detection)", async () => {
    const listTool = tool("list_users", async () => [{ id: "u1", email: "a@x.com" }, { id: "u2", email: "a@x.com" }]);
    const findDuplicates = jest.fn((items) => {
      const byEmail = new Map();
      for (const item of items) byEmail.set(item.email, (byEmail.get(item.email) || 0) + 1);
      return [...byEmail.entries()].filter(([, count]) => count > 1).map(([email]) => ({ type: "duplicate_email", email }));
    });
    const automation = createDataQualityAutomation({ tools: [listTool], checks: [{ listToolName: "list_users", findIssues: findDuplicates }] });

    const result = await automation.run({ actingUser: ADMIN });

    expect(findDuplicates).toHaveBeenCalledWith([{ id: "u1", email: "a@x.com" }, { id: "u2", email: "a@x.com" }]);
    expect(result.actions).toEqual([{ check: "list_users", issue: { type: "duplicate_email", email: "a@x.com" } }]);
  });

  test("a failing check's list Tool is reported without blocking other checks", async () => {
    const failingList = tool("list_users", async () => {
      throw new Error("db unavailable");
    });
    const okList = tool("list_hr_requests", async () => [{ id: "HR-1" }]);
    const automation = createDataQualityAutomation({
      tools: [failingList, okList],
      checks: [
        { listToolName: "list_users", findIssues: () => [{ type: "x" }] },
        { listToolName: "list_hr_requests", findIssues: () => [{ type: "y" }] },
      ],
    });

    const result = await automation.run({ actingUser: ADMIN });
    expect(result.errors).toEqual([{ check: "list_users", message: "db unavailable" }]);
    expect(result.actions).toEqual([{ check: "list_hr_requests", issue: { type: "y" } }]);
  });
});
