"use strict";

/**
 * # Diagnostic direct — meeting_agent, conversation multi-tours réelle
 * (AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md, étapes 5/6/7/8/13 ;
 * AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md pour le cycle
 * PendingAction qui remplace désormais la décision du LLM au moment de la
 * création)
 *
 * "Tester directement l'agent sans passer par Flutter", "NE PAS tester
 * uniquement avec des mocks" : construit le VRAI `MeetingAgent` (BaseAgent
 * réel, `ToolCallingChain` réelle, `LangChainWorkflowEngine` réel,
 * `PendingActionStore` réel), la VRAIE mémoire de conversation
 * (`InMemoryConversationMemory` + `ConversationManager`, EXACTEMENT ceux
 * qu'AIManager utilise en production — jamais une deuxième mémoire
 * parallèle, voir étape 7). L'écriture CRM/Google
 * (`meetingCopilotSync.service.js::createCopilotMeeting`) est mockée ici —
 * sa propre logique (Task CRM -> Tool Google -> liaison, succès/échec) a sa
 * suite dédiée, voir test/services.meetingCopilotSync.test.js.
 *
 * AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md — le
 * `chatModel` est désormais scripté SANS AUCUNE réponse (`jest.fn()` vide) :
 * la collecte des champs manquants pour une CRÉATION ne consulte plus jamais
 * le LLM (voir meetingAgent.js). Un appel non prévu renverrait `undefined` à
 * `JSON.parse()` et ferait échouer le test — preuve automatique et stricte
 * du "zéro appel Ollama" à travers toute la conversation.
 *
 * Prouve, tour après tour, EXACTEMENT le scénario demandé (étapes 6/7/8) :
 * 1. "Programmer une réunion" → l'agent NE crée RIEN, demande les infos
 *    manquantes de façon DÉTERMINISTE (zéro appel LLM).
 * 2. Chaque réponse de l'utilisateur est mémorisée (ConversationManager
 *    réel) et réinjectée au tour suivant — jamais perdue.
 * 3. Une fois sujet/début/fin connus, l'AGENT (pas le LLM) récapitule et
 *    propose un PendingAction, puis demande une confirmation explicite.
 * 4. `createCopilotMeeting` n'est appelé qu'APRÈS cette confirmation —
 *    jamais avant, jamais avec un paramètre régénéré par le LLM (celui du
 *    PendingAction stocké, EXACTEMENT).
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
const CONVERSATION_ID = "conv-meeting-1";

function fakeTool(name, invoke) {
  return { name, description: `${name} description`, invoke: invoke || jest.fn(async () => "{}") };
}

// Simule un tour de conversation réel : enregistre le message utilisateur
// (comme AIManager.handleMessage le fait AVANT d'appeler l'Agent — voir
// aiManager.js), exécute l'Agent, enregistre sa réponse.
async function turn(agent, conversationManager, message) {
  await conversationManager.recordUserMessage(CONVERSATION_ID, message);
  const result = await agent.execute({ intent: { name: "meetings" }, message, user: USER, conversationId: CONVERSATION_ID });
  await conversationManager.recordAssistantMessage(CONVERSATION_ID, result.answer, { intent: "meetings", mode: "agent" });
  return result;
}

beforeEach(() => {
  createCopilotMeeting.mockReset();
});

describe("Diagnostic — meeting_agent, conversation multi-tours (étapes 6/7/8 + cycle PendingAction)", () => {
  test("collecte sujet/début/fin tour par tour, sans jamais perdre les réponses précédentes, propose puis confirme avant de créer (via PendingAction, jamais le LLM)", async () => {
    const memory = new InMemoryConversationMemory();
    const conversationManager = new ConversationManager({ memory });
    const pendingActionStore = new PendingActionStore();

    createCopilotMeeting.mockResolvedValue({
      crmCreated: true,
      crmEventId: "task-1",
      crmError: null,
      googleCreated: true,
      googleEventId: "evt-1",
      googleEventLink: "https://calendar.google.com/evt-1",
      googleError: null,
    });

    const tools = [
      fakeTool("get_calendar_status", jest.fn(async () => JSON.stringify({ connected: true, googleEmail: null }))),
      fakeTool("create_calendar_event"),
      fakeTool("update_calendar_event"),
      fakeTool("delete_calendar_event"),
    ];

    // AUCUNE réponse scriptée : toute la collecte d'informations (tours 1-4)
    // et la confirmation (tour 5) sont désormais entièrement déterministes,
    // zéro appel LLM de bout en bout (voir docstring ci-dessus).
    const complete = jest.fn();

    const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
    const agent = createMeetingAgent({ chatModel, tools, workflowEngine: new LangChainWorkflowEngine(), memory, maxHistoryMessages: 20, pendingActionStore, createCopilotMeeting });

    // Tour 1 — demande initiale, floue : réponse déterministe listant TOUS
    // les champs manquants.
    const r1 = await turn(agent, conversationManager, "Programmer une réunion");
    expect(r1.answer).toMatch(/le sujet/i);
    expect(r1.answer).toMatch(/la date de la réunion/i);
    expect(createCopilotMeeting).not.toHaveBeenCalled();

    // Tour 2 — donne la date : seule celle-ci disparaît de la liste.
    const r2 = await turn(agent, conversationManager, "le 14/08/2026");
    expect(r2.answer).not.toMatch(/date de la réunion/i);
    expect(r2.answer).toMatch(/heure de début/i);
    expect(createCopilotMeeting).not.toHaveBeenCalled();

    // Tour 3 — donne l'heure. La date donnée au tour 2 doit rester prise en
    // compte à CE tour, via l'historique RÉEL (ConversationManager) ET
    // l'état déjà fusionné (meetingSlotExtractor.js) — jamais perdue.
    const r3 = await turn(agent, conversationManager, "10h");
    expect(r3.answer).not.toMatch(/date de la réunion/i);
    expect(r3.answer).not.toMatch(/heure de début/i);
    expect(r3.answer).toMatch(/le sujet/i);
    expect(createCopilotMeeting).not.toHaveBeenCalled();

    // Tour 4 — donne le sujet ET une durée : toutes les infos requises sont
    // maintenant réunies (sujet+début+durée). L'AGENT propose lui-même un
    // PendingAction et compose le récapitulatif — toujours zéro appel LLM.
    const r4 = await turn(agent, conversationManager, "sujet : Point projet, durée : 1 heure");
    expect(r4.answer).toContain("Confirmez-vous");
    expect(r4.answer).toContain("Point projet");
    expect(createCopilotMeeting).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();

    // Tour 5 — confirmation explicite : SEULEMENT MAINTENANT la création
    // réelle est déclenchée, avec EXACTEMENT le payload du PendingAction
    // (jamais régénéré par le LLM — complete() n'est toujours jamais appelé).
    const r5 = await turn(agent, conversationManager, "Oui, confirme");
    expect(createCopilotMeeting).toHaveBeenCalledTimes(1);
    const call = createCopilotMeeting.mock.calls[0][0];
    expect(call.actingUserId).toBe("u1");
    expect(call.payload.summary).toBe("Point projet");
    expect(call.payload.startDateTime).toBe("2026-08-14T10:00:00");
    expect(complete).not.toHaveBeenCalled(); // zéro appel LLM sur toute la conversation
    expect(r5.answer).toContain("evt-1");

    // Historique complet : 10 messages (5 tours x user+assistant), rien
    // perdu — la VRAIE mémoire partagée, jamais une deuxième créée pour cet
    // Agent.
    const fullHistory = await memory.getHistory(CONVERSATION_ID, { limit: 100 });
    expect(fullHistory).toHaveLength(10);
  });

  test("get_calendar_status est disponible pour vérifier la connexion AVANT une création (étape 5)", () => {
    const agent = createMeetingAgent({
      chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
      workflowEngine: new LangChainWorkflowEngine(),
      pendingActionStore: new PendingActionStore(),
      createCopilotMeeting: jest.fn(),
    });
    expect(agent.allowedToolNames).toContain("get_calendar_status");
    expect(agent.allowedToolNames.indexOf("get_calendar_status")).toBeLessThan(agent.allowedToolNames.indexOf("create_calendar_event"));
  });
});
