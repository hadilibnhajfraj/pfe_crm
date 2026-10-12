"use strict";

// RBAC de PROBAR ASSISTANT — rôle « commercial » (terrain) et agent commercial.
// VRAI AIManager, VRAI CommercialAgent, VRAIS Tools commerciaux derrière un
// VRAI McpServer (PermissionManager). Simulés : le modèle de langage (jamais
// sollicité) et la base — une table de contacts en mémoire qui applique le
// MÊME périmètre que le service (`created` / `assigned`).

jest.mock("../src/modules/commercial-contacts/services/commercialContactKpi.service", () => ({
  listCommercialContacts: jest.fn(),
  getCommercialContactKPI: jest.fn(),
  getCommercialContactAnalytics: jest.fn(),
  getMyKPI: jest.fn(),
  getPersonalKPISummary: jest.fn(),
  ADMIN_ROLES: ["admin", "superadmin", "superadmin2"],
}));
jest.mock("../src/modules/commercial-contacts/services/commercialContactRelance.service", () => ({ scheduleContactRelance: jest.fn(), listCommercialCandidates: jest.fn() }));

const kpiService = require("../src/modules/commercial-contacts/services/commercialContactKpi.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const commercialTools = require("../src/ai/mcp/tools/commercialContacts");

const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { BaseAgent } = require("../src/ai/agents/baseAgent");
const { createCommercialAgent, REQUIRED_ROLES } = require("../src/ai/agents/commercialAgent");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");
const { QueryRouter } = require("../src/ai/routing/queryRouter");
const { AnalyticsQueryParser } = require("../src/ai/analytics/analyticsQueryParser");
const { classifyAiCopilotError } = require("../src/modules/ai-copilot/services/errorClassifier");

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TERRAIN = { id: uuid(1), role: "commercial", email: "terrain@cbi.tn" };
const SEDENTAIRE = { id: uuid(2), role: "commercial_sedentaire", email: "sed@cbi.tn" };
const ADMIN = { id: uuid(3), role: "admin", email: "admin@cbi.tn" };
const LOGISTIQUE = { id: uuid(4), role: "responsable_logistique_achat", email: "log@cbi.tn" };
const ACCUEIL = { id: uuid(5), role: "accueil", email: "accueil@cbi.tn" };

// Base simulée. `followedBy` : commerciaux qui suivent le contact par une relance.
const DB = [
  { id: "k1", prenom: "Amine", nom: "Affecte", nomSociete: "Alpha", telephone: "+21620000001", statut: "rappeler_plus_tard", nbAppels: 2, dateAppel: "2026-09-01", createdBy: SEDENTAIRE.id, commercialId: TERRAIN.id, followedBy: [] },
  { id: "k2", prenom: "Sana", nom: "Cree", nomSociete: "Beta", telephone: null, statut: "ok", nbAppels: 1, dateAppel: "2026-09-02", createdBy: TERRAIN.id, commercialId: null, followedBy: [] },
  { id: "k3", prenom: "Rim", nom: "Suivie", nomSociete: "Gamma", telephone: "+21620000003", statut: "user_injoignable", nbAppels: 0, dateAppel: null, createdBy: SEDENTAIRE.id, commercialId: null, followedBy: [TERRAIN.id] },
  { id: "k4", prenom: "Zied", nom: "Secret", nomSociete: "Confidentielle SA", telephone: "+21699999999", statut: "ok", nbAppels: 5, dateAppel: "2026-09-03", createdBy: SEDENTAIRE.id, commercialId: uuid(9), followedBy: [] },
  { id: "k5", prenom: "Ines", nom: "Autre", nomSociete: "Delta", telephone: "+21688888888", statut: "client_refuse", nbAppels: 1, dateAppel: "2026-09-04", createdBy: uuid(8), commercialId: null, followedBy: [] },
];

function serveContacts() {
  kpiService.listCommercialContacts.mockImplementation(async (userId, { status, search, limit = 20, offset = 0 } = {}, { scope = "created" } = {}) => {
    let rows = DB;
    if (userId && scope === "assigned") rows = rows.filter((c) => c.createdBy === userId || c.commercialId === userId || c.followedBy.includes(userId));
    else if (userId) rows = rows.filter((c) => c.createdBy === userId);
    if (status) rows = rows.filter((c) => c.statut === status);
    if (search) rows = rows.filter((c) => `${c.prenom} ${c.nom} ${c.nomSociete}`.toLowerCase().includes(String(search).toLowerCase()));
    return { contacts: rows.slice(offset, offset + limit).map(({ followedBy, createdBy, commercialId, ...c }) => c), total: rows.length };
  });
}

function harness(user) {
  const registry = new ToolRegistry();
  commercialTools.toolFactories.forEach((factory) => registry.register(factory()));
  const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  const tools = createMcpToolAdapters({ mcpServer: server, actingUser: user });
  const chatModel = { invoke: jest.fn(async () => ({ content: JSON.stringify({ action: "final_answer", answer: "RÉPONSE DU MODÈLE" }) })) };
  const memory = new InMemoryConversationMemory();
  const workflowEngine = new LangChainWorkflowEngine();
  const agents = new AgentRegistry();
  agents.register(createCommercialAgent({ chatModel, tools, workflowEngine, memory, pendingActionStore: new PendingActionStore() }));
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
    analyticsParser: new AnalyticsQueryParser(),
    queryRouter: new QueryRouter(),
  });
  let n = 0;
  return { chatModel, tools, ask: (message) => manager.handleMessage({ message, user, conversationId: `c-${user.id}-${(n += 1)}` }) };
}

