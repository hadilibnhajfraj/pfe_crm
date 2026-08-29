"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const projectService = require("../../../../modules/projects/services/project.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// La route HTTP autorise le PROPRIÉTAIRE du projet OU l'admin-tier
// (requireOwnerOrAdmin), mais ce contrôle vit dans le middleware de route,
// pas dans project.service.js::moveStage() lui-même (le service fait
// confiance à l'appelant — voir l'inventaire de service dans
// AI-Business-Copilot). Comme ce Tool appelle le service directement, sans
// passer par ce middleware, il restreint volontairement l'accès à
// l'admin-tier uniquement — plus restrictif que la route (jamais l'inverse)
// tant qu'aucune fonction de lecture de propriétaire n'est exposée en
// service pour vérifier l'ownership ici.
function createMoveProjectStageTool() {
  return new ServiceBackedTool({
    name: "move_project_stage",
    description: "Déplace un projet vers une nouvelle étape de pipeline (admin-tier uniquement via ce Tool).",
    inputSchema: Joi.object({
      projectId: Joi.string().guid({ version: "uuidv4" }).required(),
      pipelineStageId: Joi.string().guid({ version: "uuidv4" }).required(),
    }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input, { actingUser }) =>
      projectService.moveStage(input.projectId, input.pipelineStageId, actingUser.id),
  });
}

module.exports = { createMoveProjectStageTool };
