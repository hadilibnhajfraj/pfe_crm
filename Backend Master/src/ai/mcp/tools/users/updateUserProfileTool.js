"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/users.routes.js PUT /:id/profile — édition admin des champs RH
// utilisés pour l'auto-remplissage des demandes RH).
function createUpdateUserProfileTool() {
  return new ServiceBackedTool({
    name: "update_user_profile",
    description: "Met à jour le profil RH d'un utilisateur donné (matricule, qualification, département, service...).",
    inputSchema: Joi.object({
      userId: Joi.string().guid({ version: "uuidv4" }).required(),
      name: Joi.string().max(255).optional(),
      designation: Joi.string().max(255).optional(),
      phone: Joi.string().max(50).optional(),
      nom: Joi.string().max(120).optional(),
      prenom: Joi.string().max(120).optional(),
      matricule: Joi.string().max(50).optional(),
      qualification: Joi.string().max(150).optional(),
      departement: Joi.string().max(150).optional(),
      service: Joi.string().max(150).optional(),
    }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input) => {
      const { userId, ...data } = input;
      return userService.updateUserProfile(userId, data);
    },
  });
}

module.exports = { createUpdateUserProfileTool };
