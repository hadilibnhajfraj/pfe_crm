"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const dashboardService = require("../../../../modules/dashboard/services/dashboard.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

function createGetProfessionalDashboardTool() {
  return new ServiceBackedTool({
    name: "get_professional_dashboard",
    description: "Tableau de bord professionnel complet (KPI consolidés) — réservé admin-tier.",
    inputSchema: Joi.object({}),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (_input, { actingUser }) => dashboardService.getProfessionalKPIs(actingUser.id, actingUser.role),
  });
}

module.exports = { createGetProfessionalDashboardTool };
