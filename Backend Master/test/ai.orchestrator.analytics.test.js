"use strict";

// Analytique CRM de bout en bout (PROBAR ASSISTANT) : VRAI AIManager, VRAI
// AnalyticsAgent, VRAIS Tools statistiques derrière un VRAI McpServer
// (PermissionManager, Joi, périmètre). Simulés : les services SQL (réponses
// fixes, espionnées), le modèle de langage et la chaîne documentaire — qui ne
// doivent JAMAIS être appelés pour une question de données CRM.

jest.mock("../src/modules/projects/services/project.service", () => ({ listProjects: jest.fn() }));
jest.mock("../src/modules/projects/services/projectStatistics.service", () => ({
  getProjectStatistics: jest.fn(),
  GROUP_BY_VALUES: ["engineer", "owner", "status", "client", "product_family", "month"],
}));
jest.mock("../src/modules/commercial-contacts/services/commercialContactStatistics.service", () => ({
  getCommercialContactStatistics: jest.fn(),
  METRICS: ["contacts", "relances", "contacts_without_relance"],
  GROUP_BY_VALUES: ["commercial", "status", "month"],
}));
jest.mock("../src/modules/industrial-records/services/industrialStatistics.service", () => ({
  getIndustrialStatistics: jest.fn(),
  GROUP_BY_VALUES: ["machine", "module", "operator", "month", "status"],
  MODULES: ["probar", "melange", "maintenance"],
}));

const projectStats = require("../src/modules/projects/services/projectStatistics.service");
const contactStats = require("../src/modules/commercial-contacts/services/commercialContactStatistics.service");
const industrialStats = require("../src/modules/industrial-records/services/industrialStatistics.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const { createGetProjectStatisticsTool } = require("../src/ai/mcp/tools/projects/getProjectStatisticsTool");
const { createGetCommercialContactStatisticsTool } = require("../src/ai/mcp/tools/commercialContacts/getCommercialContactStatisticsTool");
const { createGetIndustrialStatisticsTool } = require("../src/ai/mcp/tools/industrial/getIndustrialStatisticsTool");

const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { BaseAgent } = require("../src/ai/agents/baseAgent");
const { createAnalyticsAgent } = require("../src/ai/agents/analyticsAgent");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");
const { SemanticIntentResolver } = require("../src/ai/orchestrator/semanticIntentResolver");
const { AnalyticsQueryParser } = require("../src/ai/analytics/analyticsQueryParser");

const ADMIN = { id: "11111111-1111-4111-8111-111111111111", role: "admin" };
const COMMERCIAL = { id: "22222222-2222-4222-8222-222222222222", role: "commercial" };
const LOGISTIQUE = { id: "44444444-4444-4444-8444-444444444444", role: "responsable_logistique_achat" };

// Répartition réelle observée en base (données du 30/09/2026, archivés inclus).
const ENGINEER_RESULT = {
  groupBy: "engineer",
  scope: "all",
  includeArchived: true,
  filters: {},
  totalProjects: 253,
  withDimension: 200,
  withoutDimension: 53,
  groupCount: 120,
  truncated: true,
  engineersWithoutProjects: 23,
  groups: [
    { key: "e1", label: "Hamza Zahrouni", count: 8 },
    { key: "e2", label: "Mohamed Mejri", count: 7 },
    { key: "e3", label: "D", count: 6 },
    { key: "e4", label: "Sirine ben mahmoud", count: 6 },
  ],
};

function build(user, { timeoutMs } = {}) {
  const registry = new ToolRegistry();
  [createGetProjectStatisticsTool(), createGetCommercialContactStatisticsTool(), createGetIndustrialStatisticsTool()].forEach((t) => registry.register(t));
  const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  const tools = createMcpToolAdapters({ mcpServer: server, actingUser: user });
  const chatModel = { invoke: jest.fn(async () => ({ content: "Ahmed a 42 projets." })) };
  const qaChain = { invoke: jest.fn(async () => ({ answer: "Je ne trouve pas cette information dans la documentation.", citations: [] })) };
  const memory = new InMemoryConversationMemory();
  const workflowEngine = new LangChainWorkflowEngine();
  const parser = new AnalyticsQueryParser();
  const agents = new AgentRegistry();
  agents.register(createAnalyticsAgent({ chatModel, tools, workflowEngine, memory, analyticsParser: parser, ...(timeoutMs ? { analyticsTimeoutMs: timeoutMs } : {}) }));
  // Repli general_chat réel : documentation seule (ce qui produisait la réponse signalée).
  agents.register(new BaseAgent({ name: "assistant_agent", systemPrompt: "doc", intentNames: ["general_chat", "documentation_question"], chatModel, tools: [], allowedToolNames: [], workflowEngine, qaChain }));
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
    analyticsParser: parser,
  });
  return { manager, chatModel, qaChain };
}

