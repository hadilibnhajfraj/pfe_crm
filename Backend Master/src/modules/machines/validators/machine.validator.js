"use strict";

const Joi = require("joi");
const { MACHINE_TYPES } = require("../../../utils/machineRef");

const STATUTS = ["ACTIVE", "INACTIVE"];

const baseFields = {
  code: Joi.string().trim().uppercase().max(30).pattern(/^[A-Z0-9-]+$/).messages({
    "string.pattern.base": "Le code ne doit contenir que des lettres, chiffres et tirets (ex. PROBAR-05).",
  }),
  nom: Joi.string().trim().max(120),
  typeMachine: Joi.string().trim().uppercase().valid(...MACHINE_TYPES),
  numero: Joi.number().integer().min(1).max(99),
  statut: Joi.string().trim().uppercase().valid(...STATUTS),
  description: Joi.string().allow(null, "").optional(),
};

// code et nom sont facultatifs à la création : déduits de typeMachine +
// numero ("PROBAR-05" / "Machine PROBAR 5") s'ils sont absents.
const createSchema = Joi.object({
  ...baseFields,
  typeMachine: baseFields.typeMachine.required(),
  numero: baseFields.numero.required(),
});

const updateSchema = Joi.object(baseFields).min(1);

const statutSchema = Joi.object({ statut: baseFields.statut.required() });

const listQuerySchema = Joi.object({
  typeMachine: baseFields.typeMachine,
  statut: baseFields.statut,
});

function validate(schema, source = "body") {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
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
    // Express 5 : req.query est un getter en lecture seule.
    if (source === "query") req.validatedQuery = value;
    else req[source] = value;
    next();
  };
}

module.exports = {
  validateCreate: validate(createSchema),
  validateUpdate: validate(updateSchema),
  validateStatut: validate(statutSchema),
  validateListQuery: validate(listQuerySchema, "query"),
};
