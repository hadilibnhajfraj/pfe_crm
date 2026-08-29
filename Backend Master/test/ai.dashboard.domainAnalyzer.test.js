"use strict";

const { DomainAnalyzer, CATEGORIES } = require("../src/ai/dashboard/domainAnalyzer");
const { ConfigurationError, UnknownAnalyzerToolError, DashboardPermissionError } = require("../src/ai/dashboard/errors");

const USER = { id: "u1", role: "user" };
const ADMIN = { id: "a1", role: "admin" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("DomainAnalyzer construction", () => {
  test("requires a domain", () => {
    expect(() => new DomainAnalyzer({})).toThrow(ConfigurationError);
  });

  test("CATEGORIES lists exactly the 6 requested insight categories", () => {
    expect(CATEGORIES).toEqual(["alerts", "recommendations", "anomalies", "forecasts", "risks", "dataQuality"]);
  });
});

describe("DomainAnalyzer.analyze — permissions", () => {
  test("throws DashboardPermissionError (not swallowed) for a role outside requiredRoles", async () => {
    const analyzer = new DomainAnalyzer({ domain: "x", requiredRoles: ["admin"] });
    await expect(analyzer.analyze({ actingUser: USER })).rejects.toThrow(DashboardPermissionError);
  });

  test("allows an authorized role through", async () => {
    const analyzer = new DomainAnalyzer({ domain: "x", requiredRoles: ["user"] });
    await expect(analyzer.analyze({ actingUser: USER })).resolves.toMatchObject({ domain: "x" });
  });
});

describe("DomainAnalyzer.analyze — data fetching", () => {
  test("fetches each dataSource and makes it available to rules under its key", async () => {
    const projectsTool = tool("list_projects", async () => [{ id: "p1" }]);
    const rule = jest.fn(() => null);
    const analyzer = new DomainAnalyzer({
      domain: "projects",
      tools: [projectsTool],
      dataSources: [{ key: "projects", listToolName: "list_projects", listInput: { active: true } }],
      rules: { alerts: [rule] },
    });

    await analyzer.analyze({ actingUser: ADMIN });

    expect(projectsTool.invoke).toHaveBeenCalledWith({ active: true });
    expect(rule).toHaveBeenCalledWith({ data: { projects: [{ id: "p1" }] }, actingUser: ADMIN });
  });

  test("a failing dataSource is recorded in errors, with an empty array standing in for its data", async () => {
    const failingTool = tool("list_projects", async () => {
      throw new Error("db unavailable");
    });
    const rule = jest.fn(({ data }) => (data.projects.length === 0 ? { type: "no_data" } : null));
    const analyzer = new DomainAnalyzer({
      domain: "projects",
      tools: [failingTool],
      dataSources: [{ key: "projects", listToolName: "list_projects" }],
      rules: { alerts: [rule] },
    });

    const result = await analyzer.analyze({ actingUser: ADMIN });

    expect(result.errors).toEqual([{ source: "projects", message: "db unavailable" }]);
    expect(result.alerts).toEqual([{ domain: "projects", type: "no_data" }]);
  });

  test("_callTool refuses a Tool outside the analyzer's own dataSources", async () => {
    const analyzer = new DomainAnalyzer({ domain: "projects", tools: [tool("list_projects", async () => [])], dataSources: [{ key: "projects", listToolName: "list_projects" }] });
    await expect(analyzer._callTool("some_other_tool")).rejects.toThrow(UnknownAnalyzerToolError);
  });
});

describe("DomainAnalyzer.analyze — rule evaluation", () => {
  test("a rule returning an array contributes multiple insights, each tagged with the domain", async () => {
    const analyzer = new DomainAnalyzer({
      domain: "projects",
      dataSources: [],
      rules: { risks: [() => [{ type: "a" }, { type: "b" }]] },
    });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.risks).toEqual([{ domain: "projects", type: "a" }, { domain: "projects", type: "b" }]);
  });

  test("a rule returning null/undefined contributes nothing", async () => {
    const analyzer = new DomainAnalyzer({ domain: "projects", dataSources: [], rules: { risks: [() => null, () => undefined] } });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.risks).toEqual([]);
  });

  test("a rule that throws is recorded in errors without blocking the other rules", async () => {
    const analyzer = new DomainAnalyzer({
      domain: "projects",
      dataSources: [],
      rules: {
        risks: [
          () => {
            throw new Error("bug in rule");
          },
          () => ({ type: "ok" }),
        ],
      },
    });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.risks).toEqual([{ domain: "projects", type: "ok" }]);
    expect(result.errors).toEqual([{ category: "risks", message: "Unexpected rule failure." }]);
  });

  test("every category is present in the result, even when no rule is configured for it", async () => {
    const analyzer = new DomainAnalyzer({ domain: "projects", dataSources: [], rules: { risks: [() => ({ type: "x" })] } });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    for (const category of CATEGORIES) expect(Array.isArray(result[category])).toBe(true);
  });
});
