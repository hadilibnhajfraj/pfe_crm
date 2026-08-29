"use strict";

// Mission "CORRIGER LE FILTRAGE DES PROJETS PAR STATUT" — TEST LIVE (VRAIE
// base, VRAI compte superadmin, VRAI Tool list_projects). Le chemin est
// entièrement déterministe (_runStatusQuery(), voir projectAgent.js) : le
// LLM n'est jamais sollicité, donc ce test n'a pas besoin d'Ollama et
// s'exécute rapidement. Lecture seule — aucune écriture.
require("dotenv").config();
const { sequelize } = require("../src/db");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { ConversationContinuityResolver } = require("../src/ai/orchestrator/conversationContinuityResolver");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { loadDefaultAgents } = require("../src/ai/agents/manifest");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { createServer } = require("../src/ai/mcp/server/start");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools/mcpToolAdapter");

const REAL_SUPERADMIN = { id: "6242fb88-a0bc-4535-bddd-5285b91ca0ed", role: "superadmin", email: "cbitunisia@cbi-tunisia.com" };

afterAll(async () => {
  await sequelize.close();
});

function buildManagerFor(actingUser) {
  const server = createServer({ rateLimiter: null, auditLog: null });
  const langchainTools = createMcpToolAdapters({ mcpServer: server, actingUser });

  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const registry = new AgentRegistry();
  const pendingActionStore = new PendingActionStore();
  loadDefaultAgents(registry, {
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: async () => { throw new Error("LLM non sollicité — chemin déterministe"); } } }),
    tools: langchainTools,
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { invoke: async () => ({ answer: "x", citations: [] }) },
    summarizationChain: { invoke: async () => ({ summary: "x" }) },
    planner: { plan: async () => [] },
    pendingActionStore,
    createCopilotMeeting: async () => {},
    memory,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: {},
  });

  return new AIManager({
    conversationManager,
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry: registry }),
    toolRouter: { select: () => [] },
    workflowManager: { run: async () => ({ mode: "qa", answer: "", citations: [], toolSteps: [] }) },
    responseBuilder: new ResponseBuilder(),
    continuityResolver: new ConversationContinuityResolver({ catalog: DEFAULT_INTENT_CATALOG }),
  });
}

describe("PHASE — TEST LIVE FILTRAGE PAR STATUT : « donner moi les projet dont son statut est Négociation » (VRAIE base)", () => {
  test.each([
    "donner moi les projet dont son statut est Négociation",
    "Donne-moi les projets au statut Négociation",
    "Liste les projets en Négociation",
    "Quels sont les projets dont le statut est Négociation ?",
    "Donne-moi les projets avec le statut négociation",
  ])("%s -> intent=projects, agent=project_agent, list_projects appelé avec statut='Négociation', réponse honnête et réellement fondée sur le Tool", async (message) => {
    const manager = buildManagerFor(REAL_SUPERADMIN);
    const response = await manager.handleMessage({ message, user: REAL_SUPERADMIN, conversationId: null });

    expect(response.intent).toBe("projects");
    expect(response.agent).toBe("project_agent");

    const step = response.toolCalls.find((c) => c.tool === "list_projects");
    expect(step).toBeDefined();
    expect(step.input.statut).toBe("Négociation");

    // toolCalls[].output pour ce chemin déterministe est un résumé texte
    // lisible ("N/M projet(s) au statut « ... »"), pas du JSON brut — même
    // convention que _runOwnerNameQuery/_runAttentionAnalysis dans ce même
    // fichier (voir projectAgent.js). Le total réel est extrait de ce
    // résumé, jamais recalculé/deviné.
    const match = String(step.output).match(/\d+\/(\d+) projet/);
    expect(match).not.toBeNull();
    const total = Number(match[1]);

    if (total > 0) {
      expect(response.answer).toContain(`${total} projet`);
      expect(response.answer).toMatch(/NÉGOCIATION/i);
    } else {
      expect(response.answer).toMatch(/Aucun projet trouvé/i);
    }
  }, 30000);

  test("le nombre réel de projets 'Négociation' (non archivés) correspond à ce que la base contient réellement", async () => {
    const Project = require("../src/models/Project");
    const realCount = await Project.count({ where: { statut: "Négociation", isArchived: false } });

    const manager = buildManagerFor(REAL_SUPERADMIN);
    const response = await manager.handleMessage({ message: "donner moi les projet dont son statut est Négociation", user: REAL_SUPERADMIN, conversationId: null });

    const step = response.toolCalls.find((c) => c.tool === "list_projects");
    const match = String(step.output).match(/\d+\/(\d+) projet/);
    expect(Number(match[1])).toBe(realCount);
  }, 30000);
});

describe("PHASE — non-régression : POR PROMESH et le chemin générique de ProjectAgent restent inchangés (Étape 9)", () => {
  test("« Quels projets sont critiques ? » continue de suivre le chemin d'attention déterministe (pas le statut)", async () => {
    const manager = buildManagerFor(REAL_SUPERADMIN);
    const response = await manager.handleMessage({ message: "Quels projets sont critiques ?", user: REAL_SUPERADMIN, conversationId: null });
    expect(response.intent).toBe("projects");
    expect(response.agent).toBe("project_agent");
    const step = response.toolCalls.find((c) => c.tool === "list_projects");
    expect(step.input.statut).toBeUndefined();
  }, 30000);
});
