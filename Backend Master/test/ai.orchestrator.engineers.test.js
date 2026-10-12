"use strict";

// Ingénieurs du CRM (PROBAR ASSISTANT) — « Donne-moi la liste des ingénieurs
// qui existent dans le CRM » de bout en bout : VRAI AIManager, VRAI détecteur
// + résolveur sémantique, VRAI AnalyticsAgent, VRAI Tool list_engineers
// derrière un VRAI McpServer. Simulé : le service SQL (espionné), le modèle
// de langage et la documentation — jamais sollicités ici.

jest.mock("../src/modules/projects/services/project.service", () => ({ listProjects: jest.fn() }));
jest.mock("../src/modules/projects/services/engineerDirectory.service", () => ({
  listEngineers: jest.fn(),
  findProjectEngineers: jest.fn(),
  DEFAULT_LIMIT: 200,
  MAX_LIMIT: 1000,
}));
jest.mock("../src/modules/projects/services/projectStatistics.service", () => ({
  getProjectStatistics: jest.fn(),
  GROUP_BY_VALUES: ["engineer", "owner", "status", "client", "product_family", "month"],
}));

const engineerDirectory = require("../src/modules/projects/services/engineerDirectory.service");
const projectStats = require("../src/modules/projects/services/projectStatistics.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const { createListEngineersTool } = require("../src/ai/mcp/tools/projects/listEngineersTool");
const { createGetProjectStatisticsTool } = require("../src/ai/mcp/tools/projects/getProjectStatisticsTool");

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

const ADMIN = { id: "11111111-1111-4111-8111-111111111111", role: "admin", email: "admin@cbi.tn" };
const COMMERCIAL = { id: "22222222-2222-4222-8222-222222222222", role: "commercial", email: "com@cbi.tn" };

const ENGINEERS = {
  items: [
    { id: "e1", name: "Amine Trimech" },
    { id: "e2", name: "D" },
    { id: "e3", name: "Hamza Zahrouni" },
  ],
  total: 3,
  truncated: false,
};

const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");

function build(user, { timeoutMs, withContextResolver = false } = {}) {
  const registry = new ToolRegistry();
  [createListEngineersTool(), createGetProjectStatisticsTool()].forEach((t) => registry.register(t));
  const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  const tools = createMcpToolAdapters({ mcpServer: server, actingUser: user });
  const chatModel = { invoke: jest.fn(async () => ({ content: "Ahmed, Mohamed." })) };
  const qaChain = { invoke: jest.fn(async () => ({ answer: "Je ne trouve pas cette information dans la documentation.", citations: [] })) };
  const memory = new InMemoryConversationMemory();
  const workflowEngine = new LangChainWorkflowEngine();
  const parser = new AnalyticsQueryParser();
  const agents = new AgentRegistry();
  agents.register(createAnalyticsAgent({ chatModel, tools, workflowEngine, memory, analyticsParser: parser, ...(timeoutMs ? { analyticsTimeoutMs: timeoutMs } : {}) }));
  agents.register(new BaseAgent({ name: "assistant_agent", systemPrompt: "doc", intentNames: ["general_chat", "documentation_question", "capability_audit"], chatModel, tools: [], allowedToolNames: [], workflowEngine, qaChain }));
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
    ...(withContextResolver ? { contextResolver: new ConversationContextResolver({ catalog: DEFAULT_INTENT_CATALOG }) } : {}),
  });
  return { manager, chatModel, qaChain };
}

const ask = (h, user, message) => h.manager.handleMessage({ message, user, conversationId: "c1" });

beforeEach(() => {
  jest.clearAllMocks();
  engineerDirectory.listEngineers.mockResolvedValue(ENGINEERS);
});

