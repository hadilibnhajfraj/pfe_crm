"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const kpiService = require("../../../../modules/commercial-contacts/services/commercialContactKpi.service");

// Same admin-tier vocabulary used across the backend's requireRole/
// kpiRoleGuard checks (see e.g. modules/dashboard) — not a new role concept.
const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls modules/commercial-contacts/services/commercialContactKpi.service.js
// exclusively. getCommercialContactKPI(null) already means "no userId
// filter = global" in that service; getMyKPI(userId) is the per-commercial
// variant — this tool only picks which existing function to call, it does
// not aggregate or filter data itself.
function createGetCommercialContactKpiTool() {
  return new ServiceBackedTool({
    name: "get_commercial_contact_kpi",
    description:
      "KPI des contacts commerciaux : globaux pour un rôle admin-tier, personnels (les siens) pour un commercial.",
    inputSchema: Joi.object({}),
    requiredRoles: ["commercial_sedentaire", ...ADMIN_TIER_ROLES],
    run: async (_input, { actingUser }) => {
      return ADMIN_TIER_ROLES.includes(actingUser.role)
        ? kpiService.getCommercialContactKPI(null)
        : kpiService.getMyKPI(actingUser.id);
    },
  });
}

module.exports = { createGetCommercialContactKpiTool };
