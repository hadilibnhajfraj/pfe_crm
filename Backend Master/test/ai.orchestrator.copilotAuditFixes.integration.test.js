"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES 3 PROBLÈMES IDENTIFIÉS PAR L'AUDIT COPILOT" : preuve bout-en-bout,
// par rôle, avec le VRAI pipeline (IntentDetector -> AgentRouter -> RBAC ->
// Agent), et — pour la vérification RBAC finale — les VRAIS Tools branchés
// sur la VRAIE base (jamais un mock du mécanisme exactement vérifié ici).
require("dotenv").config();
const { sequelize } = require("../src/db");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { loadDefaultAgents } = require("../src/ai/agents/manifest");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { ALLOWED_PREFIXES_BY_ROLE } = require("../src/middleware/moduleAccessGuard");
const { createServer } = require("../src/ai/mcp/server/start");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");

const ROLES = ["admin", "superadmin", "superadmin2", "commercial", "user", "accueil", "responsable_logistique_achat", "finance_probar"];

function buildRealSystem() {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const registry = new AgentRegistry();
  loadDefaultAgents(registry, {
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: async () => { throw new Error("LLM non sollicité — chemins déterministes uniquement"); } } }),
    tools: [],
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { invoke: async () => ({ answer: "(RAG non exécuté dans ce test)", citations: [] }) },
    summarizationChain: { invoke: async () => ({ summary: "x" }) },
    planner: { plan: async () => [] },
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: async () => {},
    memory,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: ALLOWED_PREFIXES_BY_ROLE,
  });
  const manager = new AIManager({
    conversationManager,
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry: registry }),
    toolRouter: { select: () => [] },
    workflowManager: { run: async ({ intent }) => ({ mode: "qa", answer: `générique (${intent.name})`, citations: [], toolSteps: [] }) },
    responseBuilder: new ResponseBuilder(),
  });
  return { manager };
}

afterAll(async () => {
  await sequelize.close();
});

describe("PROBLÈME 2 — 'Qu'est-ce que je peux faire ?' atteint RoleCapabilityAuditAgent pour les 8 rôles réels", () => {
  test.each(ROLES)("role=%s", async (role) => {
    const { manager } = buildRealSystem();
    const response = await manager.handleMessage({
      message: "Qu'est-ce que je peux faire ?",
      user: { id: `test-${role}`, role },
      conversationId: `conv-fix2-${role}`,
    });

    expect(response.intent).toBe("capability_audit");
    expect(response.agent).toBe("role_capability_audit_agent");
    expect(response.mode).not.toBe("error");
    expect(response.answer).toMatch(new RegExp(`rôle : ${role}`));
    expect(response.toolCalls).toEqual([]); // READ-ONLY, jamais un Tool
  });

  test("finance_probar obtient explicitement NOT_IMPLEMENTED pour Finance/Achats, jamais une capacité inventée", async () => {
    const { manager } = buildRealSystem();
    const response = await manager.handleMessage({
      message: "Qu'est-ce que je peux faire ?",
      user: { id: "test-finance_probar", role: "finance_probar" },
      conversationId: "conv-fix2-finance-notimpl",
    });
    expect(response.answer).toMatch(/Non implémenté[\s\S]*Finance \/ Achats/);
  });
});

