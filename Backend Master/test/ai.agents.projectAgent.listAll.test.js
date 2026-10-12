"use strict";

// Copilot — liste / nombre / analyse de l'ENSEMBLE des projets, de bout en
// bout : VRAI AIManager, VRAI QueryRouter, VRAI ProjectAgent, VRAI Tool
// list_projects derrière un VRAI McpServer (donc la vraie règle de périmètre
// scopeInputForActingUser). Simulés : le service SQL listProjects (même
// pagination que le vrai : `limit` défaut 20 / plafond 100, `page`) et le
// modèle de langage, qui ne doit JAMAIS être sollicité sur ce chemin.

jest.mock("../src/modules/projects/services/project.service", () => ({ listProjects: jest.fn() }));

const projectService = require("../src/modules/projects/services/project.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const { createListProjectsTool } = require("../src/ai/mcp/tools/projects/listProjectsTool");

const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { BaseAgent } = require("../src/ai/agents/baseAgent");
const { createProjectAgent } = require("../src/ai/agents/projectAgent");
const { createAnalyticsAgent } = require("../src/ai/agents/analyticsAgent");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");
const { SemanticIntentResolver } = require("../src/ai/orchestrator/semanticIntentResolver");
const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");
const { AnalyticsQueryParser } = require("../src/ai/analytics/analyticsQueryParser");
const { QueryRouter } = require("../src/ai/routing/queryRouter");
const { detectProjectListRequest } = require("../src/ai/reasoning/projectListRequest");
const { analyzeProjects } = require("../src/ai/reasoning/projectListAnswerBuilder");

const ADMIN = { id: "11111111-1111-4111-8111-111111111111", role: "admin", email: "admin@cbi.tn" };
const COMMERCIAL = { id: "22222222-2222-4222-8222-222222222222", role: "commercial", email: "com@cbi.tn" };
const OTHER = "99999999-9999-4999-8999-999999999999";
const STAGES = ["Prospect", "Devis envoyé", "Négociation"];
const DAY = 86400000;

// Base simulée : `n` projets actifs, dont 1 sur 4 appartient au commercial.
function makeProjects(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    nomProjet: `Projet ${String(i + 1).padStart(3, "0")}`,
    statut: i % 2 ? "Négociation" : "Identification",
    priority: "high",
    priorityLabel: "Élevé",
    ownerId: i % 4 === 0 ? COMMERCIAL.id : OTHER,
    owner: { id: i % 4 === 0 ? COMMERCIAL.id : OTHER, name: i % 4 === 0 ? "Sami Commercial" : "Autre Commercial" },
    stage: { name: STAGES[i % STAGES.length] },
    ingenieurResponsable: i === 0 ? "Zakariah Derbel" : null,
    architecte: i === 0 ? "Atelier Lac" : null,
    actionsCount: 3,
    currentAction: "Appel",
    lastRelanceAt: null,
    // Projet 1 : relance dépassée ; projet 2 : dans 3 jours ; les autres : aucune.
    nextRelanceDate: i === 0 ? new Date(Date.now() - 5 * DAY).toISOString() : i === 1 ? new Date(Date.now() + 3 * DAY).toISOString() : null,
    isArchived: false,
  }));
}

// Même contrat que project.service.listProjects() (pagination et périmètre).
function serveProjects(all, { archived = 0, failOnPage = null, error = null, dropOnPage = null } = {}) {
  projectService.listProjects.mockImplementation(async (query, userId) => {
    const limit = Math.min(parseInt(query.limit) || 20, 100);
    const page = Math.max(parseInt(query.page) || 1, 1);
    if (failOnPage === page) throw error || new Error("connection terminated unexpectedly");
    const scoped = query.mine ? all.filter((p) => p.ownerId === userId) : all;
    let data = scoped.slice((page - 1) * limit, page * limit);
    if (dropOnPage === page) data = data.slice(0, -3);
    return { data, total: scoped.length, stats: { total: scoped.length + archived, active: scoped.length, archived }, page, pages: Math.ceil(scoped.length / limit), limit };
  });
}

