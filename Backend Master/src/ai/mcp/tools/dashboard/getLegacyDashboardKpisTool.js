"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const dashboardService = require("../../../../modules/dashboard/services/dashboard.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls modules/dashboard/services/dashboard.service.js exclusively.
// getKPIs() est la variante "legacy" (entonnoir pipeline + revenu), gardée
// par kpiRoleGuard côté route (admin-tier uniquement) — distincte de
// get_dashboard_kpis (getKPIByRole, ouvert à tout rôle avec portée interne).
function createGetLegacyDashboardKpisTool() {
  return new ServiceBackedTool({
    name: "get_legacy_dashboard_kpis",
    description: "KPI historiques du tableau de bord (entonnoir de vente, revenu) — réservé admin-tier.",
    inputSchema: Joi.object({}),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (_input, { actingUser }) => dashboardService.getKPIs(actingUser.id, actingUser.role),
  });
}

module.exports = { createGetLegacyDashboardKpisTool };
