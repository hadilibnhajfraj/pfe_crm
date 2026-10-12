"use strict";

const Joi = require("joi");

// 12 diamètres fixes — jamais de valeur libre ("Autre" supprimé).
const DIAMETRES = ["6", "8", "10", "12", "14", "16", "18", "20", "22", "24", "26", "28"];

// Une seule requête : en-tête de fiche + tableau des 12 lignes (une par
// diamètre). Aucune valeur numérique n'est obligatoire — un champ vide
// vaut 0 (Joi.default(0)).
const recuperableItemSchema = Joi.object({
  diametre: Joi.string().valid(...DIAMETRES).required().messages({
    "any.only": `Le diamètre doit être l'une des valeurs suivantes : ${DIAMETRES.join(", ")}.`,
    "any.required": "Le diamètre est obligatoire.",
  }),
  dechetKg: Joi.number().min(0).default(0).messages({
    "number.base": "Le déchet (kg) doit être un nombre.",
    "number.min": "Le déchet (kg) ne peut pas être négatif.",
  }),
  dechetProduitFiniKg: Joi.number().min(0).default(0).messages({
    "number.base": "Le déchet + produit fini (kg) doit être un nombre.",
    "number.min": "Le déchet + produit fini (kg) ne peut pas être négatif.",
  }),
});

const saveFicheSchema = Joi.object({
  module: Joi.string().valid("PROBAR", "PROMESH").required().messages({
    "any.only": "Le module doit être PROBAR ou PROMESH.",
    "any.required": "Le module est obligatoire.",
  }),
  // Numéro de la machine dans le référentiel Machines (plus de liste fixe
  // 1..4 : PROBAR-05 / PROMESH-05 sont acceptées). L'existence et le statut
  // ACTIVE de la machine (type = module) sont vérifiés à l'enregistrement
  // par le hook linkMachine (models/helpers/machineLink.js) → 400 sinon.
  machine: Joi.string().trim().pattern(/^[1-9]\d{0,2}$/).required().messages({
    "string.pattern.base": "La machine doit être un numéro de machine (1, 2, 3…).",
    "any.required": "La machine est obligatoire.",
  }),
  ligne: Joi.string().valid("L1", "L2", "L3", "L4").required().messages({
    "any.only": "La ligne doit être L1, L2, L3 ou L4.",
    "any.required": "La ligne est obligatoire.",
  }),
  poste: Joi.string().valid("matin", "soir").required().messages({
    "any.only": "Le poste doit être matin ou soir.",
    "any.required": "Le poste est obligatoire.",
  }),
  date: Joi.date().iso().required().messages({
    "date.base": "La date doit être une date valide.",
    "date.format": "La date doit être au format ISO (AAAA-MM-JJ).",
    "any.required": "La date est obligatoire.",
  }),
  // Envoyé par le client pour affichage immédiat, mais toujours recalculé
  // côté serveur depuis le profil de l'utilisateur connecté — jamais fait
  // confiance à cette valeur pour l'enregistrement définitif.
  operateur: Joi.string().max(255).allow(null, "").optional(),
  recuperables: Joi.array().items(recuperableItemSchema).default([]),
});

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((d) => d.message),
      });
    }
    req.body = value;
    next();
  };
}

module.exports = {
  DIAMETRES,
  validateSaveFiche: validate(saveFicheSchema),
};
