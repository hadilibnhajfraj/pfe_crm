"use strict";
const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

// Une ligne = un événement Google Calendar, pour UN destinataire, pour UNE
// action/relance. Voir multiRecipientCalendarSync.service.js — remplace le
// concept "un seul googleEventId" par "un événement par destinataire".
const CalendarEventSync = sequelize.define(
  "CalendarEventSync",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    // "copilot_meeting" ajouté par la migration
    // 20260815120000-add-copilot-meeting-to-calendar-event-syncs-enum.js
    // (déjà présente dans src/migrations/, pas encore exécutée au moment de
    // ce constat — voir meetingCopilotSync.service.js::ENTITY_TYPE). Gardée
    // ici explicitement synchronisée avec l'ENUM Postgres réel : même si
    // Sequelize n'impose pas de son propre chef une validation stricte
    // contre cette liste avant l'écriture (vérifié empiriquement), la
    // déclarer avec exactitude évite toute divergence future entre le
    // modèle et le schéma réel (voir le drift déjà constaté ailleurs entre
    // User.js et l'ENUM role réel de la base).
    entityType: {
      type: DataTypes.ENUM("project_action", "commercial_contact_relance", "copilot_meeting"),
      allowNull: false,
    },
    entityId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },

    // Calendrier CRM personnel de CE destinataire (table `tasks`) — voir
    // GET /tasks qui filtre par Task.createdBy = req.user.sub.
    taskId: { type: DataTypes.UUID, allowNull: true },

    googleEventId: { type: DataTypes.STRING(200), allowNull: true },
    googleEventLink: { type: DataTypes.STRING(500), allowNull: true },
    calendarId: { type: DataTypes.STRING(200), allowNull: true, defaultValue: "primary" },

    synced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    error: { type: DataTypes.TEXT, allowNull: true },
    googleUpdatedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "calendar_event_syncs",
    timestamps: true,
    indexes: [{ fields: ["entityType", "entityId"] }],
  }
);

module.exports = CalendarEventSync;
