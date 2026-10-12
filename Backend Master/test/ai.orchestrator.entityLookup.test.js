"use strict";

// PROBAR ASSISTANT — une personne, une société ou un promoteur PRÉCIS, de bout
// en bout : VRAI AIManager, VRAI QueryRouter, VRAIS Agents (EntityLookupAgent,
// AnalyticsAgent), VRAIS Tools find_crm_entity / web_search / list_engineers
// derrière un VRAI McpServer. Simulés : les services SQL (espionnés), le
// moteur Web (fournisseur factice) et le modèle de langage — jamais sollicité.

jest.mock("../src/modules/projects/services/project.service", () => ({ listProjects: jest.fn() }));
jest.mock("../src/modules/projects/services/engineerDirectory.service", () => ({
  listEngineers: jest.fn(),
  findProjectEngineers: jest.fn(),
  DEFAULT_LIMIT: 200,
  MAX_LIMIT: 1000,
}));
jest.mock("../src/modules/projects/services/crmEntityDirectory.service", () => ({
  findEntity: jest.fn(),
  findAnyEntity: jest.fn(),
  findProjectPromoter: jest.fn(),
  listPromoters: jest.fn(),
  findPromoterProjects: jest.fn(),
  listCompanies: jest.fn(),
}));
jest.mock("../src/modules/machines/services/machine.service", () => ({ listMachines: jest.fn() }));

const engineerDirectory = require("../src/modules/projects/services/engineerDirectory.service");
const crm = require("../src/modules/projects/services/crmEntityDirectory.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const { createListEngineersTool } = require("../src/ai/mcp/tools/projects/listEngineersTool");
const { createFindCrmEntityTool, scopeFor } = require("../src/ai/mcp/tools/projects/findCrmEntityTool");
const { createWebSearchTool } = require("../src/ai/mcp/tools/web");
const { createListPromotersTool } = require("../src/ai/mcp/tools/projects/listPromotersTool");
const { createListCompaniesTool } = require("../src/ai/mcp/tools/projects/listCompaniesTool");
const { createListMachinesTool } = require("../src/ai/mcp/tools/industrial/listMachinesTool");
const machineService = require("../src/modules/machines/services/machine.service");
const { WebSearchService } = require("../src/ai/web/webSearchService");

const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { BaseAgent } = require("../src/ai/agents/baseAgent");
const { createAnalyticsAgent } = require("../src/ai/agents/analyticsAgent");
const { createEntityLookupAgent } = require("../src/ai/agents/entityLookupAgent");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");
const { SemanticIntentResolver } = require("../src/ai/orchestrator/semanticIntentResolver");
const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");
const { AnalyticsQueryParser } = require("../src/ai/analytics/analyticsQueryParser");
const { QueryRouter } = require("../src/ai/routing/queryRouter");

const ADMIN = { id: "11111111-1111-4111-8111-111111111111", role: "admin", email: "admin@cbi.tn" };
const COMMERCIAL = { id: "22222222-2222-4222-8222-222222222222", role: "commercial", email: "com@cbi.tn" };
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ENGINEER_ID = "44444444-4444-4444-8444-444444444444";
const CONTACT_ID = "55555555-5555-4555-8555-555555555555";

const PROJECTS = { total: 2, truncated: false, items: [{ id: "p1", name: "Résidence Holya", statut: "En cours", archived: false }, { id: "p2", name: "Tour Lac", statut: "Livraison", archived: false }] };
const engineerMatch = (extra = {}) => ({
  entityType: "engineer",
  id: ENGINEER_ID,
  name: "Zakariah Derbel",
  matchType: "exact",
  fields: { fullName: "Zakariah Derbel", contactType: "engineer", phone: "+216 71 000 111", email: "z.derbel@bureau.tn", company: "Entreprise Derbel", createdAt: "2026-05-26T10:00:00.000Z", updatedAt: "2026-06-02T10:00:00.000Z" },
  restricted: [],
  projects: PROJECTS,
  activity: null,
  ...extra,
});
const contactMatch = (extra = {}) => ({
  entityType: "contact",
  id: CONTACT_ID,
  name: "Sami Trabelsi",
  matchType: "exact",
  fields: {
    firstName: "Sami", lastName: "Trabelsi", fullName: "Sami Trabelsi", contactType: "Batiment", phone: "+216 98 222 333", email: null, address: "Sousse",
    company: "Batipro", taxId: null, status: "rappeler_plus_tard", pipelineStage: "Devis envoyé", assignedCommercial: "Hadil", topic: "Armatures PROBAR", notes: null,
    createdAt: "2026-04-01T08:00:00.000Z", updatedAt: "2026-09-12T08:00:00.000Z",
  },
  restricted: [],
  projects: null,
  activity: { calls: 4, lastCall: "2026-09-10T09:00:00.000Z", actions: 3, lastAction: { type: "Devis envoyé", date: "2026-09-12T08:00:00.000Z" }, relances: 2, lastRelance: { date: "2026-09-20", status: "planifiee" } },
  ...extra,
});
const companyMatch = () => ({ entityType: "company", id: "c1", name: "CBI Tunisia", matchType: "exact", fields: { fullName: "CBI Tunisia", contactType: "company", createdAt: null, updatedAt: null }, restricted: [], projects: { total: 0, items: [], truncated: false }, activity: null });
const found = (matches, entityType = matches[0] ? matches[0].entityType : null) => ({ entityType, name: "x", matchType: matches[0] ? matches[0].matchType : null, matches, truncated: false });
const NOT_FOUND = { entityType: null, name: "x", matchType: null, matches: [], truncated: false };

const WEB_RESULTS = {
  company: [
    { title: "CBI Tunisia — Accueil", url: "https://www.cbi-tunisia.com/", snippet: "CBI Tunisia fabrique des armatures en fibre de verre.", source: "cbi-tunisia.com", publishedAt: null },
    { title: "CBI Tunisia | LinkedIn", url: "https://www.linkedin.com/company/cbi-tunisia", snippet: "CBI Tunisia, matériaux composites pour le bâtiment.", source: "linkedin.com", publishedAt: null },
    { title: "Sans rapport", url: "https://example.org/x", snippet: "Autre sujet.", source: "example.org", publishedAt: null },
  ],
  person: [{ title: "Zakariah Derbel - Ingénieur structure | LinkedIn", url: "https://www.linkedin.com/in/zakariah-derbel", snippet: "Zakariah Derbel, ingénieur structure à Tunis.", source: "linkedin.com", publishedAt: null }],
};

// Agents existants (projets, contacts, demandes RH / maintenance) : simulés par
// un Agent témoin qui signale seulement qu'il a été choisi.
function delegateAgent(name, intentNames) {
  const agent = new BaseAgent({ name, systemPrompt: "x", intentNames, chatModel: {}, tools: [], allowedToolNames: [], workflowEngine: new LangChainWorkflowEngine() });
  agent._run = async () => ({ answer: `[${name}]`, citations: [], toolSteps: [] });
  return agent;
}

function build(user, { webConfigured = true, webResults = null, webError = null, webSynthesis = false, llmReply = "inventé", engineerProbe = true, entityProbe = { person: true, project: false }, withQaAgent = true } = {}) {
  const provider = {
    name: "fake",
    isConfigured: () => webConfigured,
    search: jest.fn(async (query) => {
      if (webError) throw webError;
      return webResults || (/Zakariah|Zied/.test(query) ? WEB_RESULTS.person : WEB_RESULTS.company);
    }),
  };
  const registry = new ToolRegistry();
  [createListEngineersTool(), createFindCrmEntityTool(), createListPromotersTool(), createListCompaniesTool(), createListMachinesTool(), createWebSearchTool({ service: new WebSearchService({ provider }) })].forEach((t) => registry.register(t));
  const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  const tools = createMcpToolAdapters({ mcpServer: server, actingUser: user });
  const chatModel = { invoke: jest.fn(async () => ({ content: llmReply })) };
  const qaChain = { invoke: jest.fn(async () => ({ answer: "aucune information dans la documentation", citations: [] })) };
  const memory = new InMemoryConversationMemory();
  const workflowEngine = new LangChainWorkflowEngine();
  const parser = new AnalyticsQueryParser();
  const queryRouter = new QueryRouter();
  const agents = new AgentRegistry();
  agents.register(createAnalyticsAgent({ chatModel, tools, workflowEngine, memory, analyticsParser: parser }));
  agents.register(createEntityLookupAgent({ chatModel, tools, workflowEngine, memory, queryRouter, webSynthesis }));
  agents.register(delegateAgent("project_agent", ["projects"]));
  agents.register(delegateAgent("commercial_agent", ["commercial_contacts"]));
  agents.register(delegateAgent("hr_agent", ["hr"]));
  agents.register(delegateAgent("maintenance_agent", ["maintenance"]));
  if (withQaAgent) agents.register(new BaseAgent({ name: "assistant_agent", systemPrompt: "doc", intentNames: ["general_chat", "documentation_question", "capability_audit"], chatModel, tools: [], allowedToolNames: [], workflowEngine, qaChain }));
  const probes = { engineer: jest.fn(async () => engineerProbe), entity: jest.fn(async () => entityProbe) };
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
    queryRouter,
    engineerProbe: probes.engineer,
    entityProbe: probes.entity,
  });
  return { manager, chatModel, qaChain, provider, probes };
}

const ask = (h, user, message, extra = {}) => h.manager.handleMessage({ message, user, conversationId: "c1", ...extra });
const toolsOf = (r) => r.toolCalls.map((c) => c.tool);
const ADMIN_SCOPE = expect.objectContaining({ ownerId: null, contacts: { mode: "all", userId: null }, engineerCoordinates: "all" });

beforeEach(() => {
  jest.clearAllMocks();
  engineerDirectory.listEngineers.mockResolvedValue({ items: [{ id: "e1", name: "Zakariah Derbel" }], total: 118, truncated: true });
  crm.findEntity.mockResolvedValue(found([engineerMatch()]));
  crm.findAnyEntity.mockResolvedValue(found([engineerMatch()]));
  crm.findProjectPromoter.mockResolvedValue({ scope: "all", matches: [{ projectId: PROJECT_ID, projectName: "Résidence Holya", promoter: "Immobilière du Lac" }] });
});

describe("le dialogue signalé : « infos liées à Zakariah Derbel » → la fiche CRM, pas une question ni la documentation", () => {
  test.each([
    "donner moi les infos liées à Zakariah Derbel",
    "Donne-moi les infos de Zakariah Derbel",
    "Informations sur Zakariah Derbel",
    "Qui est Zakariah Derbel ?",
    "Zakariah Derbel",
  ])("« %s » → CRM interrogé, fiche structurée", async (message) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);

    expect(r).toMatchObject({ intent: "entity_lookup", agent: "entity_lookup_agent", mode: "agent" });
    expect(crm.findAnyEntity).toHaveBeenCalledWith(expect.objectContaining({ name: "Zakariah Derbel" }), ADMIN_SCOPE);
    expect(r.answer).toContain("👤 **Zakariah Derbel**");
    expect(r.answer).toContain("_Source : données internes du CRM_");
    // L'UUID du CRM est une donnée technique : jamais affichée par défaut.
    expect(r.answer).toMatch(/👤 \*\*Identité\*\*\n- Nom complet : Zakariah Derbel\n- Type : Ingénieur/);
    expect(r.answer).not.toMatch(/ID CRM|44444444-4444/);
    expect(r.answer).toMatch(/📞 \*\*Coordonnées\*\*\n- Téléphone : \+216 71 000 111\n- Email : z\.derbel@bureau\.tn/);
    expect(r.answer).toMatch(/🏢 \*\*Entreprise\*\*\n- Société \(d'après ses projets\) : Entreprise Derbel/);
    expect(r.answer).toMatch(/📊 \*\*Activité CRM\*\*\n- Projets associés \(2\) :\n {2}- 📁 Résidence Holya — En cours/);
    expect(r.answer).toMatch(/- Date de création : 26\/05\/2026/);
    // Ni le modèle de langage ni la documentation ne sont sollicités.
    expect(r.answer).not.toMatch(/documentation|De quel ingénieur/);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
    expect(h.qaChain.invoke).not.toHaveBeenCalled();
  });

  test("TEST 1 — « Donne-moi les informations de Zakariah Derbel » (classé « projets ») : une personne connue du CRM l'emporte", async () => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Donne-moi les informations de Zakariah Derbel");
    expect(h.probes.entity).toHaveBeenCalledWith("Zakariah Derbel");
    expect(r.intent).toBe("entity_lookup");
    expect(r.answer).toContain("📞 **Coordonnées**");
  });

  test("…mais un vrai nom de projet garde son routage (« détails de Résidence HOLYA »)", async () => {
    const h = build(ADMIN, { entityProbe: { person: false, project: true } });
    const r = await ask(h, ADMIN, "Donne-moi les détails de Résidence HOLYA");
    expect(r.intent).toBe("projects");
    expect(crm.findAnyEntity).not.toHaveBeenCalled();
  });

  test("intention entity_lookup sans route (repli sémantique) : le nom du message est cherché, jamais « de quel ingénieur ? »", async () => {
    const agent = createEntityLookupAgent({ chatModel: {}, tools: [], workflowEngine: new LangChainWorkflowEngine() });
    agent.tools = [{ name: "find_crm_entity", invoke: jest.fn(async () => ({ operation: "find", scope: "all", ...found([engineerMatch()]) })) }];
    const out = await agent.execute({ intent: { name: "entity_lookup" }, message: "fiche zakariah derbel", user: ADMIN, conversationId: "c9" });
    expect(agent.tools[0].invoke).toHaveBeenCalledWith(expect.objectContaining({ entityType: "auto", name: "fiche zakariah derbel" }));
    expect(out.answer).toContain("👤 **Zakariah Derbel**");
  });

  test("champ vide en base → « Non renseigné » ; champ masqué par le rôle → dit tel quel", async () => {
    crm.findAnyEntity.mockResolvedValue(found([engineerMatch({ fields: { ...engineerMatch().fields, phone: null, email: null }, restricted: ["email"] })]));
    const r = await ask(build(ADMIN), ADMIN, "Qui est Zakariah Derbel ?");
    expect(r.answer).toContain("- Téléphone : Non renseigné");
    expect(r.answer).toContain("- Email : Non accessible avec votre rôle");
  });
});

describe("questions directes sur un champ", () => {
  test.each([
    ["Téléphone de Zakariah Derbel", "Téléphone de **Zakariah Derbel** : +216 71 000 111"],
    ["Email de Zakariah Derbel", "Email de **Zakariah Derbel** : z.derbel@bureau.tn"],
    ["Adresse de Zakariah Derbel", "Adresse de **Zakariah Derbel** : Non renseigné (la fiche ingénieur du CRM ne comporte pas ce champ)"],
  ])("« %s » → uniquement ce champ, CRM seul", async (message, expected) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(r.intent).toBe("entity_lookup");
    expect(toolsOf(r)).toEqual(["find_crm_entity"]);
    expect(r.answer).toBe(`${expected}\n\n_Source : données internes du CRM_`);
    expect(h.provider.search).not.toHaveBeenCalled();
  });

  test("« Coordonnées de Zakariah Derbel » → téléphone, email, adresse", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Coordonnées de Zakariah Derbel");
    expect(r.answer).toMatch(/Téléphone de \*\*Zakariah Derbel\*\* : \+216 71 000 111\nEmail de \*\*Zakariah Derbel\*\* : z\.derbel@bureau\.tn\nAdresse de/);
  });
});