function harness(user) {
  const registry = new ToolRegistry();
  registry.register(createListProjectsTool());
  const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  const tools = createMcpToolAdapters({ mcpServer: server, actingUser: user });
  // Le modèle de langage ne doit jamais être appelé : tout appel est compté.
  const chatModel = { invoke: jest.fn(async () => ({ content: JSON.stringify({ action: "final_answer", answer: "RÉPONSE DU MODÈLE" }) })) };
  const memory = new InMemoryConversationMemory();
  const workflowEngine = new LangChainWorkflowEngine();
  const parser = new AnalyticsQueryParser();
  const agents = new AgentRegistry();
  agents.register(createProjectAgent({ chatModel, tools, workflowEngine, memory }));
  agents.register(createAnalyticsAgent({ chatModel, tools, workflowEngine, memory, analyticsParser: parser }));
  agents.register(new BaseAgent({ name: "assistant_agent", systemPrompt: "doc", intentNames: ["general_chat", "documentation_question"], chatModel, tools: [], allowedToolNames: [], workflowEngine, memory }));
  const manager = new AIManager({
    conversationManager: new ConversationManager({ memory }),
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry: agents }),
    toolRouter: { select: () => [] },
    workflowManager: { run: async () => ({ mode: "qa", answer: "réponse générale", citations: [], toolSteps: [] }) },
    responseBuilder: new ResponseBuilder(),
    entityExtractor: extractEntities,
    contextManager: new ContextManager(),
    semanticResolver: new SemanticIntentResolver({ logger: { info() {}, warn() {} } }),
    contextResolver: new ConversationContextResolver({ catalog: DEFAULT_INTENT_CATALOG }),
    analyticsParser: parser,
    queryRouter: new QueryRouter(),
  });
  const ask = (message) => manager.handleMessage({ message, user, conversationId: "c1" });
  return { ask, chatModel };
}

const stepOf = (r) => r.toolCalls.find((c) => c.tool === "list_projects");
const namesIn = (answer) => [...new Set(String(answer).match(/Projet \d{3}/g) || [])];
const pagesAsked = () => projectService.listProjects.mock.calls.map(([q]) => q.page);

