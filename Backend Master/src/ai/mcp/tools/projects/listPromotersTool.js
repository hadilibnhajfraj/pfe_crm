"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const crmEntityDirectory = require("../../../../modules/projects/services/crmEntityDirectory.service");
const { scopeFor } = require("./findCrmEntityTool");

// Promoteurs du CRM (PROBAR ASSISTANT), en LECTURE SEULE.
//
// Le promoteur est un champ du projet (projects.promoteur) : il n'y a pas de
// table dédiée. La liste est celle des promoteurs DISTINCTS des projets que
// l'utilisateur a le droit de voir — même périmètre que list_projects (rôles
// admin-tier : tous les projets ; tout autre rôle : uniquement les siens),
// décidé ICI à partir de `actingUser`.
//
// - operation "list"     : promoteurs (nom, nombre de projets), paginés.
// - operation "projects" : projets d'un promoteur désigné par son nom.
function createListPromotersTool() {
  return new ServiceBackedTool({
    name: "list_promoters",
    description: "Promoteurs réels du CRM : liste paginée des promoteurs renseignés sur les projets (nom, nombre de projets), ou projets d'un promoteur désigné par son nom.",
    inputSchema: Joi.object({
      operation: Joi.string().valid("list", "projects").default("list"),
      name: Joi.string().trim().min(2).max(200).when("operation", { is: "projects", then: Joi.required() }),
      limit: Joi.number().integer().min(1).max(200).optional(),
      offset: Joi.number().integer().min(0).max(100000).optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => {
      const scope = scopeFor(actingUser);
      if (input.operation === "projects") return { operation: "projects", ...(await crmEntityDirectory.findPromoterProjects(input, scope)) };
      return { operation: "list", ...(await crmEntityDirectory.listPromoters(input, scope)) };
    },
  });
}

module.exports = { createListPromotersTool };
