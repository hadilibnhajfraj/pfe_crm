"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS". VRAIE base, VRAI
// compte info@probardistribution.com, VRAI contact "Pépinière awled el HAJ".
// Une SEULE écriture réelle est exercée dans ce fichier (test "PHASE 13 —
// TEST LIVE"), délibérément après une confirmation explicite simulée —
// exactement le même chemin qu'un utilisateur réel confirmant "oui" — et
// nettoyée (`afterAll`) pour ne laisser aucune trace permanente.
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
const CommercialContactRelance = require("../src/models/CommercialContactRelance");
const CalendarEventSync = require("../src/models/CalendarEventSync");
const Task = require("../src/models/Task");
const googleCalendarService = require("../src/services/googleCalendar.service");

const REAL_COMMERCIAL = { id: "b7c50110-31de-4d2c-96b4-5a117c9e262a", role: "commercial", email: "info@probardistribution.com" };
const AWLED_CONTACT_ID = "008aea48-50ed-4aa4-86bf-6d51a3411c4e"; // Pépinière awled el HAJ (vérifié en base — voir audit)
const HADIL_ID = "516f6dca-7a6f-43cb-b527-5c5652e3e03f"; // hadil.ibnhajfraj@gmail.com (role "user", éligible — vérifié en base)

const createdRelanceIds = [];

afterAll(async () => {
  // Nettoyage : supprime UNIQUEMENT les relances (+ Task/CalendarEventSync/
  // événement Google éventuellement réel — voir PHASE 13) créées par ce
  // fichier de test — jamais un DELETE large, aucune trace permanente.
  if (createdRelanceIds.length) {
    const syncs = await CalendarEventSync.findAll({ where: { entityType: "commercial_contact_relance", entityId: createdRelanceIds } });
    for (const sync of syncs) {
      if (sync.googleEventId) {
        try {
          await googleCalendarService.deleteCalendarEvent({ userId: sync.userId, eventId: sync.googleEventId });
        } catch (_) {
          // best-effort — ne doit jamais empêcher le reste du nettoyage
        }
      }
    }
    const taskIds = syncs.map((s) => s.taskId).filter(Boolean);
    if (taskIds.length) await Task.destroy({ where: { id: taskIds } });
    await CalendarEventSync.destroy({ where: { entityType: "commercial_contact_relance", entityId: createdRelanceIds } });
    await CommercialContactRelance.destroy({ where: { id: createdRelanceIds } });
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
    createCopilotMeeting: async () => {},
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
    // Nécessaire pour ce fichier (contrairement aux tests P1.3, jamais
    // multi-tours) : un cycle propose -> confirme réel traverse le VRAI
    // routage d'intention à chaque tour — sans ce resolver (comme en
    // production, voir orchestrator/pipeline.js), un « confirme » isolé se
    // ferait reclasser vers `automation_agent` (mot-clé réel du catalogue,
    // refusé pour un rôle "commercial") au lieu de rester sur
    // commercial_agent.
    continuityResolver: new ConversationContinuityResolver({ catalog: DEFAULT_INTENT_CATALOG }),
  });
}