describe("La requête signalée : exécutée contre les données CRM", () => {
  test.each(["DONNE MOI LA LISTE DES INGENIEURS QUI EXISTE DANS LE CRM", "donne moi la liste des ingenieurs qui existe dans le crm", "Donne-moi la liste des ingénieurs qui existent dans le CRM", "donner moi les ingénieurs disponible dans crm"])(
    "« %s » → engineers / list / list_engineers, noms du Tool, jamais la clarification projets/maintenance/RH",
    async (message) => {
      const h = build(COMMERCIAL);
      const r = await ask(h, COMMERCIAL, message);
      expect(r).toMatchObject({ intent: "engineers", agent: "analytics_agent", mode: "agent" });
      expect(engineerDirectory.listEngineers).toHaveBeenCalledTimes(1);
      expect(r.toolCalls).toEqual([{ tool: "list_engineers", input: { operation: "list", limit: 20, offset: 0 }, output: { operation: "list", ...ENGINEERS } }]);
      expect(r.answer).toMatch(/J'ai trouvé \*\*3\*\* ingénieurs référencés dans le CRM/);
      for (const e of ENGINEERS.items) expect(r.answer).toContain(`| ${e.name} |`);
      expect(r.answer).toMatch(/Total : 3 ingénieurs\./);
      expect(r.answer).not.toMatch(/Voir mes demandes de maintenance|Voir mes demandes RH/);
      expect(h.chatModel.invoke).not.toHaveBeenCalled();
      expect(h.qaChain.invoke).not.toHaveBeenCalled();
    }
  );
});

describe("FR / EN / RU — même intention, même Tool, réponse dans la langue", () => {
  test.each([
    ["Donne-moi les ingénieurs.", /Ingénieurs du CRM/],
    ["Quels sont les ingénieurs du CRM ?", /Ingénieurs du CRM/],
    ["Quels ingénieurs existent dans le CRM ?", /Ingénieurs du CRM/],
    ["Montre-moi les ingénieurs.", /Ingénieurs du CRM/],
    ["Montre-moi les ingénieurs disponibles.", /ne comporte pas de statut de disponibilité/],
    ["Liste les ingénieurs.", /Ingénieurs du CRM/],
    ["Qui sont les ingénieurs ?", /Ingénieurs du CRM/],
    ["Show me the engineers.", /CRM engineers/],
    ["List the engineers in the CRM.", /I found \*\*3\*\* engineers registered in the CRM/],
    ["Which engineers exist in the CRM?", /CRM engineers/],
    ["Which engineers are available?", /no availability status/],
    ["Покажи инженеров.", /Инженеры CRM/],
    ["Какие инженеры есть в CRM?", /В CRM найдено инженеров: \*\*3\*\*/],
    ["Покажи список инженеров.", /Всего инженеров: 3/],
  ])("« %s »", async (message, text) => {
    const r = await ask(build(ADMIN), ADMIN, message);
    expect(r).toMatchObject({ intent: "engineers", agent: "analytics_agent" });
    expect(engineerDirectory.listEngineers).toHaveBeenCalledWith({ operation: "list", limit: 20, offset: 0 });
    expect(r.answer).toMatch(text);
  });
});

describe("Liste ≠ analytique ≠ projet précis ≠ « mes projets »", () => {
  test("« Quel ingénieur a le plus de projets ? » → crm_analytics (agrégation), pas la liste", async () => {
    projectStats.getProjectStatistics.mockResolvedValue({ groupBy: "engineer", scope: "all", includeArchived: true, filters: {}, totalProjects: 10, withDimension: 8, withoutDimension: 2, groupCount: 1, truncated: false, groups: [{ key: "e3", label: "Hamza Zahrouni", count: 8 }] });
    const r = await ask(build(ADMIN), ADMIN, "Quel ingénieur a le plus de projets ?");
    expect(r.intent).toBe("crm_analytics");
    expect(engineerDirectory.listEngineers).not.toHaveBeenCalled();
    expect(projectStats.getProjectStatistics.mock.calls[0][0]).toMatchObject({ groupBy: "engineer" });
  });

  test("« Quels ingénieurs travaillent sur mes projets ? » → répartition dans le périmètre de l'utilisateur", async () => {
    projectStats.getProjectStatistics.mockResolvedValue({ groupBy: "engineer", scope: "mine", includeArchived: true, filters: {}, totalProjects: 4, withDimension: 4, withoutDimension: 0, groupCount: 1, truncated: false, groups: [{ key: "e1", label: "Amine Trimech", count: 4 }] });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "Quels ingénieurs travaillent sur mes projets ?");
    expect(r.intent).toBe("crm_analytics");
    expect(projectStats.getProjectStatistics.mock.calls[0][1]).toEqual({ ownerId: COMMERCIAL.id });
  });

  test.each([
    ["Quel ingénieur travaille sur le projet Sfax Port ?", "Sfax Port", /👷 Ingénieur du projet « Sfax Port »/],
    ["Which engineer works on project Sfax Port?", "Sfax Port", /Engineer of project "Sfax Port"/],
    ["Какой инженер работает над проектом Sfax Port?", "Sfax Port", /Инженер проекта «Sfax Port»/],
  ])("« %s » → projet réel puis son ingénieur, dans le périmètre (commercial : ses projets)", async (message, projectName, title) => {
    engineerDirectory.findProjectEngineers.mockResolvedValue({ projectName, scope: "mine", matches: [{ projectId: "p1", projectName: "Sfax Port", engineer: { id: "e3", name: "Hamza Zahrouni" } }] });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, message);
    expect(r.intent).toBe("engineers");
    expect(engineerDirectory.findProjectEngineers).toHaveBeenCalledWith({ operation: "of_project", projectName }, { ownerId: COMMERCIAL.id });
    expect(r.answer).toMatch(title);
    expect(r.answer).toMatch(/📁 \*\*Sfax Port\*\* → 👷 \*\*Hamza Zahrouni\*\*/);
  });

  test("projet inconnu ou hors périmètre : réponse honnête, rien d'inventé", async () => {
    engineerDirectory.findProjectEngineers.mockResolvedValue({ projectName: "PR-125", scope: "mine", matches: [] });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "Quel ingénieur travaille sur le projet PR-125 ?");
    expect(r.answer).toMatch(/Je n'ai trouvé aucun projet correspondant à « PR-125 » parmi les projets auxquels vous avez accès/);
  });

  test("admin : projet cherché sur tout le CRM ; projet sans ingénieur signalé", async () => {
    engineerDirectory.findProjectEngineers.mockResolvedValue({ projectName: "Villa", scope: "all", matches: [{ projectId: "p2", projectName: "Villa Tunis", engineer: null }] });
    const r = await ask(build(ADMIN), ADMIN, "Quel ingénieur travaille sur le projet Villa ?");
    expect(engineerDirectory.findProjectEngineers.mock.calls[0][1]).toEqual({ ownerId: null });
    expect(r.answer).toMatch(/Villa Tunis\*\* → ❔ aucun ingénieur renseigné/);
  });

  test("« Comment affecter un ingénieur à un projet ? » reste documentaire (jamais la liste)", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Comment affecter un ingénieur à un projet ?");
    expect(r.intent).not.toBe("engineers");
    expect(engineerDirectory.listEngineers).not.toHaveBeenCalled();
  });
});

