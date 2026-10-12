"use strict";

/**
 * AI-Business-Copilot/31_PENDING_MEETING_CONFIRMATION_ROUTING.md — reproduit
 * en direct : une confirmation ("oui"/"confirme") répondant à un
 * PendingAction proposé par `meeting_agent` se faisait classer par
 * `IntentDetector` vers l'intention "automation" (mots-clés globaux
 * partagés avec le cycle propre à `AutomationAgent`, voir intentCatalog.js)
 * puis refuser par son RBAC admin-tier : `Role "user" is not allowed to
 * invoke agent "automation_agent".`
 *
 * Ce fichier construit le VRAI `AIManager`, le VRAI `AgentRouter`/
 * `AgentRegistry`, le VRAI `IntentDetector` lexical, le VRAI `MeetingAgent`
 * ET le VRAI `AutomationAgent` (pour reproduire fidèlement l'erreur RBAC
 * exacte si le bypass ne fonctionnait pas) — seuls `createCopilotMeeting`
 * (mocké — sa propre logique a sa suite dédiée) et les chatModels/Tools
 * sont remplacés.
 */

jest.mock("../src/services/meetingCopilotSync.service", () => ({ createCopilotMeeting: jest.fn() }));
const { createCopilotMeeting } = require("../src/services/meetingCopilotSync.service");

const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { createMeetingAgent } = require("../src/ai/agents/meetingAgent");
const { createAutomationAgent } = require("../src/ai/agents/automationAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER_A = { id: "user-A", role: "user" };
const USER_B = { id: "user-B", role: "user" };

function fakeTool(name, invoke) {
  return { name, description: `${name} description`, invoke: invoke || jest.fn(async () => "{}") };
}

function buildSystem() {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const pendingActionStore = new PendingActionStore();
  const intentDetector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
  const detectSpy = jest.spyOn(intentDetector, "detect");

  const meetingComplete = jest.fn(); // le LLM de meeting_agent : jamais consulté pendant une confirmation
  const meetingChatModel = new LlmProviderChatModel({ llmProvider: { complete: meetingComplete } });
  const meetingTools = [fakeTool("get_calendar_status"), fakeTool("create_calendar_event"), fakeTool("update_calendar_event"), fakeTool("delete_calendar_event")];
  const meetingAgent = createMeetingAgent({
    chatModel: meetingChatModel,
    tools: meetingTools,
    workflowEngine: new LangChainWorkflowEngine(),
    memory,
    maxHistoryMessages: 20,
    pendingActionStore,
    createCopilotMeeting,
  });

  // VRAI AutomationAgent (RBAC admin-tier réel) — reproduit fidèlement
  // l'erreur exacte du bug si le bypass ne fonctionnait pas.
  const automationComplete = jest.fn();
  const automationAgent = createAutomationAgent({
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: automationComplete } }),
    tools: [],
    workflowEngine: new LangChainWorkflowEngine(),
    planner: { plan: jest.fn(async () => []) },
    pendingActionStore: new PendingActionStore(), // store SÉPARÉ — AutomationAgent n'est pas concerné par ce bypass
  });

  // ProjectAgent minimal (TEST 7 : le routage normal doit rester intact
  // pour une demande sans rapport).
  const projectAgentExecute = jest.fn(async () => ({ answer: "Voici vos projets.", citations: [], toolSteps: [] }));
  const projectAgent = { name: "project_agent", canHandle: (intent) => intent.name === "projects", execute: projectAgentExecute };

  const agentRegistry = new AgentRegistry();
  agentRegistry.register(meetingAgent);
  agentRegistry.register(automationAgent);
  agentRegistry.register(projectAgent);
  const agentRouter = new AgentRouter({ agentRegistry });

  const toolRouter = { select: jest.fn(() => []) };
  const workflowManager = { run: jest.fn(async () => ({ mode: "qa", answer: "réponse générique", citations: [], toolSteps: [] })) };

  const manager = new AIManager({
    conversationManager,
    intentDetector,
    agentRouter,
    toolRouter,
    workflowManager,
    responseBuilder: new ResponseBuilder(),
    pendingActionStore,
  });

  return { manager, conversationManager, pendingActionStore, detectSpy, meetingComplete, automationComplete, projectAgentExecute };
}

beforeEach(() => {
  createCopilotMeeting.mockReset();
});