describe("PROBLÈME 1 — responsable_logistique_achat : questions métier réelles (jamais de fonctionnalité inventée)", () => {
  const RLA = { id: "test-responsable_logistique_achat", role: "responsable_logistique_achat" };

  test("'Quels sont mes enregistrements industriels ?' — rapporté tel quel : reste general_chat (gap PRÉ-EXISTANT hors-scope)", async () => {
    // intentCatalog.js::industrial n'a que des mots-clés au SINGULIER
    // ("industriel"/"industrielle"/"fiche"/"enregistrement") — "enregistrementS
    // industrielS" (pluriel) ne matche donc littéralement rien, un gap
    // pré-existant, indépendant des 3 problèmes de cette mission (jamais
    // touché : "Ne modifier que les 3 problèmes explicitement demandés").
    // "Puis-je consulter ma fiche industrielle ?" (singulier réel) route
    // correctement — voir test/ai.orchestrator.capabilityQuestionOverride.test.js.
    const { manager } = buildRealSystem();
    const response = await manager.handleMessage({ message: "Quels sont mes enregistrements industriels ?", user: RLA, conversationId: "conv-rla-industrial" });
    expect(response.intent).toBe("general_chat");
  });

  test("'Quels sont mes dossiers POR PROMESH ?' -> por_promesh, RBAC autorisé", async () => {
    const { manager } = buildRealSystem();
    const response = await manager.handleMessage({ message: "Quels sont mes dossiers POR PROMESH ?", user: RLA, conversationId: "conv-rla-por" });
    expect(response.intent).toBe("por_promesh");
    expect(response.mode).not.toBe("error");
  });

  test("'Quelles sont mes demandes de maintenance ?' -> maintenance, RBAC autorisé", async () => {
    const { manager } = buildRealSystem();
    const response = await manager.handleMessage({ message: "Quelles sont mes demandes de maintenance ?", user: RLA, conversationId: "conv-rla-maintenance" });
    expect(response.intent).toBe("maintenance");
    expect(response.mode).not.toBe("error");
  });

  test("'Quelles sont mes demandes RH ?' -> hr, RBAC autorisé", async () => {
    const { manager } = buildRealSystem();
    const response = await manager.handleMessage({ message: "Quelles sont mes demandes RH ?", user: RLA, conversationId: "conv-rla-hr" });
    expect(response.intent).toBe("hr");
    expect(response.mode).not.toBe("error");
  });

  test("'Quels sont mes modules disponibles ?' — rapporté tel quel, jamais forcé vers une intention inventée", async () => {
    const { manager } = buildRealSystem();
    const response = await manager.handleMessage({ message: "Quels sont mes modules disponibles ?", user: RLA, conversationId: "conv-rla-modules" });
    // Ni "modules" seul, ni "disponibles" seul ne sont des mots-clés
    // (voir capabilityQuestionOverride.js — "disponible" exige "moi" à ses
    // côtés, jamais ajouté seul) : cette formulation précise n'est PAS
    // couverte par les 13 familles de la mission, elle retombe donc en
    // repli RAG — documenté ici, pas silencieusement corrigé (hors-scope).
    expect(response.intent).toBe("general_chat");
  });
});

describe("PROBLÈME 3 + SÉCURITÉ RBAC — 'Donne-moi les projets de Hadil' route vers projects ET reste scopé serveur", () => {
  const COMMERCIAL_REAL_ID = "b7c50110-31de-4d2c-96b4-5a117c9e262a"; // compte réel, non-admin
  const HADIL_REAL_ID = "516f6dca-7a6f-43cb-b527-5c5652e3e03f"; // compte réel, cible de la tentative

  test("routage réel : 'Donne-moi les projets de Hadil' -> intent=projects (pas 'users')", async () => {
    const { manager } = buildRealSystem();
    const response = await manager.handleMessage({
      message: "Donne-moi les projets de Hadil",
      user: { id: COMMERCIAL_REAL_ID, role: "commercial" },
      conversationId: "conv-fix3-routing",
    });
    expect(response.intent).toBe("projects");
  });

  test("Tool réel : même si 'ownerId'/'userId'/'mine=false' visent explicitement Hadil, un commercial non-admin reste scopé à lui-même (scopeInputForActingUser, jamais contourné)", async () => {
    const server = createServer({ rateLimiter: null, auditLog: null });
    const permissionManager = new PermissionManager();
    const tool = server.toolRegistry.get("list_projects");
    const actingUser = { id: COMMERCIAL_REAL_ID, role: "commercial" };
    permissionManager.assertCanCall(tool, actingUser); // ne doit jamais lever

    for (const input of [{ ownerId: HADIL_REAL_ID }, { userId: HADIL_REAL_ID }, { mine: false }, { ownerId: HADIL_REAL_ID, mine: false }]) {
      const result = await tool.execute(input, { actingUser });
      const foreignOwners = (result.data || []).map((p) => p.ownerId).filter((id) => id && id !== COMMERCIAL_REAL_ID);
      expect(foreignOwners).toEqual([]); // jamais une donnée de Hadil, quel que soit le champ tenté
    }
  }, 30000);
});
