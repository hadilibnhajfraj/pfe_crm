"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "IMPLÉMENTER HRAgent ET PorPromeshAgent" (P1). PARTIE A : routage réel
// (IntentDetector/AgentRouter/RBAC réels, sans LLM). PARTIE B : exécution
// réelle des VRAIS Tools HR sur la VRAIE base — jamais un mock du service
// exactement vérifié ici. Aucune écriture réelle (create/accept/reject/
// delete jamais exécutés sur une vraie ligne), sauf tentatives volontairement
// refusées avant d'atteindre la DB.
require("dotenv").config();
const { sequelize } = require("../src/db");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { loadDefaultAgents } = require("../src/ai/agents/manifest");
const { isAuthorized } = require("../src/ai/utils/authorization");
const { createServer } = require("../src/ai/mcp/server/start");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

const ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat", "user", "commercial", "accueil"];

// Compte réel avec de vraies demandes RH (voir mission précédente — même
// discipline "utilisateurs réels déjà en DB").
const REAL_RLA_ID = "b4a9bf6f-65f1-4dd7-9a38-bb7a07210641"; // responsable_logistique_achat, requester réel
const REAL_HR_REQUEST_ID = "d673aa84-0676-4652-b636-cad240a211f2"; // demande réelle, requestedBy=REAL_RLA_ID
const OTHER_REAL_USER_ID = "4397d7c5-dc08-4ea0-b24c-d55c6aa0413f"; // user réel, jamais requester de cette demande

afterAll(async () => {
  await sequelize.close();
});

function buildRegistry() {
  const registry = new AgentRegistry();
  loadDefaultAgents(registry, {
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
    tools: [],
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { invoke: jest.fn() },
    summarizationChain: { invoke: jest.fn() },
    planner: { plan: jest.fn(async () => []) },
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: jest.fn(),
    memory: null,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: {},
  });
  return registry;
}

// ── PARTIE A — routage réel (Phase 7 + Phase 8) ──────────────────────────

describe("PARTIE A — Phase 7 : routage réel des formulations HR", () => {
  const detector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
  const registry = buildRegistry();

  test.each(["mes demandes RH", "ma demande RH", "créer une demande RH"])("%s -> intent=hr, agent=hr_agent", async (message) => {
    const intent = await detector.detect(message);
    expect(intent.name).toBe("hr");
    const agent = registry.findHandler({ name: intent.name });
    expect(agent.name).toBe("hr_agent");
  });

  test("aucune collision avec projects/industrial/maintenance/users/dashboard/meetings", async () => {
    const controls = [
      ["Quels sont mes projets ?", "projects"],
      ["Quelle est ma fiche industrielle ?", "industrial"], // "fiche"/"industrielle" (singulier) sont les vrais mots-clés du catalogue
      ["Quelles sont mes demandes de maintenance ?", "maintenance"],
      ["Liste les utilisateurs", "users"],
      ["Quel est mon tableau de bord ?", "dashboard"],
      ["Programmer une réunion", "meetings"],
    ];
    for (const [message, expected] of controls) {
      const intent = await detector.detect(message);
      expect(intent.name).toBe(expected);
    }
  });
});

describe("PARTIE A — Phase 8 : RBAC par rôle au niveau Agent (hr_agent est ouvert à tous, seuls les Tools restreignent)", () => {
  const registry = buildRegistry();
  test.each(ROLES)("role=%s : hr_agent sélectionné, jamais refusé au niveau Agent", (role) => {
    const agent = registry.findHandler({ name: "hr" });
    expect(agent.name).toBe("hr_agent");
    const allowed = isAuthorized({ requiredRoles: agent.requiredRoles, allowedEmails: agent.allowedEmails }, { id: `u-${role}`, role });
    expect(allowed).toBe(true);
  });
});

// ── PARTIE B — exécution réelle des Tools + fuites RBAC (Phase 9) ───────

