"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const industrialRecordService = require("../../../../modules/industrial-records/services/industrialRecord.service");

const DELETE_ROLES = ["admin", "superadmin", "superadmin2"];

function createDeleteIndustrialRecordTool() {
  return new ServiceBackedTool({
    name: "delete_industrial_record",
    description: "Supprime une fiche industrielle.",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: DELETE_ROLES,
    run: async (input, { actingUser }) => industrialRecordService.deleteRecord(input.id, actingUser),
  });
}

module.exports = { createDeleteIndustrialRecordTool };
