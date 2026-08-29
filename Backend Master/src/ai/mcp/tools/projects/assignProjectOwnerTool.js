"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const projectService = require("../../../../modules/projects/services/project.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Même restriction volontaire que move_project_stage — voir ce fichier pour
// le raisonnement (assignOwner() ne vérifie pas non plus l'ownership dans
// le service, seule la route le fait).
function createAssignProjectOwnerTool() {
  return new ServiceBackedTool({
    name: "assign_project_owner",
    description: "Assigne (ou retire, ownerId=null) le propriétaire d'un projet (admin-tier uniquement via ce Tool).",
    inputSchema: Joi.object({
      projectId: Joi.string().guid({ version: "uuidv4" }).required(),
      ownerId: Joi.string().guid({ version: "uuidv4" }).allow(null).required(),
    }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input, { actingUser }) =>
      projectService.assignOwner(input.projectId, input.ownerId, actingUser.id),
  });
}

module.exports = { createAssignProjectOwnerTool };
