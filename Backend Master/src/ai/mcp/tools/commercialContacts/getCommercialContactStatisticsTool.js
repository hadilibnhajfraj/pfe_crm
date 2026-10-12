"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const statisticsService = require("../../../../modules/commercial-contacts/services/commercialContactStatistics.service");

const ADMIN_TIER_ROLES = new Set(["admin", "superadmin", "superadmin2"]);

// Analytique contacts commerciaux et relances (PROBAR ASSISTANT), en LECTURE
// SEULE. Mêmes rôles que get_my_commercial_contacts ; même périmètre :
// rôles admin-tier → tous les contacts, sinon uniquement les contacts créés
// par l'utilisateur authentifié (les relances suivent leur contact).
function createGetCommercialContactStatisticsTool() {
  return new ServiceBackedTool({
    name: "get_commercial_contact_statistics",
    description:
      "Statistiques réelles des contacts commerciaux et des relances : totaux, répartition/classement par commercial, statut ou mois, contacts jamais relancés.",
    inputSchema: Joi.object({
      metric: Joi.string().valid(...statisticsService.METRICS).required(),
      groupBy: Joi.string().valid(...statisticsService.GROUP_BY_VALUES).allow(null).optional(),
      order: Joi.string().valid("desc", "asc").optional(),
      limit: Joi.number().integer().min(1).max(50).optional(),
      mine: Joi.boolean().optional(),
      from: Joi.date().iso().optional(),
      to: Joi.date().iso().optional(),
    }),
    requiredRoles: ["commercial_sedentaire", ...ADMIN_TIER_ROLES],
    run: async (input, { actingUser }) => {
      const { mine, ...query } = input;
      const isAdmin = ADMIN_TIER_ROLES.has(actingUser.role);
      return statisticsService.getCommercialContactStatistics(query, { userId: !isAdmin || mine ? actingUser.id : null });
    },
  });
}

module.exports = { createGetCommercialContactStatisticsTool };
