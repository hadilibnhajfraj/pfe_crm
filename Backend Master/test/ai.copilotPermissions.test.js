"use strict";

// Locks in the fix for the "Votre rôle n'est pas autorisé à utiliser le
// Copilot IA" incident — a real .env now sets AI_COPILOT_ROLES_ALLOWED,
// but the actual gate (AiManager.isRoleAllowed/canUseAiCopilot) must
// correctly recognise every REAL role of this CRM, exactly as they exist
// in the ENUM (src/models/User.js) — never a role invented for this task.
// Real ENUM roles, verified directly from the model before writing this
// file: "user", "commercial", "accueil", "admin", "superadmin",
// "superadmin2", "responsable_logistique_achat". "commercial_terrain" and
// "commercial_sedentaire" (mentioned in the task as candidates) do NOT
// exist in this project — there is a single "commercial" role — so they
// are deliberately absent from this suite rather than fabricated.

// Mocked exactly like test/ai.mcp.tools.hr.test.js — HR tools are
// DB-backed (via hrRequest.service.js -> Sequelize) and this file must
// stay runnable in isolation, without a real DB_* env configured.
jest.mock("../src/modules/hr-requests/services/hrRequest.service", () => ({
  listRequests: jest.fn(),
  getRequestById: jest.fn(),
}));

const { createDefaultAiManager } = require("../src/ai/manager");

// Mirrors the real .env's AI_COPILOT_ROLES_ALLOWED (see Backend Master/.env)
// — the business-relevant roles that actually analyze CRM data. "user" is
// the STANDARD default role of every CRM account (see User.js,
// DataTypes.ENUM(...).defaultValue === "user") — confirmed as a normal CRM
// user, added 2026-08-10 (see
// AI-Business-Copilot/05_INCIDENT_COPILOT_ROLE_USER.md). Does not widen any
// data access: list_projects/get_dashboard_kpis/get_user_dashboard are
// already reachable by this exact role with zero role restriction through
// the ordinary (non-Copilot) CRM routes — see project.routes.js, only
// authRequired, no role check at all.
//
// Mission "CORRIGER L'AUTORISATION DU COPILOT POUR
// responsable_logistique_achat" — ce rôle avait déjà un accès HTTP réel via
// moduleAccessGuard (préfixe /ai-copilot) et des capacités réelles définies
// dans capabilityMatrixService.js (industrial/maintenance/por_promesh/hr),
// mais restait exclu de cette porte plus grossière — décision produit
// explicite, ajouté ici pour que les deux portes concordent.
const REAL_ENV = { AI_COPILOT_ENABLED: "true", AI_COPILOT_ROLES_ALLOWED: "admin,superadmin,superadmin2,commercial,user,responsable_logistique_achat" };

describe("AiManager.isRoleAllowed / canUseAiCopilot — every REAL role of this CRM", () => {
  const manager = createDefaultAiManager(REAL_ENV);

  test.each(["admin", "superadmin", "superadmin2", "commercial", "user", "responsable_logistique_achat"])("role=%s -> allowed", (role) => {
    expect(manager.isRoleAllowed(role)).toBe(true);
    expect(manager.canUseAiCopilot({ role })).toEqual({ allowed: true, reason: null });
  });

  // "accueil" reste un rôle RÉEL de ce CRM (voir le commentaire ENUM en tête
  // de fichier) sans besoin métier identifié pour le Copilot — le cas
  // négatif explicitement demandé : un rôle réel, existant, toujours
  // refusé, jamais un rôle fabriqué.
  test.each(["accueil"])("role=%s -> NOT allowed (reason: role_not_allowed)", (role) => {
    expect(manager.isRoleAllowed(role)).toBe(false);
    expect(manager.canUseAiCopilot({ role })).toEqual({ allowed: false, reason: "role_not_allowed" });
  });

  test("an entirely unknown/garbage role is refused, never a crash", () => {
    expect(manager.isRoleAllowed("not_a_real_role")).toBe(false);
    expect(manager.canUseAiCopilot({ role: "not_a_real_role" })).toEqual({ allowed: false, reason: "role_not_allowed" });
  });

  test("no role at all (undefined user) is refused, never throws", () => {
    expect(() => manager.canUseAiCopilot(undefined)).not.toThrow();
    expect(manager.canUseAiCopilot(undefined)).toEqual({ allowed: false, reason: "role_not_allowed" });
  });
});

