"use strict";

// Verifies the bridge's own responsibilities in isolation — actingUser
// mapping, the per-user orchestrator cache, the RAG ingestion-once guard,
// and the conversation index — against FAKE createServer()/
// createAiOrchestrator()/createRagPipeline()/createSecurityPipeline()/
// createDefaultAiManager() (jest.mock), never a real MCP server, LLM call,
// or Sequelize model. Mirrors test/aiDashboardBridge.service.test.js.

const mockMcpServer = { name: "fake-mcp-server", handleMessage: jest.fn() };
const mockCreateServer = jest.fn(() => mockMcpServer);
jest.mock("../src/ai/mcp/server/start", () => ({ createServer: mockCreateServer }));

function fakeOrchestratorFor(actingUser) {
  return {
    actingUser,
    aiManager: { handleMessage: jest.fn(async ({ conversationId }) => ({ conversationId, intent: "projects", mode: "agent", answer: `réponse pour ${actingUser.id}` })) },
    conversationManager: { getHistory: jest.fn(async () => [{ role: "user", content: "hi" }]) },
  };
}
const mockCreateAiOrchestrator = jest.fn((opts) => fakeOrchestratorFor(opts.actingUser));
jest.mock("../src/ai/orchestrator/pipeline", () => ({ createAiOrchestrator: (...args) => mockCreateAiOrchestrator(...args) }));

const mockIngestDirectories = jest.fn(async () => []);
const mockRetrievalService = { retrieve: jest.fn() };
const mockCreateRagPipeline = jest.fn(() => ({ retrievalService: mockRetrievalService, ingestionService: { ingestDirectories: mockIngestDirectories } }));
jest.mock("../src/ai/rag/pipeline", () => ({ createRagPipeline: (...args) => mockCreateRagPipeline(...args) }));
jest.mock("../src/ai/rag/reindex", () => ({ DEFAULT_CORPUS_ROOTS: ["fake-root"] }));

const mockSecurity = { rateLimiter: { fake: "rateLimiter" }, auditLog: { fake: "auditLog" }, promptInjectionGuard: { fake: "guard" } };
const mockCreateSecurityPipeline = jest.fn(() => mockSecurity);
jest.mock("../src/ai/security", () => ({ createSecurityPipeline: (...args) => mockCreateSecurityPipeline(...args) }));

const fakeLlmProvider = { fake: "llmProvider" };
const mockGateManager = {
  isEnabled: jest.fn(() => true),
  isRoleAllowed: jest.fn(() => true),
  canUseAiCopilot: jest.fn(() => ({ allowed: true, reason: null })),
  requireLlmProvider: jest.fn(() => fakeLlmProvider),
};
const mockCreateDefaultAiManager = jest.fn(() => mockGateManager);
jest.mock("../src/ai/manager", () => ({ createDefaultAiManager: (...args) => mockCreateDefaultAiManager(...args) }));

jest.mock("uuid", () => ({ v4: jest.fn(() => "generated-conversation-id") }));

const REQ_USER = { sub: "u1", role: "admin", email: "a@b.com" };
const REQ_USER_2 = { sub: "u2", role: "commercial", email: "b@c.com" };

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe("aiCopilotBridge.service — actingUser mapping", () => {
  test("toActingUser maps {sub, role, email} to {id, role, email}", () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    expect(bridge.toActingUser(REQ_USER)).toEqual({ id: "u1", role: "admin", email: "a@b.com" });
  });
});

describe("aiCopilotBridge.service — gate passthrough", () => {
  test("isEnabled()/isRoleAllowed() delegate to createDefaultAiManager()", () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    mockGateManager.isEnabled.mockReturnValue(false);
    expect(bridge.isEnabled()).toBe(false);
    mockGateManager.isRoleAllowed.mockReturnValue(false);
    expect(bridge.isRoleAllowed("user")).toBe(false);
    expect(mockGateManager.isRoleAllowed).toHaveBeenCalledWith("user");
  });
});

