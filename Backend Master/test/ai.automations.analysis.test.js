"use strict";

const { createAnalysisAutomation, DEFAULT_SOURCES } = require("../src/ai/automations/analysisAutomation");

const USER = { id: "u1", role: "user" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("AnalysisAutomation", () => {
  test("DEFAULT_SOURCES reuses the same read-only Tools as KPIAgent/ReportingAgent", () => {
    expect(DEFAULT_SOURCES).toEqual(["get_dashboard_kpis", "get_maintenance_stats", "get_commercial_contact_analytics", "get_por_promesh_dashboard"]);
  });

  test("is open to any authenticated user (each source's own Tool enforces its own permission)", async () => {
    const automation = createAnalysisAutomation({ tools: DEFAULT_SOURCES.map((name) => tool(name, async () => ({}))) });
    await expect(automation.run({ actingUser: USER })).resolves.toMatchObject({ success: true });
  });

  test("calls every configured source and collects its output", async () => {
    const tools = [tool("get_dashboard_kpis", async () => ({ total: 42 })), tool("get_maintenance_stats", async () => ({ pending: 3 }))];
    const automation = createAnalysisAutomation({ tools, sources: ["get_dashboard_kpis", "get_maintenance_stats"] });

    const result = await automation.run({ actingUser: USER });

    expect(result.actions).toEqual([
      { source: "get_dashboard_kpis", output: { total: 42 } },
      { source: "get_maintenance_stats", output: { pending: 3 } },
    ]);
  });

  test("a source the actingUser can't access (Tool throws) is reported without blocking the others", async () => {
    const failingTool = tool("get_maintenance_stats", async () => {
      throw new Error("Role \"user\" is not allowed to call tool \"get_maintenance_stats\".");
    });
    const okTool = tool("get_dashboard_kpis", async () => ({ total: 1 }));
    const automation = createAnalysisAutomation({ tools: [failingTool, okTool], sources: ["get_maintenance_stats", "get_dashboard_kpis"] });

    const result = await automation.run({ actingUser: USER });
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ source: "get_maintenance_stats", message: expect.stringContaining("not allowed") }]);
    expect(result.actions).toEqual([{ source: "get_dashboard_kpis", output: { total: 1 } }]);
  });

  test("run({sources}) selects a subset of the allowed sources for that one call", async () => {
    const tools = [tool("get_dashboard_kpis", async () => ({ total: 1 })), tool("get_por_promesh_dashboard", async () => ({ validated: 2 }))];
    const automation = createAnalysisAutomation({ tools, sources: ["get_dashboard_kpis", "get_por_promesh_dashboard"] });

    const result = await automation.run({ actingUser: USER, sources: ["get_por_promesh_dashboard"] });
    expect(result.actions).toEqual([{ source: "get_por_promesh_dashboard", output: { validated: 2 } }]);
  });

  test("run({sources}) cannot escape the construction-time whitelist (outils autorisés)", async () => {
    const tools = [tool("get_dashboard_kpis", async () => ({ total: 1 })), tool("get_por_promesh_dashboard", async () => ({ validated: 2 }))];
    const automation = createAnalysisAutomation({ tools, sources: ["get_dashboard_kpis"] });

    const result = await automation.run({ actingUser: USER, sources: ["get_por_promesh_dashboard"] });
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toMatch(/not allowed to call Tool/);
  });
});