describe("TEST 1 — PendingAction copilot_meeting + 'oui'", () => {
  test("routé vers meeting_agent, jamais automation_agent, jamais d'erreur RBAC, confirmation acceptée, PendingAction consommé, createCopilotMeeting appelé une seule fois", async () => {
    createCopilotMeeting.mockResolvedValue({ crmCreated: true, crmEventId: "task-1", crmError: null, googleCreated: true, googleEventId: "evt-1", googleEventLink: "https://calendar.google.com/evt-1", googleError: null });
    const { manager, conversationManager, pendingActionStore, detectSpy } = buildSystem();
    const conversationId = "conv-1";

    pendingActionStore.propose(conversationId, {
      id: "pa-1",
      type: "create_meeting",
      conversationId,
      actingUserId: USER_A.id,
      payload: { projectId: null, projectName: "projet cbi10", email: null, summary: "projet cbi10", description: null, startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:00:00" },
    });
    detectSpy.mockClear();

    const response = await manager.handleMessage({ message: "oui", user: USER_A, conversationId });

    expect(response.agent).toBe("meeting_agent");
    expect(response.mode).not.toBe("error");
    expect(response.answer).not.toMatch(/not allowed to invoke agent/i);
    expect(detectSpy).not.toHaveBeenCalled(); // IntentDetector jamais consulté pour ce tour
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    expect(pendingActionStore.peek(conversationId)).toBeNull(); // consommé

    const history = await conversationManager.getHistory(conversationId);
    expect(history[0]).toMatchObject({ role: "user", content: "oui" }); // jamais enrichi/corrompu
  });
});

describe("TEST 2 — PendingAction meeting + 'confirme'", () => {
  test("meeting_agent, création autorisée", async () => {
    createCopilotMeeting.mockResolvedValue({ crmCreated: true, crmEventId: "task-2", crmError: null, googleCreated: true, googleEventId: "evt-2", googleEventLink: null, googleError: null });
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "conv-2";
    pendingActionStore.propose(conversationId, { id: "pa-2", type: "create_meeting", conversationId, actingUserId: USER_A.id, payload: { summary: "x", startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:00:00" } });

    const response = await manager.handleMessage({ message: "confirme", user: USER_A, conversationId });

    expect(response.agent).toBe("meeting_agent");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
  });
});

describe("TEST 3 — PendingAction meeting + 'non'", () => {
  test("meeting_agent, aucune création", async () => {
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "conv-3";
    pendingActionStore.propose(conversationId, { id: "pa-3", type: "create_meeting", conversationId, actingUserId: USER_A.id, payload: { summary: "x", startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:00:00" } });

    const response = await manager.handleMessage({ message: "non", user: USER_A, conversationId });

    expect(response.agent).toBe("meeting_agent");
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 4 — PendingAction meeting + 'annule'", () => {
  test("meeting_agent, aucune création", async () => {
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "conv-4";
    pendingActionStore.propose(conversationId, { id: "pa-4", type: "create_meeting", conversationId, actingUserId: USER_A.id, payload: { summary: "x", startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:00:00" } });

    const response = await manager.handleMessage({ message: "annule", user: USER_A, conversationId });

    expect(response.agent).toBe("meeting_agent");
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 5 — PendingAction meeting + 'je pense que oui'", () => {
  test("meeting_agent, confirmation ambiguë, aucune création, PendingAction conservé", async () => {
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "conv-5";
    pendingActionStore.propose(conversationId, { id: "pa-5", type: "create_meeting", conversationId, actingUserId: USER_A.id, payload: { summary: "x", startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:00:00" } });

    const response = await manager.handleMessage({ message: "je pense que oui", user: USER_A, conversationId });

    expect(response.agent).toBe("meeting_agent");
    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(pendingActionStore.peek(conversationId)).not.toBeNull();
  });
});

describe("TEST 6 — aucun PendingAction + 'oui'", () => {
  test("routage normal, meeting_agent JAMAIS forcé", async () => {
    const { manager, detectSpy } = buildSystem();

    const response = await manager.handleMessage({ message: "oui", user: USER_A, conversationId: "conv-6-fresh" });

    expect(detectSpy).toHaveBeenCalledTimes(1); // IntentDetector CONSULTÉ (flux normal)
    expect(response.agent).not.toBe("meeting_agent");
  });
});

describe("TEST 7 — aucun PendingAction + 'donne-moi mes projets'", () => {
  test("project_agent comme avant, routage normal intact", async () => {
    const { manager, projectAgentExecute } = buildSystem();

    const response = await manager.handleMessage({ message: "donne-moi mes projets", user: USER_A, conversationId: "conv-7-fresh" });

    expect(response.agent).toBe("project_agent");
    expect(projectAgentExecute).toHaveBeenCalledTimes(1);
  });
});

describe("TEST 8 — PendingAction AutomationAgent existant : comportement non cassé", () => {
  test("un utilisateur admin-tier avec un PendingAction 'automation' continue de fonctionner comme avant (store séparé, jamais concerné par ce bypass)", async () => {
    const { manager } = buildSystem();
    const ADMIN = { id: "admin-1", role: "admin" };
    // "planifie une automatisation" matche le mot-clé "planifier" du
    // catalogue "automation" — AutomationAgent propose (planner mocké : []
    // -> buildNoActionAnswer(), jamais une exécution, mais surtout jamais
    // une erreur RBAC pour ce rôle admin-tier).
    const response = await manager.handleMessage({ message: "planifie une automatisation", user: ADMIN, conversationId: "conv-8" });

    expect(response.agent).toBe("automation_agent");
    expect(response.mode).not.toBe("error");
  });

  test("un rôle non admin-tier reste refusé par le RBAC d'AutomationAgent quand AUCUN PendingAction meeting n'est actif (comportement RBAC inchangé)", async () => {
    const { manager } = buildSystem();
    const response = await manager.handleMessage({ message: "planifie une automatisation", user: USER_A, conversationId: "conv-8b" });

    expect(response.mode).toBe("error");
    expect(response.error.message).toMatch(/ne vous autorise pas à utiliser cette fonction/);
  });
});

describe("TEST 9 — isolation entre utilisateurs (RBAC/PendingAction)", () => {
  test("le PendingAction de user A n'est jamais accessible ni exécutable par user B, même avec le même conversationId", async () => {
    const { manager, pendingActionStore, detectSpy } = buildSystem();
    const conversationId = "conv-9-shared";
    pendingActionStore.propose(conversationId, { id: "pa-9", type: "create_meeting", conversationId, actingUserId: USER_A.id, payload: { summary: "réunion privée de A", startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:00:00" } });
    detectSpy.mockClear();

    // user B envoie "oui" sur le MÊME conversationId — ne doit JAMAIS
    // récupérer/exécuter le PendingAction de A.
    const response = await manager.handleMessage({ message: "oui", user: USER_B, conversationId });

    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(response.agent).not.toBe("meeting_agent"); // retombe sur le routage normal, pas de bypass
    expect(detectSpy).toHaveBeenCalledTimes(1); // IntentDetector CONSULTÉ (le bypass n'a pas matché)
    // Le PendingAction de A reste intact, jamais consommé par B.
    expect(pendingActionStore.peek(conversationId)).not.toBeNull();

    // A, lui, peut toujours confirmer normalement ensuite.
    createCopilotMeeting.mockResolvedValue({ crmCreated: true, crmEventId: "task-9", crmError: null, googleCreated: true, googleEventId: "evt-9", googleEventLink: null, googleError: null });
    const responseA = await manager.handleMessage({ message: "oui", user: USER_A, conversationId });
    expect(responseA.agent).toBe("meeting_agent");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
  });
});

describe("TEST 10 — double confirmation", () => {
  test("après un premier 'oui', un second 'oui' ne déclenche jamais une deuxième création Google/CRM", async () => {
    createCopilotMeeting.mockResolvedValue({ crmCreated: true, crmEventId: "task-10", crmError: null, googleCreated: true, googleEventId: "evt-10", googleEventLink: null, googleError: null });
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "conv-10";
    pendingActionStore.propose(conversationId, { id: "pa-10", type: "create_meeting", conversationId, actingUserId: USER_A.id, payload: { summary: "x", startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:00:00" } });

    const r1 = await manager.handleMessage({ message: "oui", user: USER_A, conversationId });
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    expect(r1.agent).toBe("meeting_agent");

    const r2 = await manager.handleMessage({ message: "oui", user: USER_A, conversationId });
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1); // TOUJOURS 1, jamais 2
    expect(r2.mode).not.toBe("error");
  });
});
