"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/users.routes.js GET / — distincte de list_users : champs plus
// courts, tri par email, filtrable par rôle).
function createListUsersByRoleTool() {
  return new ServiceBackedTool({
    name: "list_users_by_role",
    description: "Liste les utilisateurs (id, email, rôle), filtrable par rôle exact.",
    inputSchema: Joi.object({ role: Joi.string().max(50).optional() }),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async (input) => userService.listUsersByRole(input),
  });
}

module.exports = { createListUsersByRoleTool };
