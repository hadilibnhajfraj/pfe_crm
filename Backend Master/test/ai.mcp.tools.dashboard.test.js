"use strict";

jest.mock("../src/modules/dashboard/services/dashboard.service", () => ({
  getKPIs: jest.fn(),
  getKPIByRole: jest.fn(),
  getProfessionalKPIs: jest.fn(),
  getUserDashboard: jest.fn(),
}));

const dashboardService = require("../src/modules/dashboard/services/dashboard.service");
const {
  createGetDashboardKpisTool,
  createGetLegacyDashboardKpisTool,
  createGetProfessionalDashboardTool,
  createGetUserDashboardTool,
} = require("../src/ai/mcp/tools/dashboard");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];
const ADMIN = { id: "a1", role: "admin" };
const USER = { id: "u1", role: "user" };

beforeEach(() => jest.clearAllMocks());

test("get_dashboard_kpis: open to any role, calls getKPIByRole(id, role)", async () => {
  dashboardService.getKPIByRole.mockResolvedValue({});
  const tool = createGetDashboardKpisTool();
  expect(tool.requiredRoles).toEqual([]);
  await tool.execute({}, { actingUser: USER });
  expect(dashboardService.getKPIByRole).toHaveBeenCalledWith("u1", "user");
});

test("get_legacy_dashboard_kpis: admin-tier only, calls getKPIs(id, role)", async () => {
  dashboardService.getKPIs.mockResolvedValue({});
  const tool = createGetLegacyDashboardKpisTool();
  expect(tool.requiredRoles).toEqual(ADMIN_TIER_ROLES);
  await tool.execute({}, { actingUser: ADMIN });
  expect(dashboardService.getKPIs).toHaveBeenCalledWith("a1", "admin");
});

test("get_professional_dashboard: admin-tier only, calls getProfessionalKPIs(id, role)", async () => {
  dashboardService.getProfessionalKPIs.mockResolvedValue({});
  const tool = createGetProfessionalDashboardTool();
  expect(tool.requiredRoles).toEqual(ADMIN_TIER_ROLES);
  await tool.execute({}, { actingUser: ADMIN });
  expect(dashboardService.getProfessionalKPIs).toHaveBeenCalledWith("a1", "admin");
});

test("get_user_dashboard: open to any role (personal dashboard), calls getUserDashboard(id)", async () => {
  dashboardService.getUserDashboard.mockResolvedValue({});
  const tool = createGetUserDashboardTool();
  expect(tool.requiredRoles).toEqual([]);
  await tool.execute({}, { actingUser: USER });
  expect(dashboardService.getUserDashboard).toHaveBeenCalledWith("u1");
});
