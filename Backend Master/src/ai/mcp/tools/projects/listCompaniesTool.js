"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const crmEntityDirectory = require("../../../../modules/projects/services/crmEntityDirectory.service");
const { scopeFor } = require("./findCrmEntityTool");

// Sociétés du CRM (PROBAR ASSISTANT), en LECTURE SEULE : liste paginée de la
// table `companies` — même ouverture que GET /companies/all (tout utilisateur
// connecté) et mêmes champs ({ id, name }). Le nombre de projets affiché pour
// chaque société suit le périmètre de list_projects, décidé ICI à partir de
// `actingUser`. Une société précise → find_crm_entity.
function createListCompaniesTool() {
  return new ServiceBackedTool({
    name: "list_companies",
    description: "Sociétés réelles du CRM : liste paginée des sociétés référencées (nom ; sur demande leurs projets, ou seulement celles avec / sans projet) et leur nombre total.",
    inputSchema: Joi.object({
      limit: Joi.number().integer().min(1).max(200).optional(),
      offset: Joi.number().integer().min(0).max(100000).optional(),
      // "projects" : avec les projets de chaque société (périmètre de l'utilisateur).
      view: Joi.string().valid("names", "projects").optional(),
      // Sociétés ayant / n'ayant pas de projet dans le périmètre de l'utilisateur.
      filter: Joi.string().valid("with_projects", "without_projects").optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => ({ operation: "list", ...(await crmEntityDirectory.listCompanies(input, scopeFor(actingUser))) }),
  });
}

module.exports = { createListCompaniesTool };
