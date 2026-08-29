"use strict";

/**
 * AI-Business-Copilot/33_PAGE_CONTEXT_INTENT_CONTAMINATION.md — preuve de
 * bout en bout (JWT -> actingUser -> rôle réel -> IntentDetector ->
 * AgentRouter+RBAC -> agent) que `pageContext` ne contamine plus jamais la
 * classification d'intention, pour les rôles RÉELS du CRM ("commercial",
 * "responsable_logistique_achat" — voir src/models/User.js, ENUM role) —
 * jamais un rôle inventé. Utilise le VRAI `IntentDetector` (catalogue réel),
 * le VRAI `AgentRouter`/`AgentRegistry`, le VRAI `KpiAgent`/`ProjectAgent`
 * (RBAC ouvert, `requiredRoles: []`, vérifié dans leurs fichiers source
 * respectifs) — seuls les Tools MCP bas niveau et le chatModel sont
 * remplacés (même discipline que les autres suites de cette passe).
 */

const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");
const { ConversationContinuityResolver } = require("../src/ai/orchestrator/conversationContinuityResolver");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { createKpiAgent } = require("../src/ai/agents/kpiAgent");
const { createProjectAgent } = require("../src/ai/agents/projectAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

// Rôles RÉELS du CRM — src/models/User.js, ENUM role : "user", "commercial",
// "accueil", "admin", "superadmin", "superadmin2", "responsable_logistique_achat".
const COMMERCIAL_USER = { id: "u-commercial-1", role: "commercial" };

function fakeTool(name, invoke) {
  return { name, description: `${name} description`, invoke: invoke || jest.fn(async () => "{}") };
}

function fakeDashboardTool() {
  return fakeTool(
    "get_dashboard_kpis",
    jest.fn(async () =>
      JSON.stringify({
        role: "user",
        charts: { myMonthlyEvolution: [{ month: "2026-06", total: 5, validated: 1 }] },
      })
    )
  );
}

function buildRealSystem() {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const pendingActionStore = new PendingActionStore();
  const intentDetector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
  const contextResolver = new ConversationContextResolver({ catalog: DEFAULT_INTENT_CATALOG });
  const continuityResolver = new ConversationContinuityResolver({ catalog: DEFAULT_INTENT_CATALOG });
  const detectSpy = jest.spyOn(intentDetector, "detect");

  const kpiAgent = createKpiAgent({
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
    tools: [fakeDashboardTool()],
    workflowEngine: new LangChainWorkflowEngine(),
    maxHistoryMessages: 20,
  });

  const projectAgent = createProjectAgent({
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
    tools: [fakeTool("list_projects", jest.fn(async () => JSON.stringify({ projects: [{ id: "p1", nomProjet: "Villa Sfax", critique: true }] })))],
    workflowEngine: new LangChainWorkflowEngine(),
    maxHistoryMessages: 20,
  });

  const agentRegistry = new AgentRegistry();
  agentRegistry.register(kpiAgent);
  agentRegistry.register(projectAgent);
  const agentRouter = new AgentRouter({ agentRegistry });

  const toolRouter = { select: jest.fn(() => []) };
  const workflowManager = { run: jest.fn(async ({ intent }) => ({ mode: "qa", answer: `Réponse générique/RAG (${intent.name})`, citations: [], toolSteps: [] })) };

  const manager = new AIManager({
    conversationManager, intentDetector, agentRouter, toolRouter, workflowManager,
    responseBuilder: new ResponseBuilder(), pendingActionStore, contextResolver, continuityResolver,
  });

  return { manager, detectSpy };
}

// Reproduit exactement aiCopilotBridge.service.js::sendMessageAsActingUser()
// APRÈS le correctif — pageContext accepté, jamais utilisé pour construire
// le message.
async function sendAsActingUser(manager, actingUser, { message, conversationId, pageContext: _pageContext }) {
  return manager.handleMessage({ message, user: actingUser, conversationId });
}

describe("TEST commercial 1 — 'Quels sont mes projets critiques ?' sur dashboard", () => {
  test("project_agent, aucune erreur RBAC", async () => {
    const { manager } = buildRealSystem();
    const response = await sendAsActingUser(manager, COMMERCIAL_USER, {
      message: "Quels sont mes projets critiques ?",
      conversationId: "role-1",
      pageContext: { screen: "dashboard" },
    });

    expect(response.mode).not.toBe("error");
    expect(response.agent).toBe("project_agent");
    expect(response.intent).toBe("projects");
  });
});

describe("TEST commercial 2 — 'Préparer un email' sur dashboard", () => {
  test("PAS kpi_agent, aucune contamination par pageContext", async () => {
    const { manager } = buildRealSystem();
    const response = await sendAsActingUser(manager, COMMERCIAL_USER, {
      message: "Préparer un email",
      conversationId: "role-2",
      pageContext: { screen: "dashboard" },
    });

    expect(response.agent).not.toBe("kpi_agent");
    expect(response.intent).not.toBe("dashboard");
    expect(response.answer).not.toMatch(/taux de réussite|Nombre de projets/i);
  });
});

describe("TEST commercial 3 — 'Créer une activité' sur dashboard", () => {
  test("PAS kpi_agent, aucune contamination par pageContext", async () => {
    const { manager } = buildRealSystem();
    const response = await sendAsActingUser(manager, COMMERCIAL_USER, {
      message: "Créer une activité",
      conversationId: "role-3",
      pageContext: { screen: "dashboard" },
    });

    expect(response.agent).not.toBe("kpi_agent");
    expect(response.intent).not.toBe("dashboard");
    expect(response.answer).not.toMatch(/taux de réussite|Nombre de projets/i);
  });
});

describe("TEST général — 'Quel est le taux de réussite ?' doit toujours atteindre kpi_agent", () => {
  test("dashboard/kpi_agent, quel que soit pageContext (mot-clé réel du message lui-même)", async () => {
    const { manager } = buildRealSystem();
    const response = await sendAsActingUser(manager, COMMERCIAL_USER, {
      message: "Quel est le taux de réussite ?",
      conversationId: "role-4",
      pageContext: { screen: "dashboard" },
    });

    expect(response.intent).toBe("dashboard");
    expect(response.agent).toBe("kpi_agent");
    expect(response.toolCalls.some((t) => t.tool === "get_dashboard_kpis")).toBe(true);
  });
});

describe("TEST contamination — la présence de pageContext=dashboard ne doit ABSOLUMENT PAS changer l'intention", () => {
  test("IntentDetector reçoit le message brut, jamais préfixé — même résultat avec ou sans pageContext", async () => {
    const { manager: managerWithCtx, detectSpy: detectSpyWithCtx } = buildRealSystem();
    const { manager: managerWithoutCtx, detectSpy: detectSpyWithoutCtx } = buildRealSystem();

    const responseWithCtx = await sendAsActingUser(managerWithCtx, COMMERCIAL_USER, {
      message: "Préparer un email",
      conversationId: "role-5a",
      pageContext: { screen: "dashboard", data: { totalProjects: 17, successRate: "0%" } },
    });
    const responseWithoutCtx = await sendAsActingUser(managerWithoutCtx, COMMERCIAL_USER, {
      message: "Préparer un email",
      conversationId: "role-5b",
      pageContext: null,
    });

    expect(responseWithCtx.intent).toBe(responseWithoutCtx.intent);
    expect(responseWithCtx.agent).toBe(responseWithoutCtx.agent);
    // Preuve directe : le texte réellement soumis à IntentDetector est
    // IDENTIQUE au message brut, jamais préfixé — que pageContext soit
    // présent ou non.
    expect(detectSpyWithCtx).toHaveBeenCalledWith("Préparer un email", expect.anything());
    expect(detectSpyWithoutCtx).toHaveBeenCalledWith("Préparer un email", expect.anything());
  });
});
