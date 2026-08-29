"use strict";

/**
 * AI-Business-Copilot/28_MEETING_AGENT_CONFIRMATION_GATE.md — reproduit en
 * DIRECT contre le vrai Ollama (qwen3:8b) : le modèle a appelé
 * `create_calendar_event` alors qu'AUCUNE confirmation n'avait jamais été
 * demandée ni donnée — un événement RÉEL a été créé sur le calendrier
 * Google du compte connecté (`e22ajem2ag5be9p43k9sv74vr8`, supprimé après
 * coup).
 *
 * AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — la CRÉATION ne
 * passe désormais plus JAMAIS par une décision du LLM (cycle PendingAction,
 * voir meetingAgent.js et test/ai.agents.meetingAgent.pendingActionWorkflow.test.js
 * pour ce nouveau mécanisme) : ce fichier prouve que si le modèle tente
 * quand même d'appeler `create_calendar_event` via ToolCallingChain (défense
 * en profondeur — ne devrait normalement jamais être atteint), il est
 * bloqué INCONDITIONNELLEMENT, jamais le vrai Tool. `update_calendar_event`/
 * `delete_calendar_event` gardent le mécanisme de confirmation textuelle
 * D'ORIGINE (inchangé) : ce fichier prouve aussi que CE mécanisme continue
 * de fonctionner exactement comme avant.
 */

