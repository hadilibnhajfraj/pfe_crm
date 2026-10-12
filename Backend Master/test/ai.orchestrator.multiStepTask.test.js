"use strict";

// Phase 3 — TASK PLANNER + MULTI-STEP TOOL CALLING, de bout en bout.
//
// RÉELS : AIManager, ContextManager, SemanticIntentResolver, TaskPlanner,
// ConfirmationManager + PendingActionStore, TaskPlannerAgent, PlanExecutor,
// et surtout les VRAIES fabriques de Tools (list_projects,
// create_project_action, get_my_commercial_contacts,
// schedule_commercial_contact_relance) derrière un VRAI McpServer
// (PermissionManager = RBAC, validation Joi, périmètre « mine »).
// SIMULÉS : uniquement les services SQL appelés par ces Tools, et le modèle de
// langage (espionné : il ne doit JAMAIS être consulté par ce parcours).

jest.mock("../src/modules/projects/services/project.service", () => ({ listProjects: jest.fn() }));
jest.mock("../src/modules/project-actions/services/projectAction.service", () => ({ createAction: jest.fn() }));
jest.mock("../src/modules/commercial-contacts/services/commercialContactKpi.service", () => ({ listCommercialContacts: jest.fn() }));
jest.mock("../src/modules/commercial-contacts/services/commercialContactRelance.service", () => ({ scheduleContactRelance: jest.fn() }));

