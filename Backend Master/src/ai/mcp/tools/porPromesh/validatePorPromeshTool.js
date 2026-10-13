"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

// Action irréversible côté données (verrouillage définitif isLocked=true),
// mais reste une opération métier normale déjà accessible à
// responsable_logistique_achat sur ses propres fiches via la route HTTP —
// ce Tool ne fait qu'exposer exactement la même capacité, sans l'élargir.
function createValidatePorPromeshTool() {
  return new ServiceBackedTool({
    name: "validate_por_promesh",
    description: "Valide définitivement une fiche POR PROMESH (verrouillage irréversible : status=VALIDE, isLocked=true).",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => porPromeshService.validatePorPromesh(input.id, actingUser),
  });
}

module.exports = { createValidatePorPromeshTool };