const ask = (h, user, message) => h.manager.handleMessage({ message, user, conversationId: "c1" });

beforeEach(() => {
  jest.clearAllMocks();
  projectStats.getProjectStatistics.mockResolvedValue(ENGINEER_RESULT);
});

describe("« Quel est l'ingénieur le plus utilisé dans le CRM ? » — FR / EN / RU", () => {
  test.each([
    ["Quel est l'ingénieur le plus utilisé dans le CRM ?", /L'ingénieur associé au plus grand nombre de projets est :/, /👤 \*\*Hamza Zahrouni\*\* — 8 projets/],
    ["Which engineer is assigned to the most projects?", /The engineer associated with the most projects is:/, /👤 \*\*Hamza Zahrouni\*\* — 8 projects/],
    ["Какой инженер работает с наибольшим количеством проектов?", /Лидер по количеству:/, /👤 \*\*Hamza Zahrouni\*\* — 8 проектов/],
  ])("« %s » : même Tool, même entrée, chiffres du Tool, réponse dans la langue", async (message, heading, leader) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);

    expect(r).toMatchObject({ intent: "crm_analytics", agent: "analytics_agent", mode: "agent" });
    expect(projectStats.getProjectStatistics).toHaveBeenCalledTimes(1);
    expect(projectStats.getProjectStatistics).toHaveBeenCalledWith({ groupBy: "engineer", order: "desc", limit: 10, includeArchived: true }, { ownerId: null });
    expect(r.answer).toMatch(heading);
    expect(r.answer).toMatch(leader);
    expect(r.answer).toContain("| Hamza Zahrouni | 8 |");
    expect(r.answer).toMatch(/📁 (Total|Всего) ?: 253/);
    expect(r.toolCalls).toEqual([{ tool: "get_project_statistics", input: expect.any(Object), output: ENGINEER_RESULT }]);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
    expect(h.qaChain.invoke).not.toHaveBeenCalled();
  });

  test("la réponse n'est plus « je ne trouve pas cette information dans la documentation »", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Quel est l'ingénieur le plus utilisé dans le CRM ?");
    expect(r.answer).not.toMatch(/documentation/);
  });
});

