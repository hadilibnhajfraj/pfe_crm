"use strict";

// PROBAR ASSISTANT — fiches PROBAR / PROMESH : consultation, comptage, analyse,
// création guidée, module seul, permissions. VRAI AIManager (avec la reprise
// d'une action en attente), VRAIS IndustrialAgent / PorPromeshAgent, VRAIS
// outils derrière un VRAI McpServer. Simulés : les services SQL (tables en
// mémoire) et le modèle de langage, qui ne doit pas être sollicité.

jest.mock("../src/modules/industrial-records/services/industrialRecord.service", () => ({ listRecords: jest.fn(), createRecord: jest.fn(), getRecord: jest.fn(), updateRecord: jest.fn(), deleteRecord: jest.fn() }));
jest.mock("../src/modules/industrial-records/services/industrialStatistics.service", () => ({ getStatistics: jest.fn(), GROUP_BY_VALUES: ["module"], MODULES: ["probar", "melange", "maintenance"] }));
jest.mock("../src/modules/machines/services/machine.service", () => ({ listMachines: jest.fn() }));
jest.mock("../src/modules/por-promesh/services/porPromesh.service", () => ({
  listPorPromesh: jest.fn(),
  createOrOpenDraft: jest.fn(),
  createPorPromesh: jest.fn(),
  getPorPromesh: jest.fn(),
  getStats: jest.fn(),
  getDashboard: jest.fn(),
  updatePorPromesh: jest.fn(),
  deletePorPromesh: jest.fn(),
  validatePorPromesh: jest.fn(),
  listOperators: jest.fn(),
}));

