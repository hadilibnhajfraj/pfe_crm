"use strict";

/**
 * AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — les 8 tests
 * obligatoires du cycle PendingAction (propose -> confirme/annule/ambigu ->
 * exécute UNE FOIS). `meetingCopilotSync.service.js` (CRM Task + Tool
 * Google réel + liaison CalendarEventSync) est mocké ici — sa propre
 * logique a sa suite dédiée, voir test/services.meetingCopilotSync.test.js.
 * Ce fichier prouve l'ORCHESTRATION : quand est-ce que la création a
 * réellement lieu, combien de fois, et ce que dit la réponse quand une des
 * deux écritures échoue — jamais déduit du texte que le modèle produirait,
 * `complete()` (le LLM) n'étant JAMAIS appelé pendant la
 * confirmation/annulation (voir TEST 6).
 */

// Factory EXPLICITE (jamais l'automock par défaut) : l'automock devrait
// charger le VRAI module pour en déduire la forme, ce qui entraîne
// src/models/Task.js -> src/db.js -> une exigence de vraie configuration DB
// (DB_HOST/...) même pour un test qui ne touche jamais de base réelle.
jest.mock("../src/services/meetingCopilotSync.service", () => ({ createCopilotMeeting: jest.fn() }));
const { createCopilotMeeting } = require("../src/services/meetingCopilotSync.service");

const { createMeetingAgent } = require("../src/ai/agents/meetingAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

const USER = { id: "u1", role: "user" };
const CONVERSATION_ID = "conv-meeting-pending-action";
const COMPLETE_MESSAGE = "sujet : projet cbi10, le 17/08/2026 à 12h, jusqu'à 13h, email hadil.ibnhajfraj@gmail.com";

const SUCCESS_RESULT = {
  crmCreated: true,
  crmEventId: "task-1",
  crmError: null,
  googleCreated: true,
  googleEventId: "evt-1",
  googleEventLink: "https://calendar.google.com/evt-1",
  googleError: null,
};

function fakeTool(name, invoke) {
  return { name, description: `${name} description`, invoke: invoke || jest.fn(async () => "{}") };
}

async function turn(agent, conversationManager, message) {
  await conversationManager.recordUserMessage(CONVERSATION_ID, message);
  const result = await agent.execute({ intent: { name: "meetings" }, message, user: USER, conversationId: CONVERSATION_ID });
  await conversationManager.recordAssistantMessage(CONVERSATION_ID, result.answer, { intent: "meetings", mode: "agent" });
  return result;
}

// Aucune réponse scriptée pour `complete` : si le LLM était consulté
// pendant confirmation/annulation/ambiguïté, `complete()` renverrait
// `undefined` et ferait échouer bruyamment le test — une garantie
// supplémentaire, pas seulement une assertion de compte d'appels.
function buildAgent() {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const pendingActionStore = new PendingActionStore();
  const complete = jest.fn();
  const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
  const tools = [fakeTool("get_calendar_status"), fakeTool("create_calendar_event"), fakeTool("update_calendar_event"), fakeTool("delete_calendar_event")];
  const agent = createMeetingAgent({ chatModel, tools, workflowEngine: new LangChainWorkflowEngine(), memory, maxHistoryMessages: 20, pendingActionStore, createCopilotMeeting });
  return { agent, conversationManager, pendingActionStore, complete };
}

beforeEach(() => {
  createCopilotMeeting.mockReset();
});

describe("TEST 1 — refus : 'non' après le récapitulatif", () => {
  test("CRM = 0 création, Google = 0 création, PendingAction consommée/annulée", async () => {
    const { agent, conversationManager, pendingActionStore } = buildAgent();

    const proposal = await turn(agent, conversationManager, COMPLETE_MESSAGE);
    expect(proposal.answer).toContain("Confirmez-vous");
    expect(pendingActionStore.peek(CONVERSATION_ID)).not.toBeNull();

    const r2 = await turn(agent, conversationManager, "non");
    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(r2.answer).toContain("annulée");
    expect(pendingActionStore.peek(CONVERSATION_ID)).toBeNull();
  });
});

describe("TEST 2 — confirmation : 'oui, confirme la création'", () => {
  test("CRM = 1 création, Google = 1 création, crmEventId/googleEventId présents, payload identique au draft", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESS_RESULT);
    const { agent, conversationManager, pendingActionStore } = buildAgent();

    const proposal = await turn(agent, conversationManager, COMPLETE_MESSAGE);
    // Mission P1.2 — `pendingAction.payload` n'est plus exposé dans la
    // réponse API (contrat canonique {id, steps}, voir
    // meetingAgent.js::_pendingActionView) : le payload COMPLET stocké
    // côté serveur reste lisible via PendingActionStore lui-même, inchangé.
    expect(proposal.pendingAction.steps).toHaveLength(1);
    expect(proposal.pendingAction.steps[0].tool).toBe("create_calendar_event");
    const draftPayload = pendingActionStore.peek(CONVERSATION_ID).payload;

    const r2 = await turn(agent, conversationManager, "oui, confirme la création");

    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    const call = createCopilotMeeting.mock.calls[0][0];
    expect(call.payload).toEqual(draftPayload); // EXACTEMENT le payload du draft, jamais régénéré
    expect(call.actingUserId).toBe("u1");
    expect(r2.answer).toContain("task-1"); // crmEventId
    expect(r2.answer).toContain("evt-1"); // googleEventId
    expect(pendingActionStore.peek(CONVERSATION_ID)).toBeNull();
  });
});