const crypto = require("crypto");
const projectService = require("../src/modules/projects/services/project.service");
const projectActionService = require("../src/modules/project-actions/services/projectAction.service");
const contactKpiService = require("../src/modules/commercial-contacts/services/commercialContactKpi.service");
const relanceService = require("../src/modules/commercial-contacts/services/commercialContactRelance.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const { createListProjectsTool } = require("../src/ai/mcp/tools/projects/listProjectsTool");
const { createCreateProjectActionTool } = require("../src/ai/mcp/tools/projectActions/createProjectActionTool");
const { createGetMyCommercialContactsTool } = require("../src/ai/mcp/tools/commercialContacts/getMyCommercialContactsTool");
const { createScheduleCommercialContactRelanceTool } = require("../src/ai/mcp/tools/commercialContacts/scheduleCommercialContactRelanceTool");

const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { createTaskPlannerAgent } = require("../src/ai/agents/taskPlannerAgent");
const { createProjectAgent } = require("../src/ai/agents/projectAgent");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");
const { SemanticIntentResolver } = require("../src/ai/orchestrator/semanticIntentResolver");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { TaskPlanner } = require("../src/ai/planning/taskPlanner");

const EXAMPLE = "Trouve mes projets en cours sans relance depuis 30 jours et prépare une relance pour chacun.";

const ALICE = { id: crypto.randomUUID(), role: "commercial", email: "alice@cbi.tn" };
const SARA = { id: crypto.randomUUID(), role: "commercial_sedentaire", email: "sara@cbi.tn" };
const LOGISTIQUE = { id: crypto.randomUUID(), role: "responsable_logistique_achat", email: "log@cbi.tn" };
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

let PROJECTS;
let CONTACTS;
function seed() {
  const p = (nomProjet, statut, lastRelanceAt, ownerId = ALICE.id) => ({ id: crypto.randomUUID(), nomProjet, statut, lastRelanceAt, ownerId, owner: { name: "Alice" } });
  PROJECTS = [
    p("Sfax Port", "En cours", daysAgo(45)),
    p("Villa Tunis", "En cours", null),
    p("Immeuble Sousse", "En cours", daysAgo(90)),
    p("Relancé hier", "En cours", daysAgo(1)),
    p("Déjà livré", "Livraison", daysAgo(200)),
    p("Projet de Bob", "En cours", daysAgo(300), crypto.randomUUID()),
  ];
  const c = (prenom, nom, statut, dateAppel, createdBy = SARA.id) => ({ id: crypto.randomUUID(), prenom, nom, nomSociete: "STE", statut, dateAppel, createdBy });
  CONTACTS = [c("Ali", "Ben", "rappeler_plus_tard", daysAgo(20)), c("Mona", "Trabelsi", "rappeler_plus_tard", null), c("Hedi", "Kefi", "ok", daysAgo(2))];
}

// Émule le périmètre du vrai service : `mine` → projets de l'appelant.
function installServiceFakes() {
  projectService.listProjects.mockImplementation(async (query, userId) => {
    let rows = PROJECTS.filter((row) => !query.mine || row.ownerId === userId);
    if (query.statut) rows = rows.filter((row) => row.statut === query.statut);
    return { data: rows.map(({ ownerId: _o, ...row }) => row), total: rows.length };
  });
  projectActionService.createAction.mockImplementation(async (projectId, body) => ({ id: crypto.randomUUID(), projectId, typeAction_legacy: body.typeAction, dateRelance: body.dateRelance }));
  contactKpiService.listCommercialContacts.mockImplementation(async (userId, { status } = {}) => {
    const rows = CONTACTS.filter((row) => (!userId || row.createdBy === userId) && (!status || row.statut === status));
    return { contacts: rows, total: rows.length };
  });
  relanceService.scheduleContactRelance.mockImplementation(async (contactId, input) => ({ ok: true, relance: { id: crypto.randomUUID(), commercialContactId: contactId, dateRelance: input.dateRelance } }));
}

const realTools = () => [createListProjectsTool(), createCreateProjectActionTool(), createGetMyCommercialContactsTool(), createScheduleCommercialContactRelanceTool()];

// Même contenu que pipeline.js::buildToolPermissionIndex (rôles déclarés par
// chaque Tool), limité aux 4 Tools du plan pour ne pas charger la base.
function buildToolPermissionIndex() {
  return new Map(realTools().map((t) => [t.name, { requiredRoles: t.requiredRoles || [], allowedEmails: t.allowedEmails || [] }]));
}

function mcpServer() {
  const registry = new ToolRegistry();
  realTools().forEach((t) => registry.register(t));
  return new McpServer({ name: "test", version: "0.0.0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
}

// Un orchestrateur par utilisateur (comme le bridge), avec un
// PendingActionStore partagé entre les tours.
function build(user, { store = new PendingActionStore(), memory = new InMemoryConversationMemory(), agentOptions = {}, withPermissionIndex = true } = {}) {
  const server = mcpServer();
  const tools = createMcpToolAdapters({ mcpServer: server, actingUser: user });
  const chatModel = { invoke: jest.fn(async () => ({ content: "J'ai créé 12 relances avec succès." })) };
  const registry = new AgentRegistry();
  const common = { chatModel, tools, workflowEngine: new LangChainWorkflowEngine(), memory, maxHistoryMessages: 6 };
  registry.register(
    createTaskPlannerAgent({ ...common, pendingActionStore: store, toolPermissionIndex: withPermissionIndex ? buildToolPermissionIndex() : null, ...agentOptions })
  );
  registry.register(createProjectAgent({ ...common, maxToolCalls: 3 }));
  const manager = new AIManager({
    conversationManager: new ConversationManager({ memory }),
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry: registry }),
    toolRouter: { select: () => [] },
    workflowManager: { run: async () => ({ mode: "qa", answer: "réponse générale", citations: [], toolSteps: [] }) },
    responseBuilder: new ResponseBuilder(),
    pendingActionStore: store,
    entityExtractor: extractEntities,
    contextManager: new ContextManager(),
    semanticResolver: new SemanticIntentResolver({ logger: { info() {}, warn() {} } }),
    taskPlanner: new TaskPlanner(),
  });
  return { manager, chatModel, store, memory };
}

const say = (h, user, message, conversationId = "c1") => h.manager.handleMessage({ message, user, conversationId });

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  installServiceFakes();
});

