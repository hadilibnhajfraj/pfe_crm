"use strict";

// get_professional_dashboard : tableau de bord COMMERCIAL consolidé (projets,
// pipeline) — réservé aux administrateurs, comme GET /dashboard/professional.
// Vérifié au niveau du VRAI serveur d'outils (PermissionManager).

jest.mock("../src/modules/dashboard/services/dashboard.service", () => ({ getProfessionalKPIs: jest.fn(async () => ({ pipeline: [], alerts: {} })) }));
const dashboardService = require("../src/modules/dashboard/services/dashboard.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const { createGetProfessionalDashboardTool } = require("../src/ai/mcp/tools/dashboard/getProfessionalDashboardTool");

const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function toolFor(user) {
  const registry = new ToolRegistry();
  registry.register(createGetProfessionalDashboardTool());
  const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  return createMcpToolAdapters({ mcpServer: server, actingUser: user })[0];
}

beforeEach(() => jest.clearAllMocks());

test.each(["admin", "superadmin", "superadmin2"])("%s : autorisé, le service reçoit l'identité authentifiée", async (role) => {
  await toolFor({ id: uuid(1), role }).invoke({});
  expect(dashboardService.getProfessionalKPIs).toHaveBeenCalledWith(uuid(1), role);
});

test.each(["responsable_logistique_achat", "commercial", "commercial_sedentaire", "accueil", "inconnu"])("%s : refusé par le serveur d'outils, le service n'est jamais atteint", async (role) => {
  const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
  await expect(toolFor({ id: uuid(2), role }).invoke({})).rejects.toThrow(/not allowed to call tool/);
  spy.mockRestore();
  expect(dashboardService.getProfessionalKPIs).not.toHaveBeenCalled();
});
