"use strict";

const { createProjectsAnalyzer, DEFAULT_DATA_SOURCES: PROJECTS_SOURCES } = require("../src/ai/dashboard/projectsAnalyzer");
const { createPipelineAnalyzer, DEFAULT_DATA_SOURCES: PIPELINE_SOURCES } = require("../src/ai/dashboard/pipelineAnalyzer");
const { createSalesAnalyzer, DEFAULT_DATA_SOURCES: SALES_SOURCES } = require("../src/ai/dashboard/salesAnalyzer");
const { createMaintenanceAnalyzer, DEFAULT_DATA_SOURCES: MAINTENANCE_SOURCES } = require("../src/ai/dashboard/maintenanceAnalyzer");
const { createHrAnalyzer, DEFAULT_DATA_SOURCES: HR_SOURCES } = require("../src/ai/dashboard/hrAnalyzer");
const { createIndustrialAnalyzer, DEFAULT_DATA_SOURCES: INDUSTRIAL_SOURCES } = require("../src/ai/dashboard/industrialAnalyzer");
const { createKpiAnalyzer, DEFAULT_DATA_SOURCES: KPI_SOURCES } = require("../src/ai/dashboard/kpiAnalyzer");
const { DashboardPermissionError } = require("../src/ai/dashboard/errors");

const ADMIN = { id: "a1", role: "admin" };
const USER = { id: "u1", role: "user" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("ProjectsAnalyzer", () => {
  test("domain is 'projects' and default dataSources point at list_projects", () => {
    const analyzer = createProjectsAnalyzer({});
    expect(analyzer.domain).toBe("projects");
    expect(PROJECTS_SOURCES).toEqual([{ key: "projects", listToolName: "list_projects" }]);
  });

  test("flags unowned projects as a risk and a data-quality issue when a required field is missing", async () => {
    const listTool = tool("list_projects", async () => [{ id: "p1", name: "Site X", ownerId: "u1", stage: "Négo" }, { id: "p2", name: null, ownerId: null, stage: "Négo" }]);
    const analyzer = createProjectsAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.risks).toEqual([{ domain: "projects", type: "unowned_project", projectId: "p2", message: expect.stringContaining("p2") }]);
    expect(result.dataQuality).toHaveLength(1);
  });

  test("forecasts a completion_rate_estimate based on final-stage keyword matching", async () => {
    const listTool = tool("list_projects", async () => [{ id: "p1", name: "A", ownerId: "u1", stage: "Terminé" }, { id: "p2", name: "B", ownerId: "u1", stage: "Négo" }]);
    const analyzer = createProjectsAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.forecasts[0]).toMatchObject({ domain: "projects", type: "completion_rate_estimate", value: 0.5 });
  });
});

describe("PipelineAnalyzer", () => {
  test("domain is 'pipeline' and default dataSources point at list_pipeline_stages", () => {
    expect(createPipelineAnalyzer({}).domain).toBe("pipeline");
    expect(PIPELINE_SOURCES).toEqual([{ key: "stages", listToolName: "list_pipeline_stages" }]);
  });

  test("flags stages sharing the same order as an anomaly and recommends reordering", async () => {
    const listTool = tool("list_pipeline_stages", async () => [{ id: "s1", name: "Prospection", order: 1 }, { id: "s2", name: "Négo", order: 1 }]);
    const analyzer = createPipelineAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.anomalies).toEqual([{ domain: "pipeline", type: "duplicate_stage_order", order: 1, message: expect.any(String) }]);
    expect(result.recommendations).toHaveLength(1);
  });

  test("no anomaly when every stage has a distinct order", async () => {
    const listTool = tool("list_pipeline_stages", async () => [{ id: "s1", name: "A", order: 1 }, { id: "s2", name: "B", order: 2 }]);
    const analyzer = createPipelineAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.anomalies).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });
});

