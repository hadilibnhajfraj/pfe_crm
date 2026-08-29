"use strict";

// AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — ajoute
// "copilot_meeting" à l'ENUM enum_calendar_event_syncs_entityType : une
// réunion créée depuis le Copilot conversationnel (src/ai/agents/
// meetingAgent.js) n'a ni ProjectAction ni CommercialContactRelance source
// — les deux seules valeurs existantes ("project_action"/
// "commercial_contact_relance") représentent toujours une entité CRM déjà
// existante par ailleurs, jamais le cas ici. Tous les consumers existants
// de `entityType` (multiRecipientCalendarSync.service.js,
// followupAutomation.service.js, projectActionGoogleSync.service.js,
// googleCalendarInboundSync.service.js) filtrent TOUJOURS sur une valeur
// explicite dans leur WHERE — aucun ne fait de scan non filtré sur
// `entityType` — donc cette nouvelle valeur ne peut être vue par erreur par
// un consumer existant.
//
// ALTER TYPE … ADD VALUE ne peut pas s'exécuter dans une transaction sur
// PostgreSQL < 12 — même approche que les migrations existantes
// (20260729001100-add-cancelled-to-email-queue-status-enum.js,
// 20260622090000-add-responsable-logistique-achat-to-users-role-enum.js).
//
// PostgreSQL ne permet pas de retirer une valeur d'ENUM : down() est un no-op.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_calendar_event_syncs_entityType" ADD VALUE IF NOT EXISTS 'copilot_meeting'`
    );
  },

  async down() {
    // Intentional no-op: PostgreSQL cannot drop individual ENUM values.
  },
};