const industrialService = require("../src/modules/industrial-records/services/industrialRecord.service");
const promeshService = require("../src/modules/por-promesh/services/porPromesh.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const industrialTools = require("../src/ai/mcp/tools/industrial");
const promeshTools = require("../src/ai/mcp/tools/porPromesh");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { BaseAgent } = require("../src/ai/agents/baseAgent");
const { createIndustrialAgent } = require("../src/ai/agents/industrialAgent");
const { createPorPromeshAgent } = require("../src/ai/agents/porPromeshAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { detectIndustrialRequest } = require("../src/ai/reasoning/industrialRequest");

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = { id: uuid(1), role: "admin", email: "admin@cbi.tn" };
const LOGISTIQUE = { id: uuid(2), role: "responsable_logistique_achat", email: "log@cbi.tn" };
const COMMERCIAL = { id: uuid(3), role: "commercial", email: "com@cbi.tn" };

// 30 fiches PROMESH et 18 fiches PROBAR, comme sur le tableau de bord signalé.
const PROMESH = Array.from({ length: 30 }, (_, i) => ({
  id: uuid(1000 + i),
  sequenceNumber: 100 + i,
  dateProduction: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
  machine: String((i % 2) + 1),
  poste: i % 3 === 0 ? "nuit" : "matin",
  operateur: "Najeh",
  productionM2: 10,
  conformite: i % 5 === 0 ? "non_conforme" : "conforme",
  status: i < 10 ? "BROUILLON" : "VALIDE",
  createdBy: i < 4 ? LOGISTIQUE.id : ADMIN.id,
}));
const PROBAR = Array.from({ length: 18 }, (_, i) => ({ id: uuid(2000 + i), module: "probar", dateFiche: `2026-08-${String(i + 1).padStart(2, "0")}`, machine: String((i % 3) + 1), poste: i % 2 ? "nuit" : "matin", quantiteProduite: 100, statutQualite: i % 6 === 0 ? "nok" : "ok" }));
const MELANGE = Array.from({ length: 4 }, (_, i) => ({ id: uuid(3000 + i), module: "melange", dateFiche: "2026-10-03", machine: null, poste: null }));

function serve() {
  // Même règle que le service : le responsable logistique ne voit que SES fiches PROMESH.
  promeshService.listPorPromesh.mockImplementation(async (actor) => {
    const rows = actor.role === "responsable_logistique_achat" ? PROMESH.filter((f) => f.createdBy === actor.id) : PROMESH;
    return { data: rows, total: rows.length };
  });
  promeshService.createOrOpenDraft.mockImplementation(async (actor, { machine, poste }) => ({ id: uuid(9000), sequenceNumber: 131, machine: String(machine), poste, status: "BROUILLON", createdBy: actor.id }));
  industrialService.listRecords.mockImplementation(async ({ module, machine, poste } = {}) => {
    let rows = [...PROBAR, ...MELANGE];
    if (module) rows = rows.filter((r) => r.module === module);
    if (machine) rows = rows.filter((r) => r.machine === machine);
    if (poste) rows = rows.filter((r) => r.poste === poste);
    return { data: rows, total: rows.length };
  });
  industrialService.createRecord.mockImplementation(async (input, actor) => ({ id: uuid(9001), ...input, createdBy: actor.id }));
}

function harness(user) {
  const registry = new ToolRegistry();
  [...industrialTools.toolFactories, ...promeshTools.toolFactories].forEach((factory) => registry.register(factory()));
  const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  const tools = createMcpToolAdapters({ mcpServer: server, actingUser: user });
  const complete = jest.fn(async () => JSON.stringify({ action: "final_answer", answer: "RÉPONSE DU MODÈLE" }));
  const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
  const memory = new InMemoryConversationMemory();
  const workflowEngine = new LangChainWorkflowEngine();
  const pendingActionStore = new PendingActionStore();
  const agents = new AgentRegistry();
  agents.register(createIndustrialAgent({ chatModel, tools, workflowEngine, memory, pendingActionStore, maxToolCalls: 5, maxHistoryMessages: 6 }));
  agents.register(createPorPromeshAgent({ chatModel, tools, workflowEngine, memory, pendingActionStore, maxToolCalls: 5, maxHistoryMessages: 6 }));
  const witness = new BaseAgent({ name: "assistant_agent", systemPrompt: "x", intentNames: ["general_chat", "documentation_question", "projects", "commercial_contacts"], chatModel: {}, tools: [], allowedToolNames: [], workflowEngine });
  witness._run = async () => ({ answer: "[assistant_agent]", citations: [], toolSteps: [] });
  agents.register(witness);
  const manager = new AIManager({
    conversationManager: new ConversationManager({ memory }),
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry: agents }),
    toolRouter: { select: () => [] },
    workflowManager: { run: async () => ({ mode: "qa", answer: "réponse générale", citations: [], toolSteps: [] }) },
    responseBuilder: new ResponseBuilder(),
    pendingActionStore,
  });
  let n = 0;
  return {
    complete,
    ask: (message) => manager.handleMessage({ message, user, conversationId: `c-${user.id}-${(n += 1)}` }),
    say: (message) => manager.handleMessage({ message, user, conversationId: `conv-${user.id}` }),
  };
}

