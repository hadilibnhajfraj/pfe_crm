"use strict";

/**
 * AI-Business-Copilot/27_MEETING_AGENT_SLOT_ACCUMULATION.md — preuve directe
 * que `MeetingAgent` (meetingAgent.js) fusionne, à CHAQUE tour, un état
 * cumulatif (email/sujet/date/heures/durée — calculé déterministiquement
 * par meetingSlotExtractor.js) à partir de TOUS les messages précédents,
 * jamais oublié d'un tour à l'autre.
 *
 * AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md — depuis
 * cette passe, tant que les informations restent incomplètes (et qu'il ne
 * s'agit pas d'une modification/annulation), la réponse ("il me manque
 * encore : ...") est composée par `buildMissingFieldsAnswer()` directement à
 * partir de l'état fusionné — plus jamais par un appel au modèle. Ce fichier
 * vérifie donc désormais l'état fusionné à travers la RÉPONSE DÉTERMINISTE
 * elle-même, et prouve explicitement que `complete()` (le LLM) n'est JAMAIS
 * appelé pour ces scénarios — même discipline que
 * ai.diagnosis.meetingAgent.conversation.test.js (VRAI MeetingAgent, VRAIE
 * mémoire de conversation — jamais une seconde mémoire parallèle).
 */

const { createMeetingAgent } = require("../src/ai/agents/meetingAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

const USER = { id: "u1", role: "user" };
const CONVERSATION_ID = "conv-meeting-slots-1";

function fakeTool(name, invoke) {
  return { name, description: `${name} description`, invoke: invoke || jest.fn(async () => "{}") };
}

async function turn(agent, conversationManager, message) {
  await conversationManager.recordUserMessage(CONVERSATION_ID, message);
  const result = await agent.execute({ intent: { name: "meetings" }, message, user: USER, conversationId: CONVERSATION_ID });
  await conversationManager.recordAssistantMessage(CONVERSATION_ID, result.answer, { intent: "meetings", mode: "agent" });
  return result;
}

// `complete` volontairement SANS aucune réponse scriptée : ces scénarios ne
// doivent jamais l'appeler (voir 30_..._NO_LLM_FOR_MISSING_FIELDS.md) — un
// appel non prévu renverrait `undefined`, ferait échouer JSON.parse() et
// donc le test, une preuve automatique et stricte du "zéro appel LLM".
function buildAgent() {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const createCalendarEvent = jest.fn(async () => JSON.stringify({ success: true, eventId: "evt-1" }));
  const tools = [
    fakeTool("get_calendar_status", jest.fn(async () => JSON.stringify({ connected: true, googleEmail: null }))),
    fakeTool("create_calendar_event", createCalendarEvent),
    fakeTool("update_calendar_event"),
    fakeTool("delete_calendar_event"),
  ];
  const complete = jest.fn();
  const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
  const agent = createMeetingAgent({
    chatModel,
    tools,
    workflowEngine: new LangChainWorkflowEngine(),
    memory,
    maxHistoryMessages: 20,
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: jest.fn(), // non exercé dans ces scénarios (slots toujours incomplets)
  });
  return { agent, conversationManager, complete, createCalendarEvent };
}

describe("MeetingAgent — TEST 1 (toutes les infos dans un seul message tour 2)", () => {
  test("le tour 2 répond directement avec le SEUL champ encore manquant (heure de fin/durée) — zéro appel LLM", async () => {
    const { agent, conversationManager, complete, createCalendarEvent } = buildAgent();

    await turn(agent, conversationManager, "Programmer une réunion");
    const r2 = await turn(
      agent,
      conversationManager,
      "hadil.ibnhajfraj@gmail.com et programmer le projet cbi10 pour une date le 17/08/2026 à 12h"
    );

    expect(r2.answer).toMatch(/heure de fin.*durée/i);
    // email/sujet/date/heure de début sont déjà connus : jamais redemandés.
    expect(r2.answer).not.toMatch(/sujet/i);
    expect(r2.answer).not.toMatch(/date de la réunion/i);
    expect(r2.answer).not.toMatch(/heure de début/i);
    expect(complete).not.toHaveBeenCalled();
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });
});

describe("MeetingAgent — TEST 2 (informations réparties sur 4 tours, cumulatives)", () => {
  test("l'email connu au tour 2 reste pris en compte au tour 4 (jamais oublié) — zéro appel LLM", async () => {
    const { agent, conversationManager, complete } = buildAgent();

    const r1 = await turn(agent, conversationManager, "Programmer une réunion");
    const r2 = await turn(agent, conversationManager, "email hadil.ibnhajfraj@gmail.com");
    const r3 = await turn(agent, conversationManager, "le 17 août à midi");
    const r4 = await turn(agent, conversationManager, "sujet : réunion projet cbi10");

    expect(r1.answer).toMatch(/le sujet/i);
    expect(r2.answer).toMatch(/la date de la réunion/i);
    expect(r3.answer).toMatch(/le sujet/i); // toujours manquant à ce stade
    // Au tour 4, sujet/date/heure de début sont tous connus : seule
    // l'heure de fin/durée doit encore être demandée — jamais redemandé le
    // sujet, jamais "oublié" l'email/la date des tours précédents.
    expect(r4.answer).toMatch(/heure de fin.*durée/i);
    expect(r4.answer).not.toMatch(/\ble sujet\b/i);
    expect(r4.answer).not.toMatch(/date de la réunion/i);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("MeetingAgent — TEST 5 (ne jamais fabriquer une heure de fin ou une durée)", () => {
  test("date/heure de début connus (pas de sujet fourni ici) ; heure de fin/durée jamais inventée, seulement listée manquante — zéro appel LLM", async () => {
    const { agent, conversationManager, complete, createCalendarEvent } = buildAgent();

    await turn(agent, conversationManager, "Programmer une réunion");
    const r2 = await turn(agent, conversationManager, "hadil.ibnhajfraj@gmail.com le 17 août à 12h");

    // Aucun sujet n'a été fourni dans ce scénario : reste correctement listé
    // manquant, aux côtés de l'heure de fin/durée — mais date/heure de
    // début (bien fournis) ne sont plus redemandés.
    expect(r2.answer).toMatch(/\ble sujet\b/i);
    expect(r2.answer).toMatch(/heure de fin.*durée/i);
    expect(r2.answer).not.toMatch(/date de la réunion/i);
    expect(r2.answer).not.toMatch(/heure de début/i);
    expect(complete).not.toHaveBeenCalled();
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });
});

// AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — le scénario
// "toutes les infos connues -> récapitulatif -> confirmation -> création"
// est désormais gouverné par le cycle PendingAction (jamais une décision du
// LLM) : voir test/ai.agents.meetingAgent.pendingActionWorkflow.test.js
// pour sa suite dédiée (les 8 tests obligatoires), qui remplace ce bloc.
