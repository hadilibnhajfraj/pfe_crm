"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

function createGetPorPromeshDashboardTool() {
  return new ServiceBackedTool({
    name: "get_por_promesh_dashboard",
    description: "KPI du poste POR PROMESH (fiches validées/brouillon, production totale, non-conformités, opérateurs présents).",
    inputSchema: Joi.object({
      machine: Joi.string().max(50).optional(),
      poste: Joi.string().valid("matin", "nuit").optional(),
      date: Joi.date().iso().optional(),
    }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => porPromeshService.getDashboard(actingUser, input),
  });
}

module.exports = { createGetPorPromeshDashboardTool };
