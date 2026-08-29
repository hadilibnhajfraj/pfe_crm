"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

// Schéma best-effort, PAS une reproduction exhaustive de
// modules/por-promesh/validators/porPromesh.validator.js (~50 champs +
// sous-tableaux) — seuls les champs/enums critiques sont typés ici. PAS de
// `.unknown(true)` au niveau racine : un champ non listé ici n'est PAS
// "simplement ignoré par le service" s'il correspond à un vrai attribut du
// modèle Sequelize (`isLocked`, `status`, `validatedAt`...) — `repo.create()`
// le persisterait tel quel. `createdBy` reste protégé (écrasé après le
// spread dans `createPorPromesh()`), mais rien d'autre ne l'est : un champ
// non déclaré ici doit être retiré par ValidationManager
// (`stripUnknown: true`), jamais transmis (voir audit sécurité).
function createCreatePorPromeshTool() {
  return new ServiceBackedTool({
    name: "create_por_promesh",
    description: "Crée une fiche POR PROMESH (rapport d'équipe ligne PROMESH), à l'état BROUILLON.",
    inputSchema: Joi.object({
      dateProduction: Joi.date().iso().allow(null).optional(),
      heureDebut: Joi.string().pattern(TIME_PATTERN).allow("", null).optional(),
      heureFin: Joi.string().pattern(TIME_PATTERN).allow("", null).optional(),
      operateur: Joi.string().max(255).allow(null, "").optional(),
      machine: Joi.string().max(10).allow(null, "").optional(),
      poste: Joi.string().valid("matin", "nuit").allow(null, "").optional(),
      conformite: Joi.string().valid("conforme", "non_conforme").allow(null, "").optional(),
      controlesQualite: Joi.array().items(Joi.object().unknown(true)).optional(),
      arretsMachine: Joi.array().items(Joi.object().unknown(true)).optional(),
      consommations: Joi.array().items(Joi.object().unknown(true)).optional(),
      processControl: Joi.array().items(Joi.object().unknown(true)).optional(),
      nonConformites: Joi.array().items(Joi.object().unknown(true)).optional(),
    }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => porPromeshService.createPorPromesh(input, actingUser),
  });
}

module.exports = { createCreatePorPromeshTool };