describe("TESTS 2 à 7 — questions de suivi : le contact reste le sujet de la conversation", () => {
  async function conversation(match, question) {
    crm.findAnyEntity.mockResolvedValue(found([match]));
    crm.findEntity.mockResolvedValue(found([match]));
    const h = build(ADMIN);
    await ask(h, ADMIN, `Donne-moi les informations de ${match.name}`);
    crm.findEntity.mockClear();
    const r = await ask(h, ADMIN, question);
    return { h, r };
  }

  test.each([
    ["Quel est son téléphone ?", "Téléphone de **Zakariah Derbel** : +216 71 000 111"],
    ["Quel est son email ?", "Email de **Zakariah Derbel** : z.derbel@bureau.tn"],
    ["Quelle est son adresse ?", "Adresse de **Zakariah Derbel** : Non renseigné (la fiche ingénieur du CRM ne comporte pas ce champ)"],
    ["Dans quelle société travaille-t-il ?", "Société (d'après ses projets) de **Zakariah Derbel** : Entreprise Derbel"],
    ["Où travaille-t-il ?", "Société (d'après ses projets) de **Zakariah Derbel** : Entreprise Derbel"],
  ])("ingénieur — « %s »", async (question, expected) => {
    const { h, r } = await conversation(engineerMatch(), question);
    expect(r).toMatchObject({ intent: "entity_lookup", mode: "agent" });
    // Relu par son identifiant (jamais un homonyme), via le Tool scopé.
    expect(crm.findEntity).toHaveBeenCalledWith("engineer", expect.objectContaining({ name: ENGINEER_ID }), ADMIN_SCOPE);
    expect(r.answer).toBe(`${expected}\n\n_Source : données internes du CRM_`);
    expect(h.provider.search).toHaveBeenCalledTimes(2); // les 2 requêtes de la fiche du premier tour, rien ensuite
  });

  test("ingénieur — « Quels sont ses projets ? »", async () => {
    const { r } = await conversation(engineerMatch(), "Quels sont ses projets ?");
    expect(r.answer).toMatch(/^Zakariah Derbel — Projets associés \(2\) :\n {2}- 📁 Résidence Holya — En cours\n {2}- 📁 Tour Lac — Livraison/);
  });

  test("ingénieur — « Combien de relances a-t-il ? » : champ absent de sa fiche, dit tel quel (pas un comptage global)", async () => {
    const { r } = await conversation(engineerMatch(), "Combien de relances a-t-il ?");
    expect(r.intent).toBe("entity_lookup");
    expect(r.answer).toContain("Nombre de relances de **Zakariah Derbel** : Non renseigné (la fiche ingénieur du CRM ne comporte pas ce champ)");
  });

  test.each([
    ["Quel est son téléphone ?", "Téléphone de **Sami Trabelsi** : +216 98 222 333"],
    ["Quel est son email ?", "Email de **Sami Trabelsi** : Non renseigné"],
    ["Quelle est son adresse ?", "Adresse de **Sami Trabelsi** : Sousse"],
    ["Dans quelle société travaille-t-il ?", "Société de **Sami Trabelsi** : Batipro"],
    ["Combien de relances a-t-il ?", "Nombre de relances de **Sami Trabelsi** : 2\nDernière relance de **Sami Trabelsi** : 20/09/2026 — planifiee"],
    ["Combien de fois a-t-il été relancé ?", "Nombre de relances de **Sami Trabelsi** : 2\nDernière relance de **Sami Trabelsi** : 20/09/2026 — planifiee"],
    ["Quelle est sa dernière action ?", "Dernière action de **Sami Trabelsi** : Devis envoyé — 12/09/2026"],
  ])("contact commercial — « %s »", async (question, expected) => {
    const { r } = await conversation(contactMatch(), question);
    expect(crm.findEntity).toHaveBeenCalledWith("contact", expect.objectContaining({ name: CONTACT_ID }), ADMIN_SCOPE);
    expect(r.answer).toBe(`${expected}\n\n_Source : données internes du CRM_`);
  });

  test("sans contact dans la conversation, « Quel est son téléphone ? » n'est pas détourné", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Quel est son téléphone ?");
    expect(r.intent).not.toBe("entity_lookup");
    expect(crm.findEntity).not.toHaveBeenCalled();
  });

  test("le sujet d'une conversation n'est jamais visible d'un autre utilisateur", async () => {
    const h = build(ADMIN);
    await ask(h, ADMIN, "Qui est Zakariah Derbel ?");
    const r = await ask(h, COMMERCIAL, "Quel est son téléphone ?");
    expect(r.intent).not.toBe("entity_lookup");
  });
});

describe("fiche d'un contact commercial", () => {
  test("toutes les sections, valeurs réelles, vides en « Non renseigné », aucune recherche Web", async () => {
    crm.findAnyEntity.mockResolvedValue(found([contactMatch()]));
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Donne-moi les infos de Sami Trabelsi");
    expect(r.answer).toMatch(/- Prénom : Sami\n- Nom : Trabelsi\n- Type : Contact commercial — Batiment/);
    expect(r.answer).toMatch(/- Téléphone : \+216 98 222 333\n- Email : Non renseigné/);
    expect(r.answer).toMatch(/🏢 \*\*Entreprise\*\*\n- Société : Batipro\n- Matricule fiscal : Non renseigné/);
    expect(r.answer).toMatch(/📍 \*\*Adresse\*\*\n- Adresse : Sousse/);
    expect(r.answer).toMatch(/- Statut : rappeler plus tard\n- Étape commerciale : Devis envoyé\n- Commercial responsable : Hadil\n- Nombre d'appels : 4\n- Dernier appel : 10\/09\/2026\n- Nombre d'actions : 3\n- Dernière action : Devis envoyé — 12\/09\/2026\n- Nombre de relances : 2/);
    expect(r.answer).toMatch(/- Sujet de discussion : Armatures PROBAR\n- Notes : Non renseigné/);
    // Un contact commercial est un particulier / prospect : pas de recherche Web.
    expect(toolsOf(r)).toEqual(["find_crm_entity"]);
    expect(h.provider.search).not.toHaveBeenCalled();
  });
});

describe("TEST 8 — contact inexistant", () => {
  test("« Donne-moi les informations de XYZ123 » → introuvable dans le CRM (ni projet ni personne à ce nom)", async () => {
    crm.findAnyEntity.mockResolvedValue(NOT_FOUND);
    const h = build(ADMIN, { entityProbe: { person: false, project: false }, webResults: [] });
    const r = await ask(h, ADMIN, "Donne-moi les informations de XYZ123");
    expect(r.intent).toBe("entity_lookup");
    expect(crm.findAnyEntity).toHaveBeenCalledWith(expect.objectContaining({ name: "XYZ123" }), ADMIN_SCOPE);
    expect(r.answer).toContain("Aucun contact, ingénieur ni société nommé « XYZ123 » n'a été trouvé dans les données du CRM auxquelles vous avez accès.");
    expect(r.answer).not.toMatch(/documentation/);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("une recherche infructueuse ne remplace pas le contact en cours", async () => {
    const h = build(ADMIN, { webResults: [] });
    await ask(h, ADMIN, "Qui est Zakariah Derbel ?");
    crm.findAnyEntity.mockResolvedValue(NOT_FOUND);
    await ask(h, ADMIN, "Qui est Inconnu Total ?");
    const r = await ask(h, ADMIN, "Quel est son téléphone ?");
    expect(r.answer).toContain("Téléphone de **Zakariah Derbel**");
  });
});

describe("un ingénieur nommé n'est plus une liste (le bug des 118 ingénieurs)", () => {
  test("« Zakariah Derbel donne-moi plus de détails sur cet ingénieur » → sa fiche + bloc Web séparé et sourcé", async () => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Zakariah Derbel donne-moi plus de détails sur cet ingénieur");

    expect(r.intent).toBe("entity_lookup");
    expect(engineerDirectory.listEngineers).not.toHaveBeenCalled();
    expect(crm.findEntity).toHaveBeenCalledWith("engineer", expect.objectContaining({ name: "Zakariah Derbel" }), ADMIN_SCOPE);
    expect(toolsOf(r)).toEqual(["find_crm_entity", "web_search"]);
    expect(r.answer).not.toMatch(/118/);

    const [crmPart, webPart] = r.answer.split("### 🌐 Informations publiques");
    expect(crmPart).not.toMatch(/linkedin/i);
    expect(webPart).toContain("informations publiques, non vérifiées par le CRM");
    // Le titre vient du Web : échappé, jamais interprété comme du Markdown.
    expect(webPart).toContain("Selon [Zakariah Derbel - Ingénieur structure \\| LinkedIn](https://www.linkedin.com/in/zakariah-derbel) [1]");
    expect(webPart).toMatch(/### 🔗 Sources Web\n1\. \[.*\]\(https:\/\/www\.linkedin\.com\/in\/zakariah-derbel\) — LinkedIn \(linkedin\.com\)/);
    expect(r.citations).toEqual([expect.objectContaining({ index: 1, sourceType: "web", path: "https://www.linkedin.com/in/zakariah-derbel" })]);
    // Vers le moteur : le nom, la fonction, le pays, puis le nom et la société
    // (contexte professionnel public) — ni téléphone, ni e-mail, ni projet.
    expect(h.provider.search.mock.calls.map((c) => c[0])).toEqual(['"Zakariah Derbel" ingénieur Tunisie', '"Zakariah Derbel" "Entreprise Derbel"']);
    expect(JSON.stringify(h.provider.search.mock.calls)).not.toMatch(/71 000 111|bureau\.tn|Holya/);
    expect(r.answer.startsWith("🔵 Données CRM · 🌐 Recherche Web · 🔗 Sources\n\n👤 **Zakariah Derbel**")).toBe(true);
  });

  test("la liste des ingénieurs reste une liste (aucune régression)", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Donne-moi la liste des ingénieurs qui existent dans le CRM");
    expect(r).toMatchObject({ intent: "engineers", agent: "analytics_agent" });
    expect(crm.findEntity).not.toHaveBeenCalled();
  });
});

describe("FR / EN / RU", () => {
  test.each([
    ["Give me more information about Zakariah Derbel", /👤 \*\*Zakariah Derbel\*\*[\s\S]*📞 \*\*Contact details\*\*\n- Phone : \+216 71 000 111[\s\S]*Related projects \(2\)[\s\S]*### 🌐 Public information[\s\S]*According to/],
    ["Дайте мне больше информации о Закарии Дербеле", /👤 \*\*Zakariah Derbel\*\*[\s\S]*- Телефон : \+216 71 000 111[\s\S]*Связанные проекты \(2\)[\s\S]*### 🌐 Публичная информация[\s\S]*По данным/],
  ])("« %s » → fiche dans la langue de la question", async (message, expected) => {
    const r = await ask(build(ADMIN), ADMIN, message);
    expect(r.intent).toBe("entity_lookup");
    expect(r.answer).toMatch(expected);
  });

  test.each([
    ["Donne-moi des informations sur CBI Tunisia", "fr", /Aucun contact, ingénieur ni société nommé « CBI Tunisia »[\s\S]*### 🌐 Informations publiques[\s\S]*Site officiel \(cbi-tunisia\.com\)/],
    ["Give me information about CBI Tunisia", "en", /No contact, engineer or company named "CBI Tunisia"[\s\S]*### 🌐 Public information[\s\S]*Official website \(cbi-tunisia\.com\)/],
    ["Дайте мне информацию о CBI Tunisia", "ru", /не найдено ни контакта, ни инженера, ни компании с именем «CBI Tunisia»[\s\S]*### 🌐 Публичная информация[\s\S]*Официальный сайт \(cbi-tunisia\.com\)/],
  ])("« %s » → absent du CRM, sources publiques (%s)", async (message, language, expected) => {
    crm.findAnyEntity.mockResolvedValue(NOT_FOUND);
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(r.answer).toMatch(expected);
    expect(r.citations.map((c) => c.path)).toEqual(["https://www.cbi-tunisia.com/", "https://www.linkedin.com/company/cbi-tunisia"]);
    expect(h.provider.search.mock.calls[0][1]).toMatchObject({ language });
  });

  test("société connue du CRM puis « this company » / « этой компании » → Web seul, langue de la question", async () => {
    crm.findAnyEntity.mockResolvedValue(found([companyMatch()]));
    const h = build(ADMIN);
    const first = await ask(h, ADMIN, "Donne-moi des informations sur CBI Tunisia");
    expect(first.answer).toMatch(/🏢 \*\*CBI Tunisia\*\*[\s\S]*- Type : Société[\s\S]*Projets associés \(0\) : Aucun[\s\S]*### 🌐 Informations publiques/);

    crm.findAnyEntity.mockClear();
    const en = await ask(h, ADMIN, "Show me information about this company");
    expect(toolsOf(en)).toEqual(["web_search"]);
    expect(en.answer).toMatch(/🏢 \*\*CBI Tunisia\*\*[\s\S]*### 🌐 Public information[\s\S]*Official website/);
    const ru = await ask(h, ADMIN, "Покажи информацию об этой компании");
    expect(ru.answer).toMatch(/### 🌐 Публичная информация[\s\S]*Официальный сайт/);
    expect(crm.findAnyEntity).not.toHaveBeenCalled();
  });

  test("« this company » sans société connue → clarification, aucun Tool", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Show me information about this company");
    expect(r.answer).toBe("Which company do you mean? Please give its name.");
    expect(r.toolCalls).toEqual([]);
  });
});

describe("« Quels sont les projets de Zakariah Derbel ? » : CRM seul", () => {
  test("ingénieur du CRM → ses projets, aucune recherche Web", async () => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Quels sont les projets de Zakariah Derbel ?");
    expect(h.probes.engineer).toHaveBeenCalledWith("Zakariah Derbel");
    expect(toolsOf(r)).toEqual(["find_crm_entity"]);
    expect(h.provider.search).not.toHaveBeenCalled();
    expect(r.answer).toMatch(/Zakariah Derbel — Projets associés \(2\) :[\s\S]*📁 Tour Lac — Livraison/);
  });

  test("le nom n'est pas celui d'un ingénieur → routage existant inchangé (projets d'un commercial)", async () => {
    const r = await ask(build(ADMIN, { engineerProbe: false }), ADMIN, "Quels sont les projets de Hadil Ben Salem ?");
    expect(r.intent).not.toBe("entity_lookup");
    expect(crm.findEntity).not.toHaveBeenCalled();
  });
});

describe("promoteur d'un projet", () => {
  test.each([
    ["Qui est le promoteur de ce projet ?", /Selon les données internes du CRM, le promoteur du projet \*\*Résidence Holya\*\* est \*\*Immobilière du Lac\*\*/],
    ["Who is the developer of this project?", /According to internal CRM data, the developer of project \*\*Résidence Holya\*\* is \*\*Immobilière du Lac\*\*/],
    ["Кто является застройщиком этого проекта?", /По внутренним данным CRM, застройщик проекта \*\*Résidence Holya\*\* — \*\*Immobilière du Lac\*\*/],
  ])("« %s » → projet de l'écran courant, CRM puis Web sur le promoteur", async (message, expected) => {
    const h = build(ADMIN, { webResults: [{ title: "Immobilière du Lac", url: "https://immobiliere-du-lac.tn/", snippet: "Immobilière du Lac, promoteur à Tunis.", source: "immobiliere-du-lac.tn" }] });
    const r = await ask(h, ADMIN, message, { pageContext: { screen: "project", entity: "project", recordId: PROJECT_ID, label: "Résidence Holya" } });
    expect(crm.findProjectPromoter).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID }), ADMIN_SCOPE);
    expect(r.answer).toMatch(expected);
    expect(h.provider.search.mock.calls[0][0]).toContain('"Immobilière du Lac"');
  });

  test("promoteur absent du CRM → dit tel quel ; aucun projet désigné → clarification ; hors périmètre → pas de Web", async () => {
    crm.findProjectPromoter.mockResolvedValue({ scope: "all", matches: [{ projectId: PROJECT_ID, projectName: "Résidence Holya", promoter: null }] });
    const h = build(ADMIN, { webResults: [{ title: "Résidence Holya — programme", url: "https://holya.tn/", snippet: "La Résidence Holya est réalisée par X.", source: "holya.tn" }] });
    const r = await ask(h, ADMIN, "Qui est le promoteur du projet Résidence Holya ?");
    expect(r.answer).toMatch(/Le promoteur du projet \*\*Résidence Holya\*\* n'est pas renseigné dans le CRM\.[\s\S]*sources publiques qui mentionnent ce projet/);

    const c = build(COMMERCIAL);
    expect((await ask(c, COMMERCIAL, "Qui est le promoteur de ce projet ?")).answer).toMatch(/De quel projet souhaitez-vous connaître le promoteur/);
    crm.findProjectPromoter.mockResolvedValue({ scope: "mine", matches: [] });
    const out = await ask(c, COMMERCIAL, "Qui est le promoteur du projet Résidence Holya ?");
    expect(crm.findProjectPromoter).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: COMMERCIAL.id }));
    expect(out.answer).toMatch(/Je ne trouve pas le projet « Résidence Holya » dans le CRM \(ou il est hors de votre périmètre\)/);
    expect(c.provider.search).not.toHaveBeenCalled();
  });
});

describe("fiabilité et RBAC", () => {
  test("plusieurs fiches possibles → on demande laquelle, aucune recherche Web, aucun choix arbitraire", async () => {
    crm.findAnyEntity.mockResolvedValue(found([{ entityType: "engineer", id: "e1", name: "Zakariah Derbel", company: null, matchType: "exact" }, { entityType: "contact", id: "k1", name: "Zakariah Derbel", company: "Batipro", matchType: "exact" }], null));
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Qui est Zakariah Derbel ?");
    expect(r.answer).toMatch(/J'ai trouvé 2 résultats correspondant à « Zakariah Derbel » dans le CRM\. Lequel souhaitez-vous consulter \?\n\n1\. \*\*Zakariah Derbel\*\* — Ingénieur\n2\. \*\*Zakariah Derbel\*\* — Contact commercial \(Batipro\)/);
    expect(h.provider.search).not.toHaveBeenCalled();
  });

  test("correspondance approchée signalée comme telle", async () => {
    crm.findAnyEntity.mockResolvedValue(found([engineerMatch({ matchType: "fuzzy" })]));
    const r = await ask(build(ADMIN), ADMIN, "Qui est Zakaria Derbal ?");
    expect(r.answer).toMatch(/Aucune correspondance exacte pour « Zakaria Derbal » : voici la fiche la plus proche, \*\*Zakariah Derbel\*\*/);
  });

  test("recherche Web non configurée → fiche CRM complète, dit clairement", async () => {
    const h = build(ADMIN, { webConfigured: false });
    const r = await ask(h, ADMIN, "Qui est Zakariah Derbel ?");
    expect(r.answer).toContain("📞 **Coordonnées**");
    expect(r.answer).toContain("La recherche Web n'est pas encore configurée sur ce serveur");
    expect(h.provider.search).not.toHaveBeenCalled();
  });

  test("périmètre décidé par le Tool à partir du rôle, jamais par la question", () => {
    expect(scopeFor(ADMIN)).toEqual({ ownerId: null, contacts: { mode: "all", userId: null }, engineerCoordinates: "all" });
    expect(scopeFor(COMMERCIAL)).toEqual({ ownerId: COMMERCIAL.id, contacts: { mode: "commercialId", userId: COMMERCIAL.id }, engineerCoordinates: "linked" });
    expect(scopeFor({ id: "s1", role: "commercial_sedentaire" }).contacts).toEqual({ mode: "createdBy", userId: "s1" });
    expect(scopeFor({ id: "r1", role: "responsable_logistique_achat" }).contacts.mode).toBe("none");
  });

  test("un non-administrateur : projets de son périmètre, coordonnées masquées si l'ingénieur n'est lié à aucun de ses projets", async () => {
    crm.findAnyEntity.mockResolvedValue({ ...found([engineerMatch({ fields: { ...engineerMatch().fields, phone: null, email: null }, restricted: ["phone", "email"], projects: { total: 0, items: [], truncated: false } })]) });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "Qui est Zakariah Derbel ?");
    expect(crm.findAnyEntity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: COMMERCIAL.id, engineerCoordinates: "linked" }));
    expect(r.answer).toContain("- Téléphone : Non accessible avec votre rôle");
    expect(r.answer).toContain("Projets associés (0) (dans votre périmètre) : Aucun");
  });

  test("erreur du CRM → message honnête, pas de Web, pas de fiche", async () => {
    crm.findAnyEntity.mockRejectedValue(new Error("connection refused"));
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Qui est Zakariah Derbel ?");
    expect(r.answer).toBe("Je n'ai pas pu consulter le CRM pour cette demande. Veuillez réessayer.");
    expect(h.provider.search).not.toHaveBeenCalled();
  });
});

