"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const industrialRecordService = require("../../../../modules/industrial-records/services/industrialRecord.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

// createRecord() vérifie déjà en interne que seul l'e-mail codé en dur
// responsable_logistique@cbi-tunisia.com peut créer module="maintenance"
// (throw {status:403} sinon) — pas besoin de allowedEmails ici.
function createCreateIndustrialRecordTool() {
  return new ServiceBackedTool({
    name: "create_industrial_record",
    description: "Crée une fiche de production industrielle (PROBAR, mélange, ou maintenance).",
    inputSchema: Joi.object({
      module: Joi.string().valid("probar", "melange", "maintenance").required(),
      dateFiche: Joi.date().iso().optional(),
      machine: Joi.string().max(50).optional(),
      poste: Joi.string().valid("matin", "nuit").optional(),
      quantiteProduite: Joi.number().min(0).optional(),
      statutQualite: Joi.string().valid("ok", "nok").optional(),
      description: Joi.string().max(5000).optional(),
      urgence: Joi.string().valid("faible", "moyenne", "critique").optional(),
      melangeData: Joi.object().optional(),
      // PAS de `.unknown(true)` : createRecord() spread `body` avant
      // `createdBy: actor.id` (donc `createdBy` lui-même est protégé), mais
      // ne protège `statut` que pour module="maintenance" — un champ non
      // listé ici (ex. `statut` sur un module probar/mélange) doit être
      // retiré par ValidationManager (`stripUnknown: true`), pas transmis
      // tel quel (voir audit sécurité / updateIndustrialRecordTool.js).
    }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => industrialRecordService.createRecord(input, actingUser),
  });
}

module.exports = { createCreateIndustrialRecordTool };
