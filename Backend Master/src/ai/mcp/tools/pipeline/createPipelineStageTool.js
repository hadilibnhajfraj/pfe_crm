"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const pipelineStageService = require("../../../../modules/pipeline/services/pipelineStage.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];
const HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

// Schéma calqué sur modules/pipeline/validators/pipelineStage.validator.js
// (createSchema) — même règles, ré-écrites ici (le fichier de validation
// n'exporte que du middleware Express, pas le schéma Joi brut).
function createCreatePipelineStageTool() {
  return new ServiceBackedTool({
    name: "create_pipeline_stage",
    description: "Crée une nouvelle étape de pipeline.",
    inputSchema: Joi.object({
      name: Joi.string().max(120).required(),
      color: Joi.string().pattern(HEX_COLOR).optional(),
      icon: Joi.string().max(50).optional(),
      position: Joi.number().integer().min(0).optional(),
      isDefault: Joi.boolean().optional(),
      isWonStage: Joi.boolean().optional(),
      isLostStage: Joi.boolean().optional(),
      autoCreateAction: Joi.boolean().optional(),
      isCustom: Joi.boolean().optional(),
    }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input, { actingUser }) => pipelineStageService.createStage(input, actingUser.id),
  });
}

module.exports = { createCreatePipelineStageTool };
