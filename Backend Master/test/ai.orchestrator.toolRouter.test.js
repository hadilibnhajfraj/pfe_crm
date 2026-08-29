"use strict";

const { ToolRouter } = require("../src/ai/orchestrator/toolRouter");

function tool(name, description) {
  return { name, description, invoke: jest.fn() };
}

const TOOLS = [
  tool("list_maintenance_requests", "Liste les demandes de maintenance en cours"),
  tool("create_maintenance_request", "Crée une nouvelle demande de maintenance pour une panne"),
  tool("assign_maintenance_technician", "Affecte un technicien à une demande de maintenance"),
  tool("list_hr_requests", "Liste les demandes RH de congé"),
];

const TOOL_MODULE_INDEX = new Map([
  ["list_maintenance_requests", "maintenance"],
  ["create_maintenance_request", "maintenance"],
  ["assign_maintenance_technician", "maintenance"],
  ["list_hr_requests", "hr"],
]);

describe("ToolRouter", () => {
  test("returns [] when the intent does not require tools", () => {
    const router = new ToolRouter({ tools: TOOLS, toolModuleIndex: TOOL_MODULE_INDEX });
    expect(router.select({ requiresTools: false, moduleKey: null }, "peu importe")).toEqual([]);
  });

  test("returns [] when no tool exists for the intent's module", () => {
    const router = new ToolRouter({ tools: TOOLS, toolModuleIndex: TOOL_MODULE_INDEX });
    expect(router.select({ requiresTools: true, moduleKey: "dashboard" }, "les kpis")).toEqual([]);
  });

  test("restricts candidates to the intent's module — never leaks a tool from another module", () => {
    const router = new ToolRouter({ tools: TOOLS, toolModuleIndex: TOOL_MODULE_INDEX, maxTools: 10 });
    const selected = router.select({ requiresTools: true, moduleKey: "maintenance" }, "panne technicien");
    expect(selected.map((t) => t.name).sort()).toEqual(
      ["assign_maintenance_technician", "create_maintenance_request", "list_maintenance_requests"].sort()
    );
    expect(selected.find((t) => t.name === "list_hr_requests")).toBeUndefined();
  });

  test("ranks candidates by lexical overlap with the message and truncates to maxTools", () => {
    const router = new ToolRouter({ tools: TOOLS, toolModuleIndex: TOOL_MODULE_INDEX, maxTools: 1 });
    const selected = router.select({ requiresTools: true, moduleKey: "maintenance" }, "il faut affecter un technicien à cette panne");
    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe("assign_maintenance_technician");
  });

  test("falls back to the module's own candidate order when nothing scores above zero", () => {
    const router = new ToolRouter({ tools: TOOLS, toolModuleIndex: TOOL_MODULE_INDEX, maxTools: 2 });
    const selected = router.select({ requiresTools: true, moduleKey: "maintenance" }, "xyzxyz");
    expect(selected.map((t) => t.name)).toEqual(["list_maintenance_requests", "create_maintenance_request"]);
  });

  test("without a moduleKey (e.g. a generic tool-requiring intent), candidates are the full tool list", () => {
    const router = new ToolRouter({ tools: TOOLS, toolModuleIndex: TOOL_MODULE_INDEX, maxTools: 10 });
    const selected = router.select({ requiresTools: true, moduleKey: null }, "congé");
    expect(selected.map((t) => t.name)).toContain("list_hr_requests");
  });
});

describe("ToolRouter — sélection cross-module via relatedModules (« Quels projets sont en retard ? »)", () => {
  const CROSS_MODULE_TOOLS = [
    tool("list_projects", "Liste les projets (pipeline/kanban) avec statistiques globales"),
    tool("move_project_stage", "Change l'étape d'un projet dans le pipeline"),
    tool("get_dashboard_kpis", "Indicateurs clés de performance : retard, avancement des projets"),
    tool("list_hr_requests", "Liste les demandes RH de congé"),
  ];
  const CROSS_MODULE_INDEX = new Map([
    ["list_projects", "projects"],
    ["move_project_stage", "projects"],
    ["get_dashboard_kpis", "dashboard"],
    ["list_hr_requests", "hr"],
  ]);

  test("une intention 'projects' SANS relatedModules ne fait jamais remonter un Tool 'dashboard' (comportement inchangé)", () => {
    const router = new ToolRouter({ tools: CROSS_MODULE_TOOLS, toolModuleIndex: CROSS_MODULE_INDEX, maxTools: 10 });
    const selected = router.select({ requiresTools: true, moduleKey: "projects" }, "quels projets sont en retard ?");
    expect(selected.map((t) => t.name)).not.toContain("get_dashboard_kpis");
  });

  test("une intention 'projects' AVEC relatedModules: ['dashboard'] sélectionne des Tools des DEUX modules pour une seule question", () => {
    const router = new ToolRouter({ tools: CROSS_MODULE_TOOLS, toolModuleIndex: CROSS_MODULE_INDEX, maxTools: 10 });
    const selected = router.select(
      { requiresTools: true, moduleKey: "projects", relatedModules: ["dashboard"] },
      "quels projets sont en retard ?"
    );
    const names = selected.map((t) => t.name);
    expect(names).toContain("list_projects");
    expect(names).toContain("get_dashboard_kpis");
    // Toujours pas de fuite vers un module non déclaré (hr).
    expect(names).not.toContain("list_hr_requests");
  });

  test("relatedModules ne fait jamais remonter un module non déclaré, même s'il matche mieux lexicalement", () => {
    const router = new ToolRouter({ tools: CROSS_MODULE_TOOLS, toolModuleIndex: CROSS_MODULE_INDEX, maxTools: 10 });
    const selected = router.select(
      { requiresTools: true, moduleKey: "projects", relatedModules: ["dashboard"] },
      "congé RH"
    );
    expect(selected.map((t) => t.name)).not.toContain("list_hr_requests");
  });
});