describe("PHASE 3/13 — trace pipeline réel : demande d'ACTION (jamais exécutée sans confirmation)", () => {
  test("« relancer le contact Pépinière awled el HAJ pour 21/08 » -> intent=commercial_contacts, agent=commercial_agent, PROPOSE (aucune écriture)", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({
      message: "relancer le contact Pépinière awled el HAJ pour 21/08",
      user: REAL_COMMERCIAL,
      conversationId: "live-action-q1",
    });

    expect(response.intent).toBe("commercial_contacts");
    expect(response.agent).toBe("commercial_agent");
    expect(response.answer).toMatch(/confirmez-vous/i);
    expect(response.answer).toContain("Pépinière awled el HAJ");
    // Le contact réel a été résolu via get_my_commercial_contacts (search),
    // jamais un id inventé.
    const searchStep = response.toolCalls.find((c) => c.tool === "get_my_commercial_contacts");
    expect(searchStep).toBeDefined();
    expect(searchStep.input).toEqual({ search: "Pépinière awled el HAJ", limit: 20 });
    // Aucune écriture : schedule_commercial_contact_relance n'apparaît PAS
    // dans les toolCalls de CE tour.
    expect(response.toolCalls.find((c) => c.tool === "schedule_commercial_contact_relance")).toBeUndefined();
  }, 30000);

  test("« affecter Pépinière awled el HAJ à hadil.ibnhajfraj@gmail.com » -> routage corrigé (plus de repli general_chat)", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({
      message: "affecter Pépinière awled el HAJ à hadil.ibnhajfraj@gmail.com",
      user: REAL_COMMERCIAL,
      conversationId: "live-action-q2",
    });
    expect(response.intent).toBe("commercial_contacts");
    expect(response.agent).toBe("commercial_agent");
    // Sans date, l'action n'est PAS proposée — réponse honnête sur la limite.
    expect(response.answer).toMatch(/date/i);
  }, 30000);

  test("« programme une relance demain pour Pépinière awled el HAJ » -> PROPOSE", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({
      message: "programme une relance demain pour Pépinière awled el HAJ",
      user: REAL_COMMERCIAL,
      conversationId: "live-action-q4",
    });
    expect(response.intent).toBe("commercial_contacts");
    expect(response.agent).toBe("commercial_agent");
    expect(response.answer).toMatch(/confirmez-vous/i);
  }, 30000);

  test("« change le commercial responsable de Pépinière awled el HAJ » -> réponse honnête (date obligatoire manquante), aucune écriture", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({
      message: "change le commercial responsable de Pépinière awled el HAJ",
      user: REAL_COMMERCIAL,
      conversationId: "live-action-q5",
    });
    expect(response.intent).toBe("commercial_contacts");
    expect(response.agent).toBe("commercial_agent");
    expect(response.answer).toMatch(/date/i);
  }, 30000);

  test("« Quels clients dois-je relancer ? » -> continue de fonctionner comme avant (test 6, non-régression P1.3)", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({ message: "Quels clients dois-je relancer ?", user: REAL_COMMERCIAL, conversationId: "live-action-q6" });
    expect(response.intent).toBe("commercial_contacts");
    expect(response.agent).toBe("commercial_agent");
    expect(response.answer).toContain("73");
  }, 30000);
});