describe("journaux de diagnostic", () => {
  afterEach(() => delete process.env.AI_DEBUG_TRACE);

  test("[AI CRM SEARCH] / [AI CRM DETAILS] : la requête, la fiche trouvée et les NOMS des champs — jamais leurs valeurs", async () => {
    const lines = [];
    const spy = jest.spyOn(console, "log").mockImplementation((...args) => lines.push(args.join(" ")));
    const info = jest.spyOn(console, "info").mockImplementation((...args) => lines.push(args.join(" ")));
    try {
      await ask(build(ADMIN), ADMIN, "Qui est Zakariah Derbel ?");
    } finally {
      spy.mockRestore();
      info.mockRestore();
    }
    const log = lines.join("\n");
    expect(log).toContain('[AI CRM SEARCH] query="Zakariah Derbel" entityType=auto role=admin');
    expect(log).toContain(`[AI CRM SEARCH] matchedContact=["engineer:${ENGINEER_ID}"] matchType=exact`);
    expect(log).toContain(`[AI CRM DETAILS] contactId=${ENGINEER_ID} entityType=engineer`);
    expect(log).toMatch(/\[AI CRM DETAILS\] fieldsReturned=\["fullName","contactType","phone","email","company","createdAt","updatedAt","projects\(2\)"\]/);
    expect(log).toMatch(/\[AI CRM RESPONSE\] entity=engineer operation=details fields=\[\] found=1 chars=\d+/);
    expect(log).not.toMatch(/71 000 111|z\.derbel@bureau\.tn/);
  });

  test("[PROBAR_ROUTER] avec AI_DEBUG_TRACE=true", async () => {
    process.env.AI_DEBUG_TRACE = "true";
    const h = build(ADMIN);
    const lines = [];
    h.manager.logger = { info: (l) => lines.push(l), warn() {} };
    await ask(h, ADMIN, "Zakariah Derbel donne-moi plus de détails sur cet ingénieur");
    expect(lines.find((l) => l.startsWith("[PROBAR_ROUTER]"))).toBe(
      '[PROBAR_ROUTER] language=fr entity=engineer operation=details target="Zakariah Derbel" source=crm_and_web crmSearch=true webSearch=true fromContext=false lexicalIntent=general_chat accepted=true'
    );
  });
});

