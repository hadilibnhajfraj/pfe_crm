"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

function createListPorPromeshOperatorsTool() {
  return new ServiceBackedTool({
    name: "list_por_promesh_operators",
    description: "Liste les utilisateurs opérateurs éligibles pour une fiche POR PROMESH.",
    inputSchema: Joi.object({}),
    requiredRoles: READ_WRITE_ROLES,
    run: async () => porPromeshService.listOperators(),
  });
}

module.exports = { createListPorPromeshOperatorsTool };
