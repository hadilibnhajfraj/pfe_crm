"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const projectActionService = require("../../../../modules/project-actions/services/projectAction.service");

// La route HTTP réelle (`POST /:id/actions`, routes/projects.routes.js) est
// gardée par `authRequired` SEUL — aucune restriction de rôle, aucune
// vérification de propriétaire — donc ce Tool n'est PAS plus permissif que
// la production (même principe que moveProjectStageTool.js : jamais plus
// permissif que la route réelle, ici jamais moins non plus puisque la
// route elle-même est ouverte à tout utilisateur authentifié).
//
// `projectActionService.createAction(projectId, body, userId)` crée à la
// fois l'activité (ProjectAction) ET, SI `dateRelance` est fourni, le
// rappel associé (ProjectReminder, dans la MÊME transaction) — dans ce CRM,
// un rappel n'est jamais un enregistrement indépendant, toujours attaché à
// une activité (voir modules/project-actions/services/projectAction.service.js).
// Ce seul Tool couvre donc à la fois "création d'activité" et "création de
// rappel" — jamais un second Tool fabriqué pour un concept qui n'existe pas
// séparément dans le modèle de données réel.
function createCreateProjectActionTool() {
  return new ServiceBackedTool({
    name: "create_project_action",
    description:
      "Crée une activité sur un projet (ex. visite, relance) et, si une date de relance est fournie, le rappel associé.",
    inputSchema: Joi.object({
      projectId: Joi.string().guid({ version: "uuidv4" }).required(),
      typeAction: Joi.string().max(100).allow(null, "").optional(),
      commentaire: Joi.string().max(2000).allow(null, "").optional(),
      dateAction: Joi.date().iso().optional(),
      dateRelance: Joi.date().iso().allow(null).optional(),
      reminderMessage: Joi.string().max(500).allow(null, "").optional(),
      priorite: Joi.string().valid("basse", "normale", "haute", "urgente").optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => {
      const { projectId, ...body } = input;
      return projectActionService.createAction(projectId, body, actingUser.id);
    },
  });
}

module.exports = { createCreateProjectActionTool };
