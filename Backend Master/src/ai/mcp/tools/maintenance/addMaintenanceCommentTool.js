"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");

// addComment() applique désormais le même contrôle d'accès que getById()/
// getComments()/getHistory() (_canAccess : demandeur ou gestionnaire
// maintenance — corrigé lors d'un audit sécurité, cette Tool en hérite
// automatiquement sans logique dupliquée ici).
function createAddMaintenanceCommentTool() {
  return new ServiceBackedTool({
    name: "add_maintenance_comment",
    description: "Ajoute un commentaire à une demande de maintenance.",
    inputSchema: Joi.object({
      id: uuidString().required(),
      message: Joi.string().max(2000).required(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) =>
      maintenanceService.addComment(actingUser.id, actingUser.role, input.id, input.message, actingUser.email),
  });
}

module.exports = { createAddMaintenanceCommentTool };