let consoleSpies;
beforeEach(() => {
  jest.clearAllMocks();
  serveContacts();
  consoleSpies = ["log", "info", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

describe("Matrice : qui peut invoquer l'agent commercial", () => {
  test("rôles admis : exactement commercial, commercial_sedentaire et les trois rôles administrateurs", () => {
    expect([...REQUIRED_ROLES].sort()).toEqual(["admin", "commercial", "commercial_sedentaire", "superadmin", "superadmin2"]);
  });

  test("les KPI globaux restent réservés, comme sur les routes /commercial-contacts/kpi", () => {
    const byName = Object.fromEntries(commercialTools.toolFactories.map((f) => f()).map((t) => [t.name, t.requiredRoles]));
    for (const name of ["get_commercial_contact_kpi", "get_commercial_contact_analytics", "get_commercial_personal_kpi_summary"]) {
      expect(byName[name]).not.toContain("commercial");
      expect(byName[name]).toContain("commercial_sedentaire");
    }
    expect(byName.get_my_commercial_contacts).toContain("commercial");
    expect(byName.schedule_commercial_contact_relance).toContain("commercial");
  });
});

describe("Rôle « commercial » — ses contacts, et eux seuls", () => {
  test.each(["analyses mes contacts", "analyser mes contacts", "analyse mes contacts", "résume mon activité commerciale"])("« %s » : agent autorisé, analyse des seuls contacts accessibles, sans modèle de langage", async (message) => {
    const h = harness(TERRAIN);
    const r = await h.ask(message);
    expect(r.mode).toBe("agent");
    expect(r.agent).toBe("commercial_agent");
    expect(r.answer).not.toMatch(/not allowed|ne vous autorise pas/i);
    expect(r.answer).toContain("📊 ANALYSE DES CONTACTS COMMERCIAUX");
    expect(r.answer).toContain("3 contacts analysés — vos contacts (créés par vous, qui vous sont affectés ou que vous suivez).");
    expect(r.answer).toContain("• À rappeler plus tard : 1");
    expect(r.answer).toContain("• Injoignable : 1");
    expect(r.answer).toContain("• Contacts sans téléphone : 1");
    // Aucun contact d'un autre commercial, ni son nom, ni sa société, ni son téléphone.
    expect(r.answer).not.toMatch(/Secret|Confidentielle|99999999|Autre|Delta|88888888/);
    for (const [userId, , options] of kpiService.listCommercialContacts.mock.calls) {
      expect(userId).toBe(TERRAIN.id);
      expect(options).toEqual({ scope: "assigned" });
    }
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("« liste mes contacts » : contact affecté, contact créé et contact suivi par relance — rien d'autre", async () => {
    const r = await harness(TERRAIN).ask("liste mes contacts");
    expect(r.agent).toBe("commercial_agent");
    expect(r.answer).toContain("3 contact(s) commercial(aux)");
    for (const name of ["Amine Affecte", "Sana Cree", "Rim Suivie"]) expect(r.answer).toContain(name);
    expect(r.answer).not.toMatch(/Zied|Secret|Ines|Confidentielle/);
  });

  test("contact non autorisé demandé par son nom : aucune donnée, et rien n'indique qu'il existe", async () => {
    const r = await harness(TERRAIN).ask("Donne-moi les contacts de Zied Secret");
    expect(kpiService.listCommercialContacts).toHaveBeenCalledWith(TERRAIN.id, expect.objectContaining({ search: expect.stringContaining("Zied") }), { scope: "assigned" });
    expect(r.answer).not.toMatch(/Confidentielle|99999999|\+216/);
    expect(JSON.stringify(r.toolCalls)).not.toMatch(/Confidentielle|99999999/);
  });

  test("« combien de contacts » : le total de SES contacts — jamais le KPI global (outil réservé, non appelé)", async () => {
    const r = await harness(TERRAIN).ask("Combien de contacts au total ?");
    expect(r.answer).toContain("3 contacts analysés");
    expect(kpiService.getCommercialContactKPI).not.toHaveBeenCalled();
  });

  test("un paramètre de périmètre fourni à l'outil est ignoré : le rôle authentifié décide", async () => {
    const tool = harness(TERRAIN).tools.find((t) => t.name === "get_my_commercial_contacts");
    const out = JSON.parse(await tool.invoke({ limit: 50 }));
    expect(out.total).toBe(3);
    // Champs de périmètre glissés dans l'appel : écartés avant le service.
    const forged = JSON.parse(await tool.invoke({ limit: 50, userId: SEDENTAIRE.id, createdBy: SEDENTAIRE.id, ownerId: SEDENTAIRE.id }));
    expect(forged.total).toBe(3);
    expect(kpiService.listCommercialContacts).toHaveBeenLastCalledWith(TERRAIN.id, { limit: 50 }, { scope: "assigned" });
  });

  test("outil KPI appelé directement par un commercial : refusé par le serveur d'outils, service jamais atteint", async () => {
    const tool = harness(TERRAIN).tools.find((t) => t.name === "get_commercial_contact_kpi");
    await expect(tool.invoke({})).rejects.toThrow(/not allowed/i);
    expect(kpiService.getCommercialContactKPI).not.toHaveBeenCalled();
  });
});

describe("Autres rôles — règles inchangées", () => {
  test("commercial_sedentaire : « liste des contacts » → les contacts qu'il a créés (périmètre « created »)", async () => {
    const r = await harness(SEDENTAIRE).ask("Donne-moi la liste des contacts commerciaux");
    expect(r.agent).toBe("commercial_agent");
    expect(kpiService.listCommercialContacts).toHaveBeenCalledWith(SEDENTAIRE.id, expect.anything(), { scope: "created" });
    expect(r.answer).toContain("3 contact(s) commercial(aux)");
    expect(r.answer).not.toMatch(/Ines|Delta/);
  });

  test("administrateur : vue transverse conservée", async () => {
    const r = await harness(ADMIN).ask("Donne-moi la liste des contacts commerciaux");
    expect(kpiService.listCommercialContacts).toHaveBeenCalledWith(null, expect.anything(), { scope: "created" });
    expect(r.answer).toContain("5 contact(s) commercial(aux)");
  });

  test.each([
    ["responsable_logistique_achat", LOGISTIQUE],
    ["accueil", ACCUEIL],
    ["rôle inconnu", { id: uuid(6), role: "stagiaire" }],
    ["ancien nom « user »", { id: uuid(7), role: "user" }],
    ["casse différente « Commercial »", { id: uuid(10), role: "Commercial" }],
  ])("%s : refusé — message clair, non réessayable, aucun outil appelé, détail technique au journal seulement", async (_label, user) => {
    const h = harness(user);
    const r = await h.ask("liste mes contacts");
    expect(r.mode).toBe("error");
    expect(r.answer).toBeNull();
    expect(r.error).toEqual({ message: expect.stringMatching(/^Votre rôle ne vous autorise pas à utiliser cette fonction de l'assistant\./), code: "PERMISSION_DENIED", retryable: false });
    expect(r.error.message).not.toMatch(/commercial_agent|not allowed|Role "/);
    expect(kpiService.listCommercialContacts).not.toHaveBeenCalled();
    expect(consoleSpies.flatMap((s) => s.mock.calls.flat()).join(" ")).toMatch(/not allowed to invoke agent "commercial_agent"/);
  });

  test("refus d'agent levé hors orchestrateur : classé 403 PERMISSION_DENIED, jamais « Internal server error »", () => {
    const { AgentPermissionError } = require("../src/ai/agents/errors");
    expect(classifyAiCopilotError(new AgentPermissionError("commercial_agent", "accueil"))).toMatchObject({ status: 403, message: "Vous n'avez pas la permission d'effectuer cette action." });
  });
});

describe("Erreur technique — distincte d'un refus", () => {
  test("échec de la lecture des contacts : pas un message d'autorisation, cause présente dans le journal du serveur", async () => {
    kpiService.listCommercialContacts.mockRejectedValue(new Error("connection terminated unexpectedly"));
    const r = await harness(TERRAIN).ask("analyse mes contacts");
    const text = String(r.answer || (r.error && r.error.message) || "");
    expect(text).not.toMatch(/ne vous autorise pas/);
    expect(text).not.toMatch(/connection terminated/);
    expect(r.error ? r.error.code : undefined).not.toBe("PERMISSION_DENIED");
    expect(consoleSpies.flatMap((s) => s.mock.calls.flat()).map(String).join(" ")).toMatch(/get_my_commercial_contacts|connection terminated/);
  });
});

describe("Sans JWT valide — rejeté avant le Copilot (vrai middleware, vrai jsonwebtoken)", () => {
  const jwt = require("jsonwebtoken");
  const { authRequired } = require("../src/middleware/auth.middleware");
  const { ROLE_VOCABULARY_VERSION } = require("../src/constants/roles");
  const run = (authorization) => {
    const req = { headers: authorization ? { authorization } : {} };
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    const next = jest.fn();
    authRequired(req, res, next);
    return { req, res, next };
  };
  const secret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

  test.each([
    ["aucun en-tête", undefined],
    ["schéma incorrect", "Basic abc"],
    ["jeton illisible", "Bearer pas.un.jeton"],
    ["jeton signé avec une autre clé", `Bearer ${jwt.sign({ sub: uuid(1), role: "admin", rv: 2 }, "une-autre-cle", { expiresIn: "5m" })}`],
  ])("%s → 401, la requête n'atteint jamais le Copilot", (_label, header) => {
    const { res, next, req } = run(header);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  test("jeton émis avant le renommage des rôles (ancien « commercial ») → 401 : jamais interprété avec le nouveau sens", () => {
    if (!secret()) return console.warn("secret JWT absent de l'environnement de test : cas ignoré");
    const old = jwt.sign({ sub: uuid(1), role: "commercial", email: "x@y.tn" }, secret(), { expiresIn: "5m", issuer: "my-api", audience: "my-client" });
    const { res, next } = run(`Bearer ${old}`);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("jeton valide au vocabulaire actuel → accepté, rôle transmis tel quel", () => {
    if (!secret()) return console.warn("secret JWT absent de l'environnement de test : cas ignoré");
    const token = require("../src/utils/tokens").signAccessToken({ sub: uuid(1), role: "commercial", email: "x@y.tn" });
    expect(jwt.decode(token).rv).toBe(ROLE_VOCABULARY_VERSION);
    const { req, next } = run(`Bearer ${token}`);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.role).toBe("commercial");
  });
});
