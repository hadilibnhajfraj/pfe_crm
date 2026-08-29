"use strict";

const { defaultAnalyzerFactories, createDefaultAnalyzers } = require("../src/ai/dashboard/manifest");

describe("dashboard/manifest", () => {
  test("declares exactly the 7 requested domain analyzers", () => {
    expect(defaultAnalyzerFactories).toHaveLength(7);
  });

  test("createDefaultAnalyzers builds all 7, keyed by their own .domain, with no collisions", () => {
    const analyzers = createDefaultAnalyzers({ tools: [] });
    expect(analyzers.size).toBe(7);
    expect([...analyzers.keys()].sort()).toEqual(["projects", "pipeline", "sales", "maintenance", "hr", "industrial", "kpi"].sort());
  });

  test("every analyzer instance is retrievable and runnable via the returned Map", async () => {
    const analyzers = createDefaultAnalyzers({ tools: [] });
    const projects = analyzers.get("projects");
    expect(projects).toBeDefined();
    const result = await projects.analyze({ actingUser: { id: "a1", role: "admin" } });
    expect(result.domain).toBe("projects");
  });
});
