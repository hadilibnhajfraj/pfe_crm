"use strict";

const { createAutomationAgent, AutomationAgent, REQUIRED_ROLES, CONFIRM_MARKERS, CANCEL_MARKERS } = require("../src/ai/agents/automationAgent");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { ConfigurationError, AgentPermissionError } = require("../src/ai/agents/errors");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const ADMIN = { id: "a1", role: "admin" };
const USER = { id: "u1", role: "user" };

function chatModelReturning() {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => "unused") } });
}

function tool(name, impl) {
  return { name, description: `${name} description`, invoke: jest.fn(impl || (async () => `${name}-done`)) };
}

function buildAgent({ tools = [], planner, pendingActionStore = new PendingActionStore() } = {}) {
  return createAutomationAgent({
    chatModel: chatModelReturning(),
    tools,
    workflowEngine: new LangChainWorkflowEngine(),
    planner,
    pendingActionStore,
  });
}

describe("AutomationAgent construction", () => {
  test("requires a planner", () => {
    expect(() => createAutomationAgent({ chatModel: chatModelReturning(), workflowEngine: new LangChainWorkflowEngine(), pendingActionStore: new PendingActionStore() })).toThrow(
      ConfigurationError
    );
  });

  test("requires a pendingActionStore — never execute without a confirmation gate", () => {
    expect(() => createAutomationAgent({ chatModel: chatModelReturning(), workflowEngine: new LangChainWorkflowEngine(), planner: { plan: jest.fn() } })).toThrow(ConfigurationError);
  });
});

describe("AutomationAgent — identité", () => {
  test("canHandle is exclusive to 'automation', no Tool whitelist (cross-module by design)", () => {
    const agent = buildAgent({ planner: { plan: jest.fn() } });
    expect(agent).toBeInstanceOf(AutomationAgent);
    expect(agent.canHandle({ name: "automation" })).toBe(true);
    expect(agent.canHandle({ name: "maintenance" })).toBe(false);
    expect(agent.allowedToolNames).toBeNull();
  });

  test(`is restricted to admin-tier roles ([${REQUIRED_ROLES}])`, async () => {
    const agent = buildAgent({
      tools: [tool("create_project_action")],
      planner: { plan: jest.fn(async () => [{ tool: "create_project_action", input: {}, reason: "x" }]) },
    });
    await expect(agent.execute({ intent: { name: "automation" }, message: "fais plusieurs choses", user: USER, conversationId: "c1" })).rejects.toThrow(AgentPermissionError);
  });

  test("le mot 'magique' demandé à l'utilisateur EST le mot-clé reconnu — pas de synonyme caché", () => {
    expect(CONFIRM_MARKERS).toEqual(["confirme", "confirmer"]);
    expect(CANCEL_MARKERS).toEqual(["annule", "annuler"]);
  });
});

