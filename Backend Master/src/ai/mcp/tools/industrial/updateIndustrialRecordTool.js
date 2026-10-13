"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const industrialRecordService = require("../../../../modules/industrial-records/services/industrialRecord.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

// updateRecord() applique déjà assertOwnership + la règle "champs
// obligatoires avant passage à statut=validee pour PROBAR" en interne, mais
// NE fait, elle, aucun allowlisting de champs avant `instance.update(data)`
// (repo.update() -> Sequelize) — c'est le validateur Joi de la route HTTP
// (industrialRecord.validator.js, SANS `.unknown(true)`) qui joue ce rôle
// pour /industrial-records/:id. Ce Tool doit donc rester au moins aussi
// strict : PAS de `.unknown(true)` ici, pour qu'un champ non listé
// (`createdBy`, un id d'un autre utilisateur, par ex.) soit silencieusement
// retiré par ValidationManager (`stripUnknown: true`) plutôt que transmis
// tel quel à Sequelize (mass assignment — voir audit sécurité).
function createUpdateIndustrialRecordTool() {
  return new ServiceBackedTool({
    name: "update_industrial_record",
    description: "Met à jour une fiche industrielle.",
    inputSchema: Joi.object({
      id: uuidString().required(),
      dateFiche: Joi.date().iso().optional(),
      machine: Joi.string().max(50).optional(),
      poste: Joi.string().valid("matin", "nuit").optional(),
      quantiteProduite: Joi.number().min(0).optional(),
      statutQualite: Joi.string().valid("ok", "nok").optional(),
      statut: Joi.string().max(50).optional(),
      description: Joi.string().max(5000).optional(),
      melangeData: Joi.object().optional(),
    }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => {
      const { id, ...data } = input;
      return industrialRecordService.updateRecord(id, data, actingUser);
    },
  });
}

module.exports = { createUpdateIndustrialRecordTool };