describe("aiCopilotBridge.service — canUseAiCopilot (single source of truth + [AI-COPILOT] diagnostic log)", () => {
  test("delegates the decision to AiManager.canUseAiCopilot()", () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    mockGateManager.canUseAiCopilot.mockReturnValue({ allowed: false, reason: "role_not_allowed" });
    expect(bridge.canUseAiCopilot(REQ_USER_2)).toEqual({ allowed: false, reason: "role_not_allowed" });
    expect(mockGateManager.canUseAiCopilot).toHaveBeenCalledWith(REQ_USER_2);
  });

  test("logs [AI-COPILOT] permission check with userId/role/allowed, on both an allow and a refusal", () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    mockGateManager.canUseAiCopilot.mockReturnValue({ allowed: true, reason: null });
    bridge.canUseAiCopilot(REQ_USER);
    mockGateManager.canUseAiCopilot.mockReturnValue({ allowed: false, reason: "role_not_allowed" });
    bridge.canUseAiCopilot(REQ_USER_2);

    const logged = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logged).toContain("[AI-COPILOT] permission check userId=u1 role=admin allowed=true");
    expect(logged).toContain("[AI-COPILOT] permission check userId=u2 role=commercial allowed=false");
    // Mission "CORRIGER L'AUTORISATION DU COPILOT POUR
    // responsable_logistique_achat" — ÉTAPE 13 TEST 8 : aucun secret
    // (mot de passe/JWT/token) n'apparaît jamais dans ce log, seuls
    // userId/role/allowed (déjà non-secrets, visibles dans tout écran
    // d'admin listant les utilisateurs).
    expect(logged).not.toMatch(/password|mot de passe|token|bearer|authorization/i);

    logSpy.mockRestore();
  });

  test("never throws and never logs a crash on a malformed/undefined user", () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    mockGateManager.canUseAiCopilot.mockReturnValue({ allowed: false, reason: "role_not_allowed" });
    expect(() => bridge.canUseAiCopilot(undefined)).not.toThrow();
  });
});

describe("aiCopilotBridge.service — sendMessage()", () => {
  test("ingests the RAG corpus exactly once even across multiple messages/users", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    await bridge.sendMessage(REQ_USER, { message: "a", conversationId: "c1" });
    await bridge.sendMessage(REQ_USER, { message: "b", conversationId: "c1" });
    await bridge.sendMessage(REQ_USER_2, { message: "c", conversationId: "c2" });
    expect(mockIngestDirectories).toHaveBeenCalledTimes(1);
  });

  test("builds exactly ONE orchestrator per user, reused across messages", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    await bridge.sendMessage(REQ_USER, { message: "a", conversationId: "c1" });
    await bridge.sendMessage(REQ_USER, { message: "b", conversationId: "c1" });
    expect(mockCreateAiOrchestrator).toHaveBeenCalledTimes(1);
    expect(mockCreateAiOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        actingUser: { id: "u1", role: "admin", email: "a@b.com" },
        mcpServer: mockMcpServer,
        llmProvider: fakeLlmProvider,
        retriever: mockRetrievalService,
      })
    );
  });

  test("builds a SEPARATE orchestrator for a different user", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    await bridge.sendMessage(REQ_USER, { message: "a", conversationId: "c1" });
    await bridge.sendMessage(REQ_USER_2, { message: "c", conversationId: "c2" });
    expect(mockCreateAiOrchestrator).toHaveBeenCalledTimes(2);
  });

  test("generates a conversationId via uuid when none is provided", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    const response = await bridge.sendMessage(REQ_USER, { message: "a", conversationId: null });
    expect(response.conversationId).toBe("generated-conversation-id");
  });

  test("passes an explicit conversationId through unchanged", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    const response = await bridge.sendMessage(REQ_USER, { message: "a", conversationId: "my-conv" });
    expect(response.conversationId).toBe("my-conv");
  });

  test("shares the SAME security pipeline instance between McpServer and the orchestrator", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    await bridge.sendMessage(REQ_USER, { message: "a", conversationId: "c1" });
    expect(mockCreateServer).toHaveBeenCalledWith({ rateLimiter: mockSecurity.rateLimiter, auditLog: mockSecurity.auditLog });
    expect(mockCreateAiOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ promptInjectionGuard: mockSecurity.promptInjectionGuard, auditLog: mockSecurity.auditLog })
    );
  });
});

