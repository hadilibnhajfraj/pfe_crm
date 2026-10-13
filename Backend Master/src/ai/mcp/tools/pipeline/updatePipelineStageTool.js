"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const pipelineStageService = require("../../../../modules/pipeline/services/pipelineStage.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];
const HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function createUpdatePipelineStageTool() {
  return new ServiceBackedTool({
    name: "update_pipeline_stage",
    description: "Met à jour une étape de pipeline existante.",
    inputSchema: Joi.object({
      id: uuidString().required(),
      name: Joi.string().max(120).optional(),
      color: Joi.string().pattern(HEX_COLOR).optional(),
      icon: Joi.string().max(50).allow(null).optional(),
      position: Joi.number().integer().min(0).optional(),
      isDefault: Joi.boolean().optional(),
      isWonStage: Joi.boolean().optional(),
      isLostStage: Joi.boolean().optional(),
      autoCreateAction: Joi.boolean().optional(),
      isCustom: Joi.boolean().optional(),
    }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input, { actingUser }) => {
      const { id, ...data } = input;
      return pipelineStageService.updateStage(id, data, actingUser.id);
    },
  });
}

module.exports = { createUpdatePipelineStageTool };