describe("Clarification contextuelle et capacités", () => {
  // TESTS A à D — un groupe nominal seul demande la LISTE : jamais une
  // clarification, jamais la fiche d'une personne.
  test.each([
    "ingénieurs",
    "Ingénieurs",
    "ingénieures",
    "les ingénieurs",
    "les ingénieures",
    "liste des ingénieurs",
    "donne-moi les ingénieurs",
    "affiche les ingénieurs",
    "je veux les ingénieurs",
    "je veux voir les ingénieurs",
    "quels sont les ingénieurs ?",
    "quels ingénieurs avons-nous ?",
    "Voir la liste des ingénieurs",
    "engineers",
    "инженеры",
  ])("« %s » → engineers / list, sans clarification", async (message) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(r).toMatchObject({ intent: "engineers", agent: "analytics_agent", mode: "agent" });
    expect(engineerDirectory.listEngineers).toHaveBeenCalledWith({ operation: "list", limit: 20, offset: 0 });
    expect(new AnalyticsQueryParser().parse(message)).toMatchObject({ domain: "engineer", operation: "list" });
  });

  test("pagination : 20 par page, « Afficher les suivants » continue la numérotation, puis s'arrête", async () => {
    const page = (offset, n) => ({ items: Array.from({ length: n }, (_, i) => ({ id: `e${offset + i}`, name: `Ingénieur ${offset + i + 1}` })), total: 45, offset, truncated: offset + n < 45 });
    engineerDirectory.listEngineers.mockImplementation(async ({ offset = 0 }) => page(offset, Math.min(20, 45 - offset)));
    const h = build(ADMIN);

    const first = await ask(h, ADMIN, "Donne-moi la liste des ingénieurs");
    expect(first.answer).toMatch(/J'ai trouvé \*\*45\*\* ingénieurs/);
    expect(first.answer).toContain("| 20 | Ingénieur 20 |");
    expect(first.answer).not.toContain("Ingénieur 21");
    expect(first.answer).toContain("Affichage de 1 à 20 sur 45.");
    expect(first.suggestions.map((x) => x.label)).toContain("Afficher les suivants");

    const second = await ask(h, ADMIN, "Afficher les suivants");
    expect(second.intent).toBe("engineers");
    expect(engineerDirectory.listEngineers).toHaveBeenLastCalledWith({ operation: "list", limit: 20, offset: 20 });
    expect(second.answer).toContain("| 21 | Ingénieur 21 |");
    expect(second.answer).toContain("Affichage de 21 à 40 sur 45.");

    const third = await ask(h, ADMIN, "suivants");
    expect(third.answer).toContain("| 45 | Ingénieur 45 |");
    expect(third.answer).toContain("Affichage de 41 à 45 sur 45.");
    expect(third.answer).not.toContain("Afficher les suivants");
    expect(third.suggestions.map((x) => x.label)).not.toContain("Afficher les suivants");

    // Plus de liste en cours : « suivants » n'est plus une page de la liste.
    const after = await ask(h, ADMIN, "Afficher les suivants");
    expect(after.intent).not.toBe("engineers");
  });

  test("« Que puis-je faire ? » reste capability_audit ; « … ingénieurs disponibles pour moi » n'y va jamais", async () => {
    const detector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
    expect((await detector.detect("Que puis-je faire ?", {})).name).toBe("capability_audit");
    expect((await detector.detect("Qu'est-ce qui est disponible pour moi ?", {})).name).toBe("capability_audit");
    expect((await detector.detect("donner moi les ingénieurs disponible pour moi", {})).name).not.toBe("capability_audit");
  });

  test.each([
    ["Quels sont mes projets ?", "projects"],
    ["Voir mes demandes de maintenance", "maintenance"],
    ["Voir mes demandes RH", "hr"],
  ])("non-régression : « %s » → %s", async (message, intent) => {
    const detector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
    expect((await detector.detect(message, {})).name).toBe(intent);
  });
});