describe("aiCopilotBridge.service — pageContext ne contamine plus jamais l'intention (AI-Business-Copilot/33_PAGE_CONTEXT_INTENT_CONTAMINATION.md)", () => {
  // Reproduit en direct : l'ancienne garde "n'ajoute le préfixe QUE si le
  // message brut seul est déjà general_chat" ne protégeait que la MOITIÉ du
  // problème — un message SANS mot-clé propre ("Créer une activité",
  // "Préparer un email") passait la garde (general_chat sur le message
  // brut), puis le préfixe LUI-MÊME ("[...le tableau de bord.]") portait de
  // VRAIS mots-clés du catalogue ("tableau"/"bord", intentCatalog.js) qui
  // faisaient basculer la classification FINALE (dans AIManager) vers
  // "dashboard" → kpi_agent. Correctif : `message` est désormais TOUJOURS
  // transmis tel quel à AIManager.handleMessage(), quel que soit
  // `pageContext` — plus aucun chemin de contamination possible.
  test("un pageContext réel n'altère JAMAIS le message transmis à AIManager", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    const pageContext = { screen: "project", label: "Villa Sfax", data: { statut: "en_cours" } };

    await bridge.sendMessage(REQ_USER, { message: "Quel est le statut ?", conversationId: "c1", pageContext });

    const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
    const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
    expect(handleMessageCall.message).toBe("Quel est le statut ?");
  });

  test("no pageContext (absent/null) leaves the message completely unchanged", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    await bridge.sendMessage(REQ_USER, { message: "Bonjour", conversationId: "c1" });

    const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
    const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
    expect(handleMessageCall.message).toBe("Bonjour");
  });

  test("a malformed pageContext never breaks the turn — message inchangé, comme tout pageContext", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    await bridge.sendMessage(REQ_USER, { message: "Bonjour", conversationId: "c1", pageContext: { garbage: true } });

    const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
    const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
    expect(handleMessageCall.message).toBe("Bonjour");
  });

  // AI-Business-Copilot/10_INTENT_ROUTING_FIX.md, étape 14 — "INTENTION
  // UTILISATEUR > CONTEXTE PAGE" : la propriété demandée (une question qui
  // porte son propre mot-clé l'emporte toujours) est maintenant garantie
  // STRUCTURELLEMENT — plus par une garde à demi fiable, mais parce que le
  // message n'est plus jamais réécrit du tout.
  describe("étape 14 — priorité intention > contexte, pour 'Comment créer un projet ?' sur chaque écran", () => {
    test.each([
      ["dashboard", { screen: "dashboard" }],
      ["project", { screen: "project", label: "Villa Sfax", data: { statut: "en_cours" } }],
      ["commercial", { screen: "commercial", label: "STE Delta" }],
    ])("écran %s : le message atteint AIManager SANS préfixe de contexte", async (_screenName, pageContext) => {
      const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
      await bridge.sendMessage(REQ_USER, { message: "Comment créer un projet ?", conversationId: "c1", pageContext });

      const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
      const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
      expect(handleMessageCall.message).toBe("Comment créer un projet ?");
    });

    test("le test de régression exact de l'incident, sur écran dashboard : 'donne-moi les instructions comment je peux créer un projet' atteint AIManager SANS préfixe", async () => {
      const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
      await bridge.sendMessage(REQ_USER, { message: "donne-moi les instructions comment je peux créer un projet", conversationId: "c1", pageContext: { screen: "dashboard" } });

      const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
      const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
      expect(handleMessageCall.message).toBe("donne-moi les instructions comment je peux créer un projet");
    });

    // AI-Business-Copilot/33_PAGE_CONTEXT_INTENT_CONTAMINATION.md — corrige
    // l'ancien "contre-exemple honnête" (qui documentait le BUG comme un
    // comportement voulu) : un message SANS mot-clé propre, sur l'écran
    // dashboard, ne doit désormais JAMAIS recevoir de préfixe, exactement
    // comme n'importe quel autre écran.
    test("un message sans mot-clé propre ('Montre les ventes.') n'est plus jamais préfixé, même sur l'écran dashboard", async () => {
      const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
      await bridge.sendMessage(REQ_USER, { message: "Montre les ventes.", conversationId: "c1", pageContext: { screen: "dashboard" } });

      const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
      const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
      expect(handleMessageCall.message).toBe("Montre les ventes.");
    });
  });

  // AI-Business-Copilot/33_PAGE_CONTEXT_INTENT_CONTAMINATION.md — les deux
  // messages RÉELLEMENT reportés en production : "Créer une activité" et
  // "Préparer un email", sur l'écran dashboard, ne portent AUCUN mot-clé de
  // catalogue propre — c'est exactement le cas que l'ancienne garde
  // laissait passer (general_chat sur le message brut) avant de le
  // corrompre avec le préfixe.
  describe("étape 18 — régression bug pageContext->dashboard : 'Créer une activité'/'Préparer un email' jamais absorbés", () => {
    test.each([
      ["Créer une activité"],
      ["Préparer un email"],
    ])("écran dashboard, message %s : atteint AIManager strictement inchangé", async (message) => {
      const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
      await bridge.sendMessage(REQ_USER, { message, conversationId: "c1", pageContext: { screen: "dashboard" } });

      const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
      const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
      expect(handleMessageCall.message).toBe(message);
    });
  });

  // AI-Business-Copilot/11_MEETING_AGENT_FIX.md — RÉGRESSION OBLIGATOIRE
  // (bug 2) : "Programmer une réunion" n'a AUCUN mot-clé de catalogue à lui
  // seul (repli general_chat) — avant l'ajout de l'intention `meetings`
  // (intentCatalog.js), la garde de l'étape 14 le laissait donc passer et
  // le préfixe dashboard ("tableau"/"bord") l'absorbait à tort en KPI. Avec
  // `meetings` maintenant réelle, le message porte son propre signal
  // ("réunion") : la MÊME garde, sans aucune modification supplémentaire,
  // le protège désormais aussi.
  describe("étape 16 — régression bug 2, 'Programmer une réunion' sur chaque écran", () => {
    test.each([
      ["dashboard", { screen: "dashboard" }],
      ["project", { screen: "project", label: "Villa Sfax" }],
      ["commercial", { screen: "commercial", label: "STE Delta" }],
    ])("écran %s : le message atteint AIManager SANS préfixe de contexte (jamais absorbé par dashboard/kpi_agent)", async (_screenName, pageContext) => {
      const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
      await bridge.sendMessage(REQ_USER, { message: "Programmer une réunion", conversationId: "c1", pageContext });

      const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
      const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
      expect(handleMessageCall.message).toBe("Programmer une réunion");
    });
  });

  // AI-Business-Copilot/16_REMINDER_ROUTING.md — RÉGRESSION OBLIGATOIRE :
  // "Créer un rappel" n'avait AUCUN mot-clé de catalogue (repli
  // general_chat) — avant l'ajout de l'intention `reminders`
  // (intentCatalog.js), la garde de l'étape 14 le laissait donc passer et
  // le préfixe dashboard ("tableau"/"bord") l'absorbait à tort en KPI
  // ("17 projets personnels, taux de réussite de 0%..."). Avec `reminders`
  // maintenant réelle, le message porte son propre signal ("rappel") : la
  // MÊME garde, sans aucune modification supplémentaire, le protège
  // désormais aussi — exactement comme pour `meetings` (étape 16).
  describe("étape 17 — régression 'Créer un rappel' sur chaque écran (jamais absorbé par dashboard/kpi_agent)", () => {
    test.each([
      ["dashboard", { screen: "dashboard" }],
      ["project", { screen: "project", label: "Villa Sfax" }],
      ["commercial", { screen: "commercial", label: "STE Delta" }],
    ])("écran %s : le message atteint AIManager SANS préfixe de contexte", async (_screenName, pageContext) => {
      const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
      await bridge.sendMessage(REQ_USER, { message: "Créer un rappel", conversationId: "c1", pageContext });

      const orchestrator = mockCreateAiOrchestrator.mock.results[0].value;
      const handleMessageCall = orchestrator.aiManager.handleMessage.mock.calls[0][0];
      expect(handleMessageCall.message).toBe("Créer un rappel");
    });
  });
});

