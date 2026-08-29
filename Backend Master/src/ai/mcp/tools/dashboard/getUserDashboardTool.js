"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const dashboardService = require("../../../../modules/dashboard/services/dashboard.service");

// GET /dashboard/user — volontairement SANS kpiRoleGuard côté route (c'est
// le dashboard personnel de l'utilisateur) : ce Tool reste ouvert de la
// même façon.
function createGetUserDashboardTool() {
  return new ServiceBackedTool({
    name: "get_user_dashboard",
    description: "Tableau de bord personnel (cartes cliquables, répartition famille/diamètre) de l'utilisateur courant.",
    inputSchema: Joi.object({}),
    requiredRoles: [],
    run: async (_input, { actingUser }) => dashboardService.getUserDashboard(actingUser.id),
  });
}

module.exports = { createGetUserDashboardTool };
