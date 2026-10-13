"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/admin.js PUT /users/:id/active). setUserActive() applique déjà la
// règle "un non-superadmin ne peut pas modifier un superadmin" — ce Tool ne
// la duplique pas.
function createSetUserActiveTool() {
  return new ServiceBackedTool({
    name: "set_user_active",
    description: "Active ou désactive un compte utilisateur.",
    inputSchema: Joi.object({
      userId: uuidString().required(),
      active: Joi.boolean().required(),
    }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input, { actingUser }) => userService.setUserActive(actingUser.role, input.userId, input.active),
  });
}

module.exports = { createSetUserActiveTool };
