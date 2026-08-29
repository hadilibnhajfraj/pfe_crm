"use strict";

// Shared predicate behind every "may this actor do X" check in the kernel:
// mcp/permissionManager.js (may this actingUser call this Tool) and
// agents/baseAgent.js (may this actingUser invoke this Agent) both delegate
// here rather than each reimplementing the same role-or-email logic — this
// codebase's existing hybrid CRM authorization model (role OR hardcoded
// email, see mcp/permissionManager.js for the full rationale) has exactly
// one implementation, not two that could quietly drift apart.
//
// Pure and side-effect-free on purpose: callers own logging and the exact
// error thrown (a PermissionDeniedError for a Tool, an AgentPermissionError
// for an Agent) — this function only ever answers true/false.
function isAuthorized({ requiredRoles = [], allowedEmails = [] } = {}, actingUser) {
  if (!actingUser || !actingUser.id || !actingUser.role) return false;

  const emails = allowedEmails.map((e) => e.toLowerCase());
  if (requiredRoles.length === 0 && emails.length === 0) return true; // open to any authenticated actor

  const roleMatches = requiredRoles.includes(actingUser.role);
  const emailMatches = Boolean(actingUser.email) && emails.includes(actingUser.email.toLowerCase());
  return roleMatches || emailMatches;
}

module.exports = { isAuthorized };
