"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const userService = require("../../../../services/user.service");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];

// Calls services/user.service.js exclusively (extraction fidèle de
// routes/admin.js GET /admin/users — voir user.service.js).
function createListUsersTool() {
  return new ServiceBackedTool({
    name: "list_users",
    description: "Liste tous les utilisateurs (id, email, rôle, actif, dates) — administration.",
    inputSchema: Joi.object({}),
    requiredRoles: ADMIN_TIER_ROLES,
    run: async () => userService.listUsers(),
  });
}

module.exports = { createListUsersTool };