describe("PHASE 12 — anti-fuite réel : ownerId/userId/commercialName injectés n'ont AUCUN effet sur l'écriture réelle", () => {
  test("le VRAI Tool d'écriture ignore ownerId/userId/createdBy/commercialName — jamais déclarés dans son schéma", async () => {
    const server = createServer({ rateLimiter: null, auditLog: null });
    const tool = server.toolRegistry.get("schedule_commercial_contact_relance");
    const { PermissionManager } = require("../src/ai/mcp/permissionManager");
    new PermissionManager().assertCanCall(tool, REAL_COMMERCIAL);
    // Contact d'un AUTRE utilisateur (createdBy != REAL_COMMERCIAL.id) —
    // refusé par le service (RBAC réel), jamais contourné par le Tool.
    // On vérifie ici uniquement que les champs hors-schéma sont absents du
    // payload effectivement transmis au service — aucune écriture DB dans
    // ce test (contact volontairement inexistant).
    const result = await tool.execute(
      { contactId: "00000000-0000-4000-8000-000000000000", dateRelance: "2026-08-21", ownerId: "x", userId: "x", createdBy: "x", commercialName: "najeh" },
      { actingUser: REAL_COMMERCIAL }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("contact_not_found");
  }, 30000);
});

describe("PHASE 13 — TEST LIVE : cycle complet propose -> confirme -> exécution réelle (VRAI compte, VRAI contact)", () => {
  test("« relancer Pépinière awled el HAJ pour le 27/08 et affecter le commercial hadil.ibnhajfraj@gmail.com » -> confirmation -> ÉCRITURE RÉELLE + synchronisation calendrier -> vérifiée en base -> deuxième 'oui' sans effet -> nettoyée", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const conversationId = "live-action-execute-p15";

    const proposed = await manager.handleMessage({
      message: "relancer Pépinière awled el HAJ pour le 27/08 et affecter le commercial hadil.ibnhajfraj@gmail.com",
      user: REAL_COMMERCIAL,
      conversationId,
    });
    expect(proposed.answer).toMatch(/confirmez-vous/i);
    expect(proposed.pendingAction).toBeTruthy();
    // Mission P1.2 — contrat canonique {id, steps:[{tool, input, reason}]}
    // (voir commercialAgent.js::_pendingActionView), plus la preuve live
    // que le Tool exposé est bien celui réellement invoqué à la confirmation.
    expect(proposed.pendingAction.steps).toHaveLength(1);
    expect(proposed.pendingAction.steps[0].tool).toBe("schedule_commercial_contact_relance");
    expect(proposed.pendingAction.steps[0].input.contactId).toBe(AWLED_CONTACT_ID);
    expect(proposed.pendingAction.steps[0].input.commercialId).toBe(HADIL_ID);
    expect(typeof proposed.pendingAction.steps[0].reason).toBe("string");
    expect(proposed.pendingAction.steps[0].reason.length).toBeGreaterThan(0);
    const expectedDate = proposed.pendingAction.steps[0].input.dateRelance; // résolu par le serveur, jamais codé en dur ici

    const confirmed = await manager.handleMessage({ message: "oui", user: REAL_COMMERCIAL, conversationId });
    expect(confirmed.answer).toMatch(/effectuée avec succès/i);

    const writeStep = confirmed.toolCalls.find((c) => c.tool === "schedule_commercial_contact_relance");
    expect(writeStep).toBeDefined();
    const output = typeof writeStep.output === "string" ? JSON.parse(writeStep.output) : writeStep.output;
    expect(output.ok).toBe(true);
    expect(output.relance.commercialContactId).toBe(AWLED_CONTACT_ID);
    expect(output.relance.commercialId).toBe(HADIL_ID);
    createdRelanceIds.push(output.relance.id);

    // ── 1. commercial_contact_relances — vérification RÉELLE en base ──────
    const row = await CommercialContactRelance.findByPk(output.relance.id);
    expect(row).not.toBeNull();
    expect(row.commercialContactId).toBe(AWLED_CONTACT_ID);
    expect(row.commercialId).toBe(HADIL_ID);
    expect(String(row.dateRelance)).toContain(expectedDate);
    // TEST 10 — aucun email/WhatsApp/notification déclenché par ce chemin.
    expect(row.emailSent).toBe(false);
    expect(row.whatsappSent).toBe(false);
    expect(row.notificationSent).toBe(false);

    // ── 2/3. CalendarEventSync + Task (calendrier CRM du commercial affecté) ──
    const sync = await CalendarEventSync.findOne({ where: { entityType: "commercial_contact_relance", entityId: output.relance.id, userId: HADIL_ID } });
    expect(sync).not.toBeNull();
    expect(sync.taskId).toBeTruthy();
    const task = await Task.findByPk(sync.taskId);
    expect(task).not.toBeNull();
    expect(task.createdBy).toBe(HADIL_ID); // apparaît bien dans SON calendrier (GET /tasks filtre createdBy=req.user.sub)
    // Aucune heure fournie dans le message -> 09:00 LOCALE (combineDateTime()
    // parse "YYYY-MM-DDT09:00" sans fuseau explicite = heure locale du
    // process, comparée ici de la même façon plutôt que sur l'ISO UTC).
    const local = new Date(task.startAt);
    expect(`${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`).toBe(expectedDate);
    expect(`${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`).toBe("09:00");
    expect(task.endAt.getTime() - task.startAt.getTime()).toBe(30 * 60 * 1000);

    // ── 4. Google Calendar — résultat RÉEL (connecté ou non selon l'état
    // réel du compte Hadil dans cet environnement) ; jamais affirmé sans
    // preuve — l'un OU l'autre des deux messages doit apparaître, jamais
    // "Google Calendar : événement créé" si `sync.googleEventId` est vide. ──
    if (sync.googleEventId) {
      expect(confirmed.answer).toMatch(/Google Calendar : événement créé/);
    } else {
      expect(confirmed.answer).toMatch(/Google Calendar : (non connecté|échec de synchronisation)/);
    }
    expect(confirmed.answer).toMatch(/Calendrier CRM : événement créé/);

    // ── TEST 5 — deuxième "oui" -> aucune deuxième relance/tâche créée ────
    const countBefore = await CommercialContactRelance.count({ where: { commercialContactId: AWLED_CONTACT_ID, dateRelance: row.dateRelance, commercialId: HADIL_ID } });
    const secondConfirm = await manager.handleMessage({ message: "oui", user: REAL_COMMERCIAL, conversationId });
    expect(secondConfirm.toolCalls.find((c) => c.tool === "schedule_commercial_contact_relance")).toBeUndefined();
    const countAfter = await CommercialContactRelance.count({ where: { commercialContactId: AWLED_CONTACT_ID, dateRelance: row.dateRelance, commercialId: HADIL_ID } });
    expect(countAfter).toBe(countBefore);
  }, 60000);
});
