"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const statisticsService = require("../../../../modules/industrial-records/services/industrialStatistics.service");

// Mêmes rôles que list_industrial_records ; même périmètre :
// responsable_logistique_achat → uniquement ses propres fiches
// (industrialRecord.service.js::isOwnerScoped), les autres rôles autorisés → toutes.
const READ_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];
const OWNER_SCOPED_ROLES = new Set(["responsable_logistique_achat"]);

// Analytique des fiches industrielles (PROBAR ASSISTANT), en LECTURE SEULE.
function createGetIndustrialStatisticsTool() {
  return new ServiceBackedTool({
    name: "get_industrial_statistics",
    description:
      "Statistiques réelles des fiches industrielles : nombre total (et quantité produite), ou répartition/classement par machine, module, opérateur, mois ou statut.",
    inputSchema: Joi.object({
      groupBy: Joi.string().valid(...statisticsService.GROUP_BY_VALUES).allow(null).optional(),
      order: Joi.string().valid("desc", "asc").optional(),
      limit: Joi.number().integer().min(1).max(50).optional(),
      module: Joi.string().valid(...statisticsService.MODULES).optional(),
      from: Joi.date().iso().optional(),
      to: Joi.date().iso().optional(),
    }),
    requiredRoles: READ_ROLES,
    run: async (input, { actingUser }) =>
      statisticsService.getIndustrialStatistics(input || {}, { createdBy: OWNER_SCOPED_ROLES.has(actingUser.role) ? actingUser.id : null }),
  });
}

module.exports = { createGetIndustrialStatisticsTool };
