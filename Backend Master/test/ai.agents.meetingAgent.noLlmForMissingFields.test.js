"use strict";

/**
 * AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md —
 * reproduit en direct (Ollama réel, qwen3:8b) : "Programmer une réunion"
 * seul déclenchait 2 appels Ollama séquentiels (~12s + ~21s) pour la SEULE
 * tâche de demander le sujet — le second renvoyait un JSON malformé
 * (PlanningError -> WorkflowError -> BaseAgent._fallbackAnswer(), "Désolé,
 * meeting_agent n'a pas pu traiter..."). Cause : `MeetingAgent._run()`
 * délèguait encore au LLM une réponse entièrement déterminable depuis
 * `meetingSlotExtractor.js::missingMeetingFields()`.
 *
 * Ce fichier couvre exactement les 8 tests obligatoires du mandat, avec une
 * preuve renforcée pour le premier cas : un VRAI `OllamaProvider` (classe
 * réelle, jamais un simple mock maison) est injecté et sa méthode
 * `complete()` espionnée — `toHaveBeenCalledTimes(0)` prouve qu'aucun appel
 * réseau n'a même été TENTÉ, pas seulement qu'aucune réponse n'a été
 * consommée.
 */

jest.mock("../src/services/meetingCopilotSync.service", () => ({ createCopilotMeeting: jest.fn() }));
const { createCopilotMeeting } = require("../src/services/meetingCopilotSync.service");

const { createMeetingAgent } = require("../src/ai/agents/meetingAgent");
const { OllamaProvider } = require("../src/ai/services/providers/ollamaProvider");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");

const USER = { id: "u1", role: "user" };
const CONVERSATION_ID = "conv-meeting-no-llm";

function fakeTool(name, invoke) {
  return { name, description: `${name} description`, invoke: invoke || jest.fn(async () => "{}") };
}

async function turn(agent, conversationManager, message) {
  await conversationManager.recordUserMessage(CONVERSATION_ID, message);
  const result = await agent.execute({ intent: { name: "meetings" }, message, user: USER, conversationId: CONVERSATION_ID });
  await conversationManager.recordAssistantMessage(CONVERSATION_ID, result.answer, { intent: "meetings", mode: "agent" });
  return result;
}

function buildAgentWithRealOllamaProvider() {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const pendingActionStore = new PendingActionStore();
  // Instance RÉELLE — jamais construite pour avoir besoin d'un réseau tant
  // que .complete() n'est jamais appelée (voir ollamaProvider.js : le
  // constructeur ne fait aucun I/O).
  const ollamaProvider = new OllamaProvider({ model: "qwen3:8b" });
  const completeSpy = jest.spyOn(ollamaProvider, "complete");
  const chatModel = new LlmProviderChatModel({ llmProvider: ollamaProvider });
  const tools = [
    fakeTool("get_calendar_status", jest.fn(async () => JSON.stringify({ connected: true, googleEmail: null }))),
    fakeTool("create_calendar_event"),
    fakeTool("update_calendar_event"),
    fakeTool("delete_calendar_event"),
  ];
  const agent = createMeetingAgent({ chatModel, tools, workflowEngine: new LangChainWorkflowEngine(), memory, maxHistoryMessages: 20, pendingActionStore, createCopilotMeeting });
  return { agent, conversationManager, pendingActionStore, completeSpy };
}

beforeEach(() => {
  createCopilotMeeting.mockReset();
});

