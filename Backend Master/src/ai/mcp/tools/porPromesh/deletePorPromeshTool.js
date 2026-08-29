"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const DELETE_ROLES = ["admin", "superadmin", "superadmin2"];

// deletePorPromesh() refuse déjà (403) la suppression d'une fiche
// verrouillée (isLocked=true) — non dupliqué ici.
function createDeletePorPromeshTool() {
  return new ServiceBackedTool({
    name: "delete_por_promesh",
    description: "Supprime une fiche POR PROMESH non verrouillée.",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: DELETE_ROLES,
    run: async (input, { actingUser }) => porPromeshService.deletePorPromesh(input.id, actingUser),
  });
}

module.exports = { createDeletePorPromeshTool };