// Cause racine reproduite en direct : après « Voir mes demandes RH », la
// règle d'ellipse du ConversationContextResolver (message court sans mot-clé)
// rattachait « DONNER MOI LISTE DES INGENIEURS » au sujet RH → HRAgent.
describe("Sujet précédent dans la conversation : l'entité explicite l'emporte", () => {
  test("ellipse : une AUTRE entité nommée n'est jamais rattachée au sujet précédent ; la même entité reste une suite", () => {
    const resolver = new ConversationContextResolver({ catalog: DEFAULT_INTENT_CATALOG });
    expect(resolver.resolve({ message: "DONNER MOI LISTE DES INGENIEURS", history: [], currentTopic: "hr" })).toMatchObject({ isReference: false, enrichedMessage: "DONNER MOI LISTE DES INGENIEURS" });
    expect(resolver.resolve({ message: "Et les dossiers ?", history: [], currentTopic: "projects" })).toMatchObject({ isReference: true, resolvedTopic: "projects" });
    expect(resolver.resolve({ message: "Et les autres ?", history: [], currentTopic: "hr" })).toMatchObject({ isReference: true, resolvedTopic: "hr" });
  });

  test("« Voir mes demandes RH » puis « DONNER MOI LISTE DES INGENIEURS » → engineers / list_engineers, jamais l'Agent RH", async () => {
    const h = build(COMMERCIAL, { withContextResolver: true });
    const conversationId = "conv-topic";
    await h.manager.handleMessage({ message: "Voir mes demandes RH", user: COMMERCIAL, conversationId });
    const r = await h.manager.handleMessage({ message: "DONNER MOI LISTE DES INGENIEURS", user: COMMERCIAL, conversationId });
    expect(r).toMatchObject({ intent: "engineers", agent: "analytics_agent" });
    expect(engineerDirectory.listEngineers).toHaveBeenCalledTimes(1);
    expect(r.answer).toMatch(/Ingénieurs du CRM/);
  });

  test("« Give me the list of engineers. » → engineers / list", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Give me the list of engineers.");
    expect(r).toMatchObject({ intent: "engineers" });
    expect(r.answer).toMatch(/CRM engineers/);
  });
});