describe("TEST 1 — 'Programmer une réunion' : réponse déterministe, zéro appel Ollama", () => {
  test("PASS : zéro appel LLM (spy sur le VRAI OllamaProvider), zéro tool call, pas de fallback", async () => {
    const { agent, conversationManager, completeSpy } = buildAgentWithRealOllamaProvider();

    const r1 = await turn(agent, conversationManager, "Programmer une réunion");

    expect(completeSpy).toHaveBeenCalledTimes(0);
    expect(r1.toolSteps).toEqual([]);
    expect(r1.answer).not.toMatch(/désolé.*n'a pas pu traiter/i);
    expect(r1.answer).toMatch(/le sujet/i);
    expect(r1.answer).toMatch(/la date de la réunion/i);
    expect(r1.answer).toMatch(/l'heure de début/i);
    expect(r1.answer).toMatch(/heure de fin.*durée/i);
  });
});

describe("TEST 2 — 'Programmer une réunion avec sujet projet cbi10' : zéro appel LLM, demande UNIQUEMENT les slots manquants", () => {
  test("PASS", async () => {
    const { agent, conversationManager, completeSpy } = buildAgentWithRealOllamaProvider();

    const r1 = await turn(agent, conversationManager, "Programmer une réunion avec le sujet projet cbi10");

    expect(completeSpy).toHaveBeenCalledTimes(0);
    expect(r1.answer).not.toMatch(/\ble sujet\b/i); // déjà connu, jamais redemandé
    expect(r1.answer).toMatch(/la date de la réunion/i);
    expect(r1.answer).toMatch(/l'heure de début/i);
    expect(r1.answer).toMatch(/heure de fin.*durée/i);
  });
});

describe("TEST 3 — tous les slots fournis : PendingAction créé, récapitulatif correct, aucune création avant confirmation", () => {
  test("PASS", async () => {
    const { agent, conversationManager, pendingActionStore, completeSpy } = buildAgentWithRealOllamaProvider();

    const r1 = await turn(
      agent,
      conversationManager,
      "hadil.ibnhajfraj@gmail.com et projet cbi10 à 17/08/2026 à 12h durée 1 heure"
    );

    expect(completeSpy).toHaveBeenCalledTimes(0);
    const pending = pendingActionStore.peek(CONVERSATION_ID);
    expect(pending).not.toBeNull();
    expect(pending.type).toBe("create_meeting");
    // Payload construit via buildMeetingDateTimes() — jamais du texte LLM.
    expect(pending.payload.startDateTime).toBe("2026-08-17T12:00:00");
    expect(pending.payload.endDateTime).toBe("2026-08-17T13:00:00");
    expect(pending.payload.email).toBe("hadil.ibnhajfraj@gmail.com");
    expect(r1.answer).toContain("Confirmez-vous");
    expect(r1.pendingAction).not.toBeNull();
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });
});

describe("TEST 4 — pending meeting + 'oui' : confirmation acceptée, PendingAction consommé, createCopilotMeeting appelé", () => {
  test("PASS", async () => {
    createCopilotMeeting.mockResolvedValue({
      crmCreated: true,
      crmEventId: "task-1",
      crmError: null,
      googleCreated: true,
      googleEventId: "evt-1",
      googleEventLink: "https://calendar.google.com/evt-1",
      googleError: null,
    });
    const { agent, conversationManager, pendingActionStore, completeSpy } = buildAgentWithRealOllamaProvider();

    await turn(agent, conversationManager, "hadil.ibnhajfraj@gmail.com et projet cbi10 à 17/08/2026 à 12h durée 1 heure");
    const r2 = await turn(agent, conversationManager, "oui");

    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    expect(pendingActionStore.peek(CONVERSATION_ID)).toBeNull(); // consommé
    expect(r2.answer).toContain("evt-1");
    expect(completeSpy).toHaveBeenCalledTimes(0); // la confirmation ne consulte jamais le LLM
  });
});

describe("TEST 5 — pending meeting + 'non' : aucune création", () => {
  test("PASS", async () => {
    const { agent, conversationManager, pendingActionStore } = buildAgentWithRealOllamaProvider();

    await turn(agent, conversationManager, "hadil.ibnhajfraj@gmail.com et projet cbi10 à 17/08/2026 à 12h durée 1 heure");
    const r2 = await turn(agent, conversationManager, "non");

    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(pendingActionStore.peek(CONVERSATION_ID)).toBeNull();
    expect(r2.answer).toContain("annulée");
  });
});

describe("TEST 6 — pending meeting + 'je pense que oui' : ambigu, aucune création", () => {
  test("PASS", async () => {
    const { agent, conversationManager, pendingActionStore } = buildAgentWithRealOllamaProvider();

    await turn(agent, conversationManager, "hadil.ibnhajfraj@gmail.com et projet cbi10 à 17/08/2026 à 12h durée 1 heure");
    const r2 = await turn(agent, conversationManager, "je pense que oui");

    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(pendingActionStore.peek(CONVERSATION_ID)).not.toBeNull(); // reste actif, pas consommé
    expect(r2.answer).toMatch(/confirmer explicitement|n'ai pas compris/i);
  });
});

describe("TEST 7 — aucun PendingAction + 'oui' : ne force pas 'meetings', comportement normal du routage conservé", () => {
  test("PASS — via le VRAI IntentDetector lexical, dans une conversation neuve : 'oui' seul ne route jamais vers meeting_agent", async () => {
    const memory = new InMemoryConversationMemory();
    const conversationManager = new ConversationManager({ memory });
    const intentDetector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
    const agentRegistry = new AgentRegistry();
    const agentRouter = new AgentRouter({ agentRegistry });
    const toolRouter = { select: jest.fn(() => []) };
    const workflowManager = { run: jest.fn(async () => ({ mode: "qa", answer: "réponse générique", citations: [], toolSteps: [] })) };
    const manager = new AIManager({ conversationManager, intentDetector, agentRouter, toolRouter, workflowManager, responseBuilder: new ResponseBuilder() });

    const response = await manager.handleMessage({ message: "oui", user: USER, conversationId: "conv-fresh-no-pending" });

    expect(response.intent).not.toBe("meetings");
    expect(response.agent).not.toBe("meeting_agent");
    expect(workflowManager.run).toHaveBeenCalledTimes(1); // routage normal (aucun Agent enregistré ici), jamais meeting_agent forcé
  });
});

describe("TEST 8 — preuve explicite : le premier cas ne fait aucun appel à Ollama (spy sur le VRAI OllamaProvider)", () => {
  test("call count = 0", async () => {
    const { agent, conversationManager, completeSpy } = buildAgentWithRealOllamaProvider();

    await turn(agent, conversationManager, "Programmer une réunion");

    expect(completeSpy).toHaveBeenCalledTimes(0);
  });
});
