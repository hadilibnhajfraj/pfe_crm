"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const kpiService = require("../../../../modules/commercial-contacts/services/commercialContactKpi.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls modules/commercial-contacts/services/commercialContactKpi.service.js
// exclusively. Variante "analytics" (badges, taux de validation, %),
// distincte de get_commercial_contact_kpi.
function createGetCommercialContactAnalyticsTool() {
  return new ServiceBackedTool({
    name: "get_commercial_contact_analytics",
    description: "Analytics enrichies des contacts commerciaux (badges, taux de validation, distributions en %).",
    inputSchema: Joi.object({}),
    requiredRoles: ["commercial_sedentaire", ...ADMIN_TIER_ROLES],
    run: async (_input, { actingUser }) =>
      ADMIN_TIER_ROLES.includes(actingUser.role)
        ? kpiService.getCommercialContactAnalytics(null)
        : kpiService.getCommercialContactAnalytics(actingUser.id),
  });
}

module.exports = { createGetCommercialContactAnalyticsTool };
