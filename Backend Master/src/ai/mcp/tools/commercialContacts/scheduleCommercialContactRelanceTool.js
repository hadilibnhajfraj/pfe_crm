"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const relanceService = require("../../../../modules/commercial-contacts/services/commercialContactRelance.service");

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS". Écriture réelle —
// jamais appelée directement par le LLM/CommercialAgent : passe TOUJOURS par
// le cycle PendingAction (propose -> confirmation explicite -> exécution
// UNE FOIS), voir commercialAgent.js. `contactId`/`commercialId` sont des
// UUID RÉSOLUS côté serveur (jamais un nom lu tel quel dans le message,
// jamais choisi par le LLM) — voir commercialActionSlotExtractor.js pour
// l'extraction déterministe et commercialAgent.js pour la résolution via
// get_my_commercial_contacts (recherche)/list_commercial_candidates.
//
// AUCUN champ `ownerId`/`userId`/`createdBy` n'est déclaré ici : le
// propriétaire du contact n'est jamais un paramètre — l'autorisation est
// vérifiée côté service (`contact.createdBy === actingUser.id` ou
// admin-tier), une comparaison DB, jamais contournable par l'appelant (voir
// commercialContactRelance.service.js::scheduleContactRelance).
function createScheduleCommercialContactRelanceTool() {
  return new ServiceBackedTool({
    name: "schedule_commercial_contact_relance",
    description:
      "Programme une relance datée pour un contact commercial (et, optionnellement, affecte un commercial responsable) — crée un enregistrement CommercialContactRelance réel.",
    inputSchema: Joi.object({
      contactId: uuidString().required(),
      dateRelance: Joi.date().iso().required(),
      heureRelance: Joi.string().max(10).allow(null, "").optional(),
      commercialId: uuidString().allow(null).optional(),
      commentaire: Joi.string().max(2000).allow(null, "").optional(),
    }),
    // « commercial » : admis ici comme sur POST /commercial-contacts/:id/relances ;
    // le service refuse tout contact hors de son périmètre (canAccessContact, niveau MANAGE).
    requiredRoles: ["commercial", "commercial_sedentaire", "admin", "superadmin", "superadmin2"],
    run: async (input, { actingUser }) => relanceService.scheduleContactRelance(input.contactId, input, actingUser),
  });
}

module.exports = { createScheduleCommercialContactRelanceTool };