describe("AutomationAgent — étape 1 : proposer, jamais exécuter", () => {
  test("un plan exécutable devient une PROPOSITION — le Tool n'est jamais appelé au premier tour", async () => {
    const maintenanceTool = tool("create_maintenance_request", async () => "MR-1");
    const planner = { plan: jest.fn(async () => [{ tool: "create_maintenance_request", input: { title: "Panne climatiseur" }, reason: "créer la demande" }]) };
    const store = new PendingActionStore();
    const agent = buildAgent({ tools: [maintenanceTool], planner, pendingActionStore: store });

    const result = await agent.execute({ intent: { name: "automation" }, message: "crée une demande de maintenance", user: ADMIN, conversationId: "c1" });

    expect(maintenanceTool.invoke).not.toHaveBeenCalled();
    expect(result.toolSteps).toEqual([]);
    expect(result.answer).toContain("Je propose d'exécuter 1 action");
    expect(result.answer).toContain("create_maintenance_request");
    expect(result.answer).toContain("confirme");
    expect(result.pendingAction).toEqual({ id: expect.any(String), steps: [{ tool: "create_maintenance_request", input: { title: "Panne climatiseur" }, reason: "créer la demande" }] });
    expect(store.peek("c1")).not.toBeNull();
  });

  test("un plan à plusieurs étapes, cross-module, est proposé dans son intégralité", async () => {
    const maintenanceTool = tool("create_maintenance_request");
    const notificationTool = tool("send_notification_email");
    const planner = {
      plan: jest.fn(async (goal, { availableTools }) => {
        expect(availableTools.map((t) => t.name).sort()).toEqual(["create_maintenance_request", "send_notification_email"]);
        return [
          { tool: "create_maintenance_request", input: { title: "Panne climatiseur" }, reason: "créer la demande" },
          { tool: "send_notification_email", input: { to: "tech@cbi.tn" }, reason: "prévenir le technicien" },
        ];
      }),
    };
    const agent = buildAgent({ tools: [maintenanceTool, notificationTool], planner });

    const result = await agent.execute({ intent: { name: "automation" }, message: "crée une demande et préviens le technicien", user: ADMIN, conversationId: "c1" });

    expect(maintenanceTool.invoke).not.toHaveBeenCalled();
    expect(notificationTool.invoke).not.toHaveBeenCalled();
    expect(result.pendingAction.steps).toHaveLength(2);
    expect(result.answer).toContain("Je propose d'exécuter 2 actions");
  });

  test("drops plan steps referencing an unavailable Tool, proposes only the executable ones", async () => {
    const maintenanceTool = tool("create_maintenance_request");
    const planner = {
      plan: jest.fn(async () => [
        { tool: "create_maintenance_request", input: {}, reason: "x" },
        { tool: "a_tool_that_does_not_exist", input: {}, reason: "y" },
      ]),
    };
    const agent = buildAgent({ tools: [maintenanceTool], planner });

    const result = await agent.execute({ intent: { name: "automation" }, message: "m", user: ADMIN, conversationId: "c1" });
    expect(result.pendingAction.steps).toHaveLength(1);
    expect(result.pendingAction.steps[0].tool).toBe("create_maintenance_request");
  });

  test("no executable step at all -> an honest answer, no proposal stored", async () => {
    const store = new PendingActionStore();
    const planner = { plan: jest.fn(async () => [{ tool: null, input: {}, reason: "aucune action requise" }]) };
    const agent = buildAgent({ tools: [tool("t")], planner, pendingActionStore: store });

    const result = await agent.execute({ intent: { name: "automation" }, message: "m", user: ADMIN, conversationId: "c1" });
    expect(result.toolSteps).toEqual([]);
    expect(result.pendingAction).toBeNull();
    expect(result.answer).toMatch(/aucune action exécutable/i);
    expect(store.peek("c1")).toBeNull();
  });

  test("gestion des erreurs: a Planner failure degrades gracefully into a valid answer rather than throwing", async () => {
    const planner = {
      plan: jest.fn(async () => {
        throw new Error("le modèle n'a pas pu planifier");
      }),
    };
    const agent = buildAgent({ tools: [tool("t")], planner });

    const result = await agent.execute({ intent: { name: "automation" }, message: "m", user: ADMIN, conversationId: "c1" });
    expect(result.answer).toContain("automation_agent");
    expect(result.toolSteps).toEqual([]);
  });
});

