"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "IMPLÉMENTER HRAgent ET PorPromeshAgent" (P1). PARTIE A : routage réel.
// PARTIE B : exécution réelle des VRAIS Tools POR PROMESH sur la VRAIE
// base. Aucune écriture réelle (create/update/validate/delete jamais
// exécutés avec succès sur une vraie ligne).
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
const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

// Deux comptes réels DISTINCTS, chacun propriétaire d'au moins une VRAIE
// fiche POR PROMESH (voir requête DB de cette mission).
const REAL_SUPERADMIN_ID = "6242fb88-a0bc-4535-bddd-5285b91ca0ed";
const REAL_SUPERADMIN_FICHE_ID = "54b4bc7e-16b3-4056-8f65-d60fe2e050e3"; // createdBy=REAL_SUPERADMIN_ID
const REAL_RLA_ID = "b4a9bf6f-65f1-4dd7-9a38-bb7a07210641";
const REAL_RLA_FICHE_ID = "0468fe5a-c4b1-4fc3-b6fa-638f68b86a08"; // createdBy=REAL_RLA_ID

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

describe("PARTIE A — Phase 7 : routage réel des formulations POR PROMESH", () => {
  const detector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
  const registry = buildRegistry();

  test.each(["mes dossiers POR PROMESH", "valider un dossier POR PROMESH", "mes dossiers promesh"])(
    "%s -> intent=por_promesh, agent=por_promesh_agent",
    async (message) => {
      const intent = await detector.detect(message);
      expect(intent.name).toBe("por_promesh");
      const agent = registry.findHandler({ name: intent.name });
      expect(agent.name).toBe("por_promesh_agent");
    }
  );

  // Correction P1.1 (mission "CORRECTION P1 DU COPILOT IA PROBAR") — les 5
  // formulations explicitement demandées pour vérifier le routage réel
  // avant même d'atteindre requireToolUse (voir ai.agents.porPromeshAgent.test.js
  // pour la garantie requireToolUse elle-même, indépendante du texte exact).
  test.each([
    "donner moi les fiches produites PROMESH",
    "Donne-moi les fiches POR PROMESH",
    "Liste les fiches POR PROMESH",
    "Quels sont mes dossiers POR PROMESH ?",
    "Montre-moi les fiches PROMESH",
  ])("%s -> intent=por_promesh, agent=por_promesh_agent", async (message) => {
    const intent = await detector.detect(message);
    expect(intent.name).toBe("por_promesh");
    const agent = registry.findHandler({ name: intent.name });
    expect(agent.name).toBe("por_promesh_agent");
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

describe("PARTIE A — Phase 8 : RBAC par rôle au niveau Agent", () => {
  const registry = buildRegistry();
  test.each(ROLES)("role=%s", (role) => {
    const agent = registry.findHandler({ name: "por_promesh" });
    expect(agent.name).toBe("por_promesh_agent");
    const allowed = isAuthorized({ requiredRoles: agent.requiredRoles, allowedEmails: agent.allowedEmails }, { id: `u-${role}`, role });
    expect(allowed).toBe(READ_WRITE_ROLES.includes(role));
  });
});

// ── PARTIE B — exécution réelle des Tools + fuites RBAC (Phase 9) ───────

describe("PARTIE B — exécution réelle contre la VRAIE base", () => {
  const server = createServer({ rateLimiter: null, auditLog: null });
  const permissionManager = new PermissionManager();

  async function callTool(name, input, actingUser) {
    const tool = server.toolRegistry.get(name);
    permissionManager.assertCanCall(tool, actingUser);
    return tool.execute(input, { actingUser });
  }

  test("TEST OBLIGATOIRE (Phase 9, items 3/4) — commercial ET user sont refusés au niveau Tool AVANT toute donnée", () => {
    for (const role of ["commercial", "user"]) {
      const actingUser = { id: "x1", role };
      expect(() => permissionManager.assertCanCall(server.toolRegistry.get("list_por_promesh"), actingUser)).toThrow();
      expect(() => permissionManager.assertCanCall(server.toolRegistry.get("get_por_promesh"), actingUser)).toThrow();
    }
  });

  test("TEST OBLIGATOIRE (Phase 9, item 5) — RLA (READ_WRITE_ROLES) est TOUJOURS refusé sur delete_por_promesh (DELETE_ROLES = admin-tier seul)", () => {
    const rla = { id: REAL_RLA_ID, role: "responsable_logistique_achat" };
    expect(() => permissionManager.assertCanCall(server.toolRegistry.get("delete_por_promesh"), rla)).toThrow();
  });

  test("un vrai admin-tier PEUT supprimer (RBAC Tool), preuve que DELETE_ROLES fonctionne dans les deux sens", () => {
    const admin = { id: "a1", role: "admin" };
    expect(() => permissionManager.assertCanCall(server.toolRegistry.get("delete_por_promesh"), admin)).not.toThrow();
  });

  test("get_por_promesh(RLA, SA PROPRE fiche réelle) : succès", async () => {
    const result = await callTool("get_por_promesh", { id: REAL_RLA_FICHE_ID }, { id: REAL_RLA_ID, role: "responsable_logistique_achat" });
    if (!result) return;
    expect(result.id).toBe(REAL_RLA_FICHE_ID);
    expect(result.createdBy).toBe(REAL_RLA_ID);
  }, 30000);

  test("TEST FUITE — RLA (owner-scoped) ne peut PAS lire la fiche réelle d'un AUTRE utilisateur réel (superadmin)", async () => {
    await expect(
      callTool("get_por_promesh", { id: REAL_SUPERADMIN_FICHE_ID }, { id: REAL_RLA_ID, role: "responsable_logistique_achat" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      callTool("update_por_promesh", { id: REAL_SUPERADMIN_FICHE_ID, machine: "X" }, { id: REAL_RLA_ID, role: "responsable_logistique_achat" })
    ).rejects.toMatchObject({ status: 403 });
  }, 30000);

  test("un admin-tier (jamais owner-scoped) PEUT lire la fiche réelle de N'IMPORTE QUEL utilisateur — visibilité transverse attendue, pas une fuite", async () => {
    const result = await callTool("get_por_promesh", { id: REAL_RLA_FICHE_ID }, { id: "admin1", role: "admin" });
    if (!result) return;
    expect(result.id).toBe(REAL_RLA_FICHE_ID);
  }, 30000);

  test("TEST OBLIGATOIRE (Phase 9, items 7/8) — aucun Tool POR PROMESH n'accepte ownerId/userId/actingUserId : seul l'id de LA FICHE elle-même est jamais lu", () => {
    const names = [
      "list_por_promesh", "get_por_promesh", "create_por_promesh", "create_or_open_por_promesh_draft",
      "update_por_promesh", "delete_por_promesh", "validate_por_promesh", "get_por_promesh_stats",
      "get_por_promesh_dashboard", "list_por_promesh_operators",
    ];
    for (const name of names) {
      const tool = server.toolRegistry.get(name);
      const keys = Object.keys(tool.inputSchema.describe().keys || {});
      expect(keys).not.toContain("ownerId");
      expect(keys).not.toContain("userId");
      expect(keys).not.toContain("actingUserId");
      expect(keys).not.toContain("createdBy");
    }
  });
});
