"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const pipelineStageService = require("../../../../modules/pipeline/services/pipelineStage.service");

function createListPipelineStagesTool() {
  return new ServiceBackedTool({
    name: "list_pipeline_stages",
    description: "Liste toutes les étapes du pipeline commercial.",
    inputSchema: Joi.object({}),
    requiredRoles: [], // route ouverte à tout utilisateur authentifié
    run: async () => pipelineStageService.getAllStages(),
  });
}

module.exports = { createListPipelineStagesTool };
