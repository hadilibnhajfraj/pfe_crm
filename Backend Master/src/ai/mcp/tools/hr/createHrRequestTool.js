"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");

const PHONE_PATTERN = /^[0-9+\-() .]{6,20}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Schéma calqué sur modules/hr-requests/validators/hrRequest.validator.js
// (le fichier n'exporte que du middleware Express, pas le schéma Joi brut).
// `photoPaths` : chemins déjà uploadés ailleurs (upload multipart hors
// périmètre d'un Tool JSON) — tableau de chaînes optionnel.
function createCreateHrRequestTool() {
  return new ServiceBackedTool({
    name: "create_hr_request",
    description: "Soumet une demande RH (congé ou autorisation de sortie) pour l'utilisateur courant.",
    inputSchema: Joi.object({
      type: Joi.string().valid("conge", "sortie").required(),
      employeeNom: Joi.string().max(120).allow(null, "").optional(),
      employeePrenom: Joi.string().max(120).allow(null, "").optional(),
      employeeMatricule: Joi.string().max(50).allow(null, "").optional(),
      employeeQualification: Joi.string().max(150).allow(null, "").optional(),
      employeeDepartement: Joi.string().max(150).allow(null, "").optional(),
      employeeService: Joi.string().max(150).allow(null, "").optional(),
      typeConge: Joi.when("type", { is: "conge", then: Joi.string().valid("ordinaire", "maladie").required(), otherwise: Joi.forbidden() }),
      dateDebut: Joi.when("type", { is: "conge", then: Joi.date().iso().required(), otherwise: Joi.forbidden() }),
      dateFin: Joi.when("type", { is: "conge", then: Joi.date().iso().required().min(Joi.ref("dateDebut")), otherwise: Joi.forbidden() }),
      adresse: Joi.when("type", { is: "conge", then: Joi.string().max(255).required(), otherwise: Joi.forbidden() }),
      telephone: Joi.when("type", {
        is: "conge",
        then: Joi.string().pattern(PHONE_PATTERN).required(),
        otherwise: Joi.string().pattern(PHONE_PATTERN).allow(null, "").optional(),
      }),
      motif: Joi.when("type", { is: "sortie", then: Joi.string().max(255).required(), otherwise: Joi.forbidden() }),
      dateSortie: Joi.when("type", { is: "sortie", then: Joi.date().iso().required(), otherwise: Joi.forbidden() }),
      heureSortie: Joi.when("type", { is: "sortie", then: Joi.string().pattern(TIME_PATTERN).required(), otherwise: Joi.forbidden() }),
      heureRetour: Joi.when("type", { is: "sortie", then: Joi.string().pattern(TIME_PATTERN).required(), otherwise: Joi.forbidden() }),
      commentaire: Joi.string().max(2000).allow(null, "").optional(),
      photoPaths: Joi.array().items(Joi.string().max(500)).optional(),
    }),
    requiredRoles: [], // tout employé connecté
    run: async (input, { actingUser }) => {
      const { photoPaths, ...body } = input;
      return hrRequestService.createRequest(body, actingUser, photoPaths || []);
    },
  });
}

module.exports = { createCreateHrRequestTool };
