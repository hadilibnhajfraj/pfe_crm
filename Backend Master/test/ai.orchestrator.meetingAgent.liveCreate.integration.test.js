"use strict";

// Mission P1.2 (ÉTAPE 13 — TEST LIVE MEETING) — VRAIE base, VRAI compte
// info@probardistribution.com, VRAI Tool create_calendar_event, VRAIE
// création meetingCopilotSync.service.js::createCopilotMeeting() (jamais un
// mock, contrairement à test/services.meetingCopilotSync.test.js et
// test/ai.agents.meetingAgent.pendingActionWorkflow.test.js). Une SEULE
// écriture réelle est exercée (test "PHASE 13 — TEST LIVE MEETING"),
// délibérément après une confirmation explicite simulée — exactement le
// même chemin qu'un utilisateur réel confirmant "oui" — et nettoyée
// (`afterAll`) pour ne laisser aucune trace permanente. Même structure
// EXACTE que test/ai.orchestrator.commercialAgent.relanceAction.integration.test.js
// (PHASE 13), même harnais `buildManagerFor`.
//
// CONSTAT VÉRIFIÉ #1 (node -e, voir rapport de mission) : le message
// mandaté "Programmer une réunion avec Hadil demain à 10h", pris seul,
// N'EST PAS suffisant pour compléter les créneaux — meetingSlotExtractor.js
// n'invente jamais un sujet ni une heure de fin/durée absente du texte
// (design honnête assumé, voir ce fichier). `missingMeetingFields()` sur ce
// seul message retourne ["le sujet", "l'heure de fin (ou une durée)"] :
// aucune proposition n'est générée après ce seul tour. Ce test reproduit
// donc fidèlement la conversation à 2 tours qu'un utilisateur réel taperait
// pour fournir ces deux informations manquantes, avant de confirmer.
//
// CONSTAT VÉRIFIÉ #2, DÉSORMAIS CORRIGÉ (mission P1.3) — découvert PENDANT
// l'exécution de ce test live (requête SQL directe sur pg_enum) : l'ENUM
// Postgres réel `enum_calendar_event_syncs_entityType` ne contenait QUE
// 'project_action' et 'commercial_contact_relance' — PAS 'copilot_meeting',
// la valeur que meetingCopilotSync.service.js::ENTITY_TYPE passe à
// upsertSync(). Corrigé par la migration
// 20260815120000-add-copilot-meeting-to-calendar-event-syncs-enum.js
// (déjà présente dans le dépôt, exécutée explicitement lors de la mission
// P1.3) + src/models/CalendarEventSync.js (ENUM Sequelize élargi en
// conséquence). Ce fichier vérifie désormais la création RÉELLE de la ligne
// CalendarEventSync, plus seulement celle du Task CRM.
require("dotenv").config();
const { sequelize } = require("../src/db");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { ConversationContinuityResolver } = require("../src/ai/orchestrator/conversationContinuityResolver");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { loadDefaultAgents } = require("../src/ai/agents/manifest");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { createServer } = require("../src/ai/mcp/server/start");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools/mcpToolAdapter");
const { createCopilotMeeting } = require("../src/services/meetingCopilotSync.service");
const Task = require("../src/models/Task");
const CalendarEventSync = require("../src/models/CalendarEventSync");
const googleCalendarService = require("../src/services/googleCalendar.service");

const REAL_COMMERCIAL = { id: "b7c50110-31de-4d2c-96b4-5a117c9e262a", role: "commercial", email: "info@probardistribution.com" };
const ENTITY_TYPE = "copilot_meeting";

const createdTaskIds = [];