const { createMeetingAgent, NO_CONFIRMATION_MESSAGE, CREATE_BYPASSED_MESSAGE } = require("../src/ai/agents/meetingAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

const USER = { id: "u1", role: "user" };
const CONVERSATION_ID = "conv-meeting-confirmation-gate";

function fakeTool(name, invoke) {
  return { name, description: `${name} description`, invoke: invoke || jest.fn(async () => "{}") };
}

async function turn(agent, conversationManager, message) {
  await conversationManager.recordUserMessage(CONVERSATION_ID, message);
  const result = await agent.execute({ intent: { name: "meetings" }, message, user: USER, conversationId: CONVERSATION_ID });
  await conversationManager.recordAssistantMessage(CONVERSATION_ID, result.answer, { intent: "meetings", mode: "agent" });
  return result;
}

function buildAgent({ tools, complete }) {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
  const agent = createMeetingAgent({
    chatModel,
    tools,
    workflowEngine: new LangChainWorkflowEngine(),
    memory,
    maxHistoryMessages: 20,
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: jest.fn(), // non exercé dans ces scénarios (blocage avant confirmation)
  });
  return { agent, conversationManager };
}

describe("MeetingAgent — create_calendar_event est TOUJOURS bloqué via ToolCallingChain (défense en profondeur, cycle PendingAction fait foi)", () => {
  test("un modèle scripté qui tente quand même d'appeler create_calendar_event (pendant un flux d'annulation) : le Tool réel n'est JAMAIS invoqué", async () => {
    const createCalendarEvent = jest.fn(async () => JSON.stringify({ success: true, eventId: "evt-should-never-happen" }));
    const tools = [
      fakeTool("get_calendar_status", jest.fn(async () => JSON.stringify({ connected: true, googleEmail: null }))),
      fakeTool("create_calendar_event", createCalendarEvent),
      fakeTool("update_calendar_event"),
      fakeTool("delete_calendar_event"),
    ];

    // "Annule ma réunion" (mot-clé d'annulation, voir UPDATE_OR_DELETE_INTENT_RE
    // dans meetingAgent.js) : le flux LLM reste utilisé pour ce type de
    // demande (mécanisme update/delete inchangé, voir 30_..._NO_LLM_FOR_MISSING_FIELDS.md)
    // — AI-Business-Copilot/30_...md n'a intercepté QUE la collecte d'infos
    // pour une CRÉATION, jamais la modification/annulation. Le modèle
    // scripté simule ici un comportement adversarial (il tente quand même
    // create_calendar_event, exactement comme le VRAI Ollama l'a fait).
    const complete = jest.fn();
    complete
      .mockResolvedValueOnce(JSON.stringify({ action: "final_answer", answer: "Quel est le sujet et la date de la réunion à annuler ?" }))
      .mockResolvedValueOnce(
        JSON.stringify({ action: "call_tool", tool: "create_calendar_event", input: { summary: "Réunion", startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T12:15:00" } })
      )
      .mockResolvedValueOnce(JSON.stringify({ action: "final_answer", answer: "D'accord." }));

    const { agent, conversationManager } = buildAgent({ tools, complete });

    await turn(agent, conversationManager, "Annule ma réunion");
    const r2 = await turn(agent, conversationManager, "le 17 août à midi");

    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(r2.toolSteps).toEqual([{ tool: "create_calendar_event", input: expect.any(Object), output: CREATE_BYPASSED_MESSAGE }]);
    expect(CREATE_BYPASSED_MESSAGE.startsWith("Error:")).toBe(true);
  });
});

describe("MeetingAgent — update_calendar_event/delete_calendar_event gardent le mécanisme de confirmation textuelle D'ORIGINE (inchangé)", () => {
  test("le modèle demande la confirmation ('Confirmez-vous...') puis l'utilisateur répond 'Oui' : le Tool réel est alors autorisé", async () => {
    const updateCalendarEvent = jest.fn(async () => JSON.stringify({ success: true, eventId: "evt-1" }));
    const tools = [fakeTool("get_calendar_status"), fakeTool("create_calendar_event"), fakeTool("update_calendar_event", updateCalendarEvent), fakeTool("delete_calendar_event")];

    const complete = jest.fn();
    complete
      .mockResolvedValueOnce(JSON.stringify({ action: "final_answer", answer: "Récapitulatif : nouvelle heure 14h. Confirmez-vous la modification de cette réunion ?" }))
      .mockResolvedValueOnce(JSON.stringify({ action: "call_tool", tool: "update_calendar_event", input: { eventId: "evt-1", startDateTime: "2026-08-17T14:00:00", endDateTime: "2026-08-17T14:15:00" } }))
      .mockResolvedValueOnce(JSON.stringify({ action: "final_answer", answer: "C'est fait." }));

    const { agent, conversationManager } = buildAgent({ tools, complete });

    await turn(agent, conversationManager, "Déplace ma réunion à 14h");
    const r2 = await turn(agent, conversationManager, "Oui, confirme");

    expect(updateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(updateCalendarEvent).toHaveBeenCalledWith({ eventId: "evt-1", startDateTime: "2026-08-17T14:00:00", endDateTime: "2026-08-17T14:15:00" });
    expect(r2.answer).toContain("fait");
  });

  test("le dernier tour assistant contient 'Confirmez-vous' mais le message courant n'est PAS une réponse affirmative reconnue : toujours bloqué", async () => {
    const deleteCalendarEvent = jest.fn(async () => JSON.stringify({ success: true }));
    const tools = [fakeTool("get_calendar_status"), fakeTool("create_calendar_event"), fakeTool("update_calendar_event"), fakeTool("delete_calendar_event", deleteCalendarEvent)];

    const complete = jest.fn();
    complete
      .mockResolvedValueOnce(JSON.stringify({ action: "final_answer", answer: "Récapitulatif : ... Confirmez-vous l'annulation de ce rappel ?" }))
      .mockResolvedValueOnce(JSON.stringify({ action: "call_tool", tool: "delete_calendar_event", input: { eventId: "evt-1" } }))
      .mockResolvedValueOnce(JSON.stringify({ action: "final_answer", answer: "D'accord, je n'annule rien pour l'instant." }));

    const { agent, conversationManager } = buildAgent({ tools, complete });

    await turn(agent, conversationManager, "Annule mon rappel");
    // "Peut-être" n'est reconnu ni comme une confirmation ni comme un refus
    // explicite — reste bloqué par prudence (jamais deviné).
    const r2 = await turn(agent, conversationManager, "Peut-être, je ne sais pas encore");

    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    expect(r2.toolSteps).toEqual([{ tool: "delete_calendar_event", input: expect.any(Object), output: NO_CONFIRMATION_MESSAGE }]);
  });
});
