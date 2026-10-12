"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const projectStatisticsService = require("../../../../modules/projects/services/projectStatistics.service");
const { ADMIN_TIER_ROLES } = require("./listProjectsTool");

// Analytique projets (PROBAR ASSISTANT) : comptages regroupés par ingénieur,
// commercial, statut, client, famille de produit ou mois — en LECTURE SEULE.
//
// Périmètre : EXACTEMENT celui de list_projects (scopeInputForActingUser) —
// rôles admin-tier : tous les projets ; tout autre rôle : uniquement ses
// propres projets (ownerId = utilisateur authentifié). Le périmètre est
// décidé ICI, à partir de `actingUser` ; aucun champ de l'entrée ne peut
// l'élargir.
function createGetProjectStatisticsTool() {
  return new ServiceBackedTool({
    name: "get_project_statistics",
    description:
      "Statistiques réelles des projets : nombre total, ou répartition/classement par ingénieur, commercial, statut, client, famille de produit ou mois (projets archivés inclus par défaut).",
    inputSchema: Joi.object({
      groupBy: Joi.string().valid(...projectStatisticsService.GROUP_BY_VALUES).allow(null).optional(),
      order: Joi.string().valid("desc", "asc").optional(),
      limit: Joi.number().integer().min(1).max(50).optional(),
      includeArchived: Joi.boolean().optional(),
      mine: Joi.boolean().optional(),
      productFamily: Joi.string().valid("PROBAR", "PROMESH").optional(),
      statut: Joi.string().max(100).optional(),
      from: Joi.date().iso().optional(),
      to: Joi.date().iso().optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => {
      const { mine, ...query } = input || {};
      const isAdmin = ADMIN_TIER_ROLES.has(actingUser.role);
      const ownerId = !isAdmin || mine ? actingUser.id : null;
      return projectStatisticsService.getProjectStatistics(query, { ownerId });
    },
  });
}

module.exports = { createGetProjectStatisticsTool };