afterAll(async () => {
  // Nettoyage : supprime UNIQUEMENT le(s) Task/CalendarEventSync/événement
  // Google éventuellement réel créés par CE fichier — jamais un DELETE
  // large, aucune trace permanente.
  if (createdTaskIds.length) {
    const syncs = await CalendarEventSync.findAll({ where: { entityType: ENTITY_TYPE, entityId: createdTaskIds } });
    for (const sync of syncs) {
      if (sync.googleEventId) {
        try {
          await googleCalendarService.deleteCalendarEvent({ userId: sync.userId, eventId: sync.googleEventId });
        } catch (_) {
          // best-effort — ne doit jamais empêcher le reste du nettoyage
        }
      }
    }
    await CalendarEventSync.destroy({ where: { entityType: ENTITY_TYPE, entityId: createdTaskIds } });
    await Task.destroy({ where: { id: createdTaskIds } });
  }
  await sequelize.close();
});

function buildManagerFor(actingUser) {
  const server = createServer({ rateLimiter: null, auditLog: null });
  const langchainTools = createMcpToolAdapters({ mcpServer: server, actingUser });

  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const registry = new AgentRegistry();
  const pendingActionStore = new PendingActionStore();
  loadDefaultAgents(registry, {
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: async () => { throw new Error("LLM non sollicité — chemin déterministe"); } } }),
    tools: langchainTools,
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { invoke: async () => ({ answer: "x", citations: [] }) },
    summarizationChain: { invoke: async () => ({ summary: "x" }) },
    planner: { plan: async () => [] },
    pendingActionStore,
    createCopilotMeeting, // VRAIE fonction — jamais un stub, contrairement au harnais réutilisé pour CommercialAgent
    memory,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: {},
  });

  return new AIManager({
    conversationManager,
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry: registry }),
    toolRouter: { select: () => [] },
    workflowManager: { run: async () => ({ mode: "qa", answer: "", citations: [], toolSteps: [] }) },
    responseBuilder: new ResponseBuilder(),
    continuityResolver: new ConversationContinuityResolver({ catalog: DEFAULT_INTENT_CATALOG }),
  });
}

