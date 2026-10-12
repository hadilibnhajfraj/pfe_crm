"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const engineerDirectory = require("../../../../modules/projects/services/engineerDirectory.service");
const { ADMIN_TIER_ROLES } = require("./listProjectsTool");

// Ingénieurs du CRM (PROBAR ASSISTANT), en LECTURE SEULE.
//
// - operation "list" : même ouverture que GET /engineers/all (authRequired
//   seul, aucune restriction de rôle) et mêmes champs ({ id, name }) —
//   jamais téléphone ni e-mail, que cette route n'expose pas non plus.
// - operation "of_project" : ingénieur d'un projet désigné par son nom, dans
//   le périmètre de list_projects (rôles admin-tier : tous les projets ; tout
//   autre rôle : uniquement ses propres projets). Le périmètre est décidé ICI,
//   à partir de `actingUser`.
function createListEngineersTool() {
  return new ServiceBackedTool({
    name: "list_engineers",
    description:
      "Ingénieurs réels du CRM : liste des ingénieurs référencés (nom), ou ingénieur affecté à un projet désigné par son nom.",
    inputSchema: Joi.object({
      operation: Joi.string().valid("list", "of_project").default("list"),
      search: Joi.string().max(200).optional(),
      projectName: Joi.string().max(200).when("operation", { is: "of_project", then: Joi.required() }),
      limit: Joi.number().integer().min(1).max(engineerDirectory.MAX_LIMIT).optional(),
      // Pagination de la liste (« Afficher les suivants »).
      offset: Joi.number().integer().min(0).max(100000).optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => {
      if (input.operation === "of_project") {
        const ownerId = ADMIN_TIER_ROLES.has(actingUser.role) ? null : actingUser.id;
        return { operation: "of_project", ...(await engineerDirectory.findProjectEngineers(input, { ownerId })) };
      }
      return { operation: "list", ...(await engineerDirectory.listEngineers(input)) };
    },
  });
}

module.exports = { createListEngineersTool };