describe("AutomationAgent — étape 2a : confirmer déclenche l'exécution RÉELLE, et seulement alors", () => {
  test("« confirme » exécute chaque étape proposée via de VRAIS appels Tool, dans l'ordre", async () => {
    const maintenanceTool = tool("create_maintenance_request", async () => "MR-1");
    const notificationTool = tool("send_notification_email", async () => "sent");
    const planner = {
      plan: jest.fn(async () => [
        { tool: "create_maintenance_request", input: { title: "Panne climatiseur" }, reason: "créer la demande" },
        { tool: "send_notification_email", input: { to: "tech@cbi.tn" }, reason: "prévenir le technicien" },
      ]),
    };
    const store = new PendingActionStore();
    const agent = buildAgent({ tools: [maintenanceTool, notificationTool], planner, pendingActionStore: store });

    await agent.execute({ intent: { name: "automation" }, message: "crée une demande et préviens le technicien", user: ADMIN, conversationId: "c1" });
    expect(maintenanceTool.invoke).not.toHaveBeenCalled();

    const result = await agent.execute({ intent: { name: "automation" }, message: "confirme", user: ADMIN, conversationId: "c1" });

    expect(maintenanceTool.invoke).toHaveBeenCalledWith({ title: "Panne climatiseur" });
    expect(notificationTool.invoke).toHaveBeenCalledWith({ to: "tech@cbi.tn" });
    expect(result.toolSteps).toEqual([
      { tool: "create_maintenance_request", input: { title: "Panne climatiseur" }, output: "MR-1" },
      { tool: "send_notification_email", input: { to: "tech@cbi.tn" }, output: "sent" },
    ]);
    expect(result.answer).toContain("2 étape(s) exécutée(s)");
    expect(result.pendingAction).toBeNull();
    expect(store.peek("c1")).toBeNull(); // consommée, jamais réexécutable deux fois
  });

  test("« confirmer » (autre forme reconnue) fonctionne de la même façon", async () => {
    const maintenanceTool = tool("create_maintenance_request", async () => "MR-1");
    const planner = { plan: jest.fn(async () => [{ tool: "create_maintenance_request", input: {}, reason: "x" }]) };
    const agent = buildAgent({ tools: [maintenanceTool], planner });

    await agent.execute({ intent: { name: "automation" }, message: "crée une demande", user: ADMIN, conversationId: "c1" });
    const result = await agent.execute({ intent: { name: "automation" }, message: "confirmer", user: ADMIN, conversationId: "c1" });

    expect(maintenanceTool.invoke).toHaveBeenCalled();
    expect(result.toolSteps).toHaveLength(1);
  });

  test("une confirmation ne peut jamais exécuter deux fois — la seconde confirmation trouve la file vide", async () => {
    const maintenanceTool = tool("create_maintenance_request", async () => "MR-1");
    const planner = { plan: jest.fn(async () => [{ tool: "create_maintenance_request", input: {}, reason: "x" }]) };
    const agent = buildAgent({ tools: [maintenanceTool], planner });

    await agent.execute({ intent: { name: "automation" }, message: "crée une demande", user: ADMIN, conversationId: "c1" });
    await agent.execute({ intent: { name: "automation" }, message: "confirme", user: ADMIN, conversationId: "c1" });
    const second = await agent.execute({ intent: { name: "automation" }, message: "confirme", user: ADMIN, conversationId: "c1" });

    expect(maintenanceTool.invoke).toHaveBeenCalledTimes(1);
    expect(second.answer).toMatch(/aucune action en attente/i);
  });

  test("si le Tool n'est plus disponible au moment de confirmer, annule proprement plutôt que de planter", async () => {
    const maintenanceTool = tool("create_maintenance_request");
    const planner = { plan: jest.fn(async () => [{ tool: "create_maintenance_request", input: {}, reason: "x" }]) };
    // Le Tool est retiré AVANT la confirmation (ex. permission révoquée entre-temps).
    const store = new PendingActionStore();
    const agent1 = buildAgent({ tools: [maintenanceTool], planner, pendingActionStore: store });
    await agent1.execute({ intent: { name: "automation" }, message: "crée une demande", user: ADMIN, conversationId: "c1" });

    const agent2 = buildAgent({ tools: [], planner, pendingActionStore: store });
    const result = await agent2.execute({ intent: { name: "automation" }, message: "confirme", user: ADMIN, conversationId: "c1" });

    expect(result.answer).toMatch(/ne sont plus disponibles/i);
    expect(result.toolSteps).toEqual([]);
    expect(store.peek("c1")).toBeNull();
  });
});