const tools = (r) => (r.toolCalls || []).map((c) => c.tool);
let spies;
beforeEach(() => {
  jest.clearAllMocks();
  serve();
  spies = ["log", "info", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("Reconnaissance de la demande", () => {
  test.each([
    ["Donne-moi les fiches PROMESH", "list", "promesh"],
    ["donne-moi fiche PROMESH", "list", "promesh"],
    ["Liste les fiches PROBAR", "list", "probar"],
    ["Affiche l'historique PROMESH", "list", "promesh"],
    ["Combien de fiches PROMESH existent ?", "count", "promesh"],
    ["Consulte la fiche PROMESH numéro 12", "get", "promesh"],
    ["Crée une nouvelle fiche PROBAR", "create", "probar"],
    ["Je veux saisir une fiche PROMESH", "create", "promesh"],
    ["Ajouter une fiche de production", "create", null],
    ["Analyse la production PROMESH", "analysis", "promesh"],
    ["Résume les fiches PROBAR", "analysis", "probar"],
    ["Compare la production des périodes disponibles", "analysis", null],
    ["probar", "ambiguous", "probar"],
    ["PROMESH", "ambiguous", "promesh"],
  ])("« %s » → %s / %s", (message, operation, module) => {
    expect(detectIndustrialRequest(message)).toMatchObject({ operation, module });
  });

  test("le nom d'un module seul n'est jamais une création", () => {
    for (const message of ["probar", "PROBAR", "promesh", "PRO PROMESH", "Probar ?"]) expect(detectIndustrialRequest(message).operation).toBe("ambiguous");
  });

  test.each(["modifie la fiche probar", "valide la fiche promesh 12", "supprime la fiche industrielle erronée", "les fiches promesh de la machine 1", "fiches PROMESH validées"])("« %s » : modification, validation ou filtre — chemins existants", (message) => {
    expect(detectIndustrialRequest(message)).toBeNull();
  });
});

describe("Consultation", () => {
  test("« Donne-moi les fiches PROMESH » → agent PROMESH, outil list_por_promesh, les 30 fiches réelles", async () => {
    const h = harness(ADMIN);
    const r = await h.ask("Donne-moi les fiches PROMESH");
    expect(r.intent).toBe("por_promesh");
    expect(r.agent).toBe("por_promesh_agent");
    expect(tools(r)).toEqual(["list_por_promesh"]);
    expect(r.answer).toContain("📋 Fiches PROMESH — 30 résultat(s)");
    expect((r.answer.match(/^Séquence \d+ — /gm) || []).length).toBe(30);
    expect(h.complete).not.toHaveBeenCalled();
  });

  test.each(["donne-moi fiche PROMESH", "donne-moi la fiche de production PROMESH", "Affiche l'historique PROMESH", "donne moi les fiches de production promesh"])("« %s » → module PROMESH, jamais « non géré par l'agent industriel »", async (message) => {
    const h = harness(ADMIN);
    const r = await h.ask(message);
    expect(r.agent).toBe("por_promesh_agent");
    expect(r.answer).toContain("Fiches PROMESH — 30 résultat(s)");
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("« Liste les fiches PROBAR » → agent industriel, outil list_industrial_records filtré sur le module, 18 fiches", async () => {
    const h = harness(ADMIN);
    const r = await h.ask("Liste les fiches PROBAR");
    expect(r.agent).toBe("industrial_agent");
    expect(tools(r)).toEqual(["list_industrial_records"]);
    expect(industrialService.listRecords).toHaveBeenCalledWith(expect.objectContaining({ module: "probar" }), expect.anything());
    expect(r.answer).toContain("📋 Fiches PROBAR — 18 résultat(s)");
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("« Combien de fiches PROMESH existent ? » → 30, calculé par l'outil ; pas une liste", async () => {
    const r = await harness(ADMIN).ask("Combien de fiches PROMESH existent ?");
    expect(tools(r)).toEqual(["list_por_promesh"]);
    expect(r.answer).toContain("Il existe 30 fiches PROMESH dans votre périmètre.");
    expect(r.answer).toContain("• VALIDE : 20");
    expect(r.answer).toContain("• BROUILLON : 10");
    expect(r.answer).not.toMatch(/^Séquence \d+/m);
  });

  test("« Combien de fiches PROBAR ? » → 18", async () => {
    const r = await harness(ADMIN).ask("Combien de fiches PROBAR ?");
    expect(r.agent).toBe("industrial_agent");
    expect(r.answer).toContain("Il existe 18 fiches PROBAR dans votre périmètre.");
  });

  test("« Consulte la fiche PROMESH numéro 112 » → cette fiche ; numéro inexistant → dit tel quel", async () => {
    const h = harness(ADMIN);
    const found = await h.ask("Consulte la fiche PROMESH numéro 112");
    expect(found.answer).toContain("Séquence : 112");
    expect(found.answer).toContain("Statut : VALIDE");
    const missing = await h.ask("Consulte la fiche PROMESH numéro 999");
    expect(missing.answer).toBe("Aucune fiche PROMESH n'a été trouvée avec le numéro de séquence 999.");
  });

  test("« Analyse la production PROMESH » → statistiques calculées sur les 30 fiches lues", async () => {
    const h = harness(ADMIN);
    const r = await h.ask("Analyse la production PROMESH");
    expect(r.agent).toBe("por_promesh_agent");
    expect(r.answer).toContain("📊 ANALYSE DES FICHES PROMESH");
    expect(r.answer).toContain("30 fiches analysées.");
    expect(r.answer).toContain("• VALIDE : 20");
    expect(r.answer).toContain("• matin : 20");
    expect(r.answer).toContain("• non_conforme : 6");
    expect(r.answer).toContain("Production enregistrée : 300 m² sur 30 fiches renseignées.");
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("« Résume les fiches PROBAR » → analyse des 18 fiches", async () => {
    const r = await harness(ADMIN).ask("Résume les fiches PROBAR");
    expect(r.answer).toContain("📊 ANALYSE DES FICHES PROBAR");
    expect(r.answer).toContain("18 fiches analysées.");
    expect(r.answer).toContain("• nok : 3");
    expect(r.answer).toContain("Production enregistrée : 1800 sur 18 fiches renseignées.");
  });

  test("analyse sans module nommé : on demande lequel, rien n'est deviné", async () => {
    const h = harness(ADMIN);
    const r = await h.ask("Compare la production des périodes disponibles");
    expect(r.answer).toContain("De quel module souhaitez-vous l'analyse ?");
    expect(r.toolCalls).toEqual([]);
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("aucune fiche : dit tel quel ; échec de l'outil : pas un zéro", async () => {
    promeshService.listPorPromesh.mockResolvedValue({ data: [], total: 0 });
    const empty = await harness(ADMIN).ask("Combien de fiches PROMESH existent ?");
    expect(empty.answer).toBe("Aucune fiche PROMESH n'est enregistrée dans votre périmètre.");
    promeshService.listPorPromesh.mockRejectedValue(new Error("connection terminated"));
    const failed = await harness(ADMIN).ask("Combien de fiches PROMESH existent ?");
    expect(String(failed.answer)).not.toMatch(/Aucune fiche|Il existe|connection terminated/);
  });
});

describe("Module seul — question courte, jamais une création", () => {
  test.each([
    ["probar", "industrial_agent", "PROBAR"],
    ["PROMESH", "por_promesh_agent", "PROMESH"],
  ])("« %s » → propose les actions possibles ; aucun outil, aucun appel au modèle", async (message, agent, label) => {
    const h = harness(ADMIN);
    const r = await h.ask(message);
    expect(r.agent).toBe(agent);
    expect(r.answer).toContain(`Que souhaitez-vous faire avec les fiches ${label} ?`);
    expect(r.answer).toContain(`« liste des fiches ${label} »`);
    expect(r.answer).toContain(`« crée une fiche ${label} »`);
    expect(r.toolCalls).toEqual([]);
    expect(industrialService.createRecord).not.toHaveBeenCalled();
    expect(promeshService.createOrOpenDraft).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });
});

describe("Création guidée", () => {
  test("« Crée une nouvelle fiche PROBAR » (incomplète) : demande machine et poste, n'appelle pas l'outil", async () => {
    const h = harness(ADMIN);
    const r = await h.say("Crée une nouvelle fiche PROBAR");
    expect(r.agent).toBe("industrial_agent");
    expect(r.answer).toContain("Pour créer une fiche PROBAR, il me manque ces informations :");
    expect(r.answer).toContain("la machine");
    expect(r.answer).toContain("le poste");
    expect(r.answer).toContain("Rien n'est enregistré pour l'instant.");
    expect(r.toolCalls).toEqual([]);
    expect(industrialService.createRecord).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("PROBAR : champs donnés un à un et conservés, récapitulatif, puis création seulement après « confirme »", async () => {
    const h = harness(ADMIN);
    await h.say("Crée une nouvelle fiche PROBAR");
    const afterMachine = await h.say("machine 2");
    expect(afterMachine.agent).toBe("industrial_agent");
    expect(afterMachine.answer).toContain("il me manque cette information :");
    expect(afterMachine.answer).toContain("• Machine : 2");
    expect(afterMachine.answer).not.toContain("la machine (ex.");
    const recap = await h.say("poste nuit");
    expect(recap.answer).toContain("Je suis prêt à créer une fiche PROBAR avec :");
    expect(recap.answer).toContain("• Machine : 2");
    expect(recap.answer).toContain("• Poste : nuit");
    expect(recap.answer).toContain("Répondez « confirme »");
    expect(recap.pendingAction).toMatchObject({ steps: [{ tool: "create_industrial_record", input: { module: "probar", machine: "2", poste: "nuit" } }] });
    expect(industrialService.createRecord).not.toHaveBeenCalled();

    const done = await h.say("confirme");
    expect(industrialService.createRecord).toHaveBeenCalledTimes(1);
    expect(industrialService.createRecord).toHaveBeenCalledWith({ module: "probar", machine: "2", poste: "nuit" }, expect.objectContaining({ id: ADMIN.id }));
    expect(done.answer).toContain("✅ Fiche PROBAR enregistrée.");
    // Une seconde confirmation ne recrée rien.
    await h.say("confirme");
    expect(industrialService.createRecord).toHaveBeenCalledTimes(1);
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("« Je veux saisir une fiche PROMESH » : guidée (jamais la liste), tout en une phrase puis confirmation", async () => {
    const h = harness(ADMIN);
    const ask = await h.say("Je veux saisir une fiche PROMESH");
    expect(ask.agent).toBe("por_promesh_agent");
    expect(ask.answer).toContain("Pour créer une fiche PROMESH, il me manque ces informations :");
    expect(ask.answer).not.toContain("Fiches PROMESH —");
    expect(promeshService.listPorPromesh).not.toHaveBeenCalled();

    const recap = await h.say("machine 1 poste matin");
    expect(recap.agent).toBe("por_promesh_agent");
    expect(recap.answer).toContain("Je suis prêt à créer une fiche PROMESH avec :");
    expect(recap.answer).toContain("le numéro de séquence est attribué automatiquement");
    expect(promeshService.createOrOpenDraft).not.toHaveBeenCalled();

    const done = await h.say("oui");
    expect(promeshService.createOrOpenDraft).toHaveBeenCalledWith(expect.objectContaining({ id: ADMIN.id }), { machine: "1", poste: "matin" });
    expect(done.answer).toContain("✅ Fiche PROMESH enregistrée.");
    expect(done.answer).toContain("Séquence 131 — statut BROUILLON");
  });

  test("demande complète d'emblée : récapitulatif directement, rien d'inventé (ni opérateur, ni séquence)", async () => {
    const r = await harness(ADMIN).say("crée une fiche PROMESH machine 2 poste nuit");
    expect(r.answer).toContain("Je suis prêt à créer une fiche PROMESH avec :");
    expect(r.pendingAction.steps[0].input).toEqual({ machine: "2", poste: "nuit" });
    expect(promeshService.createOrOpenDraft).not.toHaveBeenCalled();
  });

  test("« annule » : rien n'est enregistré, et la création n'est plus en attente", async () => {
    const h = harness(ADMIN);
    await h.say("crée une fiche PROBAR machine 1 poste matin");
    const cancelled = await h.say("annule");
    expect(cancelled.answer).toBe("Création annulée : aucune fiche PROBAR n'a été enregistrée.");
    await h.say("confirme");
    expect(industrialService.createRecord).not.toHaveBeenCalled();
  });

  test("pendant une création, une autre demande suit son cours normal et ne crée rien", async () => {
    const h = harness(ADMIN);
    await h.say("Crée une nouvelle fiche PROBAR");
    const other = await h.say("Combien de fiches PROMESH existent ?");
    expect(other.agent).toBe("por_promesh_agent");
    expect(other.answer).toContain("Il existe 30 fiches PROMESH");
    expect(industrialService.createRecord).not.toHaveBeenCalled();
  });

  test("« Ajouter une fiche de production » : le module n'est pas deviné", async () => {
    const h = harness(ADMIN);
    const r = await h.ask("Ajouter une fiche de production");
    expect(r.answer).toContain("Quel type de fiche souhaitez-vous créer ?");
    expect(r.toolCalls).toEqual([]);
    expect(h.complete).not.toHaveBeenCalled();
  });

  test("fiche PROBAR déjà saisie aujourd'hui pour cette machine et ce poste : signalée avant confirmation", async () => {
    industrialService.listRecords.mockResolvedValue({ data: [{ id: "x", module: "probar", machine: "1", poste: "matin", dateFiche: new Date().toISOString() }], total: 1 });
    const r = await harness(ADMIN).say("crée une fiche PROBAR machine 1 poste matin");
    expect(r.answer).toContain("⚠️ 1 fiche existe déjà aujourd'hui pour cette machine et ce poste.");
  });

  test("échec de l'enregistrement : message compréhensible, cause dans le journal, aucune fiche annoncée", async () => {
    industrialService.createRecord.mockRejectedValue(new Error('null value in column "machine" violates not-null constraint'));
    const h = harness(ADMIN);
    await h.say("crée une fiche PROBAR machine 1 poste matin");
    const r = await h.say("confirme");
    expect(r.answer).toContain("La fiche PROBAR n'a pas pu être enregistrée");
    expect(r.answer).not.toMatch(/✅|violates|not-null/);
    expect(spies.flatMap((s) => s.mock.calls.flat()).map(String).join(" ")).toMatch(/FICHE_CREATION_FAILED/);
  });
});

describe("Permissions", () => {
  test.each(["Donne-moi les fiches PROMESH", "Liste les fiches PROBAR", "Crée une nouvelle fiche PROBAR", "probar"])("commercial — « %s » : refusé, aucun service appelé", async (message) => {
    const r = await harness(COMMERCIAL).ask(message);
    expect(r.mode).toBe("error");
    expect(r.error.code).toBe("PERMISSION_DENIED");
    expect(promeshService.listPorPromesh).not.toHaveBeenCalled();
    expect(industrialService.listRecords).not.toHaveBeenCalled();
    expect(industrialService.createRecord).not.toHaveBeenCalled();
  });

  test("responsable logistique : ne voit et ne compte que SES fiches PROMESH (périmètre du service)", async () => {
    const h = harness(LOGISTIQUE);
    const count = await h.ask("Combien de fiches PROMESH existent ?");
    expect(promeshService.listPorPromesh).toHaveBeenCalledWith(expect.objectContaining({ id: LOGISTIQUE.id, role: "responsable_logistique_achat" }), expect.anything());
    expect(count.answer).toContain("Il existe 4 fiches PROMESH dans votre périmètre.");
    const other = await h.ask("Consulte la fiche PROMESH numéro 120");
    expect(other.answer).toBe("Aucune fiche PROMESH n'a été trouvée avec le numéro de séquence 120.");
  });

  test("une création en attente ne peut pas être confirmée par un autre utilisateur de la même conversation", async () => {
    const store = new PendingActionStore();
    store.propose("conv", { type: "create_industrial_fiche", actingUserId: ADMIN.id, module: "probar", fields: { machine: "1", poste: "matin" }, stage: "confirm" });
    const agent = createIndustrialAgent({ chatModel: {}, tools: [{ name: "create_industrial_record", invoke: jest.fn() }, { name: "list_industrial_records", invoke: jest.fn(async () => JSON.stringify({ data: [], total: 0 })) }], workflowEngine: new LangChainWorkflowEngine(), pendingActionStore: store });
    const r = await agent.execute({ intent: { name: "industrial" }, message: "crée une fiche PROBAR", user: LOGISTIQUE, conversationId: "conv" });
    // L'autre utilisateur repart de zéro : rien n'est repris de la proposition d'ADMIN.
    expect(r.answer).toContain("il me manque ces informations");
  });
});
