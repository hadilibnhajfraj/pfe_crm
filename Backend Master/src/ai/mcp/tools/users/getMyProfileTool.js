"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/users.routes.js GET /me/profile).
function createGetMyProfileTool() {
  return new ServiceBackedTool({
    name: "get_my_profile",
    description: "Récupère le profil (RH + affichage) de l'utilisateur courant.",
    inputSchema: Joi.object({}),
    requiredRoles: [],
    run: async (_input, { actingUser }) => userService.getMyProfile(actingUser.id),
  });
}

module.exports = { createGetMyProfileTool };