describe("TEST 3 — double confirmation : 'oui' puis 'oui'", () => {
  // AI-Business-Copilot/32_MEETING_CONTEXT_AFTER_EXECUTION.md — corrige
  // l'ancienne "limite connue, assumée" ci-dessous (avant cette passe) :
  // après exécution, consume() retire le PendingAction, mais le texte
  // source ("sujet : ... le 17/08/2026 ...") restait dans l'historique — un
  // "oui" isolé ENSUITE était réévalué depuis zéro et retrouvait les MÊMES
  // slots complets, faisant ressortir une NOUVELLE proposition (jamais une
  // deuxième EXÉCUTION, mais quand même un récapitulatif de réunion
  // "fantôme" trompeur). `_proposedUpToByConversation` (état temporaire
  // local à MeetingAgent, voir meetingAgent.js) exclut désormais les
  // messages déjà consommés par la DERNIÈRE proposition résolue : un "oui"
  // isolé, sans nouvelle information, ne retrouve donc plus AUCUN slot
  // complet — il redemande les informations manquantes, exactement comme
  // une toute première demande de réunion sans détails.
  test("JAMAIS 2 créations — un second 'oui' isolé ne réutilise plus les anciens slots (les redemande au lieu de re-proposer la même réunion)", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESS_RESULT);
    const { agent, conversationManager, pendingActionStore } = buildAgent();

    await turn(agent, conversationManager, COMPLETE_MESSAGE);
    const r2 = await turn(agent, conversationManager, "oui");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    expect(pendingActionStore.peek(CONVERSATION_ID)).toBeNull(); // consommée par la 1re confirmation

    const r3 = await turn(agent, conversationManager, "oui");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1); // toujours 1, JAMAIS 2 — la garantie dure
    expect(r3.answer).not.toContain("Confirmez-vous"); // plus de nouvelle proposition fantôme
    expect(r3.answer).not.toContain("cbi10"); // les anciens slots ne sont plus réutilisés
    expect(r3.answer).toMatch(/il me manque encore/i);
    expect(pendingActionStore.peek(CONVERSATION_ID)).toBeNull(); // toujours aucune proposition active
    expect(r2.answer).not.toBe(r3.answer);
  });
});

describe("TEST 4 — confirmation ambiguë : 'je pense que oui'", () => {
  test("aucune création ; redemande une confirmation explicite ; le PendingAction reste actif pour un 'oui' clair ensuite", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESS_RESULT);
    const { agent, conversationManager, pendingActionStore } = buildAgent();

    await turn(agent, conversationManager, COMPLETE_MESSAGE);
    const r2 = await turn(agent, conversationManager, "je pense que oui");

    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(r2.answer).toMatch(/confirmer explicitement|n'ai pas compris/i);
    expect(pendingActionStore.peek(CONVERSATION_ID)).not.toBeNull(); // toujours actif

    // Un "oui" clair au tour suivant doit encore pouvoir confirmer.
    const r3 = await turn(agent, conversationManager, "oui");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    expect(r3.answer).toContain("evt-1");
  });
});

describe("TEST 5 — annulation : 'non, annule'", () => {
  test("aucune création", async () => {
    const { agent, conversationManager } = buildAgent();

    await turn(agent, conversationManager, COMPLETE_MESSAGE);
    const r2 = await turn(agent, conversationManager, "non, annule");

    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(r2.answer).toContain("annulée");
  });
});

describe("TEST 6 — le LLM ne peut jamais modifier les paramètres du meeting après confirmation", () => {
  test("complete() (le LLM) n'est JAMAIS appelé pendant la confirmation — le système utilise exclusivement le PendingAction stocké", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESS_RESULT);
    const { agent, conversationManager, complete } = buildAgent();

    await turn(agent, conversationManager, COMPLETE_MESSAGE);
    const callsBeforeConfirm = complete.mock.calls.length;

    await turn(agent, conversationManager, "oui, confirme");

    // Aucun appel LLM supplémentaire pendant la confirmation : si le
    // système avait redemandé au modèle "quoi créer", `complete` (jamais
    // scripté ici) aurait renvoyé `undefined` et fait échouer ce test.
    expect(complete.mock.calls.length).toBe(callsBeforeConfirm);
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
  });
});

describe("TEST 7 — Google Calendar échoue", () => {
  test("réponse honnête : CRM créé, mais synchronisation Google en échec — jamais 'créée avec succès'", async () => {
    createCopilotMeeting.mockResolvedValue({
      crmCreated: true,
      crmEventId: "task-2",
      crmError: null,
      googleCreated: false,
      googleEventId: null,
      googleEventLink: null,
      googleError: "Google Calendar API unavailable",
    });
    const { agent, conversationManager } = buildAgent();

    await turn(agent, conversationManager, COMPLETE_MESSAGE);
    const r2 = await turn(agent, conversationManager, "oui");

    expect(r2.answer).toContain("task-2");
    expect(r2.answer).toMatch(/synchronisation.*Google.*échoué|Google.*échoué/i);
    expect(r2.answer).not.toMatch(/créée avec succès/i);
  });
});