describe("SalesAnalyzer", () => {
  test("domain is 'sales', restricted to commercial/admin-tier roles (matches the underlying Tools)", async () => {
    const analyzer = createSalesAnalyzer({});
    expect(analyzer.domain).toBe("sales");
    expect(analyzer.requiredRoles).toEqual(["commercial", "admin", "superadmin", "superadmin2"]);
    await expect(analyzer.analyze({ actingUser: USER })).rejects.toThrow(DashboardPermissionError);
  });

  test("alerts and recommends when the extracted score is below the configured threshold", async () => {
    const kpiTool = tool("get_commercial_contact_kpi", async () => ({ score: 0.1 }));
    const analyticsTool = tool("get_commercial_contact_analytics", async () => ({ calls: 5 }));
    const analyzer = createSalesAnalyzer({ tools: [kpiTool, analyticsTool], lowScoreThreshold: 0.3 });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.alerts).toHaveLength(1);
    expect(result.recommendations).toHaveLength(1);
  });

  test("flags negative analytics values as anomalies", async () => {
    const kpiTool = tool("get_commercial_contact_kpi", async () => ({ score: 0.9 }));
    const analyticsTool = tool("get_commercial_contact_analytics", async () => ({ conversions: -2, calls: 5 }));
    const analyzer = createSalesAnalyzer({ tools: [kpiTool, analyticsTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.anomalies).toEqual([{ domain: "sales", type: "negative_metric", metric: "conversions", value: -2, message: expect.any(String) }]);
    expect(result.alerts).toEqual([]);
  });
});

describe("MaintenanceAnalyzer", () => {
  test("domain is 'maintenance' and default dataSources point at list_all_maintenance_requests", () => {
    expect(createMaintenanceAnalyzer({}).domain).toBe("maintenance");
    expect(MAINTENANCE_SOURCES).toEqual([{ key: "requests", listToolName: "list_all_maintenance_requests", listInput: {} }]);
  });

  test("alerts and recommends reassignment for critical pending requests", async () => {
    const listTool = tool("list_all_maintenance_requests", async () => [
      { id: "m1", urgence: "critique", statut: "en_attente", title: "Panne" },
      { id: "m2", urgence: "faible", statut: "en_attente" },
    ]);
    const analyzer = createMaintenanceAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.alerts).toEqual([{ domain: "maintenance", type: "critical_pending_maintenance", requestId: "m1", message: expect.stringContaining("Panne") }]);
    expect(result.recommendations).toHaveLength(1);
  });

  test("raises a backlog risk once the pending count exceeds the configured threshold", async () => {
    const listTool = tool("list_all_maintenance_requests", async () => Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, statut: "en_attente", urgence: "faible" })));
    const analyzer = createMaintenanceAnalyzer({ tools: [listTool], pendingBacklogThreshold: 2 });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.risks).toEqual([{ domain: "maintenance", type: "maintenance_backlog", count: 3, message: expect.any(String) }]);
  });

  test("forecasts a backlog_ratio_estimate from the pending/total ratio", async () => {
    const listTool = tool("list_all_maintenance_requests", async () => [{ id: "m1", statut: "en_attente" }, { id: "m2", statut: "terminee" }]);
    const analyzer = createMaintenanceAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.forecasts[0]).toMatchObject({ metric: "pending_ratio", value: 0.5 });
  });
});

describe("HrAnalyzer", () => {
  test("domain is 'hr' and default dataSources point at list_hr_requests", () => {
    expect(createHrAnalyzer({}).domain).toBe("hr");
    expect(HR_SOURCES).toEqual([{ key: "requests", listToolName: "list_hr_requests", listInput: {} }]);
  });

  test("alerts once pending requests exceed the configured threshold", async () => {
    const listTool = tool("list_hr_requests", async () => Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, type: "conge", statut: "en_attente" })));
    const analyzer = createHrAnalyzer({ tools: [listTool], pendingAlertThreshold: 5 });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.alerts).toEqual([{ domain: "hr", type: "hr_requests_pending", count: 6, message: expect.any(String) }]);
  });

  test("flags a request missing type/statut as a data-quality issue", async () => {
    const listTool = tool("list_hr_requests", async () => [{ id: "h1", type: null, statut: "en_attente" }]);
    const analyzer = createHrAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.dataQuality).toEqual([{ domain: "hr", type: "missing_field", requestId: "h1", message: expect.any(String) }]);
  });
});

