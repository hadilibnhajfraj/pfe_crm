"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const dashboardService = require("../../../../modules/dashboard/services/dashboard.service");

// Calls modules/dashboard/services/dashboard.service.js exclusively — no
// model or SQL access in this file (enforced by
// test/ai.mcp.tools.policy.test.js). Role-scoping (admin-tier: every
// project; anyone else: only their own) happens inside getKPIByRole itself,
// unchanged — this tool never re-derives that scope.
function createGetDashboardKpisTool() {
  return new ServiceBackedTool({
    name: "get_dashboard_kpis",
    description:
      "Retourne les KPI du tableau de bord pour l'utilisateur courant : KPI globaux pour un rôle admin-tier, KPI personnels pour les autres rôles.",
    inputSchema: Joi.object({}),
    requiredRoles: [], // open to any authenticated actor — the service itself scopes the data
    run: async (_input, { actingUser }) => {
      return dashboardService.getKPIByRole(actingUser.id, actingUser.role);
    },
  });
}

module.exports = { createGetDashboardKpisTool };
