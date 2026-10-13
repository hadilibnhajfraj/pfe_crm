"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const pipelineStageService = require("../../../../modules/pipeline/services/pipelineStage.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// deleteStage() refuse déjà (409) la suppression d'une étape utilisée par
// au moins un projet — garde-fou déjà en place côté service, non dupliqué.
function createDeletePipelineStageTool() {
  return new ServiceBackedTool({
    name: "delete_pipeline_stage",
    description: "Supprime (soft-delete) une étape de pipeline non utilisée par un projet.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input) => pipelineStageService.deleteStage(input.id),
  });
}

module.exports = { createDeletePipelineStageTool };
