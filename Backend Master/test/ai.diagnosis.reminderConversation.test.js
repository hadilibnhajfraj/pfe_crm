"use strict";

/**
 * # Diagnostic direct — meeting_agent sur l'intention `reminders`, conversation multi-tours réelle
 * (AI-Business-Copilot/16_REMINDER_ROUTING.md, étape 8 — le dialogue exact demandé ;
 * AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md pour le cycle
 * PendingAction qui remplace désormais la décision du LLM au moment de la
 * création)
 *
 * Même discipline que `test/ai.diagnosis.meetingAgent.conversation.test.js` :
 * le VRAI `MeetingAgent` (BaseAgent réel, `ToolCallingChain` réelle,
 * `PendingActionStore` réel), la VRAIE mémoire de conversation
 * (`InMemoryConversationMemory` + `ConversationManager`) — seuls le
 * `chatModel` et l'écriture CRM/Google
 * (`meetingCopilotSync.service.js::createCopilotMeeting`, mockée — sa propre
 * logique a sa suite dédiée, voir test/services.meetingCopilotSync.test.js)
 * sont remplacés.
 *
 * AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md — le
 * `chatModel` est scripté SANS AUCUNE réponse (`jest.fn()` vide) : la
 * collecte des champs manquants pour une CRÉATION ne consulte plus jamais
 * le LLM. Prouve le dialogue de l'étape 8, désormais entièrement
 * déterministe : "Créer un rappel" → réponse listant les champs manquants →
 * "Relancer le client ABC" (sujet) → "demain à 10h" (début) → "15 minutes"
 * (durée) → récapitulatif + confirmation (composés par l'AGENT, jamais par
 * le LLM) → SEULEMENT ALORS création réelle.
 */

// Factory EXPLICITE (jamais l'automock par défaut) : l'automock chargerait
// le VRAI module (src/models/Task.js -> src/db.js -> vraie config DB
// requise) même pour ce test qui ne touche jamais de base réelle.
jest.mock("../src/services/meetingCopilotSync.service", () => ({ createCopilotMeeting: jest.fn() }));
const { createCopilotMeeting } = require("../src/services/meetingCopilotSync.service");

const { createMeetingAgent } = require("../src/ai/agents/meetingAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

const USER = { id: "u1", role: "user" };
const CONVERSATION_ID = "conv-reminder-1";

function fakeTool(name, invoke) {
  return { name, description: `${name} description`, invoke: invoke || jest.fn(async () => "{}") };
}

async function turn(agent, conversationManager, message) {
  await conversationManager.recordUserMessage(CONVERSATION_ID, message);
  const result = await agent.execute({ intent: { name: "reminders" }, message, user: USER, conversationId: CONVERSATION_ID });
  await conversationManager.recordAssistantMessage(CONVERSATION_ID, result.answer, { intent: "reminders", mode: "agent" });
  return result;
}

beforeEach(() => {
  createCopilotMeeting.mockReset();
});

describe("Diagnostic — meeting_agent sur 'reminders', conversation multi-tours (étape 8, dialogue exact demandé + cycle PendingAction)", () => {
  test("« Créer un rappel » collecte contenu puis date/heure, propose puis confirme avant de créer (jamais le LLM à la création)", async () => {
    const memory = new InMemoryConversationMemory();
    const conversationManager = new ConversationManager({ memory });
    const pendingActionStore = new PendingActionStore();

    createCopilotMeeting.mockResolvedValue({
      crmCreated: true,
      crmEventId: "task-2",
      crmError: null,
      googleCreated: true,
      googleEventId: "evt-2",
      googleEventLink: "https://calendar.google.com/evt-2",
      googleError: null,
    });

    const tools = [
      fakeTool("get_calendar_status", jest.fn(async () => JSON.stringify({ connected: true, googleEmail: null }))),
      fakeTool("create_calendar_event"),
      fakeTool("update_calendar_event"),
      fakeTool("delete_calendar_event"),
    ];

    // AUCUNE réponse scriptée : toute la collecte (tours 1-4) et la
    // confirmation (tour 5) sont désormais entièrement déterministes.
    const complete = jest.fn();

    const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
    const agent = createMeetingAgent({ chatModel, tools, workflowEngine: new LangChainWorkflowEngine(), memory, maxHistoryMessages: 20, pendingActionStore, createCopilotMeeting });

    // Tour 1 — demande initiale, floue (le cas exact rapporté) : réponse
    // déterministe listant tous les champs manquants, zéro appel LLM.
    const r1 = await turn(agent, conversationManager, "Créer un rappel");
    expect(r1.answer).toMatch(/le sujet/i);
    expect(r1.answer).not.toMatch(/projets personnels|taux de réussite/i);
    expect(createCopilotMeeting).not.toHaveBeenCalled();

    // Tour 2 — donne le contenu (marqueur "sujet :" explicite, reconnu par
    // meetingSlotExtractor.js — voir sa propre suite pour la portée exacte
    // de l'extraction de sujet).
    const r2 = await turn(agent, conversationManager, "sujet : Relancer le client ABC");
    expect(r2.answer).not.toMatch(/\ble sujet\b/i);
    expect(r2.answer).toMatch(/la date de la réunion/i);
    expect(createCopilotMeeting).not.toHaveBeenCalled();

    // Tour 3 — donne la date/heure : sujet+début réunis, durée/fin encore
    // absente -> toujours incomplet, AUCUNE création.
    const r3 = await turn(agent, conversationManager, "demain à 10h");
    expect(r3.answer).toMatch(/heure de fin.*durée/i);
    expect(createCopilotMeeting).not.toHaveBeenCalled();

    // Tour 4 — donne une durée : désormais complet -> l'AGENT (jamais le
    // LLM, complete() reste non appelé) propose et récapitule.
    const r4 = await turn(agent, conversationManager, "durée : 15 minutes");
    expect(r4.answer).toContain("Confirmez-vous");
    expect(r4.answer).toContain("Relancer le client ABC");
    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();

    // Tour 5 — confirmation explicite : SEULEMENT MAINTENANT la création
    // réelle est déclenchée, avec le payload du PendingAction (jamais le LLM).
    const r5 = await turn(agent, conversationManager, "Oui, confirme");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    expect(createCopilotMeeting.mock.calls[0][0].payload.summary).toBe("Relancer le client ABC");
    expect(complete).not.toHaveBeenCalled(); // zéro appel LLM sur toute la conversation
    expect(r5.answer).toContain("evt-2");
  });
});
