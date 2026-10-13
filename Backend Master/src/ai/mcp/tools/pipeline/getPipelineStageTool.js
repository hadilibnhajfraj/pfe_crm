"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const pipelineStageService = require("../../../../modules/pipeline/services/pipelineStage.service");

function createGetPipelineStageTool() {
  return new ServiceBackedTool({
    name: "get_pipeline_stage",
    description: "Récupère une étape de pipeline par identifiant.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: [],
    run: async (input) => pipelineStageService.getStageById(input.id),
  });
}

module.exports = { createGetPipelineStageTool };