describe("Égalités, classement, répartition", () => {
  test("égalité en tête : les ex æquo sont annoncés, aucun gagnant arbitraire ; « D » affiché tel quel", async () => {
    projectStats.getProjectStatistics.mockResolvedValue({ ...ENGINEER_RESULT, groups: ENGINEER_RESULT.groups.slice(2) });
    const r = await ask(build(ADMIN), ADMIN, "Quel ingénieur a le plus de projets ?");
    expect(r.answer).toMatch(/Plusieurs ingénieurs sont à égalité avec le plus grand nombre de projets \(6\)/);
    expect(r.answer).toMatch(/👤 \*\*D\*\* — 6 projets/);
    expect(r.answer).toMatch(/👤 \*\*Sirine ben mahmoud\*\* — 6 projets/);
  });

  test.each([
    ["Donne-moi le classement des ingénieurs.", { groupBy: "engineer", order: "desc", limit: 5 }, /Top 4 des ingénieurs/],
    ["Top 5 engineers by number of projects.", { groupBy: "engineer", order: "desc", limit: 5 }, /Top 4 engineers/],
    ["Покажи инженеров с наибольшим количеством проектов.", { groupBy: "engineer", order: "desc", limit: 5 }, /Топ-4/],
    ["Combien de projets possède chaque ingénieur ?", { groupBy: "engineer", order: "desc", limit: 20 }, /Répartition :/],
  ])("« %s »", async (message, input, text) => {
    const r = await ask(build(ADMIN), ADMIN, message);
    expect(projectStats.getProjectStatistics.mock.calls[0][0]).toMatchObject(input);
    expect(r.answer).toMatch(text);
  });

  test("« Quel ingénieur possède le plus de projets PROBAR ? » : filtre transmis au Tool", async () => {
    await ask(build(ADMIN), ADMIN, "Quel ingénieur possède le plus de projets PROBAR ?");
    expect(projectStats.getProjectStatistics.mock.calls[0][0]).toMatchObject({ groupBy: "engineer", productFamily: "PROBAR" });
  });

  test("« le moins » : tri ascendant et précision « parmi ceux ayant au moins un projet »", async () => {
    projectStats.getProjectStatistics.mockResolvedValue({ ...ENGINEER_RESULT, groups: [{ key: "x", label: "Ali", count: 1 }, { key: "y", label: "Sami", count: 2 }] });
    const r = await ask(build(ADMIN), ADMIN, "Quel ingénieur a le moins de projets ?");
    expect(projectStats.getProjectStatistics.mock.calls[0][0].order).toBe("asc");
    expect(r.answer).toMatch(/L'ingénieur associé au plus petit nombre de projets est :/);
    expect(r.answer).toMatch(/Parmi les ingénieurs ayant au moins un projet/);
  });

  test("projets sans ingénieur et ingénieurs sans projet rapportés (cartes KPI)", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Quel ingénieur a le plus de projets ?");
    expect(r.answer).toMatch(/❔ Sans ingénieur : 53/);
    expect(r.answer).toMatch(/👷 Ingénieurs sans projet : 23/);
  });

  test("données volumineuses : liste tronquée annoncée (… et N autres)", async () => {
    const groups = Array.from({ length: 20 }, (_, i) => ({ key: `e${i}`, label: `Ing ${i}`, count: 50 - i }));
    projectStats.getProjectStatistics.mockResolvedValue({ ...ENGINEER_RESULT, groupCount: 120, groups, truncated: true });
    const r = await ask(build(ADMIN), ADMIN, "Combien de projets possède chaque ingénieur ?");
    expect(r.answer).toMatch(/… et 100 autre\(s\) ingénieurs/);
  });
});

describe("Aucun résultat", () => {
  test("message exact demandé, aucun chiffre inventé", async () => {
    projectStats.getProjectStatistics.mockResolvedValue({ ...ENGINEER_RESULT, totalProjects: 0, withDimension: 0, withoutDimension: 0, groupCount: 0, truncated: false, groups: [] });
    const r = await ask(build(ADMIN), ADMIN, "Quel est l'ingénieur le plus utilisé dans le CRM ?");
    expect(r.answer).toMatch(/Je n'ai trouvé aucun projet associé à un ingénieur dans les données actuellement accessibles\./);
  });
});

describe("RBAC — le serveur décide", () => {
  test("commercial : la même question porte sur SES projets, et la réponse le dit", async () => {
    projectStats.getProjectStatistics.mockResolvedValue({ ...ENGINEER_RESULT, scope: "mine" });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "Quels ingénieurs travaillent sur mes projets ?");
    expect(projectStats.getProjectStatistics.mock.calls[0][1]).toEqual({ ownerId: COMMERCIAL.id });
    expect(r.answer).toMatch(/Périmètre : vos données uniquement/);
  });

  test("rôle non autorisé (contacts pour un commercial terrain) : refus du serveur, aucun chiffre", async () => {
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "Quel commercial a le plus de contacts ?");
    expect(contactStats.getCommercialContactStatistics).not.toHaveBeenCalled();
    expect(r.answer).toMatch(/Votre rôle ne permet pas de consulter ces statistiques/);
  });

  test("responsable logistique : fiches industrielles limitées aux siennes", async () => {
    industrialStats.getIndustrialStatistics.mockResolvedValue({ groupBy: "machine", scope: "mine", filters: {}, totalRecords: 5, withDimension: 5, withoutDimension: 0, groupCount: 1, truncated: false, groups: [{ key: "m", label: "PROBAR-01", count: 5, quantity: 100 }] });
    const r = await ask(build(LOGISTIQUE), LOGISTIQUE, "Quelle machine a produit le plus de fiches ?");
    expect(industrialStats.getIndustrialStatistics.mock.calls[0][1]).toEqual({ createdBy: LOGISTIQUE.id });
    expect(r.answer).toMatch(/La machine associée au plus grand nombre de fiches est :/);
    expect(r.answer).toMatch(/⚙️ \*\*PROBAR-01\*\* — 5 fiches/);
  });
});