describe("Plan multi-step — l'exemple de référence", () => {
  test("tour 1 : comprendre, planifier, LIRE, analyser, préparer, résumer, demander confirmation — sans rien écrire", async () => {
    const h = build(ALICE);
    const r = await say(h, ALICE, EXAMPLE);

    expect(r).toMatchObject({ intent: "multi_step_task", agent: "task_planner_agent", mode: "agent" });
    // 1-3. lecture réelle, scopée par le Tool (commercial → mine: true)
    expect(projectService.listProjects).toHaveBeenCalledTimes(1);
    expect(projectService.listProjects.mock.calls[0][0]).toMatchObject({ mine: true, statut: "En cours" });
    // 4-5. analyse : 3 retenus (Bob hors périmètre, « Relancé hier » écarté)
    expect(r.answer).toMatch(/1\. ✅ Lecture .*\[list_projects\] → 4 lu\(s\)/);
    expect(r.answer).toMatch(/3 projets retenu\(s\), 1 écarté\(s\)/);
    expect(r.answer).toContain("AUCUNE n'est encore exécutée");
    for (const name of ["Villa Tunis", "Immeuble Sousse", "Sfax Port"]) expect(r.answer).toContain(name);
    expect(r.answer).not.toContain("Projet de Bob");
    // 6-7. résumé + demande de confirmation, plan stocké
    expect(r.answer).toMatch(/Répondez « confirme » pour exécuter ces 3 action\(s\)/);
    expect(r.pendingAction).toMatchObject({ type: "task_plan" });
    expect(r.pendingAction.steps).toHaveLength(3);
    expect(r.pendingAction.steps[0].input).toMatchObject({ typeAction: "Relance", priorite: "normale" });
    // aucune écriture, aucun modèle de langage
    expect(projectActionService.createAction).not.toHaveBeenCalled();
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("tour 2 « confirme » : relecture du périmètre, 3 écritures réelles, résultats réels des Tools renvoyés", async () => {
    const h = build(ALICE);
    const proposal = await say(h, ALICE, EXAMPLE);
    const r = await say(h, ALICE, "confirme");

    expect(r).toMatchObject({ intent: "multi_step_task", agent: "task_planner_agent", pendingAction: null });
    expect(projectService.listProjects).toHaveBeenCalledTimes(2); // lecture + relecture avant écriture
    expect(projectActionService.createAction).toHaveBeenCalledTimes(3);
    const targeted = projectActionService.createAction.mock.calls.map((c) => c[0]);
    expect(targeted).toEqual(proposal.pendingAction.steps.map((s) => s.input.projectId));
    // identité de l'auteur : l'utilisateur authentifié, jamais un champ du message
    expect(projectActionService.createAction.mock.calls.every((c) => c[2] === ALICE.id)).toBe(true);

    expect(r.answer).toMatch(/✅ 3 action\(s\) exécutée\(s\) sur 3/);
    const writes = r.toolCalls.filter((t) => t.tool === "create_project_action");
    expect(writes).toHaveLength(3);
    for (const call of writes) expect(r.answer).toContain(`enregistrement ${call.output.id}`);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();

    // usage unique : une seconde confirmation n'exécute rien
    const again = await say(h, ALICE, "confirme");
    expect(projectActionService.createAction).toHaveBeenCalledTimes(3);
    expect(again.intent).not.toBe("multi_step_task"); // plus de plan : routage normal
  });
});

describe("Plan simple", () => {
  test("une seule cible : 1 lecture, 1 action préparée, exécutée après confirmation", async () => {
    PROJECTS = PROJECTS.filter((p) => p.nomProjet === "Sfax Port");
    const h = build(ALICE);
    const r1 = await say(h, ALICE, "Prépare une relance pour tous mes projets en cours dans 3 jours");
    expect(r1.pendingAction.steps).toHaveLength(1);
    expect(r1.pendingAction.steps[0].input).toMatchObject({ projectId: PROJECTS[0].id, typeAction: "Relance" });
    expect(r1.answer).not.toMatch(/demain par défaut/); // date explicite
    const r2 = await say(h, ALICE, "Oui, je confirme.");
    expect(projectActionService.createAction).toHaveBeenCalledTimes(1);
    expect(r2.answer).toMatch(/✅ 1 action\(s\) exécutée\(s\) sur 1/);
  });

  test("rien ne correspond : aucune proposition, rien à confirmer, rien d'écrit", async () => {
    PROJECTS = PROJECTS.filter((p) => p.nomProjet === "Relancé hier");
    const h = build(ALICE);
    const r = await say(h, ALICE, EXAMPLE);
    expect(r.pendingAction).toBeNull();
    expect(r.answer).toMatch(/Aucun projet ne correspond à ces critères/);
    expect(h.store.peek("c1")).toBeNull();
  });

  test("contacts (commercial sédentaire) : Tools dédiés, relance programmée après confirmation", async () => {
    const h = build(SARA);
    const r1 = await say(h, SARA, "Trouve mes contacts à rappeler et programme une relance pour chacun");
    expect(r1.pendingAction.steps.map((s) => s.tool)).toEqual(["schedule_commercial_contact_relance", "schedule_commercial_contact_relance"]);
    await say(h, SARA, "confirme");
    expect(relanceService.scheduleContactRelance).toHaveBeenCalledTimes(2);
    expect(relanceService.scheduleContactRelance.mock.calls[0][2]).toMatchObject({ id: SARA.id });
  });
});

describe("Annulation", () => {
  test("« annule » : rien n'est exécuté, le plan est retiré ; « confirme » ensuite n'a plus d'effet", async () => {
    const h = build(ALICE);
    await say(h, ALICE, EXAMPLE);
    const r = await say(h, ALICE, "annule");
    expect(r).toMatchObject({ intent: "multi_step_task", pendingAction: null });
    expect(r.answer).toMatch(/Plan annulé .* Aucune des 3 action\(s\) préparée\(s\) n'a été exécutée/);
    await say(h, ALICE, "confirme");
    expect(projectActionService.createAction).not.toHaveBeenCalled();
  });

  test("une autre question entre-temps ne consomme pas le plan ; « ne confirme pas » n'exécute rien", async () => {
    const h = build(ALICE);
    await say(h, ALICE, EXAMPLE);
    const other = await say(h, ALICE, "Montre-moi mes projets en cours");
    expect(other.agent).toBe("project_agent");
    await say(h, ALICE, "ne confirme pas");
    expect(projectActionService.createAction).not.toHaveBeenCalled();
    await say(h, ALICE, "confirme");
    expect(projectActionService.createAction).toHaveBeenCalledTimes(3);
  });
});

describe("Permissions — le RBAC du serveur décide, jamais le modèle", () => {
  test("écriture non autorisée pour le rôle : refus avant toute lecture (mêmes rôles que le Tool)", async () => {
    const h = build(LOGISTIQUE); // rôle sans droit schedule_commercial_contact_relance
    const r = await say(h, LOGISTIQUE, "Trouve mes contacts à rappeler et programme une relance pour chacun");
    expect(r.answer).toMatch(/non autorisée pour votre rôle/);
    expect(contactKpiService.listCommercialContacts).not.toHaveBeenCalled();
    expect(r.pendingAction).toBeNull();
  });

  test("sans vérification préalable, c'est le serveur MCP qui refuse la lecture : plan interrompu", async () => {
    const h = build(LOGISTIQUE, { withPermissionIndex: false });
    const r = await say(h, LOGISTIQUE, "Trouve mes contacts à rappeler et programme une relance pour chacun");
    expect(r.answer).toMatch(/⛔ Lecture .*permission refusée par le serveur/);
    expect(r.answer).toMatch(/aucune action n'a été préparée ni exécutée/);
    expect(contactKpiService.listCommercialContacts).not.toHaveBeenCalled();
    expect(r.pendingAction).toBeNull();
  });

  test("rôle retiré entre proposition et confirmation : le serveur refuse, rien n'est écrit", async () => {
    const store = new PendingActionStore();
    const memory = new InMemoryConversationMemory();
    const asSedentaire = build(SARA, { store, memory });
    await say(asSedentaire, SARA, "Trouve mes contacts à rappeler et programme une relance pour chacun");
    const demoted = { ...SARA, role: "responsable_logistique_achat" };
    const asDemoted = build(demoted, { store, memory, withPermissionIndex: false });
    const r = await say(asDemoted, demoted, "confirme");
    expect(relanceService.scheduleContactRelance).not.toHaveBeenCalled();
    expect(r.answer).toMatch(/Aucune action n'a abouti/);
    expect(r.answer).toMatch(/vérification du périmètre impossible \(permission refusée/);
  });

  test("un autre utilisateur ne peut pas confirmer le plan d'Alice (même conversation)", async () => {
    const store = new PendingActionStore();
    const memory = new InMemoryConversationMemory();
    await say(build(ALICE, { store, memory }), ALICE, EXAMPLE);
    const mallory = { id: crypto.randomUUID(), role: "admin" };
    const r = await say(build(mallory, { store, memory }), mallory, "confirme");
    expect(r.agent).not.toBe("task_planner_agent");
    expect(projectActionService.createAction).not.toHaveBeenCalled();
    expect(store.peek("c1")).toMatchObject({ actingUserId: ALICE.id });
  });

  test("refus métier du service (accès au contact) : rapporté tel quel, jamais présenté comme réussi", async () => {
    relanceService.scheduleContactRelance.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const h = build(SARA);
    await say(h, SARA, "Trouve mes contacts à rappeler et programme une relance pour chacun");
    const r = await say(h, SARA, "confirme");
    expect(r.answer).toMatch(/Exécution partielle : 1 action\(s\) réussie\(s\), 1 en échec/);
    expect(r.answer).toMatch(/non effectuée : accès refusé à ce contact/);
  });
});

describe("Échecs de Tools", () => {
  test("échec de la lecture : plan interrompu, aucune proposition", async () => {
    projectService.listProjects.mockRejectedValueOnce(new Error("connection refused"));
    const h = build(ALICE);
    const r = await say(h, ALICE, EXAMPLE);
    expect(r.answer).toMatch(/❌ Lecture .*échec du Tool/);
    expect(r.answer).toMatch(/Le plan est interrompu/);
    expect(r.pendingAction).toBeNull();
  });

  test("échec partiel à l'exécution : réussites et échecs rapportés ligne par ligne", async () => {
    const h = build(ALICE);
    await say(h, ALICE, EXAMPLE);
    projectActionService.createAction
      .mockImplementationOnce(async (projectId) => ({ id: crypto.randomUUID(), projectId }))
      .mockImplementationOnce(async () => {
        throw { status: 404, message: "Project not found" };
      })
      .mockImplementationOnce(async (projectId) => ({ id: crypto.randomUUID(), projectId }));
    const r = await say(h, ALICE, "confirme");
    expect(projectActionService.createAction).toHaveBeenCalledTimes(3); // l'échec n'arrête pas les suivantes
    expect(r.answer).toMatch(/Exécution partielle : 2 action\(s\) réussie\(s\), 1 en échec, sur 3/);
    expect(r.answer).toMatch(/❌ .*échec du Tool/);
  });

  test("projet réaffecté entre proposition et confirmation : non écrit (relecture du périmètre)", async () => {
    const h = build(ALICE);
    const proposal = await say(h, ALICE, EXAMPLE);
    const movedId = proposal.pendingAction.steps[0].target.id;
    PROJECTS.find((p) => p.id === movedId).ownerId = crypto.randomUUID();
    const r = await say(h, ALICE, "confirme");
    expect(projectActionService.createAction).toHaveBeenCalledTimes(2);
    expect(projectActionService.createAction.mock.calls.map((c) => c[0])).not.toContain(movedId);
    expect(r.answer).toMatch(/n'est plus dans votre périmètre/);
  });
});

describe("Timeouts", () => {
  test("lecture trop lente : délai dépassé, rien de préparé", async () => {
    projectService.listProjects.mockImplementationOnce(() => new Promise(() => {}));
    const h = build(ALICE, { agentOptions: { stepTimeoutMs: 30 } });
    const r = await say(h, ALICE, EXAMPLE);
    expect(r.answer).toMatch(/⏱️ Lecture .*délai de 30 ms dépassé/);
    expect(r.pendingAction).toBeNull();
  });

  test("écriture trop lente : statut délai dépassé et avertissement (elle a pu aboutir), les autres continuent", async () => {
    const h = build(ALICE, { agentOptions: { stepTimeoutMs: 50 } });
    await say(h, ALICE, EXAMPLE);
    projectActionService.createAction.mockImplementationOnce(() => new Promise(() => {}));
    const r = await say(h, ALICE, "confirme");
    expect(r.answer).toMatch(/2 action\(s\) réussie\(s\), 1 en échec/);
    expect(r.answer).toMatch(/⏱️ .*a pu aboutir côté serveur/);
  });
});

describe("Résultats hallucinés — seules les données des Tools comptent", () => {
  test("lecture renvoyant des lignes sans identifiant réel : rejetée, aucune action préparée", async () => {
    projectService.listProjects.mockResolvedValueOnce({ data: [{ id: "PRJ-1", nomProjet: "Projet inventé", statut: "En cours" }], total: 1 });
    const h = build(ALICE);
    const r = await say(h, ALICE, EXAMPLE);
    expect(r.answer).toMatch(/non conforme : ligne 1 sans identifiant valide/);
    expect(r.pendingAction).toBeNull();
  });

  test("écriture « réussie » sans enregistrement renvoyé : jamais comptée comme un succès", async () => {
    const h = build(ALICE);
    await say(h, ALICE, EXAMPLE);
    projectActionService.createAction.mockResolvedValue({ success: true, message: "Relance créée" });
    const r = await say(h, ALICE, "confirme");
    expect(r.answer).toMatch(/❌ Aucune action n'a abouti \(3 tentée\(s\)\)/);
    expect(r.answer).toMatch(/aucun enregistrement renvoyé par le service/);
  });

  test("plan altéré (cible injectée hors lecture) : l'écriture est refusée sans appeler le Tool", async () => {
    const h = build(ALICE);
    await say(h, ALICE, EXAMPLE);
    const pending = h.store.peek("c1");
    const foreign = PROJECTS.find((p) => p.nomProjet === "Projet de Bob").id;
    pending.steps[0].input.projectId = foreign; // cible réelle… d'un autre utilisateur
    const r = await say(h, ALICE, "confirme");
    expect(projectActionService.createAction.mock.calls.map((c) => c[0])).not.toContain(foreign);
    expect(r.answer).toMatch(/refusée : la cible ne provient d'aucune lecture réelle/);
  });

  test("le modèle de langage n'est jamais consulté : aucun chiffre ne peut venir de lui", async () => {
    const h = build(ALICE);
    await say(h, ALICE, EXAMPLE);
    const r = await say(h, ALICE, "confirme");
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
    expect(r.answer).not.toContain("12 relances");
    expect(r.answer).toMatch(/Résultats renvoyés par les Tools du CRM/);
  });

  test("« confirme » sans plan en attente : rien n'est inventé ni exécuté", async () => {
    const store = new PendingActionStore();
    const h = build(ALICE, { store });
    store.propose("c1", { type: "task_plan", actingUserId: ALICE.id, id: "x", goal: "g", steps: [], summary: null });
    store.consume("c1");
    const r = await say(h, ALICE, "confirme");
    expect(projectActionService.createAction).not.toHaveBeenCalled();
    expect(r.answer).not.toMatch(/exécutée/);
  });
});
