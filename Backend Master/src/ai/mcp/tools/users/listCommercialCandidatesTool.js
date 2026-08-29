"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/users.routes.js GET /commercials).
function createListCommercialCandidatesTool() {
  return new ServiceBackedTool({
    name: "list_commercial_candidates",
    description: "Liste les utilisateurs sélectionnables comme \"Commercial\" (rôles non admin/techniques exclus, actifs uniquement).",
    inputSchema: Joi.object({}),
    requiredRoles: [], // ouvert : c'est l'utilisateur lui-même qui peuple ce menu déroulant
    run: async () => userService.listCommercialCandidates(),
  });
}

module.exports = { createListCommercialCandidatesTool };