describe("TEST 8 — le CRM échoue", () => {
  test("aucune affirmation de création complète", async () => {
    createCopilotMeeting.mockResolvedValue({
      crmCreated: false,
      crmEventId: null,
      crmError: "connection refused",
      googleCreated: false,
      googleEventId: null,
      googleEventLink: null,
      googleError: null,
    });
    const { agent, conversationManager } = buildAgent();

    await turn(agent, conversationManager, COMPLETE_MESSAGE);
    const r2 = await turn(agent, conversationManager, "oui");

    expect(r2.answer).not.toMatch(/créée avec succès/i);
    expect(r2.answer).toMatch(/n'a pas pu être créée/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MISSION P1.2 — NORMALISER pendingAction. Contrat canonique
// {id, steps:[{tool, input, reason}]} — voir meetingAgent.js::
// _pendingActionView. TESTS M1 à M7 explicitement demandés par la mission.
// ═══════════════════════════════════════════════════════════════════════
describe("Mission P1.2 — contrat pendingAction canonique (TESTS M1-M7)", () => {
  test("M1 — une proposition retourne pendingAction.steps.length === 1", async () => {
    const { agent, conversationManager } = buildAgent();
    const proposal = await turn(agent, conversationManager, COMPLETE_MESSAGE);
    expect(proposal.pendingAction).toBeTruthy();
    expect(proposal.pendingAction.steps).toHaveLength(1);
  });

  test("M2 — steps[0].tool === 'create_calendar_event'", async () => {
    const { agent, conversationManager } = buildAgent();
    const proposal = await turn(agent, conversationManager, COMPLETE_MESSAGE);
    expect(proposal.pendingAction.steps[0].tool).toBe("create_calendar_event");
  });

  test("M3 — steps[0].input contient summary/startDateTime/endDateTime", async () => {
    const { agent, conversationManager } = buildAgent();
    const proposal = await turn(agent, conversationManager, COMPLETE_MESSAGE);
    const { input } = proposal.pendingAction.steps[0];
    expect(typeof input.summary).toBe("string");
    expect(input.summary.length).toBeGreaterThan(0);
    expect(typeof input.startDateTime).toBe("string");
    expect(typeof input.endDateTime).toBe("string");
  });

  test("M4/M5 — 'oui' exécute createCopilotMeeting exactement une fois ; un deuxième 'oui' isolé n'exécute jamais une deuxième fois", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESS_RESULT);
    const { agent, conversationManager } = buildAgent();

    await turn(agent, conversationManager, COMPLETE_MESSAGE);
    await turn(agent, conversationManager, "oui");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1); // M4

    await turn(agent, conversationManager, "oui");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1); // M5 — toujours 1
  });

  test("M6 — 'non' n'exécute jamais createCopilotMeeting", async () => {
    const { agent, conversationManager } = buildAgent();
    await turn(agent, conversationManager, COMPLETE_MESSAGE);
    await turn(agent, conversationManager, "non");
    expect(createCopilotMeeting).not.toHaveBeenCalled();
  });

  test("M7 — falsifier pendingAction.steps (input/reason) avant de confirmer n'a AUCUNE influence sur l'exécution réelle : le serveur relit exclusivement action.payload stocké côté serveur", async () => {
    createCopilotMeeting.mockResolvedValue(SUCCESS_RESULT);
    const { agent, conversationManager, pendingActionStore } = buildAgent();

    const proposal = await turn(agent, conversationManager, COMPLETE_MESSAGE);
    const realPayload = pendingActionStore.peek(CONVERSATION_ID).payload;

    const tampered = JSON.parse(JSON.stringify(proposal.pendingAction));
    tampered.steps[0].tool = "delete_calendar_event"; // texte falsifié
    tampered.steps[0].input.summary = "RÉUNION INJECTÉE";
    tampered.steps[0].reason = "texte arbitraire sans rapport";

    // `execute()` ne déclare pas de paramètre `pendingAction` (voir
    // baseAgent.js::execute({intent, message, user, conversationId})) —
    // le transmettre explicitement ici prouve qu'il est structurellement
    // ignoré, pas seulement absent par convention.
    await conversationManager.recordUserMessage(CONVERSATION_ID, "oui");
    const result = await agent.execute({ intent: { name: "meetings" }, message: "oui", user: USER, conversationId: CONVERSATION_ID, pendingAction: tampered });
    await conversationManager.recordAssistantMessage(CONVERSATION_ID, result.answer, { intent: "meetings", mode: "agent" });

    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    const call = createCopilotMeeting.mock.calls[0][0];
    expect(call.payload).toEqual(realPayload); // jamais le texte falsifié
    expect(call.payload.summary).not.toBe("RÉUNION INJECTÉE");
  });
});