let consoleError;
beforeEach(() => {
  jest.clearAllMocks();
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("Reconnaissance de la demande (sans modèle de langage)", () => {
  test.each([
    ["donne-moi tous les projets", "list", false, "fr"],
    ["Liste complète des projets", "list", false, "fr"],
    ["mes projets", "list", true, "fr"],
    ["analyse mes projets", "analysis", true, "fr"],
    ["Combien de projets ?", "count", false, "fr"],
    ["Combien y a-t-il de projets au total ?", "count", false, "fr"],
    ["Combien de projets ai-je ?", "count", true, "fr"],
    ["list all projects", "list", false, "en"],
    ["show me my projects", "list", true, "en"],
    ["Analyze my projects", "analysis", true, "en"],
    ["How many projects do I have?", "count", true, "en"],
    ["Покажи все проекты", "list", false, "ru"],
    ["мои проекты", "list", true, "ru"],
    ["Проанализируй мои проекты", "analysis", true, "ru"],
    ["Сколько проектов?", "count", false, "ru"],
  ])("« %s » → %s", (message, kind, mine, language) => {
    expect(detectProjectListRequest(message)).toEqual({ kind, mine, language });
  });

  // Recherche, détail, filtre, autre entité : les chemins existants restent en place.
  test.each([
    "projets en retard",
    "Quels projets sont critiques ?",
    "Liste les projets en Négociation",
    "les projets de Hadil",
    "Combien de projets a Hadil ?",
    "Décris le projet Sfax",
    "Analyse du projet Sfax",
    "Déplace le projet Sousse vers l'étape suivante",
    "liste des sociétés",
    "Combien de contacts ?",
  ])("« %s » n'est pas prise par ce chemin", (message) => {
    expect(detectProjectListRequest(message)).toBeNull();
  });
});

describe("« donne-moi tous les projets » — administrateur", () => {
  test("une seule page : tous les projets sont listés, avec leurs champs", async () => {
    serveProjects(makeProjects(7));
    const h = harness(ADMIN);
    const r = await h.ask("donne-moi tous les projets");

    expect(r.intent).toBe("projects");
    expect(r.agent).toBe("project_agent");
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
    expect(pagesAsked()).toEqual([1]);
    expect(stepOf(r).input).toEqual({ isArchived: false, limit: 100 });
    expect(stepOf(r).output).toMatchObject({ total: 7, fetched: 7, complete: true, page: 1, hasMore: false });
    expect(namesIn(r.answer)).toHaveLength(7);
    expect(r.answer).toContain("7 projets — tous les projets non archivés.");
    expect(r.answer).toContain("Fin de la liste.");
    // Champs du premier projet, tels que renvoyés par le Tool.
    expect(r.answer).toContain("Identifiant : 00000000-0000-4000-8000-000000000001");
    expect(r.answer).toContain("Étape : Prospect · Statut : Identification · Priorité : Élevé");
    expect(r.answer).toContain("Commercial : Sami Commercial · Ingénieur : Zakariah Derbel · Architecte : Atelier Lac");
    expect(r.answer).toContain("Suivi : 3 actions (dernière action : Appel)");
    // Champ absent : non affiché, jamais inventé (le projet 2 n'a ni ingénieur ni architecte).
    expect(r.answer).toContain("   Commercial : Autre Commercial\n");
    expect(r.answer).toContain("Prochaine relance : aucune planifiée");
  });

  test("plusieurs pages : 253 projets lus en 3 pages, total exact, puis « suite » jusqu'au dernier", async () => {
    serveProjects(makeProjects(253), { archived: 12 });
    const h = harness(ADMIN);
    const first = await h.ask("donne-moi tous les projets");

    expect(pagesAsked()).toEqual([1, 2, 3]);
    expect(stepOf(first).output).toMatchObject({ total: 253, fetched: 253, pagesRead: 3, complete: true, page: 1, pageSize: 20, shown: 20, hasMore: true });
    expect(first.answer).toContain("253 projets — tous les projets non archivés.");
    expect(first.answer).toContain("Projets 1 à 20 sur 253.");
    expect(first.answer).toContain("12 projets archivés non inclus.");
    expect(first.answer).toContain("Il reste 233 projets. Écrivez « suite » pour afficher les suivants.");
    expect(first.answer).not.toContain("Récupération incomplète");

    const seen = new Set(namesIn(first.answer));
    let last = first;
    for (let i = 0; i < 12; i += 1) {
      last = await h.ask("suite");
      expect(last.agent).toBe("project_agent");
      namesIn(last.answer).forEach((n) => seen.add(n));
    }
    expect(last.answer).toContain("Projets 241 à 253 sur 253.");
    expect(last.answer).toContain("Fin de la liste.");
    // Chaque projet a été affiché une fois, aucun n'a été oublié.
    expect(seen.size).toBe(253);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("aucun projet : réponse explicite, pas une liste vide présentée comme un résultat", async () => {
    serveProjects([]);
    const r = await harness(ADMIN).ask("donne-moi tous les projets");
    expect(r.answer).toContain("Aucun projet trouvé pour tous les projets non archivés.");
    expect(stepOf(r).output).toMatchObject({ total: 0, fetched: 0, complete: true });
  });

  test("« mes projets » d'un administrateur sans projet : indique comment voir l'ensemble", async () => {
    serveProjects(makeProjects(8));
    const r = await harness(ADMIN).ask("mes projets");
    expect(stepOf(r).input).toEqual({ isArchived: false, limit: 100, mine: true });
    expect(r.answer).toContain("Aucun projet trouvé pour vos projets non archivés.");
    expect(r.answer).toContain("demandez « tous les projets »");
  });
});

describe("Erreurs — jamais un échec présenté comme une liste", () => {
  test("erreur PostgreSQL dès la première page : message explicite, aucun projet, erreur journalisée", async () => {
    serveProjects(makeProjects(30), { failOnPage: 1, error: Object.assign(new Error('relation "projects" does not exist'), { name: "SequelizeDatabaseError" }) });
    const h = harness(ADMIN);
    const r = await h.ask("donne-moi tous les projets");

    expect(r.answer).toContain("Je n'ai pas pu récupérer les projets");
    expect(namesIn(r.answer)).toHaveLength(0);
    // Le détail technique reste dans le journal, pas dans la réponse.
    expect(r.answer).not.toMatch(/relation|Sequelize|does not exist/);
    expect(stepOf(r).output).toEqual({ error: "PROJECT_LIST_FAILED" });
    expect(consoleError.mock.calls.flat().join(" ")).toContain("PROJECT_LIST_FAILED");
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("échec en cours de lecture (page 2 sur 3) : aucune liste partielle", async () => {
    serveProjects(makeProjects(253), { failOnPage: 2 });
    const r = await harness(ADMIN).ask("donne-moi tous les projets");
    expect(pagesAsked()).toEqual([1, 2]);
    expect(r.answer).toContain("Je n'ai pas pu récupérer les projets");
    expect(namesIn(r.answer)).toHaveLength(0);
  });

  test("résultat inattendu du Tool : traité comme un échec", async () => {
    projectService.listProjects.mockResolvedValue({ rows: [] });
    const r = await harness(ADMIN).ask("analyse mes projets");
    expect(r.answer).toContain("Je n'ai pas pu récupérer les projets");
  });

  test("moins de projets lus que le total annoncé : la réponse dit qu'elle est incomplète", async () => {
    serveProjects(makeProjects(253), { dropOnPage: 3 });
    const r = await harness(ADMIN).ask("donne-moi tous les projets");
    expect(stepOf(r).output).toMatchObject({ total: 253, fetched: 250, complete: false });
    expect(r.answer).toContain("⚠️ Récupération incomplète : 250 projets lus sur 253. Cette liste n'est pas exhaustive.");
  });
});

describe("Périmètre par rôle — inchangé", () => {
  test("commercial : « tous les projets » ne renvoie que les siens, et la réponse le dit", async () => {
    serveProjects(makeProjects(40));
    const h = harness(COMMERCIAL);
    const r = await h.ask("donne-moi tous les projets");

    for (const [query, userId] of projectService.listProjects.mock.calls) {
      expect(query.mine).toBe(true);
      expect(userId).toBe(COMMERCIAL.id);
    }
    expect(stepOf(r).output).toMatchObject({ total: 10, fetched: 10, complete: true, scope: "restricted" });
    expect(r.answer).toContain("10 projets — vos projets non archivés (votre périmètre d'accès).");
    expect(r.answer).not.toContain("Autre Commercial");
    // Identifiant technique : réservé aux rôles administrateurs.
    expect(r.answer).not.toContain("Identifiant");
    expect(r.answer).not.toContain("00000000-0000-4000-8000");
  });

  test("commercial : « mes projets » et « combien de projets » donnent le même nombre", async () => {
    serveProjects(makeProjects(40), { archived: 2 });
    const h = harness(COMMERCIAL);
    const list = await h.ask("mes projets");
    const count = await h.ask("Combien de projets ai-je ?");
    expect(list.answer).toContain("10 projets — vos projets non archivés.");
    expect(count.answer).toContain("Il y a 10 projets — vos projets non archivés.");
    expect(count.answer).toContain("Total en base dans ce périmètre : 12 (10 actifs, 2 archivés).");
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("administrateur : liste, nombre et analyse portent sur le même ensemble", async () => {
    serveProjects(makeProjects(253));
    const h = harness(ADMIN);
    const list = await h.ask("donne-moi tous les projets");
    const count = await h.ask("Combien de projets ?");
    const analysis = await h.ask("Fais une analyse de tous les projets");
    expect(stepOf(list).output.total).toBe(253);
    expect(count.answer).toContain("Il y a 253 projets — tous les projets non archivés.");
    expect(analysis.answer).toContain("Analyse de 253 projets — tous les projets non archivés.");
  });
});

describe("« analyse mes projets » — calculée sur les projets réellement lus", () => {
  test("répartition par étape et par statut, relances, champs manquants", async () => {
    const all = makeProjects(40);
    all[4].stage = null;
    serveProjects(all);
    const h = harness(COMMERCIAL);
    const r = await h.ask("analyse mes projets");

    expect(r.agent).toBe("project_agent");
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
    expect(r.answer).toContain("📊 ANALYSE DES PROJETS");
    expect(r.answer).toContain("Analyse de 10 projets — vos projets non archivés.");
    const mine = all.filter((p) => p.ownerId === COMMERCIAL.id);
    const expected = analyzeProjects(mine);
    for (const [stage, n] of expected.byStage) expect(r.answer).toContain(`• ${stage || "sans étape"} : ${n}`);
    expect(r.answer).toContain("• Identification : 10");
    expect(r.answer).toContain("• en retard (date dépassée) : 1");
    expect(r.answer).toContain("• sans relance planifiée : 9");
    expect(r.answer).toContain("Relances en retard :\n• Projet 001");
    expect(r.answer).toContain("• sans étape : 1");
    // La somme des étapes est le nombre de projets analysés.
    expect(expected.byStage.reduce((s, [, n]) => s + n, 0)).toBe(10);
  });

  test("lecture incomplète : l'analyse le signale", async () => {
    serveProjects(makeProjects(253), { dropOnPage: 2 });
    const r = await harness(ADMIN).ask("Fais une analyse de tous les projets");
    expect(r.answer).toContain("Analyse de 250 projets");
    expect(r.answer).toContain("⚠️ Récupération incomplète : 250 projets lus sur 253.");
  });
});

describe("Trois langues", () => {
  test.each([
    ["list all projects", "25 projects — all non-archived projects.", "5 more projects. Type \"next\" to see the following ones.", "next", "Projects 21 to 25 of 25."],
    ["Покажи все проекты", "Проектов: 25 — все неархивные проекты.", "Осталось проектов: 5.", "дальше", "Проекты с 21 по 25 из 25."],
    ["donne-moi tous les projets", "25 projets — tous les projets non archivés.", "Il reste 5 projets.", "suite", "Projets 21 à 25 sur 25."],
  ])("« %s » : liste complète puis page suivante, dans la langue de la demande", async (message, header, more, next, range) => {
    serveProjects(makeProjects(25));
    const h = harness(ADMIN);
    const first = await h.ask(message);
    expect(first.agent).toBe("project_agent");
    expect(first.answer).toContain(header);
    expect(first.answer).toContain(more);
    const second = await h.ask(next);
    expect(second.agent).toBe("project_agent");
    expect(second.answer).toContain(range);
    expect(namesIn(first.answer).concat(namesIn(second.answer))).toHaveLength(25);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test.each([
    ["Analyze my projects", "📊 PROJECT ANALYSIS", "Analysis of 10 projects — your non-archived projects."],
    ["Проанализируй мои проекты", "📊 АНАЛИЗ ПРОЕКТОВ", "Проанализировано проектов: 10 — ваши неархивные проекты."],
    ["analyse mes projets", "📊 ANALYSE DES PROJETS", "Analyse de 10 projets — vos projets non archivés."],
  ])("« %s » : analyse dans la langue de la demande", async (message, title, line) => {
    serveProjects(makeProjects(40));
    const h = harness(COMMERCIAL);
    const r = await h.ask(message);
    expect(r.agent).toBe("project_agent");
    expect(r.answer).toContain(title);
    expect(r.answer).toContain(line);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("« mes projets » garde le périmètre « mes » sur la page suivante", async () => {
    const all = makeProjects(120).map((p) => ({ ...p, ownerId: ADMIN.id }));
    all.push(...makeProjects(5).map((p) => ({ ...p, id: p.id.replace("4000", "4001"), nomProjet: `Autre ${p.nomProjet}`, ownerId: OTHER })));
    serveProjects(all);
    const h = harness(ADMIN);
    const first = await h.ask("mes projets");
    expect(first.answer).toContain("120 projets — vos projets non archivés.");
    const second = await h.ask("suite");
    expect(second.answer).toContain("Projets 21 à 40 sur 120.");
    for (const [query] of projectService.listProjects.mock.calls) expect(query.mine).toBe(true);
  });
});
