"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

function createListPorPromeshTool() {
  return new ServiceBackedTool({
    name: "list_por_promesh",
    description:
      "Liste paginée/filtrée des fiches POR PROMESH — portée limitée à ses propres fiches pour responsable_logistique_achat. " +
      "Le résultat retourné par ce Tool constitue la source de vérité pour les informations POR PROMESH : utilise les données " +
      "retournées sans les modifier, n'invente jamais un champ, n'invente jamais une fiche, ne réponds jamais comme si une " +
      "donnée existait lorsque ce Tool ne la retourne pas, conserve les valeurs numériques et les dates exactement telles que " +
      "retournées, et utilise les champs retournés pour construire une réponse métier structurée. Lorsque ce Tool retourne " +
      "plusieurs fiches, présente-les individuellement et clairement.",
    inputSchema: Joi.object({
      machine: Joi.string().max(50).optional(),
      poste: Joi.string().valid("matin", "nuit").optional(),
      date: Joi.date().iso().optional(),
      status: Joi.string().valid("BROUILLON", "VALIDE").optional(),
      search: Joi.string().max(255).optional(),
      page: Joi.number().integer().min(1).optional(),
      pageSize: Joi.number().integer().min(1).max(2000).optional(),
    }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => porPromeshService.listPorPromesh(actingUser, input),
  });
}

module.exports = { createListPorPromeshTool };