describe("IndustrialAnalyzer", () => {
  test("domain is 'industrial', restricted to READ_WRITE_ROLES (matches the underlying Tools)", async () => {
    const analyzer = createIndustrialAnalyzer({});
    expect(analyzer.domain).toBe("industrial");
    expect(analyzer.requiredRoles).toEqual(["admin", "superadmin", "superadmin2", "responsable_logistique_achat"]);
    await expect(analyzer.analyze({ actingUser: USER })).rejects.toThrow(DashboardPermissionError);
    expect(INDUSTRIAL_SOURCES).toEqual([{ key: "records", listToolName: "list_industrial_records", listInput: {} }]);
  });

  test("flags a record missing a required field as both a data-quality issue and a reliability risk", async () => {
    const listTool = tool("list_industrial_records", async () => [{ id: "i1", reference: null, quantity: 10 }]);
    const analyzer = createIndustrialAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.dataQuality).toHaveLength(1);
    expect(result.risks).toEqual([{ domain: "industrial", type: "unreliable_industrial_data", count: 1, message: expect.any(String) }]);
  });

  test("flags a statistically outlying quantity as an anomaly", async () => {
    const records = [
      { id: "i1", reference: "r1", quantity: 10 }, { id: "i2", reference: "r2", quantity: 10 }, { id: "i3", reference: "r3", quantity: 10 },
      { id: "i4", reference: "r4", quantity: 10 }, { id: "i5", reference: "r5", quantity: 10 }, { id: "i6", reference: "r6", quantity: 10 },
      { id: "outlier", reference: "r7", quantity: 100 },
    ];
    const listTool = tool("list_industrial_records", async () => records);
    const analyzer = createIndustrialAnalyzer({ tools: [listTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.anomalies).toEqual([{ domain: "industrial", type: "quantity_outlier", recordId: "outlier", value: 100, zScore: expect.any(Number), message: expect.any(String) }]);
  });
});

describe("KpiAnalyzer", () => {
  test("domain is 'kpi' and default dataSources point at get_dashboard_kpis/get_por_promesh_dashboard", () => {
    expect(createKpiAnalyzer({}).domain).toBe("kpi");
    expect(KPI_SOURCES).toEqual([
      { key: "dashboard", listToolName: "get_dashboard_kpis" },
      { key: "porPromesh", listToolName: "get_por_promesh_dashboard" },
    ]);
  });

  test("alerts when the extracted KPI total is below the configured threshold", async () => {
    const dashboardTool = tool("get_dashboard_kpis", async () => ({ total: 0 }));
    const porPromeshTool = tool("get_por_promesh_dashboard", async () => ({}));
    const analyzer = createKpiAnalyzer({ tools: [dashboardTool, porPromeshTool], minTotalThreshold: 1 });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.alerts).toEqual([{ domain: "kpi", type: "low_kpi_volume", metric: "total", value: 0, message: expect.any(String) }]);
  });

  test("forecasts a validation_rate_estimate and recommends a review when it's below half", async () => {
    const dashboardTool = tool("get_dashboard_kpis", async () => ({ total: 10 }));
    const porPromeshTool = tool("get_por_promesh_dashboard", async () => ({ validated: 2, draft: 8 }));
    const analyzer = createKpiAnalyzer({ tools: [dashboardTool, porPromeshTool] });
    const result = await analyzer.analyze({ actingUser: ADMIN });
    expect(result.forecasts[0]).toMatchObject({ metric: "por_promesh_validation_rate", value: 0.2 });
    expect(result.recommendations).toHaveLength(1);
  });
});