describe("Erreurs", () => {
  test("erreur PostgreSQL : message honnête, aucun chiffre", async () => {
    projectStats.getProjectStatistics.mockRejectedValue(new Error('column "engineerId" does not exist'));
    const r = await ask(build(ADMIN), ADMIN, "Quel est l'ingénieur le plus utilisé dans le CRM ?");
    expect(r.answer).toMatch(/n'ont pas pu être récupérées/);
    expect(r.answer).not.toMatch(/\d+ projets/);
  });

  test("Tool trop lent : délai dépassé annoncé", async () => {
    projectStats.getProjectStatistics.mockImplementation(() => new Promise(() => {}));
    const r = await ask(build(ADMIN, { timeoutMs: 30 }), ADMIN, "Which engineer is assigned to the most projects?");
    expect(r.answer).toMatch(/could not be computed in time/);
  });

  test("résultat non conforme (chiffre non entier) : rejeté, jamais affiché", async () => {
    projectStats.getProjectStatistics.mockResolvedValue({ ...ENGINEER_RESULT, groups: [{ key: "e", label: "X", count: "beaucoup" }] });
    const r = await ask(build(ADMIN), ADMIN, "Quel ingénieur a le plus de projets ?");
    expect(r.answer).toMatch(/n'ont pas pu être récupérées/);
    expect(r.answer).not.toContain("beaucoup");
  });
});

describe("Autres analyses et frontière documentation", () => {
  test("« Combien de relances ont été faites ce mois-ci ? » : nombre réel de relances sur la période", async () => {
    contactStats.getCommercialContactStatistics.mockResolvedValue({ metric: "relances", groupBy: null, scope: "all", filters: {}, total: 12, groups: [], groupCount: 0, truncated: false });
    const r = await ask(build(ADMIN), ADMIN, "Combien de relances ont été faites ce mois-ci ?");
    expect(contactStats.getCommercialContactStatistics.mock.calls[0][0]).toMatchObject({ metric: "relances", from: expect.any(Date) });
    expect(r.answer).toMatch(/Nombre de relances : \*\*12\*\*/);
    expect(r.answer).toMatch(/ce mois-ci/);
  });

  test("« Comment créer un projet ? » reste une question documentaire", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Comment créer un projet ?");
    expect(r.intent).toBe("documentation_question");
    expect(projectStats.getProjectStatistics).not.toHaveBeenCalled();
  });

  test.each([
    ["Combien de devis avons-nous ?", /Je ne suis pas certain|Je veux m'assurer de bien comprendre/],
    ["How many invoices do we have?", /I want to make sure I understand your request/],
    ["Сколько у нас сделок?", /Хочу убедиться, что правильно понял запрос/],
  ])("question de données non couverte « %s » : clarification, jamais la documentation", async (message, text) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(r.mode).toBe("clarification");
    expect(r.answer).toMatch(text);
    expect(h.qaChain.invoke).not.toHaveBeenCalled();
  });
});