describe("AiManager.isRoleAllowed — normalized comparison (ÉTAPE 4: casse/espaces)", () => {
  test("a role read with incidental whitespace/case still matches the configured allow-list", () => {
    const manager = createDefaultAiManager(REAL_ENV);
    expect(manager.isRoleAllowed(" admin ")).toBe(true);
    expect(manager.isRoleAllowed("ADMIN")).toBe(true);
    expect(manager.isRoleAllowed("Commercial")).toBe(true);
  });

  test("an allow-list entry typed with a different case in .env still matches the real lowercase ENUM value", () => {
    const manager = createDefaultAiManager({ AI_COPILOT_ENABLED: "true", AI_COPILOT_ROLES_ALLOWED: "Admin, SuperAdmin" });
    expect(manager.isRoleAllowed("admin")).toBe(true);
    expect(manager.isRoleAllowed("superadmin")).toBe(true);
  });

  test("normalization is comparison-only — never mutates the configured list itself", () => {
    const manager = createDefaultAiManager({ AI_COPILOT_ENABLED: "true", AI_COPILOT_ROLES_ALLOWED: "Admin,SuperAdmin" });
    expect(manager.config.rolesAllowed).toEqual(["Admin", "SuperAdmin"]);
  });
});

describe("canUseAiCopilot() — copilot_disabled takes priority over role_not_allowed", () => {
  test("when the feature flag itself is off, the reason is copilot_disabled even for an otherwise-allowed role", () => {
    const manager = createDefaultAiManager({ AI_COPILOT_ENABLED: "false", AI_COPILOT_ROLES_ALLOWED: "admin" });
    expect(manager.canUseAiCopilot({ role: "admin" })).toEqual({ allowed: false, reason: "copilot_disabled" });
  });
});

describe("Real business rule: no MCP Tool exposes salary/payroll data at all (ÉTAPE 9)", () => {
  test("HR tools only expose leave/absence requests, never a salary field — the Copilot has no capability to leak what it cannot fetch", () => {
    const { createListHrRequestsTool } = require("../src/ai/mcp/tools/hr/listHrRequestsTool");
    const { createGetHrRequestTool } = require("../src/ai/mcp/tools/hr/getHrRequestTool");
    const listTool = createListHrRequestsTool();
    const getTool = createGetHrRequestTool();
    // "requiredRoles: []" here means "any authenticated Tool-caller may
    // call this Tool at all" — it does NOT mean "sees every user's data
    // unscoped": the underlying hrRequest.service.js still scopes results
    // to the caller's own requests unless they are an HR reviewer (see
    // HR_REVIEWER_ROLES elsewhere in this same tools/hr/ directory) — a
    // pre-existing CRM rule, unrelated to and unmodified by this fix.
    expect(listTool.requiredRoles).toEqual([]);
    expect(getTool.requiredRoles).toEqual([]);
    expect(listTool.description).not.toMatch(/salaire|salary|payroll/i);
    expect(getTool.description).not.toMatch(/salaire|salary|payroll/i);
  });
});

// Mission "CORRIGER L'AUTORISATION DU COPILOT POUR
// responsable_logistique_achat" — ÉTAPE 6/13 TEST 7 : autoriser ce rôle à
// UTILISER le Copilot (la porte grossière ci-dessus) ne doit jamais le faire
// passer les portes plus fines (PermissionManager par Tool). Preuve directe,
// avec le VRAI PermissionManager (jamais mocké) et un VRAI Tool admin-tier
// seul (list_users) que ce rôle n'a jamais eu le droit d'appeler, ni avant
// ni après ce correctif.
describe("Mission RLA-COPILOT — TEST 7 : autoriser le Copilot ne contourne jamais le RBAC des Tools", () => {
  test("responsable_logistique_achat passe désormais canUseAiCopilot() mais reste refusé par PermissionManager sur un Tool admin-tier (list_users)", () => {
    const manager = createDefaultAiManager(REAL_ENV);
    expect(manager.canUseAiCopilot({ role: "responsable_logistique_achat" })).toEqual({ allowed: true, reason: null });

    const { PermissionManager } = require("../src/ai/mcp/permissionManager");
    const { createServer } = require("../src/ai/mcp/server/start");
    const server = createServer({ rateLimiter: null, auditLog: null });
    const listUsersTool = server.toolRegistry.get("list_users");
    expect(() => new PermissionManager().assertCanCall(listUsersTool, { id: "x1", role: "responsable_logistique_achat" })).toThrow();
  });
});
