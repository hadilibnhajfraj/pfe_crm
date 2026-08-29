"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/users.routes.js GET /:id/profile — vue admin du profil RH d'un
// autre utilisateur).
function createGetUserProfileTool() {
  return new ServiceBackedTool({
    name: "get_user_profile",
    description: "Récupère le profil RH d'un utilisateur donné (vue admin).",
    inputSchema: Joi.object({ userId: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input) => userService.getUserProfile(input.userId),
  });
}

module.exports = { createGetUserProfileTool };
