"use strict";

// PROBAR ASSISTANT — contacts commerciaux PAR STATUT (« contacts refusés »,
// « combien… », « analyse… », « projets dont le client est refusé »).
// VRAI AIManager, VRAI QueryRouter, VRAI CommercialAgent, VRAI outil
// get_my_commercial_contacts derrière un VRAI McpServer. Simulés : la base
// (table en mémoire, même périmètre que le service) et le modèle de langage,
// qui ne doit jamais être sollicité.

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
const { createCommercialAgent } = require("../src/ai/agents/commercialAgent");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");
const { QueryRouter } = require("../src/ai/routing/queryRouter");
const { AnalyticsQueryParser } = require("../src/ai/analytics/analyticsQueryParser");
const { detectContactStatusRequest } = require("../src/ai/reasoning/contactStatusRequest");

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = { id: uuid(1), role: "admin", email: "admin@cbi.tn" };
const SEDENTAIRE = { id: uuid(2), role: "commercial_sedentaire", email: "sed@cbi.tn" };
const AUTRE_SEDENTAIRE = { id: uuid(3), role: "commercial_sedentaire", email: "sed2@cbi.tn" };
// Trois commerciaux terrain : aucun contact ; 12 contacts suivis par relance (aucun refusé —
// la situation constatée en base) ; 2 contacts refusés affectés + 1 contact « ok » créé.
const TERRAIN_VIDE = { id: uuid(4), role: "commercial", email: "t1@cbi.tn" };
const TERRAIN_SUIVI = { id: uuid(5), role: "commercial", email: "t2@cbi.tn" };
const TERRAIN_AFFECTE = { id: uuid(6), role: "commercial", email: "t3@cbi.tn" };

// Même répartition que le tableau de bord signalé : 485 contacts, dont 63 refusés,
// tous créés par le même commercial sédentaire.
const COUNTS = { ok: 256, user_injoignable: 93, rappeler_plus_tard: 73, client_refuse: 63 };
const DB = [];
for (const [statut, n] of Object.entries(COUNTS)) {
  for (let i = 0; i < n; i += 1) {
    DB.push({
      id: statut + "-" + i,
      prenom: "Contact",
      nom: (statut === "client_refuse" ? "Refus" : "Autre") + String(i).padStart(3, "0"),
      nomSociete: statut === "client_refuse" ? (i < 6 ? null : i % 2 ? "Société Alpha" : "Société " + i) : "Société Autre",
      telephone: i % 10 === 0 ? null : "+2162000" + String(i).padStart(4, "0"),
      statut,
      nbAppels: 1,
      dateAppel: i % 5 === 0 ? null : "2026-09-01",
      createdBy: statut === "ok" && i === 255 ? TERRAIN_AFFECTE.id : SEDENTAIRE.id,
      commercialId: statut === "client_refuse" && i < 2 ? TERRAIN_AFFECTE.id : null,
      followedBy: (statut === "ok" && i < 7) || (statut === "rappeler_plus_tard" && i < 5) ? [TERRAIN_SUIVI.id] : [],
    });
  }
}