describe("aiCopilotBridge.service — Proactive AI (confirmProactiveWorkflow/rejectProactiveWorkflow)", () => {
  function proposeWorkflow(bridge, { workflowId = "w1", recipientUserId = "u1", tool = "create_project_action", input = { projectId: "p1" }, label = "Créer un rappel" } = {}) {
    const { getProactiveActionStore } = require("../src/ai/proactive/proactiveActionStore");
    getProactiveActionStore().propose(workflowId, { recipientUserId, tool, input, label, reason: "x", domain: "projects", subject: "Projet en retard" });
    return workflowId;
  }

  test("confirmProactiveWorkflow: exécute le Tool via mcpServer.handleMessage() avec l'actingUser du CONFIRMANT (pas celui du cron)", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    mockMcpServer.handleMessage.mockResolvedValue({ jsonrpc: "2.0", id: "x", result: { content: [{ type: "text", text: JSON.stringify({ id: "action1" }) }], isError: false } });
    const workflowId = proposeWorkflow(bridge);

    const result = await bridge.confirmProactiveWorkflow(REQ_USER, workflowId);

    expect(mockMcpServer.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: "tools/call", params: { name: "create_project_action", arguments: { projectId: "p1" }, actingUser: { id: "u1", role: "admin", email: "a@b.com" } } })
    );
    expect(result).toEqual({ workflowId, label: "Créer un rappel", domain: "projects", subject: "Projet en retard", result: { id: "action1" } });
  });

  test("confirmProactiveWorkflow: consomme le workflow — une seconde confirmation renvoie null (jamais ré-exécutable)", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    mockMcpServer.handleMessage.mockResolvedValue({ result: { content: [{ type: "text", text: "{}" }] } });
    const workflowId = proposeWorkflow(bridge);

    await bridge.confirmProactiveWorkflow(REQ_USER, workflowId);
    const second = await bridge.confirmProactiveWorkflow(REQ_USER, workflowId);

    expect(second).toBeNull();
    expect(mockMcpServer.handleMessage).toHaveBeenCalledTimes(1);
  });

  test("confirmProactiveWorkflow: null pour un autre utilisateur que le destinataire — jamais exécutable au nom de quelqu'un d'autre", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    const workflowId = proposeWorkflow(bridge, { recipientUserId: "u1" });

    const result = await bridge.confirmProactiveWorkflow(REQ_USER_2, workflowId);

    expect(result).toBeNull();
    expect(mockMcpServer.handleMessage).not.toHaveBeenCalled();
  });

  test("confirmProactiveWorkflow: null pour un workflowId inconnu/expiré", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    expect(await bridge.confirmProactiveWorkflow(REQ_USER, "does-not-exist")).toBeNull();
  });

  test("confirmProactiveWorkflow: une erreur renvoyée par le Tool (JSON-RPC error) devient une exception JS, jamais avalée silencieusement", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    mockMcpServer.handleMessage.mockResolvedValue({ jsonrpc: "2.0", id: "x", error: { code: -32004, message: "Project not found" } });
    const workflowId = proposeWorkflow(bridge);

    await expect(bridge.confirmProactiveWorkflow(REQ_USER, workflowId)).rejects.toThrow("Project not found");
  });

  test("rejectProactiveWorkflow: consomme le workflow SANS jamais appeler mcpServer.handleMessage()", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    const workflowId = proposeWorkflow(bridge);

    const rejected = bridge.rejectProactiveWorkflow(REQ_USER, workflowId);

    expect(rejected).toBe(true);
    expect(mockMcpServer.handleMessage).not.toHaveBeenCalled();
    expect(await bridge.confirmProactiveWorkflow(REQ_USER, workflowId)).toBeNull(); // déjà consommé
  });

  test("rejectProactiveWorkflow: false pour un autre utilisateur que le destinataire, ou un id inconnu", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    const workflowId = proposeWorkflow(bridge, { recipientUserId: "u1" });

    expect(bridge.rejectProactiveWorkflow(REQ_USER_2, workflowId)).toBe(false);
    expect(bridge.rejectProactiveWorkflow(REQ_USER, "does-not-exist")).toBe(false);
  });
});

describe("aiCopilotBridge.service — conversation index (listConversations/getConversationHistory)", () => {
  test("a conversation appears in listConversations() only after sendMessage() touches it, and only for its owner", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    expect(bridge.listConversations(REQ_USER)).toEqual([]);

    await bridge.sendMessage(REQ_USER, { message: "a", conversationId: "c1" });

    const list = bridge.listConversations(REQ_USER);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ conversationId: "c1", intent: "projects" });
    expect(bridge.listConversations(REQ_USER_2)).toEqual([]);
  });

  test("getConversationHistory() returns null for a conversationId the caller never touched", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    await bridge.sendMessage(REQ_USER, { message: "a", conversationId: "c1" });
    expect(await bridge.getConversationHistory(REQ_USER_2, "c1")).toBeNull();
  });

  test("getConversationHistory() returns the real history for a conversation the caller owns", async () => {
    const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
    await bridge.sendMessage(REQ_USER, { message: "a", conversationId: "c1" });
    const history = await bridge.getConversationHistory(REQ_USER, "c1");
    expect(history).toEqual([{ role: "user", content: "hi" }]);
  });
});
