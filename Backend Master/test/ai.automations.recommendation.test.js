"use strict";

const { createRecommendationAutomation, DEFAULT_RULES } = require("../src/ai/automations/recommendationAutomation");

const USER = { id: "u1", role: "user" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("RecommendationAutomation", () => {
  test("DEFAULT_RULES reads maintenance requests, never mutates anything", () => {
    expect(DEFAULT_RULES).toHaveLength(1);
    expect(DEFAULT_RULES[0].listToolName).toBe("list_all_maintenance_requests");
  });

  test("is read-only: never calls anything but a list Tool, even when it finds a recommendation", async () => {
    const listTool = tool("list_all_maintenance_requests", async () => [{ id: "MR-1", title: "Panne", statut: "en_attente", urgence: "critique" }]);
    const automation = createRecommendationAutomation({
      tools: [listTool],
      rules: [{ listToolName: "list_all_maintenance_requests", evaluate: (item) => (item.urgence === "critique" ? { message: `${item.title} est critique` } : null) }],
    });

    const result = await automation.run({ actingUser: USER });

    expect(result.actions).toEqual([{ rule: "list_all_maintenance_requests", item: { id: "MR-1", title: "Panne", statut: "en_attente", urgence: "critique" }, recommendation: { message: "Panne est critique" } }]);
  });

  test("evaluate() returning null/falsy produces no recommendation for that item", async () => {
    const listTool = tool("list_all_maintenance_requests", async () => [{ id: "MR-1", urgence: "faible" }]);
    const automation = createRecommendationAutomation({
      tools: [listTool],
      rules: [{ listToolName: "list_all_maintenance_requests", evaluate: (item) => (item.urgence === "critique" ? { message: "x" } : null) }],
    });

    const result = await automation.run({ actingUser: USER });
    expect(result.actions).toEqual([]);
    expect(result.success).toBe(true);
  });

  test("multiple rules run independently — one rule's list failure doesn't block the others", async () => {
    const failingList = tool("list_all_maintenance_requests", async () => {
      throw new Error("timeout");
    });
    const okList = tool("list_hr_requests", async () => [{ id: "HR-1", type: "conge" }]);
    const automation = createRecommendationAutomation({
      tools: [failingList, okList],
      rules: [
        { listToolName: "list_all_maintenance_requests", evaluate: () => ({ message: "x" }) },
        { listToolName: "list_hr_requests", evaluate: (item) => ({ message: `Suivre ${item.type}` }) },
      ],
    });

    const result = await automation.run({ actingUser: USER });
    expect(result.errors).toEqual([{ rule: "list_all_maintenance_requests", message: "timeout" }]);
    expect(result.actions).toHaveLength(1);
  });
});
