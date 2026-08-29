"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const industrialRecordService = require("../../../../modules/industrial-records/services/industrialRecord.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

function createListIndustrialRecordsTool() {
  return new ServiceBackedTool({
    name: "list_industrial_records",
    description: "Liste paginée des fiches industrielles — portée limitée à ses propres fiches pour responsable_logistique_achat.",
    inputSchema: Joi.object({
      module: Joi.string().valid("probar", "melange", "maintenance").optional(),
      machine: Joi.string().max(50).optional(),
      poste: Joi.string().valid("matin", "nuit").optional(),
      page: Joi.number().integer().min(1).optional(),
      pageSize: Joi.number().integer().min(1).max(2000).optional(),
    }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => industrialRecordService.listRecords(input, actingUser),
  });
}

module.exports = { createListIndustrialRecordsTool };