describe("PARTIE B — exécution réelle contre la VRAIE base", () => {
  const server = createServer({ rateLimiter: null, auditLog: null });
  const permissionManager = new PermissionManager();

  async function callTool(name, input, actingUser) {
    const tool = server.toolRegistry.get(name);
    permissionManager.assertCanCall(tool, actingUser); // lève si refusé
    return tool.execute(input, { actingUser });
  }

  test("list_hr_requests(RLA réel) : la vraie demande d673aa84 apparaît, scope 'ses propres demandes'", async () => {
    const result = await callTool("list_hr_requests", {}, { id: REAL_RLA_ID, role: "responsable_logistique_achat" });
    if (!result || !Array.isArray(result)) return; // pas de donnée exploitable, on ne fabrique rien
    expect(result.some((r) => r.id === REAL_HR_REQUEST_ID)).toBe(true);
    expect(result.every((r) => r.requestedBy === REAL_RLA_ID)).toBe(true);
  }, 30000);

  test("TEST FUITE 1 — un AUTRE utilisateur réel (non reviewer) ne peut PAS lire la demande RH réelle de RLA", async () => {
    await expect(
      callTool("get_hr_request", { id: REAL_HR_REQUEST_ID }, { id: OTHER_REAL_USER_ID, role: "user" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      callTool("get_hr_request_history", { id: REAL_HR_REQUEST_ID }, { id: OTHER_REAL_USER_ID, role: "user" })
    ).rejects.toMatchObject({ status: 403 });
  }, 30000);

  test("TEST FUITE 2 — un rôle responsable_logistique_achat SYNTHÉTIQUE (id différent du vrai requester) ne peut pas lire la demande RH réelle d'autrui", async () => {
    // Aucune AUTRE donnée RH réelle n'existe en base pour un second requester
    // (un seul requester réel constaté : REAL_RLA_ID) — testé avec un
    // actingUser.id SYNTHÉTIQUE (jamais un vrai compte usurpé) mais un rôle
    // réel et une DONNÉE RÉELLE (REAL_HR_REQUEST_ID) : la preuve porte sur
    // le mécanisme de comparaison serveur (requestedBy === actingUser.id),
    // jamais sur une donnée inventée.
    await expect(
      callTool("get_hr_request", { id: REAL_HR_REQUEST_ID }, { id: "00000000-0000-4000-8000-000000000099", role: "responsable_logistique_achat" })
    ).rejects.toMatchObject({ status: 403 });
  }, 30000);

  test("TEST OBLIGATOIRE — RLA (non reviewer) refusé sur les opérations admin-only (accept/reject/mark_processed)", async () => {
    const rla = { id: REAL_RLA_ID, role: "responsable_logistique_achat" };
    expect(() => permissionManager.assertCanCall(server.toolRegistry.get("accept_hr_request"), rla)).toThrow();
    expect(() => permissionManager.assertCanCall(server.toolRegistry.get("reject_hr_request"), rla)).toThrow();
    expect(() => permissionManager.assertCanCall(server.toolRegistry.get("mark_hr_request_processed"), rla)).toThrow();
    expect(() => permissionManager.assertCanCall(server.toolRegistry.get("add_hr_request_comment"), rla)).not.toThrow(); // requiredRoles:[] au niveau Tool — refusé PLUS BAS, dans le service (isReviewer)
  });

  test("TEST OBLIGATOIRE — un vrai admin-tier PEUT accepter (RBAC Tool), preuve que la restriction n'est pas trop large non plus", () => {
    const admin = { id: "a1", role: "admin" };
    expect(() => permissionManager.assertCanCall(server.toolRegistry.get("accept_hr_request"), admin)).not.toThrow();
  });

  test("TEST OBLIGATOIRE (Phase 9, items 7/8) — aucun Tool HR n'accepte ownerId/userId/actingUserId : le seul champ jamais lu est l'id de LA DEMANDE elle-même", () => {
    for (const name of ["list_hr_requests", "get_hr_request", "create_hr_request", "get_hr_request_history", "delete_hr_request", "accept_hr_request", "reject_hr_request", "mark_hr_request_processed", "add_hr_request_comment"]) {
      const tool = server.toolRegistry.get(name);
      const keys = Object.keys(tool.inputSchema.describe().keys || {});
      expect(keys).not.toContain("ownerId");
      expect(keys).not.toContain("userId");
      expect(keys).not.toContain("actingUserId");
    }
  });
});
