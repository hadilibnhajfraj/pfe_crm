"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const porPromeshService = require("../../../../modules/por-promesh/services/porPromesh.service");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

// Malgré son nom, createOrOpenDraft() crée TOUJOURS une nouvelle fiche
// brouillon (jamais de réouverture) — comportement existant, non modifié.
function createCreateOrOpenPorPromeshDraftTool() {
  return new ServiceBackedTool({
    name: "create_or_open_por_promesh_draft",
    description: "Crée une nouvelle fiche POR PROMESH brouillon pour une machine/poste donnés (date/heure du jour).",
    inputSchema: Joi.object({
      machine: Joi.alternatives(Joi.string(), Joi.number()).required(),
      poste: Joi.string().valid("matin", "nuit").required(),
      operateurName: Joi.string().max(255).allow(null, "").optional(),
    }),
    requiredRoles: READ_WRITE_ROLES,
    run: async (input, { actingUser }) => porPromeshService.createOrOpenDraft(actingUser, input),
  });
}

module.exports = { createCreateOrOpenPorPromeshDraftTool };
