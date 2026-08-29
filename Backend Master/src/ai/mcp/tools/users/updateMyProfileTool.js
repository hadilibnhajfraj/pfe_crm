"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/users.routes.js PUT /me/profile) — sans l'upload de fichier avatar
// multipart, hors périmètre d'un Tool JSON (voir src/ai/README.md) ;
// `avatarUrl` reste modifiable comme simple chaîne.
function createUpdateMyProfileTool() {
  return new ServiceBackedTool({
    name: "update_my_profile",
    description: "Met à jour le profil de l'utilisateur courant (nom, coordonnées, champs RH).",
    inputSchema: Joi.object({
      name: Joi.string().max(255).optional(),
      designation: Joi.string().max(255).optional(),
      birthday: Joi.string().max(50).optional(),
      phone: Joi.string().max(50).optional(),
      country: Joi.string().max(100).optional(),
      state: Joi.string().max(100).optional(),
      address: Joi.string().max(255).optional(),
      about: Joi.string().max(2000).optional(),
      avatarUrl: Joi.string().max(500).optional(),
      nom: Joi.string().max(120).optional(),
      prenom: Joi.string().max(120).optional(),
      matricule: Joi.string().max(50).optional(),
      qualification: Joi.string().max(150).optional(),
      departement: Joi.string().max(150).optional(),
      service: Joi.string().max(150).optional(),
    }).min(1),
    requiredRoles: [],
    run: async (input, { actingUser }) => userService.updateMyProfile(actingUser.id, input),
  });
}

module.exports = { createUpdateMyProfileTool };
