"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

function createGetPorPromeshStatsTool() {
  return new ServiceBackedTool({
    name: "get_por_promesh_stats",
    description: "Agrégats POR PROMESH (production par heure, conformité, production des 7 derniers jours).",
    inputSchema: Joi.object({
      machine: Joi.string().max(50).optional(),
      poste: Joi.string().valid("matin", "nuit").optional(),
      date: Joi.date().iso().optional(),
    }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => porPromeshService.getStats(actingUser, input),
  });
}

module.exports = { createGetPorPromeshStatsTool };