describe("AutomationAgent — étape 2b : annuler ne déclenche JAMAIS aucune exécution", () => {
  test("« annule » retire la proposition sans jamais appeler le Tool", async () => {
    const maintenanceTool = tool("create_maintenance_request");
    const planner = { plan: jest.fn(async () => [{ tool: "create_maintenance_request", input: {}, reason: "x" }]) };
    const store = new PendingActionStore();
    const agent = buildAgent({ tools: [maintenanceTool], planner, pendingActionStore: store });

    await agent.execute({ intent: { name: "automation" }, message: "crée une demande", user: ADMIN, conversationId: "c1" });
    const result = await agent.execute({ intent: { name: "automation" }, message: "annule", user: ADMIN, conversationId: "c1" });

    expect(maintenanceTool.invoke).not.toHaveBeenCalled();
    expect(result.answer).toContain("Action annulée");
    expect(result.answer).toContain("create_maintenance_request");
    expect(result.pendingAction).toBeNull();
    expect(store.peek("c1")).toBeNull();
  });

  test("« annuler » (autre forme reconnue) fonctionne de la même façon", async () => {
    const maintenanceTool = tool("create_maintenance_request");
    const planner = { plan: jest.fn(async () => [{ tool: "create_maintenance_request", input: {}, reason: "x" }]) };
    const agent = buildAgent({ tools: [maintenanceTool], planner });

    await agent.execute({ intent: { name: "automation" }, message: "crée une demande", user: ADMIN, conversationId: "c1" });
    const result = await agent.execute({ intent: { name: "automation" }, message: "annuler cette action", user: ADMIN, conversationId: "c1" });

    expect(maintenanceTool.invoke).not.toHaveBeenCalled();
    expect(result.answer).toContain("Action annulée");
  });
});

describe("AutomationAgent — cas limites de conversation", () => {
  test("« confirme » isolé sans rien en attente : réponse honnête, jamais un plan halluciné", async () => {
    const planner = { plan: jest.fn() };
    const agent = buildAgent({ tools: [tool("t")], planner });

    const result = await agent.execute({ intent: { name: "automation" }, message: "Confirme.", user: ADMIN, conversationId: "c1" });

    expect(planner.plan).not.toHaveBeenCalled();
    expect(result.answer).toMatch(/aucune action en attente/i);
  });

  test("« annule » isolé sans rien en attente : même réponse honnête", async () => {
    const planner = { plan: jest.fn() };
    const agent = buildAgent({ tools: [tool("t")], planner });

    const result = await agent.execute({ intent: { name: "automation" }, message: "Annule.", user: ADMIN, conversationId: "c1" });

    expect(planner.plan).not.toHaveBeenCalled();
    expect(result.answer).toMatch(/aucune action en attente/i);
  });

  test("sans conversationId, une proposition ne peut jamais être confirmée plus tard (rien n'est persisté)", async () => {
    const maintenanceTool = tool("create_maintenance_request");
    const planner = { plan: jest.fn(async () => [{ tool: "create_maintenance_request", input: {}, reason: "x" }]) };
    const agent = buildAgent({ tools: [maintenanceTool], planner });

    const proposal = await agent.execute({ intent: { name: "automation" }, message: "crée une demande", user: ADMIN, conversationId: null });
    expect(proposal.pendingAction).not.toBeNull(); // décrit dans la réponse...

    const confirmation = await agent.execute({ intent: { name: "automation" }, message: "confirme", user: ADMIN, conversationId: null });
    expect(maintenanceTool.invoke).not.toHaveBeenCalled(); // ...mais jamais exécutable sans conversationId
    expect(confirmation.answer).toMatch(/aucune action en attente/i);
  });

  test("une nouvelle demande REMPLACE une proposition en attente non confirmée (jamais empilée)", async () => {
    const maintenanceTool = tool("create_maintenance_request");
    const notificationTool = tool("send_notification_email");
    const planner = jest.fn();
    planner
      .mockResolvedValueOnce([{ tool: "create_maintenance_request", input: {}, reason: "première demande" }])
      .mockResolvedValueOnce([{ tool: "send_notification_email", input: {}, reason: "seconde demande" }]);
    const store = new PendingActionStore();
    const agent = buildAgent({ tools: [maintenanceTool, notificationTool], planner: { plan: planner }, pendingActionStore: store });

    await agent.execute({ intent: { name: "automation" }, message: "crée une demande de maintenance", user: ADMIN, conversationId: "c1" });
    await agent.execute({ intent: { name: "automation" }, message: "envoie un email", user: ADMIN, conversationId: "c1" });

    const result = await agent.execute({ intent: { name: "automation" }, message: "confirme", user: ADMIN, conversationId: "c1" });
    expect(maintenanceTool.invoke).not.toHaveBeenCalled();
    expect(notificationTool.invoke).toHaveBeenCalled();
    expect(result.toolSteps).toHaveLength(1);
  });
});
