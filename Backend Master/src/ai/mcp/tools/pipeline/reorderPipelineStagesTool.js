"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const pipelineStageService = require("../../../../modules/pipeline/services/pipelineStage.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

function createReorderPipelineStagesTool() {
  return new ServiceBackedTool({
    name: "reorder_pipeline_stages",
    description: "Réordonne plusieurs étapes de pipeline en une seule opération.",
    inputSchema: Joi.object({
      stages: Joi.array()
        .items(Joi.object({ id: uuidString().required(), position: Joi.number().integer().min(0).required() }))
        .min(1)
        .required(),
    }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input) => pipelineStageService.reorderStages(input.stages),
  });
}

module.exports = { createReorderPipelineStagesTool };
