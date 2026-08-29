"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const notificationService = require("../../../../services/notification.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls services/notification.service.js exclusively (extraction fidèle de
// routes/notifications.routes.js POST /send-email). Cette route legacy
// n'exige AUCUNE authentification (P0 du dossier d'architecture) — ce Tool
// exige délibérément admin-tier, plus restrictif que la route existante,
// pour ne pas reproduire cette faille au niveau IA.
function createSendNotificationEmailTool() {
  return new ServiceBackedTool({
    name: "send_notification_email",
    description: "Envoie un e-mail et crée la notification correspondante pour un destinataire donné.",
    inputSchema: Joi.object({
      toUserId: Joi.string().guid({ version: "uuidv4" }).required(),
      emailTo: Joi.string().email().required(),
      fromName: Joi.string().max(120).optional(),
      subject: Joi.string().max(255).required(),
      message: Joi.string().max(5000).required(),
      type: Joi.string().max(50).optional(),
    }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input) => notificationService.sendEmailNotification(input),
  });
}

module.exports = { createSendNotificationEmailTool };
