"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

// updatePorPromesh() vérifie déjà ownership + refuse (403) toute écriture
// si isLocked=true (fiche validée) — non dupliqué ici. Schéma best-effort
// pour les champs "plats" (mainFields) — MAIS, contrairement à la note
// d'origine sur create_por_promesh, PAS de `.unknown(true)` au niveau
// racine : `updatePorPromesh()` ne fait aucun allowlisting avant
// `repo.update(report, mainFields)` (Sequelize `instance.update(data)`,
// qui persiste tout attribut de modèle réel présent dans `data`) — un
// champ non listé ici (`isLocked`, `status`, `validatedAt`, ...) doit être
// retiré par ValidationManager (`stripUnknown: true`), jamais transmis tel
// quel (voir audit sécurité). Les sous-tableaux (`controlesQualite`, etc.)
// restent volontairement permissifs (`Joi.object().unknown(true)` par
// ligne) — risque moindre et documenté séparément.
function createUpdatePorPromeshTool() {
  return new ServiceBackedTool({
    name: "update_por_promesh",
    description: "Met à jour une fiche POR PROMESH non verrouillée (status=BROUILLON).",
    inputSchema: Joi.object({
      id: Joi.string().guid({ version: "uuidv4" }).required(),
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
    }).min(2),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => {
      const { id, ...data } = input;
      return porPromeshService.updatePorPromesh(id, data, actingUser);
    },
  });
}

module.exports = { createUpdatePorPromeshTool };