describe("PHASE 13 — TEST LIVE MEETING : cycle complet propose -> confirme -> exécution réelle (VRAI compte)", () => {
  test("« Programmer une réunion avec Hadil demain à 10h » (incomplet, voir constat ci-dessus) -> complété au tour 2 -> pendingAction.steps -> confirmation -> ÉCRITURE RÉELLE (Task + CalendarEventSync) -> deuxième 'oui' sans effet -> nettoyée", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const conversationId = "live-meeting-create-p1.2";

    // Tour 1 — le message EXACT mandaté par la mission : incomplet (voir
    // constat en tête de fichier), l'agent redemande le sujet et l'heure de
    // fin/durée, ZÉRO PendingAction à ce stade.
    const turn1 = await manager.handleMessage({ message: "Programmer une réunion avec Hadil demain à 10h", user: REAL_COMMERCIAL, conversationId });
    expect(turn1.intent).toBe("meetings");
    expect(turn1.agent).toBe("meeting_agent");
    expect(turn1.pendingAction).toBeFalsy();
    expect(turn1.answer).toMatch(/sujet/i);

    // Tour 2 — fournit les 2 informations manquantes (sujet + durée) :
    // complète désormais les créneaux (cumulatif, voir meetingSlotExtractor.js).
    const turn2 = await manager.handleMessage({ message: "sujet : Reunion Copilot Test P1-2, duree : 30 minutes", user: REAL_COMMERCIAL, conversationId });
    expect(turn2.pendingAction).toBeTruthy();
    expect(turn2.pendingAction.steps).toHaveLength(1);
    expect(turn2.pendingAction.steps[0].tool).toBe("create_calendar_event");
    expect(turn2.pendingAction.steps[0].input.summary).toBe("Reunion Copilot Test P1-2");
    expect(typeof turn2.pendingAction.steps[0].input.startDateTime).toBe("string");
    expect(typeof turn2.pendingAction.steps[0].input.endDateTime).toBe("string");
    expect(typeof turn2.pendingAction.steps[0].reason).toBe("string");
    expect(turn2.pendingAction.steps[0].reason.length).toBeGreaterThan(0);
    expect(turn2.answer).toMatch(/confirmez-vous/i);

    // Tour 3 — confirmation réelle.
    const confirmed = await manager.handleMessage({ message: "oui", user: REAL_COMMERCIAL, conversationId });

    const createStep = confirmed.toolCalls.find((c) => c.tool === "create_calendar_event");
    expect(createStep).toBeDefined();
    const output = typeof createStep.output === "string" ? JSON.parse(createStep.output) : createStep.output;
    expect(output.crmCreated).toBe(true);
    expect(output.crmEventId).toBeTruthy();
    createdTaskIds.push(output.crmEventId);

    // ── Vérification RÉELLE en base — le Task CRM ───────────────────────
    const task = await Task.findByPk(output.crmEventId);
    expect(task).not.toBeNull();
    expect(task.title).toBe("Reunion Copilot Test P1-2");
    expect(task.createdBy).toBe(REAL_COMMERCIAL.id); // Task.createdBy = actingUser.id, jamais un autre id

    // ── Vérification RÉELLE en base — la ligne CalendarEventSync (P1.3) ──
    const sync = await CalendarEventSync.findOne({ where: { entityType: ENTITY_TYPE, entityId: output.crmEventId, userId: REAL_COMMERCIAL.id } });
    expect(sync).not.toBeNull();
    expect(sync.entityType).toBe("copilot_meeting");
    expect(sync.entityId).toBe(output.crmEventId); // = Task.id, l'identifiant réellement utilisé par meetingCopilotSync
    expect(sync.userId).toBe(REAL_COMMERCIAL.id);

    // Réponse Copilot — reflète le résultat RÉEL, jamais un succès inventé.
    if (sync.googleEventId) {
      expect(output.googleCreated).toBe(true);
      expect(sync.synced).toBe(true);
      expect(confirmed.answer).toMatch(/Réunion créée avec succès/);
    } else {
      expect(output.googleCreated).toBe(false);
      expect(sync.synced).toBe(false);
      expect(confirmed.answer).toMatch(/synchronisation avec Google Calendar a échoué/);
      expect(confirmed.answer).not.toMatch(/créée avec succès/i);
    }
    // Un échec Google n'annule jamais la Task CRM (déjà vérifiée ci-dessus).
    expect(confirmed.answer).toMatch(/La réunion a été créée dans le CRM|Réunion créée avec succès/);

    // ── Deuxième "oui" -> aucune deuxième création (Task NI CalendarEventSync) ──
    const taskCountBefore = await Task.count({ where: { id: output.crmEventId } });
    const syncCountBefore = await CalendarEventSync.count({ where: { entityType: ENTITY_TYPE, entityId: output.crmEventId } });
    const secondConfirm = await manager.handleMessage({ message: "oui", user: REAL_COMMERCIAL, conversationId });
    expect(secondConfirm.toolCalls.find((c) => c.tool === "create_calendar_event")).toBeUndefined();
    const taskCountAfter = await Task.count({ where: { id: output.crmEventId } });
    const syncCountAfter = await CalendarEventSync.count({ where: { entityType: ENTITY_TYPE, entityId: output.crmEventId } });
    expect(taskCountAfter).toBe(taskCountBefore); // toujours 1
    expect(syncCountAfter).toBe(syncCountBefore); // toujours 1 — aucun doublon CalendarEventSync
  }, 60000);

  test("« non » après le récapitulatif -> aucune création réelle", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const conversationId = "live-meeting-cancel-p1.2";

    await manager.handleMessage({ message: "sujet : Reunion annulee Test P1-2, demain à 15h, duree : 15 minutes", user: REAL_COMMERCIAL, conversationId });
    const cancelled = await manager.handleMessage({ message: "non", user: REAL_COMMERCIAL, conversationId });

    expect(cancelled.answer).toMatch(/annulée/i);
    const anyCreated = await Task.count({ where: { title: "Reunion annulee Test P1-2", createdBy: REAL_COMMERCIAL.id } });
    expect(anyCreated).toBe(0);
  }, 60000);
});
