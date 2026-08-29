"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/admin.js PUT /users/:id/role — superadmin uniquement, comme la
// route d'origine). setUserRole() applique déjà la liste de rôles
// assignables (connue pour être incomplète — voir user.service.js) : ce
// Tool ne la resserre ni ne l'élargit.
function createSetUserRoleTool() {
  return new ServiceBackedTool({
    name: "set_user_role",
    description: "Change le rôle d'un utilisateur (superadmin uniquement).",
    inputSchema: Joi.object({
      userId: Joi.string().guid({ version: "uuidv4" }).required(),
      role: Joi.string().max(50).required(),
    }),
    requiredRoles: ["superadmin", "superadmin2"],
    run: async (input) => userService.setUserRole(input.userId, input.role),
  });
}

module.exports = { createSetUserRoleTool };
