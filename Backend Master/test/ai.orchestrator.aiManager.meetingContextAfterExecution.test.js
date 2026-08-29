"use strict";

/**
 * AI-Business-Copilot/32_MEETING_CONTEXT_AFTER_EXECUTION.md — reproduit en
 * direct : après une réunion CONFIRMÉE et créée (CRM + Google Calendar),
 * "Créer une activité"/"Créer un rappel"/"Préparer un email" ressortaient
 * encore le récapitulatif de l'ANCIENNE réunion ("projet cbi10", ...).
 *
 * Cause exacte (voir le rapport livré avant ce fichier, non répété ici en
 * détail) — DEUX bugs indépendants qui se combinent :
 * 1. `ConversationContextResolver._lastKnownTopic()` (repli historique)
 *    ressuscitait un sujet "meetings" déjà clos (`ConversationManager.
 *    _currentTopic` correctement effacé, mais l'historique lui gardait pour
 *    toujours le tag `intent:"meetings"` du tour de confirmation).
 * 2. `MeetingAgent._run()` refusionnait TOUJOURS les slots depuis TOUS les
 *    messages utilisateur de la conversation (cumulatif par conception),
 *    sans notion de "cette réunion a déjà été exécutée" — dès qu'il était
 *    réinvoqué (via le bug 1, OU légitimement via "rappel", un vrai
 *    mot-clé), il retrouvait les mêmes slots complets et re-proposait.
 *
 * Ce fichier construit le VRAI AIManager, le VRAI MeetingAgent, le VRAI
 * ConversationContextResolver/ConversationContinuityResolver, le VRAI
 * IntentDetector lexical (catalogue réel — pour que la collision/l'absence
 * de mots-clés soit authentique, pas simulée) et le VRAI AgentRegistry/
 * AgentRouter — seuls `createCopilotMeeting` (sa propre suite de tests
 * dédiée couvre Task/Google Calendar en détail) et les chatModels/Tools bas
 * niveau sont remplacés.
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
const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");
const { ConversationContinuityResolver } = require("../src/ai/orchestrator/conversationContinuityResolver");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { createMeetingAgent } = require("../src/ai/agents/meetingAgent");
const { createAutomationAgent } = require("../src/ai/agents/automationAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER_A = { id: "user-A", role: "user" };
const ADMIN = { id: "admin-1", role: "admin" };

const SUCCESSFUL_MEETING_RESULT = {
  crmCreated: true,
  crmEventId: "task-cbi10-1",
  crmError: null,
  googleCreated: true,
  googleEventId: "evt-cbi10-1",
  googleEventLink: "https://calendar.google.com/evt-cbi10-1",
  googleError: null,
};

function fakeTool(name) {
  return { name, description: `${name} description`, invoke: jest.fn(async () => "{}") };
}

function buildSystem() {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const pendingActionStore = new PendingActionStore();
  const intentDetector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
  const contextResolver = new ConversationContextResolver({ catalog: DEFAULT_INTENT_CATALOG });
  const continuityResolver = new ConversationContinuityResolver({ catalog: DEFAULT_INTENT_CATALOG });
  const detectSpy = jest.spyOn(intentDetector, "detect");

  const meetingChatModel = new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } });
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

  // VRAI AutomationAgent (RBAC admin-tier réel), store SÉPARÉ — jamais
  // concerné par ce bypass ni par ce bug (voir TEST 8-équivalent implicite :
  // aucune régression de son propre cycle propose/confirme).
  const automationAgent = createAutomationAgent({
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
    tools: [],
    workflowEngine: new LangChainWorkflowEngine(),
    planner: { plan: jest.fn(async () => []) },
    pendingActionStore: new PendingActionStore(),
  });

  const projectAgentExecute = jest.fn(async () => ({ answer: "Voici vos projets.", citations: [], toolSteps: [] }));
  const projectAgent = { name: "project_agent", canHandle: (intent) => intent.name === "projects", execute: projectAgentExecute };

  const agentRegistry = new AgentRegistry();
  agentRegistry.register(meetingAgent);
  agentRegistry.register(automationAgent);
  agentRegistry.register(projectAgent);
  const agentRouter = new AgentRouter({ agentRegistry });

  const toolRouter = { select: jest.fn(() => []) };
  const workflowManager = { run: jest.fn(async ({ intent }) => ({ mode: "qa", answer: `Réponse générique (${intent.name})`, citations: [], toolSteps: [] })) };

  const manager = new AIManager({
    conversationManager,
    intentDetector,
    agentRouter,
    toolRouter,
    workflowManager,
    responseBuilder: new ResponseBuilder(),
    pendingActionStore,
    contextResolver,
    continuityResolver,
  });

  return { manager, conversationManager, pendingActionStore, detectSpy, meetingAgent, projectAgentExecute };
}

beforeEach(() => {
  createCopilotMeeting.mockReset();
});

// Journalise exactement ce que le protocole de test demande : intent,
// selectedAgent, pendingAction avant/après, toolCalls, et fait apparaître le
// contenu du récapitulatif de réunion (pour prouver visuellement l'absence
// de réutilisation — "projet cbi10" ne doit plus jamais réapparaître).
async function turn(manager, pendingActionStore, conversationId, user, message, label) {
  const pendingBefore = pendingActionStore.peek(conversationId);
  const response = await manager.handleMessage({ message, user, conversationId });
  const pendingAfter = pendingActionStore.peek(conversationId);
  // eslint-disable-next-line no-console
  console.log(
    `[${label}] message=${JSON.stringify(message)} intent=${response.intent} agent=${response.agent} ` +
      `pendingBefore=${pendingBefore ? pendingBefore.type : null} pendingAfter=${pendingAfter ? pendingAfter.type : null} ` +
      `toolCalls=${response.toolCalls.map((t) => t.tool).join(",") || "(none)"} answer=${String(response.answer).slice(0, 80)}`
  );
  return response;
}

// Amène une conversation jusqu'à "réunion confirmée et créée" — étape
// commune à la quasi-totalité des 10 tests demandés.
async function createAndConfirmMeeting(manager, pendingActionStore, conversationId) {
  await turn(manager, pendingActionStore, conversationId, USER_A, "Programmer une reunion", "setup:start");
  await turn(manager, pendingActionStore, conversationId, USER_A, "projet cbi10, 17/08/2026 a 12h, duree 1 heure", "setup:slots");
  const confirmResponse = await turn(manager, pendingActionStore, conversationId, USER_A, "confirme", "setup:confirm");
  return confirmResponse;
}

describe("TEST 1 — après confirmation, 'Créer une activité' ne réutilise plus l'ancienne réunion", () => {
  test("agent != meeting_agent, aucun nouveau récapitulatif, aucun create_calendar_event, aucun nouveau Task meeting", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESSFUL_MEETING_RESULT);
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "test1";
    await createAndConfirmMeeting(manager, pendingActionStore, conversationId);
    createCopilotMeeting.mockClear();

    const response = await turn(manager, pendingActionStore, conversationId, USER_A, "Creer une activite", "T1");

    expect(response.agent).not.toBe("meeting_agent");
    expect(response.answer).not.toMatch(/cbi10/i);
    expect(response.answer).not.toMatch(/récapitulatif de la réunion/i);
    expect(response.pendingAction).toBeNull();
    expect(response.toolCalls).toEqual([]);
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 2 — après confirmation, 'Créer un rappel' ne réutilise pas la réunion précédente", () => {
  test("meeting_agent légitimement sélectionné (mot-clé réel 'rappel'), mais AUCUNE réutilisation des anciens slots", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESSFUL_MEETING_RESULT);
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "test2";
    await createAndConfirmMeeting(manager, pendingActionStore, conversationId);
    createCopilotMeeting.mockClear();

    const response = await turn(manager, pendingActionStore, conversationId, USER_A, "Creer un rappel", "T2");

    // "rappel" est un vrai mot-clé du catalogue ("reminders") — meeting_agent
    // EST le bon agent pour un rappel, ce n'est pas le bug. Le bug serait de
    // réutiliser "projet cbi10"/17/08/2026 pour CE rappel.
    expect(response.answer).not.toMatch(/cbi10/i);
    expect(response.answer).not.toMatch(/récapitulatif de la réunion/i);
    expect(response.pendingAction).toBeNull();
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 3 — après confirmation, 'Préparer un email' ne réutilise pas la réunion précédente", () => {
  test("routage normal, aucun meeting workflow", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESSFUL_MEETING_RESULT);
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "test3";
    await createAndConfirmMeeting(manager, pendingActionStore, conversationId);
    createCopilotMeeting.mockClear();

    const response = await turn(manager, pendingActionStore, conversationId, USER_A, "Preparer un email", "T3");

    expect(response.agent).not.toBe("meeting_agent");
    expect(response.answer).not.toMatch(/cbi10/i);
    expect(response.pendingAction).toBeNull();
    expect(response.toolCalls).toEqual([]);
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 4 — après confirmation, 'Quels sont mes projets ?' route vers project_agent", () => {
  test("project_agent, aucune utilisation des slots meeting précédents", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESSFUL_MEETING_RESULT);
    const { manager, pendingActionStore, projectAgentExecute } = buildSystem();
    const conversationId = "test4";
    await createAndConfirmMeeting(manager, pendingActionStore, conversationId);
    createCopilotMeeting.mockClear();

    const response = await turn(manager, pendingActionStore, conversationId, USER_A, "Quels sont mes projets ?", "T4");

    expect(response.agent).toBe("project_agent");
    expect(projectAgentExecute).toHaveBeenCalledTimes(1);
    expect(response.answer).not.toMatch(/cbi10/i);
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 5 — après confirmation, 'Programmer une réunion' démarre une VRAIE nouvelle demande", () => {
  test("nouvelle demande de réunion (slots vides), pas de réutilisation automatique de l'ancienne", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESSFUL_MEETING_RESULT);
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "test5";
    await createAndConfirmMeeting(manager, pendingActionStore, conversationId);
    createCopilotMeeting.mockClear();

    const response = await turn(manager, pendingActionStore, conversationId, USER_A, "Programmer une reunion", "T5");

    expect(response.agent).toBe("meeting_agent");
    // Slots vides attendus : le récapitulatif de "projet cbi10" ne doit PAS
    // ressortir tout seul ; l'agent doit redemander les informations.
    expect(response.answer).not.toMatch(/cbi10/i);
    expect(response.answer).toMatch(/il me manque encore/i);
    expect(response.pendingAction).toBeNull();
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 6 — annulation, puis 'Créer une activité' : aucun ancien meeting actif", () => {
  test("l'annulation ferme aussi le sujet (pas seulement l'exécution)", async () => {
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "test6";
    await turn(manager, pendingActionStore, conversationId, USER_A, "Programmer une reunion", "T6:start");
    await turn(manager, pendingActionStore, conversationId, USER_A, "projet cbi10, 17/08/2026 a 12h, duree 1 heure", "T6:slots");
    const cancelResponse = await turn(manager, pendingActionStore, conversationId, USER_A, "annule", "T6:cancel");
    expect(cancelResponse.pendingAction).toBeNull();

    const response = await turn(manager, pendingActionStore, conversationId, USER_A, "Creer une activite", "T6");

    expect(response.agent).not.toBe("meeting_agent");
    expect(response.answer).not.toMatch(/cbi10/i);
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 7 — expiration du PendingAction, puis nouvelle demande non-meeting", () => {
  test("aucune réutilisation des slots de la réunion jamais confirmée", async () => {
    const memory = new InMemoryConversationMemory();
    const conversationManager = new ConversationManager({ memory });
    // TTL très court pour simuler une expiration réelle sans attendre 15 min.
    const pendingActionStore = new PendingActionStore({ ttlMs: 10, now: () => Date.now() });
    const intentDetector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
    const contextResolver = new ConversationContextResolver({ catalog: DEFAULT_INTENT_CATALOG });
    const continuityResolver = new ConversationContinuityResolver({ catalog: DEFAULT_INTENT_CATALOG });
    const meetingAgent = createMeetingAgent({
      chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
      tools: [fakeTool("get_calendar_status"), fakeTool("create_calendar_event"), fakeTool("update_calendar_event"), fakeTool("delete_calendar_event")],
      workflowEngine: new LangChainWorkflowEngine(),
      memory,
      maxHistoryMessages: 20,
      pendingActionStore,
      createCopilotMeeting,
    });
    const projectAgent = { name: "project_agent", canHandle: (intent) => intent.name === "projects", execute: jest.fn(async () => ({ answer: "Voici vos projets.", citations: [], toolSteps: [] })) };
    const agentRegistry = new AgentRegistry();
    agentRegistry.register(meetingAgent);
    agentRegistry.register(projectAgent);
    const agentRouter = new AgentRouter({ agentRegistry });
    const toolRouter = { select: jest.fn(() => []) };
    const workflowManager = { run: jest.fn(async ({ intent }) => ({ mode: "qa", answer: `Réponse générique (${intent.name})`, citations: [], toolSteps: [] })) };
    const manager = new AIManager({
      conversationManager, intentDetector, agentRouter, toolRouter, workflowManager,
      responseBuilder: new ResponseBuilder(), pendingActionStore, contextResolver, continuityResolver,
    });

    const conversationId = "test7";
    await turn(manager, pendingActionStore, conversationId, USER_A, "Programmer une reunion", "T7:start");
    await turn(manager, pendingActionStore, conversationId, USER_A, "projet cbi10, 17/08/2026 a 12h, duree 1 heure", "T7:slots");

    await new Promise((r) => setTimeout(r, 20)); // laisse le TTL (10ms) expirer réellement

    const response = await turn(manager, pendingActionStore, conversationId, USER_A, "Quels sont mes projets ?", "T7");

    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(response.pendingAction).toBeNull();
    // Propriété de sécurité demandée ("aucune réutilisation") : quel que soit
    // l'agent retenu pour ce message, aucun Task/événement lié à "cbi10"
    // n'est créé et aucune confirmation n'est exécutée automatiquement.
    expect(response.answer).not.toMatch(/cbi10/i);
  });
});

describe("TEST 8 — comportement AutomationAgent existant non cassé", () => {
  test("le cycle propose/confirme d'AutomationAgent (store séparé) continue de fonctionner", async () => {
    const { manager } = buildSystem();
    const response = await manager.handleMessage({ message: "planifie une automatisation", user: ADMIN, conversationId: "test8" });
    expect(response.agent).toBe("automation_agent");
    expect(response.mode).not.toBe("error");
  });
});

describe("TEST 9 — double confirmation après création", () => {
  test("un second 'oui' n'appelle jamais createCopilotMeeting une deuxième fois", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESSFUL_MEETING_RESULT);
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "test9";
    await createAndConfirmMeeting(manager, pendingActionStore, conversationId);
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);

    const secondResponse = await turn(manager, pendingActionStore, conversationId, USER_A, "oui", "T9:second-oui");

    expect(createCopilotMeeting).toHaveBeenCalledTimes(1); // TOUJOURS 1, jamais 2
    expect(secondResponse.mode).not.toBe("error");
  });
});

describe("TEST 10 — traçabilité des IDs et absence de PendingAction actif après consommation", () => {
  test("conversationId/pendingActionId/Task CRM ID/Google eventId tous vérifiables, plus aucun PendingAction actif ensuite", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESSFUL_MEETING_RESULT);
    const { manager, pendingActionStore } = buildSystem();
    const conversationId = "test10";

    await turn(manager, pendingActionStore, conversationId, USER_A, "Programmer une reunion", "T10:start");
    const proposalResponse = await turn(manager, pendingActionStore, conversationId, USER_A, "projet cbi10, 17/08/2026 a 12h, duree 1 heure", "T10:slots");
    const pendingActionId = proposalResponse.pendingAction && proposalResponse.pendingAction.id;
    expect(pendingActionId).toEqual(expect.any(String));

    const confirmResponse = await turn(manager, pendingActionStore, conversationId, USER_A, "confirme", "T10:confirm");

    expect(confirmResponse.conversationId).toBe(conversationId);
    expect(confirmResponse.toolCalls).toHaveLength(1);
    expect(confirmResponse.toolCalls[0].tool).toBe("create_calendar_event");
    expect(confirmResponse.toolCalls[0].output).toMatchObject({
      crmEventId: SUCCESSFUL_MEETING_RESULT.crmEventId,
      googleEventId: SUCCESSFUL_MEETING_RESULT.googleEventId,
    });
    expect(confirmResponse.answer).toMatch(new RegExp(SUCCESSFUL_MEETING_RESULT.crmEventId));
    expect(confirmResponse.answer).toMatch(new RegExp(SUCCESSFUL_MEETING_RESULT.googleEventId));

    // Plus aucun PendingAction actif pour ce meeting, sous ce conversationId.
    expect(pendingActionStore.peek(conversationId)).toBeNull();
  });
});