function serve() {
  kpiService.listCommercialContacts.mockImplementation(async (userId, { status, search, limit = 20, offset = 0 } = {}, { scope = "created" } = {}) => {
    let rows = DB;
    if (userId && scope === "assigned") rows = rows.filter((c) => c.createdBy === userId || c.commercialId === userId || c.followedBy.includes(userId));
    else if (userId) rows = rows.filter((c) => c.createdBy === userId);
    if (status) rows = rows.filter((c) => c.statut === status);
    if (search) rows = rows.filter((c) => (c.prenom + " " + c.nom).toLowerCase().includes(String(search).toLowerCase()));
    return { contacts: rows.slice(offset, offset + limit).map(({ createdBy, commercialId, followedBy, ...c }) => c), total: rows.length };
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
  const witness = (name, intentNames) => {
    const agent = new BaseAgent({ name, systemPrompt: "x", intentNames, chatModel: {}, tools: [], allowedToolNames: [], workflowEngine });
    agent._run = async () => ({ answer: `[${name}]`, citations: [], toolSteps: [] });
    return agent;
  };
  agents.register(witness("project_agent", ["projects"]));
  agents.register(witness("assistant_agent", ["general_chat", "documentation_question"]));
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
  const say = (message) => manager.handleMessage({ message, user, conversationId: `conv-${user.id}` });
  return { chatModel, say, ask: (message) => manager.handleMessage({ message, user, conversationId: `c-${user.id}-${(n += 1)}` }) };
}

const stepOf = (r) => r.toolCalls.find((c) => c.tool === "get_my_commercial_contacts");
let spies;
beforeEach(() => {
  jest.clearAllMocks();
  serve();
  spies = ["log", "info", "warn", "error"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));
const logged = () => spies.flatMap((s) => s.mock.calls.flat()).map(String).join(" ");

describe("Reconnaissance : le mot de l'utilisateur → l'une des 4 valeurs réelles du statut", () => {
  test.each([
    ["Liste les contacts refusés", "client_refuse", "list"],
    ["donne moi les contact refuser", "client_refuse", "list"],
    ["les contacts avec le statut client_refuse", "client_refuse", "list"],
    ["list refused contacts", "client_refuse", "list"],
    ["Combien de contacts ont été refusés ?", "client_refuse", "count"],
    ["Combien de mes contacts ont le statut client_refuse ?", "client_refuse", "count"],
    ["how many contacts were rejected?", "client_refuse", "count"],
    ["Analyse les contacts refusés", "client_refuse", "analysis"],
    ["Analyse mes contacts refusés", "client_refuse", "analysis"],
    ["les projets dont le client est refusé", "client_refuse", "projects"],
    ["Quels projets concernent des clients refusés ?", "client_refuse", "projects"],
    ["contacts injoignables", "user_injoignable", "list"],
    ["contacts à rappeler plus tard", "rappeler_plus_tard", "list"],
    ["Donne-moi la répartition de mes contacts par statut", null, "distribution"],
    ["contacts by status", null, "distribution"],
  ])("« %s » → %s / %s", (message, status, operation) => {
    expect(detectContactStatusRequest(message)).toMatchObject({ status, operation });
  });

  test.each(["projets refusés", "liste des projets", "répartition des projets par statut", "relance les contacts refusés", "Donne-moi la liste des contacts commerciaux", "analyse mes contacts", "le client a refusé le devis du projet Holya", "statut du projet Sfax"])("« %s » : pas une demande de contacts par statut", (message) => {
    expect(detectContactStatusRequest(message)).toBeNull();
  });
});

describe("Administrateur — périmètre global, celui du tableau de bord", () => {
  test("« Combien de contacts ont été refusés ? » → 63 sur 485, avec la répartition du tableau de bord", async () => {
    const h = harness(ADMIN);
    const r = await h.ask("Combien de contacts ont été refusés ?");
    expect(r.agent).toBe("commercial_agent");
    expect(stepOf(r).output).toMatchObject({ status: "client_refuse", operation: "count", scope: "all", total: 63, totalAll: 485, counts: COUNTS });
    expect(r.answer).toContain("Dans le CRM, 63 contacts ont le statut « client_refuse », sur 485 contacts consultables.");
    for (const [status, n] of Object.entries(COUNTS)) expect(r.answer).toContain("• " + status + " : " + n + " (");
    expect(r.answer).toContain("Même source et même calcul que le tableau de bord « Commercial Contacts KPI »");
    // Chaque nombre vient de l'outil : périmètre global (aucun filtre utilisateur).
    for (const [userId, , options] of kpiService.listCommercialContacts.mock.calls) {
      expect(userId).toBeNull();
      expect(options).toEqual({ scope: "created" });
    }
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test.each([
    ["Combien de contacts injoignables ?", 93, "user_injoignable"],
    ["Combien de contacts ont le statut ok ?", 256, "ok"],
  ])("« %s » → %i sur 485", async (message, n, status) => {
    const r = await harness(ADMIN).ask(message);
    expect(r.answer).toContain("Dans le CRM, " + n + " contacts ont le statut « " + status + " », sur 485 contacts consultables.");
  });

  test("« à rappeler plus tard » garde son chemin existant (analyse des relances) et donne le même nombre : 73", async () => {
    const r = await harness(ADMIN).ask("Combien de contacts à rappeler plus tard ?");
    expect(r.answer).toContain("73 contact(s) marqué(s) « à rappeler plus tard »");
  });

  test("« Liste les contacts refusés » → 63 sur 485, 20 affichés, tous au bon statut", async () => {
    const r = await harness(ADMIN).ask("Liste les contacts refusés");
    expect(r.answer).toContain("Dans le CRM, 63 contacts ont le statut « client_refuse », sur 485 contacts consultables.");
    expect(r.answer).toContain("20 affichés sur 63.");
    expect((r.answer.match(/Contact Refus\d{3}/g) || []).length).toBe(20);
    expect(r.answer).not.toContain("Contact Autre");
    expect(r.answer).toContain("... et 43 autres contacts non affichés ici.");
  });

  test("« Analyse les contacts refusés » → part, répartition et statistiques sur les 63 contacts lus", async () => {
    const r = await harness(ADMIN).ask("Analyse les contacts refusés");
    expect(stepOf(r).output).toMatchObject({ total: 63, read: 63 });
    expect(r.answer).toContain("📊 ANALYSE DES CONTACTS REFUSÉS");
    expect(r.answer).toContain("Soit 13 % de ces contacts.");
    expect(r.answer).toContain("• Appels enregistrés : 63");
    expect(r.answer).toContain("• Sans téléphone : 7");
    expect(r.answer).toContain("• Sans société renseignée : 6");
    expect(r.answer).toContain("• Société Alpha : 28");
    expect(r.answer).not.toContain("Lecture incomplète");
  });

  test("« Donne-moi la répartition des contacts par statut » → les 4 statuts, somme = 485", async () => {
    const r = await harness(ADMIN).ask("Donne-moi la répartition des contacts par statut");
    expect(r.agent).toBe("commercial_agent");
    expect(r.answer).toContain("📊 RÉPARTITION DES CONTACTS PAR STATUT");
    expect(r.answer).toContain("Répartition des 485 contacts consultables par statut :");
    expect(r.answer).toContain("• ok : 256 (52.8 %)");
    expect(r.answer).toContain("• client_refuse : 63 (13 %)");
    const counts = stepOf(r).output.counts;
    expect(Object.values(counts).reduce((x, y) => x + y, 0)).toBe(485);
  });

  test("« les projets dont le client est refusé » → les 63 contacts refusés, l'absence de lien contact-projet dite ; aucun projet inventé", async () => {
    const r = await harness(ADMIN).ask("les projets dont le client est refusé");
    expect(r.agent).toBe("commercial_agent");
    expect(r.answer).toContain("Le CRM ne relie pas les contacts commerciaux aux projets");
    expect(r.answer).toContain("63 contacts ont le statut « client_refuse », sur 485 contacts consultables.");
    expect(r.answer).not.toContain("📁");
  });
});

describe("Commercial sédentaire", () => {
  test("créateur des contacts : 63 sur 485, dans SON périmètre (contacts créés)", async () => {
    const r = await harness(SEDENTAIRE).ask("Combien de contacts ont été refusés ?");
    for (const [userId, , options] of kpiService.listCommercialContacts.mock.calls) {
      expect(userId).toBe(SEDENTAIRE.id);
      expect(options).toEqual({ scope: "created" });
    }
    expect(r.answer).toContain("Dans votre périmètre, 63 contacts ont le statut « client_refuse », sur 484 contacts consultables.");
    expect(r.answer).toContain("Périmètre : les contacts que vous avez créés.");
  });

  test("autre commercial sédentaire, sans aucun contact : dit qu'aucun contact n'est consultable — pas « aucun refusé »", async () => {
    const r = await harness(AUTRE_SEDENTAIRE).ask("Liste les contacts refusés");
    expect(r.answer).toContain("Aucun contact n'est consultable dans votre périmètre (les contacts que vous avez créés)");
    expect(r.answer).toContain("Le tableau de bord d'un administrateur porte sur tous les contacts du CRM");
    expect(r.answer).not.toContain("Contact Refus");
  });
});

describe("Commercial (terrain) — le nombre de SON périmètre, jamais le total global", () => {
  test("12 contacts suivis, aucun refusé : comptage → « 0 … sur 12 » et la répartition réelle", async () => {
    const h = harness(TERRAIN_SUIVI);
    const r = await h.ask("Combien de mes contacts ont le statut client_refuse ?");
    expect(r.agent).toBe("commercial_agent");
    for (const [userId, , options] of kpiService.listCommercialContacts.mock.calls) {
      expect(userId).toBe(TERRAIN_SUIVI.id);
      expect(options).toEqual({ scope: "assigned" });
    }
    expect(stepOf(r).output).toMatchObject({ scope: "assigned", total: 0, totalAll: 12, counts: { ok: 7, user_injoignable: 0, rappeler_plus_tard: 5, client_refuse: 0 } });
    expect(r.answer).toContain("Dans votre périmètre, 0 contact a le statut « client_refuse », sur 12 contacts consultables.");
    expect(r.answer).toContain("• ok : 7 (58.3 %)");
    expect(r.answer).toContain("• rappeler_plus_tard : 5 (41.7 %)");
    expect(r.answer).toContain("• client_refuse : 0 (0 %)");
    expect(r.answer).toContain("Périmètre : les contacts que vous avez créés, qui vous sont affectés ou que vous suivez par une relance.");
    // Jamais le total global ni un contact d'un autre.
    expect(r.answer).not.toMatch(/\b63\b|\b485\b|Contact Refus/);
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("même compte : comptage, liste et analyse donnent trois réponses différentes, toutes chiffrées", async () => {
    const h = harness(TERRAIN_SUIVI);
    const count = await h.ask("Combien de contacts ont été refusés ?");
    const list = await h.ask("Liste les contacts refusés");
    const analysis = await h.ask("Analyse mes contacts refusés");
    expect(new Set([count.answer, list.answer, analysis.answer]).size).toBe(3);
    for (const r of [count, list, analysis]) expect(r.answer).toContain("0 contact a le statut « client_refuse », sur 12 contacts consultables.");
    expect(list.answer).toContain("Il n'y a donc aucun contact à afficher pour ce statut.");
    expect(analysis.answer).toContain("Soit 0 % de ces contacts.");
    expect(analysis.answer).not.toContain("Appels enregistrés");
  });

  test("« Donne-moi la répartition de mes contacts par statut » → ses 12 contacts : 7 ok, 5 à rappeler", async () => {
    const r = await harness(TERRAIN_SUIVI).ask("Donne-moi la répartition de mes contacts par statut");
    expect(r.answer).toContain("Répartition des 12 contacts consultables par statut :");
    expect(r.answer).toContain("• ok : 7 (58.3 %)");
    expect(r.answer).toContain("• user_injoignable : 0 (0 %)");
  });

  test("2 contacts refusés affectés + 1 contact créé : « 2 … sur 3 », et seulement ces deux-là dans la liste", async () => {
    const count = await harness(TERRAIN_AFFECTE).ask("Combien de contacts ont été refusés ?");
    expect(count.answer).toContain("Dans votre périmètre, 2 contacts ont le statut « client_refuse », sur 3 contacts consultables.");
    const list = await harness(TERRAIN_AFFECTE).ask("Liste les contacts refusés");
    expect(list.answer).toContain("Contact Refus000");
    expect(list.answer).toContain("Contact Refus001");
    // Les 61 autres refusés sont affectés ailleurs : jamais affichés, jamais comptés.
    expect(list.answer).not.toContain("Contact Refus002");
    expect((list.answer.match(/Contact Refus\d{3}/g) || []).length).toBe(2);
  });

  test("aucun contact dans son périmètre : « aucun contact consultable », pas un zéro présenté comme une statistique", async () => {
    const r = await harness(TERRAIN_VIDE).ask("Combien de contacts ont été refusés ?");
    expect(stepOf(r).output).toMatchObject({ totalAll: 0, total: 0 });
    expect(r.answer).toContain("Aucun contact n'est consultable dans votre périmètre (les contacts que vous avez créés, qui vous sont affectés ou que vous suivez par une relance)");
    expect(r.answer).toContain("il peut afficher des contacts que votre rôle ne vous permet pas de consulter");
  });
});

describe("Refus et erreurs", () => {
  test("rôle non autorisé : refus, aucun contact lu", async () => {
    const user = { id: uuid(9), role: "responsable_logistique_achat" };
    const r = await harness(user).ask("Combien de contacts ont été refusés ?");
    expect(r.mode).toBe("error");
    expect(r.error.code).toBe("PERMISSION_DENIED");
    expect(kpiService.listCommercialContacts).not.toHaveBeenCalled();
  });

  test.each(["Combien de contacts ont été refusés ?", "Liste les contacts refusés", "Analyse mes contacts refusés", "Donne-moi la répartition de mes contacts par statut"])("erreur SQL pendant « %s » : dit comme un échec, aucun nombre, cause dans le journal seulement", async (message) => {
    kpiService.listCommercialContacts.mockRejectedValue(Object.assign(new Error('relation "commercial_contacts" does not exist'), { name: "SequelizeDatabaseError" }));
    const r = await harness(TERRAIN_SUIVI).ask(message);
    expect(r.mode).toBe("agent");
    expect(r.answer).toContain("Je n'ai pas pu lire les contacts : la récupération des données a échoué. Ce n'est pas un résultat égal à zéro");
    expect(r.answer).not.toMatch(/\d+ contact|Aucun contact|relation|does not exist/);
    expect(stepOf(r).output).toEqual({ error: "CONTACT_STATUS_FAILED" });
    expect(logged()).toMatch(/CONTACT_STATUS_FAILED/);
  });

  test("échec au milieu des comptages (3ᵉ lecture) : aucun résultat partiel", async () => {
    let n = 0;
    const real = kpiService.listCommercialContacts.getMockImplementation();
    kpiService.listCommercialContacts.mockImplementation(async (...args) => {
      n += 1;
      if (n === 3) throw new Error("connection terminated");
      return real(...args);
    });
    const r = await harness(ADMIN).ask("Combien de contacts ont été refusés ?");
    expect(r.answer).toContain("Je n'ai pas pu lire les contacts");
    expect(r.answer).not.toMatch(/485|\b63\b/);
  });
});

describe("Langue et non-régression", () => {
  test("anglais : réponse en anglais", async () => {
    const r = await harness(ADMIN).ask("how many contacts were rejected?");
    expect(r.answer).toContain('In the CRM, 63 contacts have the status "client_refuse", out of 485 viewable contacts.');
  });

  test("« liste des contacts commerciaux » (sans statut) garde son chemin", async () => {
    const h = harness(ADMIN);
    const list = await h.ask("Donne-moi la liste des contacts commerciaux");
    expect(list.answer).toContain("485 contact(s) commercial(aux)");
    expect(kpiService.listCommercialContacts).toHaveBeenLastCalledWith(null, { limit: 20 }, { scope: "created" });
  });

  test("une question sur les projets sans client ni contact reste à l'agent projets", async () => {
    const r = await harness(ADMIN).ask("Quels sont les projets refusés ?");
    expect(r.agent).toBe("project_agent");
  });
});

describe("BUG SIGNALÉ — « Je n'ai trouvé aucun contact correspondant » pour un filtre par statut", () => {
  const { extractContactName, extractCommercialActionSlots, isCommercialActionRequest } = require("../src/ai/agents/commercialActionSlotExtractor");
  const NOT_FOUND = /aucun contact correspondant/i;

  test.each([
    ["donne-moi les contacts dont le statut est client refuse", "client_refuse", 63],
    ["donne-moi les contacts dont le statut est ok", "ok", 256],
    ["contacts refusés", "client_refuse", 63],
    ["contacts dont le client a refusé", "client_refuse", 63],
    ["contacts client_refuse", "client_refuse", 63],
    ["contacts OK", "ok", 256],
    ["contacts avec le statut ok", "ok", 256],
    ["liste des contacts injoignables", "user_injoignable", 93],
    ["donne-moi le contact dont le statut est ok", "ok", 256],
    ["liste mes contacts pour le statut refusé", "client_refuse", 63],
  ])("« %s » → filtre %s : %i contacts, les 20 premiers affichés, tous de ce statut", async (message, status, n) => {
    const h = harness(ADMIN);
    const r = await h.ask(message);
    expect(r.agent).toBe("commercial_agent");
    expect(r.answer).not.toMatch(NOT_FOUND);
    expect(kpiService.listCommercialContacts).toHaveBeenCalledWith(null, expect.objectContaining({ status, limit: 20 }), { scope: "created" });
    expect(stepOf(r).output).toMatchObject({ status, operation: "list", total: n, totalAll: 485, read: 20 });
    expect(r.answer).toContain("Dans le CRM, " + n + " contacts ont le statut « " + status + " », sur 485 contacts consultables.");
    expect((r.answer.match(/^\d+\. Contact /gm) || []).length).toBe(20);
    if (status === "client_refuse") expect(r.answer).not.toContain("Contact Autre");
    else expect(r.answer).not.toContain("Contact Refus");
    expect(h.chatModel.invoke).not.toHaveBeenCalled();
  });

  test("cause racine : une formule courante n'est plus prise pour un NOM de contact", () => {
    for (const message of ["liste mes contacts pour le statut refusé", "donne-moi le contact dont le statut est ok", "donne moi les contacts pour le statut ok", "contacts pour client refuse", "analyse pour moi mes contacts", "donne-moi les statistiques pour ce mois", "programme une relance pour les contacts refusés"]) {
      expect(extractContactName(message)).toBeNull();
      expect(isCommercialActionRequest(extractCommercialActionSlots([message]))).toBe(false);
    }
    // Les vrais noms restent reconnus.
    expect(extractContactName("Relance le contact Amine Ben Salah pour demain")).toBe("Amine Ben Salah");
    expect(extractContactName("relancer Pépinière awled el HAJ pour le 21/08")).toBe("Pépinière awled el HAJ");
    expect(extractContactName("affecte Sana Trabelsi à commercial@cbi.tn")).toBe("Sana Trabelsi");
    expect(extractContactName("programme une relance demain pour amine ben salah")).toBe("amine ben salah");
  });

  test("même conversation : un message antérieur ambigu ne capture plus les demandes suivantes", async () => {
    const h = harness(ADMIN);
    await h.say("liste mes contacts pour le statut refusé");
    const ok = await h.say("donne-moi les contacts dont le statut est ok");
    const refused = await h.say("donne-moi les contacts dont le statut est client refuse");
    expect(ok.answer).not.toMatch(NOT_FOUND);
    expect(ok.answer).toContain("256 contacts ont le statut « ok »");
    expect(refused.answer).not.toMatch(NOT_FOUND);
    expect(refused.answer).toContain("63 contacts ont le statut « client_refuse »");
  });

  test("même conversation : une action abandonnée (nom donné, date jamais fournie) ne capture pas la lecture qui suit", async () => {
    const h = harness(ADMIN);
    const action = await h.say("Relance le contact Zzz Inconnu");
    expect(action.answer).toMatch(NOT_FOUND); // ce nom n'existe pas : réponse légitime ICI
    const list = await h.say("donne-moi les contacts dont le statut est ok");
    expect(list.answer).not.toMatch(NOT_FOUND);
    expect(list.answer).toContain("256 contacts ont le statut « ok »");
    const count = await h.say("Combien de contacts ont été refusés ?");
    expect(count.answer).toContain("63 contacts ont le statut « client_refuse », sur 485");
    const all = await h.say("Donne-moi la liste des contacts commerciaux");
    expect(all.answer).toContain("485 contact(s) commercial(aux)");
  });

  test("une action en cours reste poursuivie quand le message suivant la complète (date)", async () => {
    const h = harness(ADMIN);
    const first = await h.say("Relance le contact Refus000");
    expect(first.answer).toContain("il me manque encore une date");
    const next = await h.say("Programme la relance pour le 21/08");
    // Le message apporte une date : c'est bien la suite de l'action, pas une lecture.
    expect(next.answer).not.toContain("contacts consultables");
    expect(next.answer).not.toMatch(NOT_FOUND);
    expect(next.answer).toContain("Refus000");
  });

  test("commercial : mêmes demandes, dans SON périmètre — chiffrées, jamais « aucun contact correspondant »", async () => {
    const h = harness(TERRAIN_SUIVI);
    const ok = await h.ask("donne-moi les contacts dont le statut est ok");
    expect(ok.answer).toContain("Dans votre périmètre, 7 contacts ont le statut « ok », sur 12 contacts consultables.");
    expect((ok.answer.match(/^\d+\. Contact /gm) || []).length).toBe(7);
    const refused = await h.ask("donne-moi les contacts dont le statut est client refuse");
    expect(refused.answer).toContain("Dans votre périmètre, 0 contact a le statut « client_refuse », sur 12 contacts consultables.");
    for (const r of [ok, refused]) expect(r.answer).not.toMatch(NOT_FOUND);
  });

  test("comptage : requêtes de comptage seulement (limit 1), jamais la liste entière", async () => {
    await harness(ADMIN).ask("Combien de contacts ont été refusés ?");
    for (const [, input] of kpiService.listCommercialContacts.mock.calls) expect(input.limit).toBe(1);
    expect(kpiService.listCommercialContacts).toHaveBeenCalledTimes(5); // total + 4 statuts
  });
});