describe("recherche Web réelle : identité, indisponibilité, synthèse, performance", () => {
  const ZIED = () => engineerMatch({ id: "66666666-6666-4666-8666-666666666666", name: "Zied Hmidi", fields: { ...engineerMatch().fields, fullName: "Zied Hmidi", company: "Bureau d'études Hmidi" } });
  const page = (title, snippet, url) => ({ title, url, snippet, source: new URL(url).hostname.replace(/^www\./, ""), publishedAt: null });

  test("CRITÈRE DE VALIDATION — « Zied Hmidi donne-moi plus d'informations sur cet ingénieur » : CRM, Web, sources, français", async () => {
    crm.findEntity.mockResolvedValue(found([ZIED()]));
    const h = build(ADMIN, {
      webResults: [
        page("Zied Hmidi | LinkedIn", "Zied Hmidi, ingénieur génie civil, Bureau d'études Hmidi, Tunis.", "https://www.linkedin.com/in/zied-hmidi"),
        page("Zied Hmidi - footballeur", "Zied Hmidi, joueur né en 1990.", "https://sport.example.com/zied-hmidi"),
        page("Annuaire", "Zied Hmidi : téléphone et adresse.", "https://www.truecaller.com/zied-hmidi"),
      ],
    });
    const r = await ask(h, ADMIN, "Zied Hmidi donne-moi plus d'informations sur cet ingénieur");

    expect(r.intent).toBe("entity_lookup");
    expect(toolsOf(r)).toEqual(["find_crm_entity", "web_search"]);
    expect(h.provider.search.mock.calls.map((c) => c[0])).toEqual(['"Zied Hmidi" ingénieur Tunisie', '"Zied Hmidi" "Bureau d\'études Hmidi"']);
    expect(r.answer).toContain("🔵 Données CRM · 🌐 Recherche Web · 🔗 Sources");
    expect(r.answer).toContain("👤 **Zied Hmidi**");
    expect(r.answer).toContain("### 🌐 Informations publiques");
    // La page qui cite sa société passe en tête ; l'annuaire de coordonnées est écarté.
    expect(r.citations.map((c) => c.path)).toEqual(["https://www.linkedin.com/in/zied-hmidi"]);
    expect(r.answer).not.toMatch(/truecaller|n'est pas encore configurée|je ne peux pas confirmer/);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test.each([
    ["Who is Zied Hmidi?", /🔵 CRM data · 🌐 Web search · 🔗 Sources[\s\S]*👤 \*\*Zied Hmidi\*\*[\s\S]*### 🌐 Public information/, '"Zied Hmidi" engineer Tunisia'],
    ["Дайте информацию о Zied Hmidi", /🔵 Данные CRM · 🌐 Поиск в интернете · 🔗 Источники[\s\S]*👤 \*\*Zied Hmidi\*\*[\s\S]*### 🌐 Публичная информация/, '"Zied Hmidi" инженер Тунис'],
  ])("« %s » → CRM + Web, réponse et requête dans la langue de la question, nom jamais traduit", async (message, expected, query) => {
    crm.findAnyEntity.mockResolvedValue(found([ZIED()]));
    const h = build(ADMIN, { webResults: [page("Zied Hmidi | LinkedIn", "Zied Hmidi, civil engineer, Tunis.", "https://www.linkedin.com/in/zied-hmidi")] });
    const r = await ask(h, ADMIN, message);
    expect(r.answer).toMatch(expected);
    expect(h.provider.search.mock.calls[0][0]).toBe(query);
  });

  test("même nom, aucun élément commun avec la fiche CRM → mise en garde, jamais de fusion", async () => {
    crm.findAnyEntity.mockResolvedValue(found([ZIED()]));
    const h = build(ADMIN, { webResults: [page("Zied Hmidi - recettes", "Zied Hmidi partage ses recettes de cuisine.", "https://blog.example.com/zied-hmidi")] });
    const r = await ask(h, ADMIN, "Qui est Zied Hmidi ?");
    expect(r.answer).toContain("J'ai trouvé des informations publiques correspondant au nom Zied Hmidi, mais je ne peux pas confirmer qu'elles correspondent à la même personne que celle enregistrée dans le CRM.");
  });

  test("« informations publiques sur la société CBI Tunisia » → Web seul, le CRM n'est pas interrogé", async () => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Donne-moi des informations publiques sur la société CBI Tunisia");
    expect(toolsOf(r)).toEqual(["web_search"]);
    expect(crm.findAnyEntity).not.toHaveBeenCalled();
    expect(r.answer).toMatch(/### 🌐 Informations publiques[\s\S]*Site officiel \(cbi-tunisia\.com\)/);
    expect(r.answer).not.toContain("🔵 Données CRM");
  });

  test("fournisseur en panne → la fiche CRM reste affichée, l'indisponibilité est dite, rien n'est présenté comme venant du Web", async () => {
    const h = build(ADMIN, { webError: new Error("ECONNRESET") });
    const r = await ask(h, ADMIN, "Qui est Zakariah Derbel ?");
    expect(r.answer).toContain("📞 **Coordonnées**");
    expect(r.answer).toContain("Les données CRM sont disponibles, mais la recherche Web est temporairement indisponible.");
    expect(r.answer).not.toMatch(/🌐 Recherche Web|### 🌐 Informations publiques|n'est pas encore configurée/);
    expect(r.citations).toEqual([]);
  });

  test("synthèse (AI_WEB_SEARCH_SYNTHESIS) : rédigée à partir des seuls extraits, sources toujours listées", async () => {
    const h = build(ADMIN, { webSynthesis: true, llmReply: "Zakariah Derbel est ingénieur structure à Tunis [1]." });
    const r = await ask(h, ADMIN, "Qui est Zakariah Derbel ?");
    expect(h.chatModel.invoke).toHaveBeenCalledTimes(1);
    const prompt = JSON.stringify(h.chatModel.invoke.mock.calls[0][0]);
    expect(prompt).toContain("ingénieur structure à Tunis");
    expect(prompt).not.toMatch(/71 000 111|bureau\.tn/); // aucune donnée du CRM dans le prompt
    expect(r.answer).toMatch(/\*\*Synthèse\*\* _\(rédigée automatiquement à partir des sources ci-dessous\)_\nZakariah Derbel est ingénieur structure à Tunis \[1\]\.\n\n### 🔗 Sources Web\n1\. /);
  });

  test.each([
    ["un lien fabriqué", "Voir https://faux-site.tn pour plus de détails [1]."],
    ["une source inexistante", "Il a fondé trois sociétés [4]."],
    ["aucune source citée", "C'est un ingénieur reconnu."],
  ])("synthèse rejetée (%s) → extraits cités tels quels", async (_label, llmReply) => {
    const r = await ask(build(ADMIN, { webSynthesis: true, llmReply }), ADMIN, "Qui est Zakariah Derbel ?");
    expect(r.answer).not.toContain("**Synthèse**");
    expect(r.answer).not.toMatch(/faux-site|trois sociétés|reconnu/);
    expect(r.answer).toContain("- Selon [Zakariah Derbel - Ingénieur structure");
  });

  test.each(["Donne-moi mes projets", "Quels sont mes contacts ?", "Combien de projets ai-je ?", "Liste mes machines"])("TEST 6 — « %s » → aucune recherche Web", async (message) => {
    machineService.listMachines.mockResolvedValue([]);
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(toolsOf(r)).not.toContain("web_search");
    expect(h.provider.search).not.toHaveBeenCalled();
  });
});

describe("TESTS E, F, G — une nouvelle demande remplace le contexte ; une question de suivi le garde", () => {
  const ZIED_ID = "77777777-7777-4777-8777-777777777777";
  const zied = () => engineerMatch({ id: ZIED_ID, name: "Zied Hmidi", fields: { ...engineerMatch().fields, fullName: "Zied Hmidi" } });

  beforeEach(() => {
    crm.findAnyEntity.mockResolvedValue(found([zied()]));
    crm.findEntity.mockResolvedValue(found([zied()]));
    engineerDirectory.listEngineers.mockResolvedValue({ items: [{ id: "e1", name: "Ahmed Ben Ali" }, { id: ZIED_ID, name: "Zied Hmidi" }], total: 118, offset: 0, truncated: true });
  });

  test("E puis F : « informations sur Zied Hmidi » → sa fiche ; « quels sont ses projets ? » → ses projets", async () => {
    const h = build(ADMIN);
    const e = await ask(h, ADMIN, "donne-moi des informations sur Zied Hmidi");
    expect(e.intent).toBe("entity_lookup");
    expect(e.answer).toContain("👤 **Zied Hmidi**");
    const f = await ask(h, ADMIN, "quels sont ses projets ?");
    expect(f.intent).toBe("entity_lookup");
    expect(crm.findEntity).toHaveBeenLastCalledWith("engineer", expect.objectContaining({ name: ZIED_ID }), ADMIN_SCOPE);
    expect(f.answer).toMatch(/^Zied Hmidi — Projets associés \(2\)/);
  });

  test.each(["donne-moi la liste des ingénieurs", "ingénieurs", "ingénieures", "les ingénieurs", "Donne-moi la liste des ingénieurs."])(
    "G : après la fiche de Zied Hmidi, « %s » → la LISTE des ingénieurs, pas sa fiche",
    async (message) => {
      const h = build(ADMIN);
      await ask(h, ADMIN, "Donne-moi des informations sur Zied Hmidi");
      crm.findEntity.mockClear();
      crm.findAnyEntity.mockClear();

      const r = await ask(h, ADMIN, message);
      expect(r).toMatchObject({ intent: "engineers", agent: "analytics_agent", mode: "agent" });
      expect(toolsOf(r)).toEqual(["list_engineers"]);
      expect(crm.findEntity).not.toHaveBeenCalled();
      expect(crm.findAnyEntity).not.toHaveBeenCalled();
      expect(r.answer).toMatch(/^👥 Ingénieurs du CRM\n\nJ'ai trouvé \*\*118\*\* ingénieurs/);
      expect(r.answer).not.toContain("Voici les informations disponibles pour");
    }
  );

  test("…et le contact reste disponible ensuite : « quel est son téléphone ? » parle toujours de Zied Hmidi", async () => {
    const h = build(ADMIN);
    await ask(h, ADMIN, "Donne-moi des informations sur Zied Hmidi");
    await ask(h, ADMIN, "liste des ingénieurs");
    const r = await ask(h, ADMIN, "Quel est son téléphone ?");
    expect(r.answer).toContain("Téléphone de **Zied Hmidi**");
  });

  test.each([
    ["Give me the list of engineers", /^👥 CRM engineers\n\nI found \*\*118\*\* engineers/],
    ["Покажи список инженеров", /^👥 Инженеры CRM\n\nВ CRM найдено инженеров: \*\*118\*\*/],
  ])("même intention dans une autre langue — « %s »", async (message, expected) => {
    const h = build(ADMIN);
    await ask(h, ADMIN, "Donne-moi des informations sur Zied Hmidi");
    const r = await ask(h, ADMIN, message);
    expect(r.intent).toBe("engineers");
    expect(r.answer).toMatch(expected);
  });

  test("[PROBAR_ROUTER] : liste (target=null, source=crm), fiche, projets", async () => {
    process.env.AI_DEBUG_TRACE = "true";
    try {
      const h = build(ADMIN);
      const lines = [];
      h.manager.logger = { info: (l) => lines.push(l), warn() {} };
      await ask(h, ADMIN, "Donne-moi la liste des ingénieurs");
      await ask(h, ADMIN, "Donne-moi des informations sur l'ingénieur Zied Hmidi");
      await ask(h, ADMIN, "Quels sont les projets de Zied Hmidi ?");
      const traces = lines.filter((l) => l.startsWith("[PROBAR_ROUTER]"));
      expect(traces[0]).toContain("language=fr entity=engineer operation=list target=null source=crm ");
      expect(traces[1]).toContain('language=fr entity=engineer operation=details target="Zied Hmidi" source=crm_and_web ');
      expect(traces[2]).toContain('language=fr entity=engineer operation=projects target="Zied Hmidi" source=crm ');
    } finally {
      delete process.env.AI_DEBUG_TRACE;
    }
  });

  test("UUID du CRM : affiché uniquement en mode diagnostic", async () => {
    process.env.AI_DEBUG_TRACE = "true";
    try {
      const r = await ask(build(ADMIN), ADMIN, "Qui est Zied Hmidi ?");
      expect(r.answer).toContain(`- ID CRM : ${ZIED_ID}`);
    } finally {
      delete process.env.AI_DEBUG_TRACE;
    }
  });
});

describe("CRITÈRE DE FIN — « Donne-moi des informations sur Amin Mansour »", () => {
  const AMIN_ID = "88888888-8888-4888-8888-888888888888";
  const amin = () => engineerMatch({ id: AMIN_ID, name: "Amin Mansour", fields: { ...engineerMatch().fields, fullName: "Amin Mansour", company: "Mansour Ingénierie Conseil" } });
  const page = (title, snippet, url) => ({ title, url, snippet, source: new URL(url).hostname.replace(/^www\./, ""), publishedAt: null });
  const WEB = [
    page("Amin Mansour — Conseil", "Amin Mansour, ingénieur conseil, fondateur de Mansour Ingénierie Conseil à Tunis.", "https://www.linkedin.com/in/amin-mansour"),
    page("Ordre des ingénieurs", "Amin Mansour, ingénieur génie civil inscrit au tableau.", "https://www.ordre-ingenieurs.tn/annuaire/amin-mansour"),
    page("Amin Mansour, chanteur", "Amin Mansour sort un nouvel album.", "https://musique.example.com/amin-mansour"),
  ];

  beforeEach(() => {
    crm.findAnyEntity.mockResolvedValue(found([amin()]));
    crm.findEntity.mockResolvedValue(found([amin()]));
  });

  test.each([
    ["Donne-moi des informations sur Amin Mansour", /🔵 Données CRM · 🌐 Recherche Web · 🔗 Sources[\s\S]*👤 \*\*Amin Mansour\*\*[\s\S]*- Type : Ingénieur[\s\S]*### 🌐 Informations publiques[\s\S]*### 🔗 Sources Web/, '"Amin Mansour" ingénieur Tunisie'],
    ["Qui est Amin Mansour ?", /👤 \*\*Amin Mansour\*\*[\s\S]*### 🌐 Informations publiques/, '"Amin Mansour" ingénieur Tunisie'],
    ["Give me information about Amin Mansour", /🔵 CRM data · 🌐 Web search · 🔗 Sources[\s\S]*👤 \*\*Amin Mansour\*\*[\s\S]*### 🌐 Public information[\s\S]*### 🔗 Web sources/, '"Amin Mansour" engineer Tunisia'],
    ["Дайте информацию об Amin Mansour", /🔵 Данные CRM · 🌐 Поиск в интернете · 🔗 Источники[\s\S]*👤 \*\*Amin Mansour\*\*[\s\S]*### 🌐 Публичная информация[\s\S]*### 🔗 Источники/, '"Amin Mansour" инженер Тунис'],
  ])("« %s » → CRM + Web, deux blocs distincts, sources réelles, langue de la question", async (message, expected, firstQuery) => {
    const h = build(ADMIN, { webResults: WEB });
    const r = await ask(h, ADMIN, message);

    expect(r.intent).toBe("entity_lookup");
    expect(toolsOf(r)).toEqual(["find_crm_entity", "web_search"]);
    expect(r.answer).toMatch(expected);
    // Requêtes : nom + fonction + pays, puis nom + société du CRM. Rien d'autre.
    expect(h.provider.search.mock.calls.map((c) => c[0])).toEqual([firstQuery, '"Amin Mansour" "Mansour Ingénierie Conseil"']);
    expect(JSON.stringify(h.provider.search.mock.calls)).not.toMatch(/71 000 111|bureau\.tn|Holya/);
    // La page qui cite sa société d'abord, puis l'annuaire professionnel du
    // pays ; l'homonyme sans rapport (un chanteur) est écarté. Chaque URL
    // affichée est une URL renvoyée par le moteur.
    expect(r.citations.map((c) => c.path)).toEqual([WEB[0].url, WEB[1].url]);
    for (const url of r.answer.match(/https?:\/\/[^\s)]+/g)) expect(WEB.map((w) => w.url)).toContain(url);
    expect(r.answer).not.toMatch(/n'est pas encore configurée|not configured|ID CRM|CRM ID/);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("le moteur répond mais rien ne parle de lui → dit tel quel, pas « non configurée »", async () => {
    const h = build(ADMIN, { webResults: [page("Autre sujet", "Rien sur cette personne.", "https://example.org/x")] });
    const r = await ask(h, ADMIN, "Donne-moi des informations sur Amin Mansour");
    expect(r.answer).toContain("Je n'ai trouvé aucune information publique suffisamment fiable pour cette personne.");
    expect(r.answer).not.toMatch(/n'est pas encore configurée/);
    expect(r.citations).toEqual([]);
  });

  test("« Et ses projets ? » → ses projets (CRM seul) ; « Donne-moi la liste des ingénieurs » → la liste, sans reprendre Amin Mansour", async () => {
    engineerDirectory.listEngineers.mockResolvedValue({ items: [{ id: "e1", name: "Ahmed Ben Ali" }], total: 118, offset: 0, truncated: true });
    const h = build(ADMIN, { webResults: WEB });
    await ask(h, ADMIN, "Donne-moi des informations sur Amin Mansour");
    h.provider.search.mockClear();

    const projects = await ask(h, ADMIN, "Et ses projets ?");
    expect(projects.answer).toMatch(/^Amin Mansour — Projets associés \(2\)/);
    const list = await ask(h, ADMIN, "Donne-moi la liste des ingénieurs");
    expect(list).toMatchObject({ intent: "engineers", agent: "analytics_agent" });
    expect(list.answer).not.toContain("Amin Mansour");
    expect(h.provider.search).not.toHaveBeenCalled();
  });

  test("« dernières informations publiques sur CBI Tunisia » → Web seul", async () => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Quelles sont les dernières informations publiques sur CBI Tunisia ?");
    expect(toolsOf(r)).toEqual(["web_search"]);
    expect(crm.findAnyEntity).not.toHaveBeenCalled();
  });

  test("traces internes (AI_DEBUG_TRACE) : routeur, CRM, Web, identité, réponse — jamais dans la réponse", async () => {
    process.env.AI_DEBUG_TRACE = "true";
    const lines = [];
    const spies = ["log", "info"].map((m) => jest.spyOn(console, m).mockImplementation((...a) => lines.push(a.join(" "))));
    let r;
    try {
      r = await ask(build(ADMIN, { webResults: WEB }), ADMIN, "Donne-moi des informations sur Amin Mansour");
    } finally {
      spies.forEach((x) => x.mockRestore());
      delete process.env.AI_DEBUG_TRACE;
    }
    const log = lines.join("\n");
    expect(log).toContain('[PROBAR_ROUTER] language=fr entity=unknown operation=details target="Amin Mansour" source=crm_and_web');
    expect(log).toContain("[CRM_SEARCH] matched=true count=1 entity=engineer");
    expect(log).toContain("[WEB_SEARCH] provider=fake executed=true status=ok results=2");
    expect(log).toMatch(/\[IDENTITY_MATCH\] confidence=0\.\d\d level=confirmed/);
    expect(log).toContain("[RESPONSE_BUILDER] crm=true web=true sources=2 synthesis=false");
    expect(r.answer).not.toMatch(/\[CRM_SEARCH\]|\[WEB_SEARCH\]|\[IDENTITY_MATCH\]|\[PROBAR_ROUTER\]/);
    // Administrateur + diagnostic : l'identifiant technique est visible…
    expect(r.answer).toContain(`- ID CRM : ${AMIN_ID}`);
  });

  test("…mais jamais pour un autre rôle, même en mode diagnostic", async () => {
    process.env.AI_DEBUG_TRACE = "true";
    try {
      const r = await ask(build(COMMERCIAL, { webResults: WEB }), COMMERCIAL, "Qui est Amin Mansour ?");
      expect(r.answer).not.toMatch(/ID CRM|88888888/);
    } finally {
      delete process.env.AI_DEBUG_TRACE;
    }
  });
});

describe("mise en forme et synthèse ancrée", () => {
  test("en-tête, bloc CRM, bloc public et sources distincts ; champ vide du CRM laissé tel quel même si le Web en parle", async () => {
    crm.findAnyEntity.mockResolvedValue(found([engineerMatch({ name: "Amin Mansour", fields: { ...engineerMatch().fields, fullName: "Amin Mansour", company: null }, projects: { total: 0, items: [], truncated: false } })]));
    const h = build(ADMIN, { webResults: [{ title: "Amin Mansour | LinkedIn", url: "https://www.linkedin.com/in/amin-mansour", snippet: "Amin Mansour, ingénieur chez Batipro, Tunis.", source: "linkedin.com" }] });
    const r = await ask(h, ADMIN, "Donne-moi des informations sur Amin Mansour");

    expect(r.answer).toMatch(/^🔵 Données CRM · 🌐 Recherche Web · 🔗 Sources\n\n👤 \*\*Amin Mansour\*\*\nIngénieur\n\n### 🏢 Informations CRM\n_Source : données internes du CRM_/);
    const [crmPart, rest] = r.answer.split("### 🌐 Informations publiques");
    const [publicPart, sourcesPart] = rest.split("### 🔗 Sources Web");
    // Le CRM dit ce qu'il sait — « Non renseigné » reste « Non renseigné ».
    expect(crmPart).toContain("- Société (d'après ses projets) : Non renseigné");
    expect(crmPart).toContain("Projets associés (0) : Aucun");
    expect(crmPart).not.toContain("Batipro");
    // Le Web complète, dans son propre bloc, avec sa source.
    expect(publicPart).toContain("Les recherches publiques disponibles indiquent :");
    expect(publicPart).toMatch(/Selon \[Amin Mansour \\\| LinkedIn\]\(https:\/\/www\.linkedin\.com\/in\/amin-mansour\) \[1\] : « Amin Mansour, ingénieur chez Batipro, Tunis\. »/);
    expect(sourcesPart).toMatch(/1\. \[Amin Mansour \\\| LinkedIn\]\(https:\/\/www\.linkedin\.com\/in\/amin-mansour\) — LinkedIn \(linkedin\.com\)/);
  });

  test.each([
    ["une société absente des sources", "Zakariah Derbel travaille chez Bouygues Construction [1]."],
    ["une date absente des sources", "Zakariah Derbel est ingénieur structure depuis 2012 [1]."],
  ])("synthèse rejetée (%s) → extraits cités tels quels", async (_label, llmReply) => {
    const r = await ask(build(ADMIN, { webSynthesis: true, llmReply }), ADMIN, "Qui est Zakariah Derbel ?");
    expect(r.answer).not.toMatch(/Bouygues|2012|\*\*Synthèse\*\*/);
    expect(r.answer).toContain("- Selon [Zakariah Derbel - Ingénieur structure");
  });
});

describe("réglages issus de vrais résultats du moteur", () => {
  const page = (title, snippet, url) => ({ title, url, snippet, source: new URL(url).hostname.replace(/^www\./, ""), publishedAt: null });

  test("homonymes approchés et pages d'annuaire écartés : « Mansouri », « 60+ profiles »", async () => {
    crm.findAnyEntity.mockResolvedValue(found([engineerMatch({ name: "Amin Mansour", fields: { ...engineerMatch().fields, fullName: "Amin Mansour", company: null } })]));
    const h = build(ADMIN, {
      webResults: [
        page('60+ "Amin Mansour" profiles', "View the profiles of professionals named Amin Mansour.", "https://www.linkedin.com/pub/dir/Amin/Mansour"),
        page("Amin Mansouri's Homepage", "Amin Mansouri is a researcher.", "https://sites.google.com/view/amin-mansouri"),
        page("Amin Mansour - MEP engineer", "Amin Mansour, engineer.", "https://www.linkedin.com/in/amin-mansour"),
      ],
    });
    const r = await ask(h, ADMIN, "Qui est Amin Mansour ?");
    expect(r.citations.map((c) => c.path)).toEqual(["https://www.linkedin.com/in/amin-mansour"]);
  });

  test("« Recherche sur le Web : CBI Tunisia » → Web seul ; une autre organisation « CBI » qui parle de la Tunisie est écartée", async () => {
    const h = build(ADMIN, {
      webResults: [
        page("CBI Tunisia - Leader in Fiberglass Rebar Innovation", "CBI Tunisia manufactures fiberglass rebar.", "https://cbi-tunisia.com"),
        page("Tunisia circular apparel | CBI", "CBI supports exporters in Tunisia.", "https://www.cbi.eu/projects/tunisia-circular-apparel"),
      ],
    });
    const r = await ask(h, ADMIN, "Recherche sur le Web : CBI Tunisia");
    expect(r.intent).toBe("entity_lookup");
    expect(toolsOf(r)).toEqual(["web_search"]);
    expect(crm.findAnyEntity).not.toHaveBeenCalled();
    expect(h.provider.search.mock.calls[0][0]).toBe('"CBI Tunisia"');
    expect(r.citations.map((c) => c.path)).toEqual(["https://cbi-tunisia.com"]);
    expect(r.answer).toMatch(/^🌐 \*\*CBI Tunisia\*\*[\s\S]*### 🌐 Informations publiques[\s\S]*### 🔗 Sources Web\n1\. \[CBI Tunisia - Leader in Fiberglass Rebar Innovation\]\(https:\/\/cbi-tunisia\.com\) — Site officiel/);
  });

  test("les quatre situations du Web ne sont jamais confondues", async () => {
    const answerOf = async (options) => (await ask(build(ADMIN, options), ADMIN, "Qui est Zakariah Derbel ?")).answer;
    const notConfigured = await answerOf({ webConfigured: false });
    const failed = await answerOf({ webError: new Error("tavily a répondu HTTP 401") });
    const empty = await answerOf({ webResults: [] });
    const ok = await answerOf({});

    expect(notConfigured).toContain("n'est pas encore configurée");
    expect(failed).toContain("temporairement indisponible");
    expect(failed).not.toContain("n'est pas encore configurée");
    expect(empty).toContain("Je n'ai trouvé aucune information publique suffisamment fiable pour cette personne.");
    expect(empty).not.toMatch(/n'est pas encore configurée|temporairement indisponible/);
    expect(ok).toContain("### 🔗 Sources Web");
    expect(ok).not.toMatch(/n'est pas encore configurée|temporairement indisponible|aucune information publique/);
  });
});

describe("homonymes : constaté sur de vrais résultats", () => {
  const page = (title, snippet, url) => ({ title, url, snippet, source: new URL(url).hostname.replace(/^www\./, ""), publishedAt: null });
  const HOMONYMS = [
    page("Amine MALLEK - Ingénieur chargé d'affaires ICPE", "# Amine Mallek Headline: Ingénieur chargé d'affaires ICPE chez KALIÈS Location: Mouvaux, Hauts-de-France, France Experience: 8 years.", "https://fr.linkedin.com/in/amine-mallek-b1639312a"),
    page("Amine Mallek - Financial Services", "Amine Mallek Headline: Mastercard | McGill Location: Greater Toronto Area, Canada.", "https://ca.linkedin.com/in/amine-mallek"),
  ];

  test("un ingénieur du même nom dans un autre pays n'est pas « probable » : mise en garde, liens seuls, aucun détail attribué", async () => {
    crm.findAnyEntity.mockResolvedValue(found([engineerMatch({ name: "Amine Mallek", fields: { ...engineerMatch().fields, fullName: "Amine Mallek", company: "GTU" } })]));
    const h = build(ADMIN, { webResults: HOMONYMS });
    const r = await ask(h, ADMIN, "Donne-moi des informations sur Amine Mallek");

    expect(r.answer).toContain("J'ai trouvé des informations publiques correspondant au nom Amine Mallek, mais je ne peux pas confirmer qu'elles correspondent à la même personne que celle enregistrée dans le CRM.");
    expect(r.answer).toContain("### 🔗 Pages publiques portant ce nom (identité non vérifiée)");
    expect(r.answer).toMatch(/1\. \[Amine MALLEK - Ingénieur chargé d'affaires ICPE\]\(https:\/\/fr\.linkedin\.com\/in\/amine-mallek-b1639312a\)/);
    // Rien du contenu de ces pages n'est repris.
    expect(r.answer).not.toMatch(/KALIÈS|Mouvaux|Mastercard|Toronto|Selon \[/);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("extraits nettoyés et coupés ; métier ET pays concordants → « probable », extraits cités avec réserve", async () => {
    crm.findAnyEntity.mockResolvedValue(found([engineerMatch({ name: "Amine Mallek", fields: { ...engineerMatch().fields, fullName: "Amine Mallek", company: "GTU" } })]));
    const long = `# Amine Mallek ## Ingénieur génie civil à Sfax, Tunisie. ${"Détail du parcours. ".repeat(40)}`;
    const r = await ask(build(ADMIN, { webResults: [page("Amine Mallek", long, "https://annuaire-btp.example.tn/amine-mallek")] }), ADMIN, "Qui est Amine Mallek ?");
    expect(r.answer).toContain("rien ne permet toutefois de confirmer avec certitude");
    const extract = r.answer.match(/« (.*) »/)[1];
    expect(extract.length).toBeLessThanOrEqual(285);
    expect(extract).not.toMatch(/#/);
    expect(extract.endsWith("…")).toBe(true);
  });
});

describe("promoteurs : la LISTE n'est pas « le promoteur de quel projet ? »", () => {
  const PROMOTERS = { items: [{ name: "Immobilière du Lac", projects: 3 }, { name: "Ste immo Gardi", projects: 1 }], total: 2, offset: 0, truncated: false, scope: "all" };
  const PAGE = { screen: "project", entity: "project", recordId: PROJECT_ID, label: "Résidence Holya" };

  beforeEach(() => {
    crm.listPromoters.mockResolvedValue(PROMOTERS);
    crm.findPromoterProjects.mockResolvedValue({ name: "Alpha", matchType: "exact", scope: "all", matches: [{ name: "Alpha Immobilier", projects: { total: 2, items: [{ id: "p1", name: "Résidence Holya", statut: "En cours", archived: false }, { id: "p2", name: "Tour Lac", statut: "Livraison", archived: true }] } }] });
  });

  test.each([
    "donner moi les listes des promoteurs dans le crm",
    "tous les promoteurs",
    "liste des promoteurs",
    "affiche les promoteurs",
    "quels sont les promoteurs ?",
    "je veux voir tous les promoteurs",
    "promoteurs",
  ])("TESTS 1-3 — « %s » → promoter.list : la liste, jamais une question sur un projet", async (message) => {
    const h = build(ADMIN);
    // Même avec une fiche projet ouverte : la liste reste une liste.
    const r = await ask(h, ADMIN, message, { pageContext: PAGE });
    expect(r).toMatchObject({ intent: "entity_lookup", agent: "entity_lookup_agent", mode: "agent" });
    expect(toolsOf(r)).toEqual(["list_promoters"]);
    expect(crm.listPromoters).toHaveBeenCalledWith(expect.objectContaining({ operation: "list", limit: 20, offset: 0 }), ADMIN_SCOPE);
    expect(crm.findProjectPromoter).not.toHaveBeenCalled();
    expect(r.answer).toMatch(/^🏢 Promoteurs du CRM\n\nJ'ai trouvé \*\*2\*\* promoteurs dans le CRM :\n\n1\. \*\*Immobilière du Lac\*\* — 3 projets\n2\. \*\*Ste immo Gardi\*\* — 1 projet/);
    expect(r.answer).not.toMatch(/De quel projet/);
    expect(h.provider.search).not.toHaveBeenCalled();
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test.each([
    ["list all developers", /^🏢 CRM developers\n\nI found \*\*2\*\* developers in the CRM:/],
    ["show me all promoters", /^🏢 CRM developers/],
    ["give me the list of developers", /^🏢 CRM developers/],
    ["покажи список застройщиков", /^🏢 Застройщики в CRM\n\nВ CRM найдено застройщиков: \*\*2\*\*/],
    ["все застройщики", /^🏢 Застройщики в CRM/],
  ])("TESTS 6-7 — « %s » → promoter.list dans la langue de la question", async (message, expected) => {
    const r = await ask(build(ADMIN), ADMIN, message);
    expect(toolsOf(r)).toEqual(["list_promoters"]);
    expect(r.answer).toMatch(expected);
  });

  test("TEST 4 — « Qui est le promoteur du projet Alpha ? » → promoteur DE CE projet (inchangé)", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Qui est le promoteur du projet Alpha ?");
    expect(crm.findProjectPromoter).toHaveBeenCalledWith(expect.objectContaining({ projectName: "Alpha" }), ADMIN_SCOPE);
    expect(crm.listPromoters).not.toHaveBeenCalled();
    expect(r.answer).toMatch(/le promoteur du projet \*\*Résidence Holya\*\* est \*\*Immobilière du Lac\*\*/);
  });

  test("« Quel est le promoteur de ce projet ? » sans projet connu → la clarification reste réservée à ce cas", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Quel est le promoteur de ce projet ?");
    expect(r.answer).toMatch(/De quel projet souhaitez-vous connaître le promoteur/);
    expect(r.toolCalls).toEqual([]);
  });

  test("TEST 5 — « Donne-moi les projets du promoteur Alpha » → promoter.projects", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Donne-moi les projets du promoteur Alpha");
    expect(toolsOf(r)).toEqual(["list_promoters"]);
    expect(crm.findPromoterProjects).toHaveBeenCalledWith(expect.objectContaining({ operation: "projects", name: "Alpha" }), ADMIN_SCOPE);
    expect(r.answer).toMatch(/🏢 Selon les données internes du CRM, le promoteur \*\*Alpha Immobilier\*\* a \*\*2\*\* projets :\n\n- 📁 Résidence Holya — En cours\n- 📁 Tour Lac — Livraison, archivé/);
  });

  test("promoteur inconnu ou ambigu → dit tel quel, aucun choix arbitraire", async () => {
    crm.findPromoterProjects.mockResolvedValue({ name: "Alpha", matchType: null, scope: "all", matches: [] });
    expect((await ask(build(ADMIN), ADMIN, "Donne-moi les projets du promoteur Alpha")).answer).toBe("Je ne trouve aucun promoteur nommé « Alpha » dans les données CRM accessibles avec votre rôle.");
    crm.findPromoterProjects.mockResolvedValue({ name: "Alpha", matchType: "tokens", scope: "all", matches: [{ name: "Alpha Immobilier" }, { name: "Alpha Promotion" }] });
    expect((await ask(build(ADMIN), ADMIN, "Donne-moi les projets du promoteur Alpha")).answer).toMatch(/2 promoteurs correspondent à « Alpha »\. Lequel souhaitez-vous consulter \?\n\n1\. \*\*Alpha Immobilier\*\*\n2\. \*\*Alpha Promotion\*\*/);
  });

  test("contexte : après « promoteur du projet Alpha », « Tous les promoteurs » est une NOUVELLE demande", async () => {
    const h = build(ADMIN);
    await ask(h, ADMIN, "Qui est le promoteur du projet Alpha ?");
    crm.findProjectPromoter.mockClear();
    const r = await ask(h, ADMIN, "Tous les promoteurs");
    expect(toolsOf(r)).toEqual(["list_promoters"]);
    expect(crm.findProjectPromoter).not.toHaveBeenCalled();
    expect(r.answer).toMatch(/^🏢 Promoteurs du CRM/);
  });

  test("aucun promoteur accessible ; périmètre d'un non-administrateur", async () => {
    crm.listPromoters.mockResolvedValue({ items: [], total: 0, offset: 0, truncated: false, scope: "mine" });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "liste des promoteurs");
    expect(crm.listPromoters).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: COMMERCIAL.id }));
    expect(r.answer).toContain("Je n'ai trouvé aucun promoteur dans les données CRM accessibles avec votre rôle.");
  });

  test("pagination : 20 par page, « Afficher les suivants » continue la numérotation", async () => {
    const page = (offset, n) => ({ items: Array.from({ length: n }, (_, i) => ({ name: `Promoteur ${offset + i + 1}`, projects: 1 })), total: 48, offset, truncated: offset + n < 48, scope: "all" });
    crm.listPromoters.mockImplementation(async ({ offset = 0 }) => page(offset, Math.min(20, 48 - offset)));
    const h = build(ADMIN);

    const first = await ask(h, ADMIN, "liste des promoteurs");
    expect(first.answer).toContain("20. **Promoteur 20** — 1 projet");
    expect(first.answer).not.toContain("Promoteur 21");
    expect(first.answer).toContain("Affichage 1–20 sur 48.");
    expect(first.suggestions.map((x) => x.label)).toContain("Afficher les suivants");

    const second = await ask(h, ADMIN, "Afficher les suivants");
    expect(second.intent).toBe("entity_lookup");
    expect(crm.listPromoters).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 }), ADMIN_SCOPE);
    expect(second.answer).toContain("21. **Promoteur 21**");
    expect(second.answer).toContain("Affichage 21–40 sur 48.");

    const third = await ask(h, ADMIN, "suivants");
    expect(third.answer).toContain("48. **Promoteur 48**");
    expect(third.answer).toContain("Affichage 41–48 sur 48.");
    expect(third.suggestions.map((x) => x.label)).not.toContain("Afficher les suivants");
  });

  test("les listes restent distinctes : projets, ingénieurs, promoteurs", async () => {
    const h = build(ADMIN);
    expect((await ask(h, ADMIN, "liste des ingénieurs")).intent).toBe("engineers");
    expect((await ask(h, ADMIN, "liste des projets")).intent).not.toBe("entity_lookup");
    expect(crm.listPromoters).not.toHaveBeenCalled();
  });

  test("[PROBAR_ROUTER] : entity=promoter operation=list target=null source=crm", async () => {
    process.env.AI_DEBUG_TRACE = "true";
    try {
      const h = build(ADMIN);
      const lines = [];
      h.manager.logger = { info: (l) => lines.push(l), warn() {} };
      await ask(h, ADMIN, "tous les promoteurs");
      expect(lines.find((l) => l.startsWith("[PROBAR_ROUTER]"))).toContain("language=fr entity=promoter operation=list target=null source=crm ");
    } finally {
      delete process.env.AI_DEBUG_TRACE;
    }
  });
});

describe("listes CRM unifiées : « liste des X » → X.list, sans clarification", () => {
  const COMPANIES = { items: [{ id: "c1", name: "Batipro", projects: 3 }, { id: "c2", name: "CBI Tunisia", projects: 0 }], total: 2, offset: 0, truncated: false, scope: "all" };
  const MACHINES = [
    { id: "m1", code: "PROBAR-01", nom: "Machine PROBAR 1", typeMachine: "PROBAR", numero: 1, statut: "ACTIVE" },
    { id: "m2", code: "PROMESH-01", nom: "Machine PROMESH 1", typeMachine: "PROMESH", numero: 1, statut: "INACTIVE" },
  ];

  beforeEach(() => {
    crm.listCompanies.mockResolvedValue(COMPANIES);
    crm.listPromoters.mockResolvedValue({ items: [{ name: "Immobilière du Lac", projects: 3 }], total: 1, offset: 0, truncated: false, scope: "all" });
    machineService.listMachines.mockResolvedValue(MACHINES);
    engineerDirectory.listEngineers.mockResolvedValue({ items: [{ id: "e1", name: "Amin Mansour" }], total: 118, offset: 0, truncated: true });
  });

  test.each([
    "donner moi liste des sociétés dans crm",
    "donner moi liste des company dans crm",
    "liste des sociétés",
    "liste des entreprises",
    "liste des company",
    "liste des companies",
    "donne-moi les sociétés",
    "donne-moi les entreprises",
    "sociétés",
  ])("company.list — « %s »", async (message) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(r).toMatchObject({ intent: "entity_lookup", agent: "entity_lookup_agent", mode: "agent" });
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(crm.listCompanies).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }), ADMIN_SCOPE);
    expect(r.answer).toMatch(/^🏢 Sociétés du CRM\n\nJ'ai trouvé \*\*2\*\* sociétés dans le CRM :\n\n1\. Batipro\n2\. CBI Tunisia\n/);
    expect(r.answer).not.toMatch(/préciser/);
    expect(h.provider.search).not.toHaveBeenCalled();
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test.each([
    ["show me the companies", /^🏢 CRM companies\n\nI found \*\*2\*\* companies in the CRM:/],
    ["list companies", /^🏢 CRM companies/],
    ["give me all companies", /^🏢 CRM companies/],
    ["list all companies", /^🏢 CRM companies/],
    ["покажи список компаний", /^🏢 Компании в CRM\n\nВ CRM найдено компаний: \*\*2\*\*/],
  ])("company.list — « %s » dans la langue de la question", async (message, expected) => {
    const r = await ask(build(ADMIN), ADMIN, message);
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(r.answer).toMatch(expected);
  });

  test.each([
    ["liste des machines", /^⚙️ Machines du CRM\n\nJ'ai trouvé \*\*2\*\* machines[\s\S]*\| PROBAR-01 \| Machine PROBAR 1 \| PROBAR \| Active \|\n\| PROMESH-01 \| Machine PROMESH 1 \| PROMESH \| Inactive \|/],
    ["toutes les machines", /^⚙️ Machines du CRM/],
    ["donne-moi les machines", /^⚙️ Machines du CRM/],
    ["show me the machines", /^⚙️ CRM machines\n\nI found \*\*2\*\* machines/],
  ])("machine.list — « %s »", async (message, expected) => {
    const r = await ask(build(COMMERCIAL), COMMERCIAL, message); // liste ouverte à tout utilisateur connecté, comme GET /machines
    expect(toolsOf(r)).toEqual(["list_machines"]);
    expect(r.answer).toMatch(expected);
  });

  test.each([
    ["tous les promoteurs", "entity_lookup", "list_promoters"],
    ["tous les ingénieurs", "engineers", "list_engineers"],
    ["liste des ingénieurs", "engineers", "list_engineers"],
  ])("« %s » → %s via %s", async (message, intent, tool) => {
    const r = await ask(build(ADMIN), ADMIN, message);
    expect(r.intent).toBe(intent);
    expect(toolsOf(r)).toEqual([tool]);
  });

  test.each([
    ["liste des projets", "projects", "project_agent"],
    ["tous les projets", "projects", "project_agent"],
    ["list all projects", "projects", "project_agent"],
    ["покажи все проекты", "projects", "project_agent"],
    ["liste des contacts", "commercial_contacts", "commercial_agent"],
    ["affiche les contacts", "commercial_contacts", "commercial_agent"],
    ["show me all contacts", "commercial_contacts", "commercial_agent"],
    ["liste des demandes RH", "hr", "hr_agent"],
    ["toutes les demandes RH", "hr", "hr_agent"],
    ["list all HR requests", "hr", "hr_agent"],
    ["liste des demandes de maintenance", "maintenance", "maintenance_agent"],
    ["mes demandes de maintenance", "maintenance", "maintenance_agent"],
    ["list maintenance requests", "maintenance", "maintenance_agent"],
  ])("« %s » → %s, confié à l'Agent existant (%s), sans clarification", async (message, intent, agent) => {
    const r = await ask(build(ADMIN), ADMIN, message);
    expect(r).toMatchObject({ intent, agent, mode: "agent" });
    expect(crm.listCompanies).not.toHaveBeenCalled();
  });

  test("LIST et DETAILS restent séparés", async () => {
    crm.findAnyEntity.mockResolvedValue(found([companyMatch()]));
    const h = build(ADMIN);
    const details = await ask(h, ADMIN, "donne-moi des informations sur CBI Tunisia");
    expect(toolsOf(details)).toEqual(["find_crm_entity", "web_search"]);
    expect(details.answer).toContain("🏢 **CBI Tunisia**");
    const list = await ask(h, ADMIN, "liste des sociétés");
    expect(toolsOf(list)).toEqual(["list_companies"]);
    const promoter = await ask(h, ADMIN, "qui est le promoteur du projet Alpha ?");
    expect(crm.findProjectPromoter).toHaveBeenCalled();
    expect(promoter.answer).toMatch(/promoteur du projet/);
  });

  test("nouvelle demande : après la fiche d'Amin Mansour, « liste des sociétés » abandonne ce contexte", async () => {
    crm.findAnyEntity.mockResolvedValue(found([engineerMatch({ name: "Amin Mansour" })]));
    const h = build(ADMIN);
    await ask(h, ADMIN, "Donne-moi des informations sur Amin Mansour");
    crm.findEntity.mockClear();
    const r = await ask(h, ADMIN, "liste des sociétés");
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(crm.findEntity).not.toHaveBeenCalled();
    expect(r.answer).not.toContain("Amin Mansour");
  });

  test("pagination des sociétés : 20 par page, « Afficher les suivants »", async () => {
    const page = (offset, n) => ({ items: Array.from({ length: n }, (_, i) => ({ id: `c${offset + i}`, name: `Société ${offset + i + 1}`, projects: 1 })), total: 85, offset, truncated: offset + n < 85, scope: "all" });
    crm.listCompanies.mockImplementation(async ({ offset = 0 }) => page(offset, Math.min(20, 85 - offset)));
    const h = build(ADMIN);
    const first = await ask(h, ADMIN, "liste des sociétés");
    expect(first.answer).toContain("20. Société 20\n");
    expect(first.answer).not.toMatch(/aucun projet|— \d+ projet/);
    expect(first.answer).toContain("Affichage 1–20 sur 85.");
    expect(first.suggestions.map((x) => x.label)).toContain("Afficher les suivants");
    const second = await ask(h, ADMIN, "Afficher les suivants");
    expect(crm.listCompanies).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 }), ADMIN_SCOPE);
    expect(second.answer).toContain("21. Société 21");
    expect(second.answer).toContain("Affichage 21–40 sur 85.");
  });

  test("périmètre : le nombre de projets d'un non-administrateur est limité aux siens", async () => {
    crm.listCompanies.mockResolvedValue({ ...COMPANIES, scope: "mine" });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "liste des sociétés");
    expect(crm.listCompanies).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: COMMERCIAL.id }));
    // Liste simple : aucun nombre de projets n'est affiché, donc aucune mention de périmètre.
    expect(r.answer).not.toMatch(/aucun projet|vos projets uniquement/);
  });

  test("ce qui n'est PAS une liste simple garde son routage (filtre, nom, comptage, création)", async () => {
    const h = build(ADMIN);
    for (const message of ["liste des projets en retard", "Combien de machines avons-nous ?", "Comment créer une société ?"]) {
      const r = await ask(h, ADMIN, message);
      expect(toolsOf(r)).not.toContain("list_companies");
      expect(toolsOf(r)).not.toContain("list_machines");
    }
  });

  test("traces [PROBAR_INTENT] / [PROBAR_TOOL] / [PROBAR_RESULT] — journal du serveur uniquement", async () => {
    process.env.AI_DEBUG_TRACE = "true";
    try {
      const h = build(ADMIN);
      const lines = [];
      h.manager.logger = { info: (l) => lines.push(l), warn() {} };
      const r = await ask(h, ADMIN, "donner moi liste des sociétés dans crm");
      expect(lines).toContain("[PROBAR_INTENT] language=fr entity=company operation=list target=null source=crm");
      expect(lines).toContain("[PROBAR_TOOL] tool=list_companies");
      expect(lines).toContain("[PROBAR_RESULT] count=2");
      expect(r.answer).not.toMatch(/PROBAR_INTENT|PROBAR_TOOL|PROBAR_RESULT/);
    } finally {
      delete process.env.AI_DEBUG_TRACE;
    }
  });
});

describe("ingénieurs et sociétés : périmètre, relations, formulations (correctif)", () => {
  const { correctEntityTypos } = require("../src/ai/routing/entityNormalizer");
  const COMPANIES = { items: [{ id: "c1", name: "Batipro", projects: 3 }, { id: "c2", name: "CBI Tunisia", projects: 0 }], total: 2, offset: 0, truncated: false, scope: "all" };
  const hidden = (n, extra = {}) => engineerMatch({ fields: { ...engineerMatch().fields, phone: null, email: null, company: null }, restricted: ["phone", "email", "company"], projects: { total: 0, items: [], truncated: false, outOfScope: n }, ...extra });

  beforeEach(() => crm.listCompanies.mockResolvedValue(COMPANIES));

  test.each([
    "Donne-moi la liste des sociétés",
    "Donne-moi la liste des companies",
    "Liste toutes les companies",
    "Affiche les entreprises enregistrées dans le CRM",
    "Show me all companies",
    "Show me all registered companies",
    "Покажи список компаний",
    "liste des socités",
    "donne moi la liste des sociétées",
  ])("« %s » → liste des sociétés, sans clarification", async (message) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(r.mode).toBe("agent");
    expect(r.answer).toContain("Batipro");
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("liste des sociétés vide : dit tel quel", async () => {
    crm.listCompanies.mockResolvedValue({ items: [], total: 0, offset: 0, truncated: false, scope: "mine" });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "Donne-moi la liste des sociétés");
    expect(r.answer).toContain("Je n'ai trouvé aucune société dans les données CRM accessibles avec votre rôle.");
  });

  test("faute de frappe corrigée sur le mot d'entité seulement, jamais sur un nom propre", () => {
    expect(correctEntityTypos("liste des socités")).toBe("liste des societes");
    expect(correctEntityTypos("les projets de Societa Engineering")).toBe("les projets de Societa Engineering");
    expect(correctEntityTypos("Qui est Zakariah Derbel ?")).toBe("Qui est Zakariah Derbel ?");
  });

  test("ingénieur dont les projets sont hors du périmètre : ni « 0 projet » ni « Non renseigné »", async () => {
    crm.findEntity.mockResolvedValue({ ...found([hidden(4)]), scope: "mine" });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(r.answer).toContain("- Société (d'après ses projets) : Non accessible avec votre rôle");
    expect(r.answer).toContain("- Projets associés (0) (dans votre périmètre) : Aucun dans votre périmètre");
    expect(r.answer).toContain("🔒 4 autres projets associés hors de votre périmètre — non accessibles avec votre rôle");
    expect(r.answer).not.toContain("Société (d'après ses projets) : Non renseigné");
  });

  test("ingénieur réellement sans projet ni société : information absente, dite comme telle", async () => {
    crm.findEntity.mockResolvedValue(found([engineerMatch({ fields: { ...engineerMatch().fields, company: null }, projects: { total: 0, items: [], truncated: false, outOfScope: 0 } })]));
    const r = await ask(build(ADMIN), ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(r.answer).toContain("- Société (d'après ses projets) : Non renseigné");
    expect(r.answer).toContain("- Projets associés (0) : Aucun");
    expect(r.answer).not.toContain("hors de votre périmètre");
  });

  test("bureau d'études affiché seulement s'il est renseigné sur ses projets", async () => {
    crm.findEntity.mockResolvedValue(found([engineerMatch({ fields: { ...engineerMatch().fields, designOffice: "Sigma Conseil" } })]));
    const withOffice = await ask(build(ADMIN), ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(withOffice.answer).toContain("- Bureau d'études (d'après ses projets) : Sigma Conseil");
    crm.findEntity.mockResolvedValue(found([engineerMatch()]));
    const without = await ask(build(ADMIN), ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(without.answer).not.toContain("Bureau d'études");
  });

  test("« Quels projets sont associés à cet ingénieur ? » après sa fiche : ses projets, pas un utilisateur nommé « cet ingénieur »", async () => {
    crm.findEntity.mockResolvedValue(found([engineerMatch()]));
    const h = build(ADMIN);
    await ask(h, ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    const r = await ask(h, ADMIN, "Quels projets sont associés à cet ingénieur ?");
    expect(r.agent).toBe("entity_lookup_agent");
    expect(crm.findEntity).toHaveBeenLastCalledWith("engineer", expect.objectContaining({ name: ENGINEER_ID }), expect.anything());
    expect(r.answer).toContain("Zakariah Derbel — Projets associés (2) :");
    expect(r.answer).toContain("📁 Résidence Holya — En cours");
    expect(r.answer).toContain("📁 Tour Lac — Livraison");
  });

  test.each(["Which projects are linked to this engineer?", "Какие проекты у этого инженера?"])("même question de suivi — « %s »", async (message) => {
    crm.findEntity.mockResolvedValue(found([engineerMatch()]));
    const h = build(ADMIN);
    await ask(h, ADMIN, "Give me information about engineer Zakariah Derbel");
    const r = await ask(h, ADMIN, message);
    expect(r.agent).toBe("entity_lookup_agent");
    expect(r.answer).toContain("Résidence Holya");
  });

  test("« cet ingénieur » sans ingénieur en cours : on demande lequel, aucun outil appelé", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Quels projets sont associés à cet ingénieur ?");
    expect(r.answer).toBe("De quel ingénieur parlez-vous ? Indiquez son nom.");
    expect(r.toolCalls).toEqual([]);
  });

  test("société ayant plusieurs projets : projets et ingénieurs associés, Web distinct du CRM", async () => {
    const company = { entityType: "company", id: "c1", name: "CBI Tunisia", matchType: "exact", restricted: [], activity: null, fields: { fullName: "CBI Tunisia", contactType: "company", engineers: "Zakariah Derbel, Amin Mansour", createdAt: null, updatedAt: null }, projects: { total: 3, truncated: false, outOfScope: 0, items: [{ id: "p1", name: "Résidence Holya", statut: "En cours", archived: false }, { id: "p2", name: "Tour Lac", statut: "Livraison", archived: false }, { id: "p3", name: "Dépôt Sfax", statut: "Terminé", archived: true }] } };
    crm.findEntity.mockResolvedValue(found([company]));
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Donne-moi les informations sur la société CBI Tunisia");
    expect(crm.findEntity).toHaveBeenCalledWith("company", expect.objectContaining({ name: "CBI Tunisia" }), expect.anything());
    expect(r.answer).toContain("- Ingénieurs associés (d'après ses projets) : Zakariah Derbel, Amin Mansour");
    expect(r.answer).toContain("- Projets associés (3) :");
    expect(r.answer).toContain("📁 Dépôt Sfax — Terminé, archivé");
    // Les deux sources restent séparées et nommées.
    expect(r.answer).toContain("_Source : données internes du CRM_");
    expect(r.answer).toContain("🌐 Recherche Web");
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations.every((c) => c.sourceType === "web" && /^https:\/\//.test(c.path))).toBe(true);

    const projects = await ask(h, ADMIN, "Quels sont les projets de cette société ?");
    expect(projects.answer).toContain("CBI Tunisia — Projets associés (3) :");
  });

  test("« les projets de la société X » : la société, pas un ingénieur", async () => {
    crm.findEntity.mockResolvedValue(found([{ entityType: "company", id: "c1", name: "Batipro", matchType: "exact", restricted: [], activity: null, fields: { fullName: "Batipro", contactType: "company" }, projects: PROJECTS }]));
    const r = await ask(build(ADMIN), ADMIN, "Donne-moi les projets de la société Batipro");
    expect(crm.findEntity).toHaveBeenCalledWith("company", expect.objectContaining({ name: "Batipro" }), expect.anything());
    expect(r.answer).toContain("Batipro — Projets associés (2) :");
  });

  test("ingénieur introuvable : résultat vide dit tel quel, aucune fiche inventée", async () => {
    crm.findEntity.mockResolvedValue(NOT_FOUND);
    const r = await ask(build(ADMIN, { webResults: [] }), ADMIN, "Qui est l'ingénieur Inconnu Total ?");
    expect(r.answer).toContain("nommé « Inconnu Total » n'a été trouvé dans les données du CRM auxquelles vous avez accès.");
    expect(r.answer).not.toContain("Projets associés");
  });

  test("refus du serveur d'outils (rôle non autorisé) : dit comme un refus, pas comme une absence", async () => {
    // Outil réservé aux administrateurs : le refus vient du serveur d'outils
    // (PermissionManager), avant toute lecture du CRM.
    const registry = new ToolRegistry();
    const restricted = createFindCrmEntityTool();
    restricted.requiredRoles = ["admin"];
    registry.register(restricted);
    const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
    const agent = createEntityLookupAgent({ chatModel: {}, tools: createMcpToolAdapters({ mcpServer: server, actingUser: COMMERCIAL }), workflowEngine: new LangChainWorkflowEngine(), queryRouter: new QueryRouter() });
    const r = await agent.execute({ intent: { name: "entity_lookup" }, message: "Qui est l'ingénieur Zakariah Derbel ?", user: COMMERCIAL, conversationId: null });
    expect(r.answer).toBe("Vous n'avez pas l'autorisation de consulter cette information dans le CRM.");
    expect(crm.findEntity).not.toHaveBeenCalled();
  });

  test("erreur technique du CRM : distincte d'un refus et d'une absence", async () => {
    crm.findEntity.mockRejectedValue(new Error("SequelizeConnectionError"));
    const r = await ask(build(ADMIN), ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(r.answer).toBe("Je n'ai pas pu consulter le CRM pour cette demande. Veuillez réessayer.");
  });

  test("erreur du fournisseur Web : la fiche CRM reste complète, aucune source inventée, la clé n'apparaît pas", async () => {
    crm.findEntity.mockResolvedValue(found([engineerMatch()]));
    const r = await ask(build(ADMIN, { webError: new Error("tavily a répondu HTTP 401 key=tvly-SECRET") }), ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(r.answer).toContain("- Projets associés (2) :");
    expect(r.answer).toContain("Les données CRM sont disponibles, mais la recherche Web est temporairement indisponible.");
    expect(r.answer).not.toMatch(/https?:\/\/|tvly|401/);
    expect(r.citations).toEqual([]);
  });

  test("compte dont l'adresse a un domaine non DNS (tiret bas) : les outils répondent", async () => {
    const demo = { ...COMMERCIAL, email: "demo.commercial01@cbi_tunisia.com" };
    const r = await ask(build(demo), demo, "Donne-moi la liste des sociétés");
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(r.answer).toContain("Batipro");
  });
});

describe("recherche Web Tavily dans le Copilot : causes d'échec et architectes (réponses simulées)", () => {
  const { WebSearchProviderError } = require("../src/ai/web/webSearchProviders");
  const failing = (reason, status) => build(ADMIN, { webError: new WebSearchProviderError(`tavily a répondu HTTP ${status} tvly-NE-DOIT-PAS-SORTIR`, reason) });

  beforeEach(() => crm.findEntity.mockResolvedValue(found([engineerMatch()])));

  test.each([
    ["invalid_key", 401, "la clé du fournisseur est refusée"],
    ["quota_exceeded", 432, "le quota du fournisseur est épuisé"],
    ["rate_limited", 429, "momentanément limitée (trop de requêtes)"],
    ["timeout", 0, "n'a pas répondu dans le délai imparti"],
  ])("cause « %s » : dite clairement, fiche CRM complète, aucune source ni clé", async (reason, status, text) => {
    const h = failing(reason, status);
    const r = await ask(h, ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(r.answer).toContain("- Projets associés (2) :");
    expect(r.answer).toContain(text);
    expect(r.answer).toContain("Les données du CRM ci-dessus restent complètes.");
    expect(r.answer).not.toMatch(/tvly|https?:\/\/|HTTP \d/);
    expect(r.citations).toEqual([]);
    expect(JSON.stringify(r.toolCalls)).not.toContain("tvly");
    expect(r.toolCalls.find((c) => c.tool === "web_search").output).toMatchObject({ configured: true, failed: true, reason, results: [] });
  });

  test("service injoignable : message d'indisponibilité temporaire", async () => {
    const r = await ask(failing("unavailable", 503), ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(r.answer).toContain("Les données CRM sont disponibles, mais la recherche Web est temporairement indisponible.");
  });

  test("succès : sources Web avec titre et adresse, séparées des données du CRM", async () => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(h.provider.search).toHaveBeenCalled();
    // Seul le nom public (et sa société) part vers le moteur : jamais ses coordonnées.
    const sent = h.provider.search.mock.calls.map(([query]) => query).join(" ");
    expect(sent).toContain("Zakariah Derbel");
    expect(sent).not.toMatch(/71 000 111|z\.derbel@/);
    expect(r.answer).toContain("_Source : données internes du CRM_");
    expect(r.citations).toEqual([expect.objectContaining({ sourceType: "web", title: "Zakariah Derbel - Ingénieur structure | LinkedIn", path: "https://www.linkedin.com/in/zakariah-derbel" })]);
    expect(r.answer).toContain("https://www.linkedin.com/in/zakariah-derbel");
  });

  test("résultat Web vide : dit tel quel, aucune source inventée", async () => {
    const r = await ask(build(ADMIN, { webResults: [] }), ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    expect(r.answer).toContain("Je n'ai trouvé aucune information publique suffisamment fiable pour cette personne.");
    expect(r.citations).toEqual([]);
  });

  test("pas de recherche Web quand elle n'apporte rien : liste, question sur un champ, projets", async () => {
    crm.listCompanies.mockResolvedValue({ items: [{ id: "c1", name: "Batipro", projects: 3 }], total: 1, offset: 0, truncated: false, scope: "all" });
    const h = build(ADMIN);
    await ask(h, ADMIN, "Donne-moi la liste des sociétés");
    await ask(h, ADMIN, "Quel est le téléphone de l'ingénieur Zakariah Derbel ?");
    await ask(h, ADMIN, "Les projets de l'ingénieur Zakariah Derbel");
    expect(h.provider.search).not.toHaveBeenCalled();
  });

  test("architecte : fiche CRM (table des architectes), puis sources Web", async () => {
    const architect = { entityType: "architect", id: "a1", name: "Karim Ben Salah", matchType: "exact", restricted: [], activity: null, fields: { fullName: "Karim Ben Salah", contactType: "architect", phone: "+216 71 555 000", email: null, company: "Batipro", createdAt: null, updatedAt: null }, projects: PROJECTS };
    crm.findEntity.mockResolvedValue(found([architect]));
    const h = build(ADMIN, { webResults: [] });
    const r = await ask(h, ADMIN, "Qui est l'architecte Karim Ben Salah ?");
    expect(crm.findEntity).toHaveBeenCalledWith("architect", expect.objectContaining({ name: "Karim Ben Salah" }), expect.anything());
    expect(r.answer).toContain("- Type : Architecte");
    expect(r.answer).toContain("- Société (d'après ses projets) : Batipro");
    expect(r.answer).toContain("- Projets associés (2) :");
    expect(h.provider.search).toHaveBeenCalled();
  });
});

describe("sociétés : LISTE, DÉTAIL et RECHERCHE sont trois demandes distinctes", () => {
  const { QueryRouter: Router } = require("../src/ai/routing/queryRouter");
  const { createEntityLookupAgent: makeAgent } = require("../src/ai/agents/entityLookupAgent");
  const routerOnly = new Router();
  const COMPANIES = { items: [{ id: "c1", name: "Batipro", projects: 3 }, { id: "c2", name: "CBI Tunisia", projects: 0 }], total: 2, offset: 0, truncated: false, scope: "all" };
  const batipro = () => ({ entityType: "company", id: "c1", name: "Batipro", matchType: "exact", restricted: [], activity: null, fields: { fullName: "Batipro", contactType: "company", engineers: null, createdAt: null, updatedAt: null }, projects: PROJECTS });
  const WHICH = "De quelle personne ou société souhaitez-vous les informations";

  beforeEach(() => {
    crm.listCompanies.mockResolvedValue(COMPANIES);
    crm.findEntity.mockResolvedValue(found([batipro()]));
  });

  // ── Détection (routeur seul) ──
  test.each([
    "donne-moi la liste des sociétés",
    "société qui existe dans le CRM",
    "sociétés qui existent dans le CRM",
    "liste des sociétés du CRM",
    "affiche toutes les sociétés",
    "donne-moi les companies",
    "list all companies",
    "companies in the CRM",
    "Donne-moi la liste des sociétés",
    "Quelles sont les sociétés enregistrées dans le CRM ?",
    "Affiche toutes les companies",
    "informations sur les sociétés",
    "parle-moi des sociétés du CRM",
    "tell me about the companies",
    "liste des socités",
    "donne moi la liste des societe",
  ])("LISTE — « %s »", (message) => {
    expect(routerOnly.route(message)).toMatchObject({ entity: "company", operation: "list", target: null, mode: "CRM_ONLY" });
  });

  test.each([
    ["Donne-moi les informations sur la société Batipro", "Batipro"],
    ["Give me information about the company Batipro", "Batipro"],
  ])("DÉTAIL — « %s »", (message, target) => {
    expect(routerOnly.route(message)).toMatchObject({ entity: "company", operation: "details", target, mode: "CRM_AND_WEB" });
  });

  test.each([
    ["Recherche la société Batipro", "Batipro"],
    ["recherche la société batipro", "batipro"],
    ["cherche la societe nommée ben ameur batiment", "ben ameur batiment"],
    ["Search company Batipro", "Batipro"],
    ["Найди компанию Batipro", "Batipro"],
  ])("RECHERCHE — « %s »", (message, target) => {
    expect(routerOnly.route(message)).toMatchObject({ entity: "company", operation: "search", target, mode: "CRM_ONLY" });
  });

  test.each(["la société du projet Holya", "combien de projets par société ?", "quelle société a le plus de projets ?", "recherche les projets en négociation", "Recherche sur le Web : CBI Tunisia"])("inchangé — « %s » n'est ni une liste ni une recherche de société", (message) => {
    const route = routerOnly.route(message);
    expect(route && route.entity === "company").toBeFalsy();
  });

  // ── De bout en bout : routage vers l'outil et traitement du résultat ──
  test.each([
    "donne-moi la liste des sociétés",
    "société qui existe dans le CRM",
    "liste des sociétés du CRM",
    "affiche toutes les sociétés",
    "donne-moi les companies",
    "list all companies",
    "Donne-moi la liste des sociétés",
    "Quelles sont les sociétés enregistrées dans le CRM ?",
    "Affiche toutes les companies",
  ])("« %s » → outil list_companies exécuté, sociétés de la base affichées, aucune demande de précision", async (message) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(crm.listCompanies).toHaveBeenCalledTimes(1);
    expect(r.mode).toBe("agent");
    expect(r.answer).toContain("**2**");
    expect(r.answer).toContain("1. Batipro\n2. CBI Tunisia");
    expect(r.answer).not.toMatch(/aucun projet|— \d+ projet/);
    expect(r.answer).not.toContain(WHICH);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
    expect(h.provider.search).not.toHaveBeenCalled();
  });

  test("la liste est la même après la fiche d'un ingénieur : le sujet précédent n'est pas repris", async () => {
    const h = build(ADMIN);
    crm.findEntity.mockResolvedValue(found([engineerMatch()]));
    await ask(h, ADMIN, "Qui est l'ingénieur Zakariah Derbel ?");
    const r = await ask(h, ADMIN, "donne-moi la liste des sociétés");
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(r.answer).not.toContain(WHICH);
  });

  test("« Donne-moi les informations sur la société Batipro » → fiche de CETTE société (find_crm_entity), pas la liste", async () => {
    const r = await ask(build(ADMIN), ADMIN, "Donne-moi les informations sur la société Batipro");
    expect(crm.findEntity).toHaveBeenCalledWith("company", expect.objectContaining({ name: "Batipro" }), expect.anything());
    expect(crm.listCompanies).not.toHaveBeenCalled();
    expect(r.answer).toContain("🏢 **Batipro**");
    expect(r.answer).toContain("- Projets associés (2) :");
  });

  test("« Recherche la société Batipro » → recherche par nom dans le CRM seul, fiche si une seule société", async () => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "Recherche la société Batipro");
    expect(r.agent).toBe("entity_lookup_agent");
    expect(toolsOf(r)).toEqual(["find_crm_entity"]);
    expect(crm.findEntity).toHaveBeenCalledWith("company", expect.objectContaining({ name: "Batipro" }), expect.anything());
    expect(r.answer).toContain("🏢 **Batipro**");
    expect(h.provider.search).not.toHaveBeenCalled();
  });

  test("recherche : plusieurs sociétés portent ce nom → on demande laquelle, aucune n'est choisie", async () => {
    crm.findEntity.mockResolvedValue(found([{ entityType: "company", id: "c1", name: "EGTS", company: null, matchType: "tokens" }, { entityType: "company", id: "c2", name: "EGTS SFAX", company: null, matchType: "tokens" }]));
    const r = await ask(build(ADMIN), ADMIN, "Recherche la société EGTS");
    expect(r.answer).toContain("J'ai trouvé 2 résultats correspondant à « EGTS » dans le CRM. Lequel souhaitez-vous consulter ?");
    expect(r.answer).toContain("1. **EGTS** — Société");
    expect(r.answer).toContain("2. **EGTS SFAX** — Société");
  });

  test("recherche sans résultat : dit tel quel, aucune société inventée", async () => {
    crm.findEntity.mockResolvedValue(NOT_FOUND);
    const r = await ask(build(ADMIN), ADMIN, "Recherche la société Zzqx");
    expect(r.answer).toContain("nommé « Zzqx » n'a été trouvé dans les données du CRM auxquelles vous avez accès.");
    expect(r.answer).not.toContain("Projets associés");
  });

  test("aucune société en base : message explicite", async () => {
    crm.listCompanies.mockResolvedValue({ items: [], total: 0, offset: 0, truncated: false, scope: "all" });
    const r = await ask(build(ADMIN), ADMIN, "donne-moi la liste des sociétés");
    expect(r.answer).toContain("Je n'ai trouvé aucune société dans les données CRM accessibles avec votre rôle.");
  });

  test("échec de la lecture : erreur compréhensible pour l'utilisateur, cause technique journalisée côté serveur seulement", async () => {
    crm.listCompanies.mockRejectedValue(new Error('relation "companies" does not exist'));
    const lines = [];
    const spies = ["log", "info", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation((...a) => lines.push(a.join(" "))));
    let r;
    try {
      r = await ask(build(ADMIN), ADMIN, "donne-moi la liste des sociétés");
    } finally {
      spies.forEach((x) => x.mockRestore());
    }
    expect(r.answer).toBe("Je n'ai pas pu consulter le CRM pour cette demande. Veuillez réessayer.");
    expect(r.answer).not.toMatch(/relation|does not exist/);
    expect(lines.join("\n")).toMatch(/list_companies/);
  });

  test("droits : un commercial obtient la liste avec ses propres projets comptés (périmètre décidé par l'outil)", async () => {
    crm.listCompanies.mockResolvedValue({ ...COMPANIES, scope: "mine" });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "donne-moi la liste des sociétés");
    expect(crm.listCompanies).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: COMMERCIAL.id }));
    expect(r.answer).toContain("1. Batipro");
    expect(r.answer).not.toMatch(/aucun projet|— \d+ projet/);
  });

  // Filet de sécurité : la branche qui produisait « De quelle personne ou société… ».
  test("l'agent, appelé sans route sur une demande qui parle DES sociétés, sert la liste au lieu de demander un nom", async () => {
    const h = build(ADMIN);
    const tools = [{ name: "list_companies", invoke: jest.fn(async () => JSON.stringify(COMPANIES)) }];
    const agent = makeAgent({ chatModel: {}, tools, workflowEngine: new LangChainWorkflowEngine(), queryRouter: { route: () => null } });
    const r = await agent.execute({ intent: { name: "entity_lookup" }, message: "les sociétés clientes référencées chez nous", user: ADMIN, conversationId: null });
    expect(tools[0].invoke).toHaveBeenCalledTimes(1);
    expect(r.answer).toContain("1. Batipro");
    expect(r.answer).not.toContain(WHICH);
    expect(h).toBeDefined();
  });

  test("sans aucun nom ni entité, la demande de précision reste en place", async () => {
    const agent = makeAgent({ chatModel: {}, tools: [], workflowEngine: new LangChainWorkflowEngine(), queryRouter: { route: () => null } });
    const r = await agent.execute({ intent: { name: "entity_lookup" }, message: "donne-moi des informations", user: ADMIN, conversationId: null });
    expect(r.answer).toContain(WHICH);
  });
});

describe("sociétés : lister, lister avec leurs projets, filtrer, compter — et projets d'une société nommée", () => {
  const { QueryRouter: Router } = require("../src/ai/routing/queryRouter");
  const routerOnly = new Router();
  const PLAIN = { items: [{ id: "c1", name: "2M Batiment", projects: 1 }, { id: "c2", name: "AFRIQUE TRAVAUX", projects: 0 }, { id: "c3", name: "Ajej Immo", projects: 0 }], total: 120, totalAll: 120, offset: 0, truncated: true, scope: "all", view: "names", filter: null, projectsLoaded: null };
  const WITH_PROJECTS = {
    ...PLAIN,
    view: "projects",
    projectsLoaded: true,
    items: [
      { id: "c1", name: "2M Batiment", projects: 2, outOfScope: 0, projectItems: [{ id: "p1", name: "Résidence Holya", statut: "En cours", archived: false }, { id: "p2", name: "Dépôt Sfax", statut: "Terminé", archived: true }] },
      { id: "c2", name: "AFRIQUE TRAVAUX", projects: 0, outOfScope: 0, projectItems: [] },
    ],
  };
  const company2M = () => ({ entityType: "company", id: "c1", name: "2M Batiment", matchType: "exact", restricted: [], activity: null, fields: { fullName: "2M Batiment", contactType: "company" }, projects: { total: 2, truncated: false, outOfScope: 0, items: WITH_PROJECTS.items[0].projectItems } });

  beforeEach(() => crm.listCompanies.mockResolvedValue(PLAIN));

  // ── Détection ──
  test.each([
    ["donne-moi la liste des sociétés dans le CRM", "list", {}],
    ["donne moi la liste des societe", "list", {}],
    ["affiche toutes les companies", "list", {}],
    ["quelles sont les sociétés enregistrées ?", "list", {}],
    ["je veux voir les entreprises", "list", {}],
    ["liste des sociétés", "list", {}],
    ["show me all companies in the CRM", "list", {}],
    ["donne-moi toutes les sociétés avec leurs projets", "list", { view: "projects" }],
    ["liste des sociétés avec leurs projets", "list", { view: "projects" }],
    ["list all companies and their projects", "list", { view: "projects" }],
    ["Покажи компании и их проекты", "list", { view: "projects" }],
    ["les sociétés sans projet", "list", { filter: "without_projects" }],
    ["companies without projects", "list", { filter: "without_projects" }],
    ["sociétés qui ont des projets", "list", { filter: "with_projects" }],
    ["combien de sociétés existe-t-il dans le CRM ?", "count", {}],
    ["how many companies are there?", "count", {}],
    ["сколько компаний в CRM?", "count", {}],
    ["combien de sociétés sans projet ?", "count", { filter: "without_projects" }],
  ])("« %s » → company.%s %j", (message, operation, extra) => {
    const route = routerOnly.route(message);
    expect(route).toMatchObject({ entity: "company", operation, target: null, mode: "CRM_ONLY", ...extra });
    if (!extra.view) expect(route.view).toBeUndefined();
    if (!extra.filter) expect(route.filter).toBeUndefined();
  });

  test("« quels projets sont associés à 2M Batiment ? » : nom commençant par un chiffre reconnu, route soumise à vérification dans le CRM", () => {
    expect(routerOnly.route("quels projets sont associés à 2M Batiment ?")).toMatchObject({ operation: "projects", target: "2M Batiment", requiresKnownEntity: true, mode: "CRM_ONLY" });
    expect(routerOnly.accepts(routerOnly.route("quels projets sont associés à 2M Batiment ?"), "projects")).toBe("known");
  });

  // ── Liste simple ──
  test.each(["donne-moi la liste des sociétés dans le CRM", "donne moi la liste des societe", "affiche toutes les companies"])("« %s » : les noms seuls, numérotés, avec la suite annoncée", async (message) => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, message);
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(crm.listCompanies).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }), expect.anything());
    expect(crm.listCompanies.mock.calls[0][0].view).toBeUndefined();
    expect(r.answer).toBe(
      ["🏢 Sociétés du CRM", "", "J'ai trouvé **120** sociétés dans le CRM :", "", "1. 2M Batiment", "2. AFRIQUE TRAVAUX", "3. Ajej Immo", "", "Affichage 1–3 sur 120.", "Pour voir la suite, écrivez « Afficher les suivants ».", "", "_Source : données internes du CRM_"].join("\n")
    );
    expect(r.mode).toBe("agent");
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("langue de la demande : anglais et russe", async () => {
    const en = await ask(build(ADMIN), ADMIN, "show me all companies in the CRM");
    expect(en.answer).toContain("I found **120** companies in the CRM:\n\n1. 2M Batiment\n2. AFRIQUE TRAVAUX");
    expect(en.answer).toContain('To see more, type "Show more".');
    const ru = await ask(build(ADMIN), ADMIN, "Покажи список компаний");
    expect(ru.answer).toContain("В CRM найдено компаний: **120**.\n\n1. 2M Batiment");
  });

  // ── Avec leurs projets ──
  test("« liste des sociétés avec leurs projets » : projets regroupés par société ; « aucun projet » seulement parce que c'est demandé", async () => {
    crm.listCompanies.mockResolvedValue(WITH_PROJECTS);
    const r = await ask(build(ADMIN), ADMIN, "liste des sociétés avec leurs projets");
    expect(crm.listCompanies).toHaveBeenCalledWith(expect.objectContaining({ view: "projects" }), expect.anything());
    expect(r.answer).toContain("1. **2M Batiment**\n   - 📁 Résidence Holya — En cours\n   - 📁 Dépôt Sfax — Terminé, archivé\n2. **AFRIQUE TRAVAUX**\n   - aucun projet associé");
  });

  test("« avec leurs projets » : la page suivante garde la même vue", async () => {
    crm.listCompanies.mockResolvedValue(WITH_PROJECTS);
    const h = build(ADMIN);
    await ask(h, ADMIN, "liste des sociétés avec leurs projets");
    await ask(h, ADMIN, "Afficher les suivants");
    expect(crm.listCompanies).toHaveBeenLastCalledWith(expect.objectContaining({ view: "projects", offset: 2 }), expect.anything());
  });

  test("échec de la lecture des projets : noms affichés, aucune société déclarée « sans projet »", async () => {
    crm.listCompanies.mockResolvedValue({ ...PLAIN, view: "projects", projectsLoaded: false, items: PLAIN.items.map((i) => ({ ...i, projects: null })) });
    const r = await ask(build(ADMIN), ADMIN, "liste des sociétés avec leurs projets");
    expect(r.answer).toContain("⚠️ Les projets n'ont pas pu être récupérés : seuls les noms des sociétés sont affichés. Cela ne signifie pas qu'elles n'ont aucun projet.");
    expect(r.answer).toContain("1. 2M Batiment\n2. AFRIQUE TRAVAUX");
    expect(r.answer).not.toContain("aucun projet associé");
  });

  test("droits : un commercial ne voit que ses projets ; les autres sont comptés comme hors périmètre, jamais « aucun projet »", async () => {
    crm.listCompanies.mockResolvedValue({ ...WITH_PROJECTS, scope: "mine", items: [{ id: "c1", name: "2M Batiment", projects: 0, outOfScope: 2, projectItems: [] }, { id: "c2", name: "AFRIQUE TRAVAUX", projects: 0, outOfScope: 0, projectItems: [] }] });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "liste des sociétés avec leurs projets");
    expect(crm.listCompanies).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: COMMERCIAL.id }));
    expect(r.answer).toContain("1. **2M Batiment**\n   - 🔒 2 projets hors de votre périmètre");
    expect(r.answer).toContain("2. **AFRIQUE TRAVAUX**\n   - aucun projet dans votre périmètre");
    expect(r.answer).toContain("Projets affichés : les vôtres uniquement (droits de votre rôle).");
  });

  // ── Filtrer ──
  test("« les sociétés sans projet » : filtre appliqué par l'outil ; pour un commercial, le critère est dit limité à son périmètre", async () => {
    crm.listCompanies.mockResolvedValue({ ...PLAIN, total: 35, totalAll: 120, filter: "without_projects", scope: "mine", items: [{ id: "c2", name: "AFRIQUE TRAVAUX", projects: 0 }] });
    const r = await ask(build(COMMERCIAL), COMMERCIAL, "les sociétés sans projet");
    expect(crm.listCompanies).toHaveBeenCalledWith(expect.objectContaining({ filter: "without_projects" }), expect.objectContaining({ ownerId: COMMERCIAL.id }));
    expect(r.answer).toContain("J'ai trouvé **35** sociétés sans projet associé dans votre périmètre :\n\n1. AFRIQUE TRAVAUX");
    expect(r.answer).toContain("Critère évalué sur vos projets uniquement (droits de votre rôle) : une société peut avoir des projets que vous ne voyez pas.");
  });

  // ── Compter ──
  test("« combien de sociétés existe-t-il dans le CRM ? » : le total de l'outil, aucune liste, pas l'analyse par client", async () => {
    const h = build(ADMIN);
    const r = await ask(h, ADMIN, "combien de sociétés existe-t-il dans le CRM ?");
    expect(r.agent).toBe("entity_lookup_agent");
    expect(toolsOf(r)).toEqual(["list_companies"]);
    expect(r.answer).toBe("Le CRM compte **120** sociétés.\n\n_Source : données internes du CRM_");
    const en = await ask(build(ADMIN), ADMIN, "how many companies are there?");
    expect(en.answer).toContain("The CRM holds **120** companies.");
  });

  test("« combien de sociétés sans projet ? » : nombre filtré, rapporté au total", async () => {
    crm.listCompanies.mockResolvedValue({ ...PLAIN, total: 35, totalAll: 120, filter: "without_projects" });
    const r = await ask(build(ADMIN), ADMIN, "combien de sociétés sans projet ?");
    expect(r.answer).toContain("**35** sociétés n'ont aucun projet, sur 120 dans le CRM.");
  });

  // ── Projets d'une société nommée ──
  test("« quels projets sont associés à 2M Batiment ? » : la société est reconnue dans le CRM, ses projets sont listés", async () => {
    crm.findAnyEntity.mockResolvedValue(found([company2M()]));
    const h = build(ADMIN, { entityProbe: { person: false, company: true, project: false } });
    const r = await ask(h, ADMIN, "quels projets sont associés à 2M Batiment ?");
    expect(r.agent).toBe("entity_lookup_agent");
    expect(h.probes.entity).toHaveBeenCalledWith("2M Batiment");
    expect(r.answer).toContain("2M Batiment — Projets associés (2) :");
    expect(r.answer).toContain("📁 Résidence Holya — En cours");
    expect(r.answer).toContain("📁 Dépôt Sfax — Terminé, archivé");
  });

  test("société sans projet associé : dit tel quel", async () => {
    crm.findAnyEntity.mockResolvedValue(found([{ ...company2M(), projects: { total: 0, items: [], truncated: false, outOfScope: 0 } }]));
    const r = await ask(build(ADMIN, { entityProbe: { person: false, company: true, project: false } }), ADMIN, "quels projets sont associés à 2M Batiment ?");
    expect(r.answer).toContain("2M Batiment — Projets associés (0) : Aucun");
    expect(r.answer).not.toContain("hors de votre périmètre");
  });

  test("droits : projets de la société hors du périmètre du commercial → « non accessibles », pas « aucun »", async () => {
    crm.findAnyEntity.mockResolvedValue({ ...found([{ ...company2M(), projects: { total: 0, items: [], truncated: false, outOfScope: 2 } }]), scope: "mine" });
    const r = await ask(build(COMMERCIAL, { entityProbe: { person: false, company: true, project: false } }), COMMERCIAL, "quels projets sont associés à 2M Batiment ?");
    expect(r.answer).toContain("Aucun dans votre périmètre");
    expect(r.answer).toContain("🔒 2 autres projets associés hors de votre périmètre — non accessibles avec votre rôle");
  });

  test("« projets associés à X » quand X n'est ni une personne ni une société du CRM : le routage existant (projets d'un commercial) est conservé", async () => {
    const h = build(ADMIN, { entityProbe: { person: false, company: false, project: false } });
    const r = await ask(h, ADMIN, "Donne-moi les projets associés à Hadil.");
    expect(r.agent).toBe("project_agent");
  });

  test("« les projets de 2M Batiment » : pas un ingénieur, mais une société du CRM → ses projets", async () => {
    crm.findEntity.mockResolvedValue(found([company2M()]));
    const h = build(ADMIN, { engineerProbe: false, entityProbe: { person: false, company: true, project: false } });
    const r = await ask(h, ADMIN, "Quels sont les projets de 2M Batiment ?");
    expect(r.agent).toBe("entity_lookup_agent");
    expect(crm.findEntity).toHaveBeenCalledWith("company", expect.objectContaining({ name: "2M Batiment" }), expect.anything());
    expect(r.answer).toContain("2M Batiment — Projets associés (2) :");
  });

  test("échec de l'outil : message d'erreur dans la langue de la demande", async () => {
    crm.listCompanies.mockRejectedValue(new Error("connection terminated"));
    const fr = await ask(build(ADMIN), ADMIN, "liste des sociétés avec leurs projets");
    expect(fr.answer).toBe("Je n'ai pas pu consulter le CRM pour cette demande. Veuillez réessayer.");
    const en = await ask(build(ADMIN), ADMIN, "list all companies and their projects");
    expect(en.answer).toBe("I could not query the CRM for this request. Please try again.");
  });
});
