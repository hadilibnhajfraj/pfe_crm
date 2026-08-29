"use strict";

const { PermissionDeniedError } = require("./errors");
const { createMcpLogger } = require("./logger");
const { isAuthorized } = require("../utils/authorization");

const logger = createMcpLogger("permission");

// Delegates entirely to what each Tool declares (`tool.requiredRoles` /
// `tool.allowedEmails`) — never reimplements CRM role logic here (plan
// §4.5, §10.1: "jamais réimplémenter une logique de portée parallèle"). A
// Tool's requiredRoles should be sourced from the same role vocabulary
// already used by requireRole/kpiRoleGuard elsewhere in the backend.
// Fine-grained, per-record scoping (owner-scoped data) stays inside the
// existing service the Tool calls — this class only answers "may this
// actor call this tool at all".
//
// allowedEmails exists because several CRM actors are authorized by a
// hardcoded e-mail address rather than a role (root admin, gestionnaire RH
// manegerofficecbi@gmail.com, responsable maintenance accueilcbif@gmail.com
// — see config/hrManager.js, config/maintenanceManager.js,
// config/rootAdmin.js). A Tool that omits this OR-condition would be
// *more* restrictive than the real HTTP route for those specific accounts —
// this mirrors the app's existing hybrid role-or-email model exactly,
// it does not introduce a new authorization concept.
class PermissionManager {
  assertCanCall(tool, actingUser) {
    if (!actingUser || !actingUser.id || !actingUser.role) {
      logger.warn(`denied "${tool.name}" for an unauthenticated/anonymous caller`);
      throw new PermissionDeniedError(tool.name, "anonymous");
    }

    if (isAuthorized({ requiredRoles: tool.requiredRoles || [], allowedEmails: tool.allowedEmails || [] }, actingUser)) {
      return;
    }

    logger.warn(`denied "${tool.name}" for role "${actingUser.role}"`);
    throw new PermissionDeniedError(tool.name, actingUser.role);
  }
}

module.exports = { PermissionManager };