describe("Données, erreurs, volume", () => {
  test("aucun ingénieur : message exact demandé", async () => {
    engineerDirectory.listEngineers.mockResolvedValue({ items: [], total: 0, truncated: false });
    const r = await ask(build(ADMIN), ADMIN, "Liste les ingénieurs.");
    expect(r.answer).toMatch(/Aucun ingénieur n'est actuellement disponible dans les données CRM auxquelles vous avez accès\./);
  });

  test("grand volume : total réel et mention de la troncature", async () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, name: `Ingénieur ${i}` }));
    engineerDirectory.listEngineers.mockResolvedValue({ items, total: 250, truncated: true });
    const r = await ask(build(ADMIN), ADMIN, "Liste les ingénieurs.");
    expect(r.answer).toMatch(/Affichage de 1 à 200 sur 250\./);
    expect(r.answer).toContain("Pour voir la suite, écrivez « Afficher les suivants ».");
    expect(r.answer).toMatch(/Total : 250 ingénieurs\./);
  });

  test("erreur PostgreSQL : message honnête, aucun nom affiché", async () => {
    engineerDirectory.listEngineers.mockRejectedValue(new Error('relation "engineers" does not exist'));
    const r = await ask(build(ADMIN), ADMIN, "Liste les ingénieurs.");
    expect(r.answer).toMatch(/n'ont pas pu être récupérées/);
  });

  test("Tool trop lent : délai dépassé annoncé", async () => {
    engineerDirectory.listEngineers.mockImplementation(() => new Promise(() => {}));
    const r = await ask(build(ADMIN, { timeoutMs: 30 }), ADMIN, "Show me the engineers.");
    expect(r.answer).toMatch(/could not be computed in time/);
  });

  test("résultat non conforme (nom vide) : rejeté, jamais affiché", async () => {
    engineerDirectory.listEngineers.mockResolvedValue({ items: [{ id: "x", name: "  " }], total: 1, truncated: false });
    const r = await ask(build(ADMIN), ADMIN, "Liste les ingénieurs.");
    expect(r.answer).toMatch(/n'ont pas pu être récupérées/);
  });
});

describe("Tool list_engineers — mêmes champs et même ouverture que GET /engineers/all", () => {
  test("tout rôle authentifié peut lister ; seuls { id, name } sont renvoyés par le service", async () => {
    const tools = Object.fromEntries(
      createMcpToolAdapters({
        mcpServer: (() => {
          const registry = new ToolRegistry();
          registry.register(createListEngineersTool());
          return new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
        })(),
        actingUser: COMMERCIAL,
      }).map((a) => [a.name, a])
    );
    const out = JSON.parse(await tools.list_engineers.invoke({}));
    expect(out).toMatchObject({ operation: "list", total: 3 });
    expect(Object.keys(out.items[0]).sort()).toEqual(["id", "name"]);
    await expect(tools.list_engineers.invoke({ operation: "of_project" })).rejects.toThrow(/Invalid input/);
  });
});
