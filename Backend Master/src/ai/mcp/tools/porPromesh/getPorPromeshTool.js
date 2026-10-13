"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

function createGetPorPromeshTool() {
  return new ServiceBackedTool({
    name: "get_por_promesh",
    description: "Récupère une fiche POR PROMESH complète par identifiant.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => porPromeshService.getPorPromeshById(input.id, actingUser),
  });
}

module.exports = { createGetPorPromeshTool };
