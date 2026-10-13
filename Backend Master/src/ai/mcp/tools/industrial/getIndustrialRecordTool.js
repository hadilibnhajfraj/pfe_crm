"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const industrialRecordService = require("../../../../modules/industrial-records/services/industrialRecord.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

function createGetIndustrialRecordTool() {
  return new ServiceBackedTool({
    name: "get_industrial_record",
    description: "Récupère une fiche industrielle par identifiant.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => industrialRecordService.getRecordById(input.id, actingUser),
  });
}

module.exports = { createGetIndustrialRecordTool };
