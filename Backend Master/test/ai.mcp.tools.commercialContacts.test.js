"use strict";

jest.mock("../src/modules/commercial-contacts/services/commercialContactKpi.service", () => ({
  getCommercialContactKPI: jest.fn(),
  getCommercialContactAnalytics: jest.fn(),
  getMyKPI: jest.fn(),
  getPersonalKPISummary: jest.fn(),
  listCommercialContacts: jest.fn(),
}));

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS" : mocké pour la
// MÊME raison que commercialContactKpi.service ci-dessus — sans ce mock,
// `require("../src/ai/mcp/tools/commercialContacts")` (index.js) charge
// aussi `scheduleCommercialContactRelanceTool.js`, qui requiert ce service
// réel, qui requiert `src/db.js` — ce fichier de test ne configure
// délibérément aucune variable d'environnement DB.
jest.mock("../src/modules/commercial-contacts/services/commercialContactRelance.service", () => ({
  scheduleContactRelance: jest.fn(),
  ADMIN_TIER_ROLES: new Set(["admin", "superadmin", "superadmin2"]),
}));

const kpiService = require("../src/modules/commercial-contacts/services/commercialContactKpi.service");
const relanceService = require("../src/modules/commercial-contacts/services/commercialContactRelance.service");
const {
  createGetCommercialContactKpiTool,
  createGetCommercialContactAnalyticsTool,
  createGetPersonalKpiSummaryTool,
  createGetMyCommercialContactsTool,
  createScheduleCommercialContactRelanceTool,
} = require("../src/ai/mcp/tools/commercialContacts");
const { scopeInputForActingUser, ADMIN_TIER_ROLES } = require("../src/ai/mcp/tools/commercialContacts/getPersonalKpiSummaryTool");

const ADMIN = { id: "a1", role: "admin" };
const COMMERCIAL = { id: "c1", role: "commercial_sedentaire" };

beforeEach(() => jest.clearAllMocks());

describe("get_commercial_contact_kpi tool", () => {
  test("admin-tier -> getCommercialContactKPI(null); commercial -> getMyKPI(id)", async () => {
    kpiService.getCommercialContactKPI.mockResolvedValue({ total: 10 });
    kpiService.getMyKPI.mockResolvedValue({ total: 3 });
    const tool = createGetCommercialContactKpiTool();

    await tool.execute({}, { actingUser: ADMIN });
    expect(kpiService.getCommercialContactKPI).toHaveBeenCalledWith(null);

    await tool.execute({}, { actingUser: COMMERCIAL });
    expect(kpiService.getMyKPI).toHaveBeenCalledWith("c1");
  });
});

describe("get_commercial_contact_analytics tool", () => {
  test("admin-tier -> getCommercialContactAnalytics(null); commercial -> getCommercialContactAnalytics(id)", async () => {
    kpiService.getCommercialContactAnalytics.mockResolvedValue({});
    const tool = createGetCommercialContactAnalyticsTool();

    await tool.execute({}, { actingUser: ADMIN });
    expect(kpiService.getCommercialContactAnalytics).toHaveBeenLastCalledWith(null);

    await tool.execute({}, { actingUser: COMMERCIAL });
    expect(kpiService.getCommercialContactAnalytics).toHaveBeenLastCalledWith("c1");
  });

  test("requires commercial or admin-tier — a plain 'user' role is denied at PermissionManager level, not here (schema-only test)", () => {
    expect(createGetCommercialContactAnalyticsTool().requiredRoles).toEqual([
      "commercial_sedentaire",
      "admin",
      "superadmin",
      "superadmin2",
    ]);
  });
});

describe("get_commercial_personal_kpi_summary tool", () => {
  test("forwards actingUser.id and optional commercialName to getPersonalKPISummary", async () => {
    kpiService.getPersonalKPISummary.mockResolvedValue({});
    const tool = createGetPersonalKpiSummaryTool();

    await tool.execute({}, { actingUser: COMMERCIAL });
    expect(kpiService.getPersonalKPISummary).toHaveBeenLastCalledWith("c1", null);

    await tool.execute({ commercialName: "mayssa" }, { actingUser: ADMIN });
    expect(kpiService.getPersonalKPISummary).toHaveBeenLastCalledWith("a1", "mayssa");
  });

  // AI-Business-Copilot/34_PERSONAL_KPI_SUMMARY_RBAC.md — TESTS OBLIGATOIRES
  // du correctif RBAC (voir getPersonalKpiSummaryTool.js::scopeInputForActingUser).
  const COMMERCIAL_B = { id: "b2", role: "commercial_sedentaire" };

  test("TEST 1 — commercial A demande ses KPI (aucun commercialName) : actingUser.id = A, KPI de A uniquement", async () => {
    kpiService.getPersonalKPISummary.mockResolvedValue({ totalContacts: 5 });
    const tool = createGetPersonalKpiSummaryTool();

    const result = await tool.execute({}, { actingUser: COMMERCIAL });

    expect(kpiService.getPersonalKPISummary).toHaveBeenCalledWith("c1", null);
    expect(result).toEqual({ totalContacts: 5 });
  });

  test("TEST 2 — commercial A demande explicitement les KPI de 'Commercial B' via commercialName : reste limité à A", async () => {
    kpiService.getPersonalKPISummary.mockResolvedValue({});
    const tool = createGetPersonalKpiSummaryTool();

    await tool.execute({ commercialName: "Commercial B" }, { actingUser: COMMERCIAL });

    // Le service n'est JAMAIS appelé avec le nom fourni — commercialName est
    // retiré avant d'atteindre getPersonalKPISummary, quel que soit son contenu.
    expect(kpiService.getPersonalKPISummary).toHaveBeenCalledWith("c1", null);
    expect(kpiService.getPersonalKPISummary).not.toHaveBeenCalledWith(expect.anything(), "Commercial B");
  });

  test("TEST 3 — un champ userId/commercialId fourni directement (hors schéma) n'atteint jamais run() — Joi stripUnknown, vérifié ici au niveau du Tool avec le champ déjà absent", async () => {
    kpiService.getPersonalKPISummary.mockResolvedValue({});
    const tool = createGetPersonalKpiSummaryTool();

    // Reproduit fidèlement ce que le Tool reçoit RÉELLEMENT en production :
    // ValidationManager.validateToolInput() (mcp/validationManager.js) valide
    // avec `stripUnknown: true` AVANT tool.execute() — un champ non déclaré
    // par inputSchema (seul `commercialName` existe) n'atteint donc jamais
    // ce code. Simulé ici en construisant l'input EXACTEMENT comme le ferait
    // ValidationManager (le schéma réel du Tool, mêmes options).
    const validated = tool.inputSchema.validate(
      { commercialName: "Commercial B", userId: "other-user-uuid", commercialId: "other-commercial-uuid" },
      { abortEarly: false, stripUnknown: true }
    ).value;
    expect(validated).toEqual({ commercialName: "Commercial B" }); // userId/commercialId déjà éliminés par Joi

    await tool.execute(validated, { actingUser: COMMERCIAL });

    expect(kpiService.getPersonalKPISummary).toHaveBeenCalledWith("c1", null); // toujours A, jamais un autre id
  });

  test("TEST 4 — admin demande les KPI d'un commercial nommé : comportement transverse existant conservé", async () => {
    kpiService.getPersonalKPISummary.mockResolvedValue({ totalContacts: 42 });
    const tool = createGetPersonalKpiSummaryTool();

    const result = await tool.execute({ commercialName: "Commercial B" }, { actingUser: ADMIN });

    expect(kpiService.getPersonalKPISummary).toHaveBeenCalledWith("a1", "Commercial B");
    expect(result).toEqual({ totalContacts: 42 });
  });

  test("TEST 4bis — superadmin/superadmin2 conservent également le comportement transverse", async () => {
    kpiService.getPersonalKPISummary.mockResolvedValue({});
    const tool = createGetPersonalKpiSummaryTool();

    await tool.execute({ commercialName: "Commercial B" }, { actingUser: { id: "sa1", role: "superadmin" } });
    expect(kpiService.getPersonalKPISummary).toHaveBeenLastCalledWith("sa1", "Commercial B");

    await tool.execute({ commercialName: "Commercial B" }, { actingUser: { id: "sa2", role: "superadmin2" } });
    expect(kpiService.getPersonalKPISummary).toHaveBeenLastCalledWith("sa2", "Commercial B");
  });

  test("TEST 5 — scopeInputForActingUser() exportée : preuve directe et unitaire du mécanisme de protection", () => {
    expect(scopeInputForActingUser({ commercialName: "Commercial B" }, COMMERCIAL)).toEqual({});
    expect(scopeInputForActingUser({ commercialName: "Commercial B" }, COMMERCIAL_B)).toEqual({});
    expect(scopeInputForActingUser({}, COMMERCIAL)).toEqual({});
    expect(scopeInputForActingUser({ commercialName: "Commercial B" }, ADMIN)).toEqual({ commercialName: "Commercial B" });
    expect(ADMIN_TIER_ROLES.has("commercial")).toBe(false);
    expect([...ADMIN_TIER_ROLES]).toEqual(["admin", "superadmin", "superadmin2"]);
  });
});

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "EXPOSER
// LA LISTE DES CONTACTS À RELANCER AU COPILOT".
describe("get_my_commercial_contacts tool", () => {
  test("commercial -> userId=actingUser.id ; admin-tier -> userId=null (vue transverse)", async () => {
    kpiService.listCommercialContacts.mockResolvedValue({ contacts: [], total: 0 });
    const tool = createGetMyCommercialContactsTool();

    await tool.execute({ status: "rappeler_plus_tard", limit: 20 }, { actingUser: COMMERCIAL });
    expect(kpiService.listCommercialContacts).toHaveBeenLastCalledWith("c1", { status: "rappeler_plus_tard", limit: 20 }, { scope: "created" });

    await tool.execute({ status: "rappeler_plus_tard" }, { actingUser: ADMIN });
    expect(kpiService.listCommercialContacts).toHaveBeenLastCalledWith(null, { status: "rappeler_plus_tard" }, { scope: "created" });
  });

  test("commercial (terrain) -> ses contacts créés, affectés ou suivis : périmètre « assigned », jamais transverse, jamais choisi par l'appelant", async () => {
    kpiService.listCommercialContacts.mockResolvedValue({ contacts: [], total: 0 });
    const tool = createGetMyCommercialContactsTool();
    const terrain = { id: "t1", role: "commercial" };
    await tool.execute({ limit: 20, userId: "autre", createdBy: "autre", ownerId: "autre", commercialName: "najeh" }, { actingUser: terrain });
    expect(kpiService.listCommercialContacts).toHaveBeenLastCalledWith("t1", { limit: 20 }, { scope: "assigned" });
  });

  test("requires commercial or admin-tier", () => {
    expect(createGetMyCommercialContactsTool().requiredRoles).toEqual(["commercial", "commercial_sedentaire", "admin", "superadmin", "superadmin2"]);
  });
});

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS".
describe("schedule_commercial_contact_relance tool", () => {
  test("forwards contactId/dateRelance/commercialId to the service, jamais un ownerId/userId/createdBy (schéma ne les déclare pas)", async () => {
    relanceService.scheduleContactRelance.mockResolvedValue({ ok: true, relance: {}, contact: {} });
    const tool = createScheduleCommercialContactRelanceTool();

    const input = { contactId: "00000000-0000-4000-8000-000000000001", dateRelance: "2026-08-21", commercialId: "00000000-0000-4000-8000-000000000002" };
    await tool.execute(input, { actingUser: COMMERCIAL });

    expect(relanceService.scheduleContactRelance).toHaveBeenCalledWith(input.contactId, input, COMMERCIAL);
  });

  test("requires commercial or admin-tier", () => {
    expect(createScheduleCommercialContactRelanceTool().requiredRoles).toEqual(["commercial", "commercial_sedentaire", "admin", "superadmin", "superadmin2"]);
  });

  test("ownerId/userId/createdBy/commercialName ne sont PAS déclarés dans le schéma — Joi les élimine avant run()", () => {
    const tool = createScheduleCommercialContactRelanceTool();
    const validated = tool.inputSchema.validate(
      { contactId: "00000000-0000-4000-8000-000000000001", dateRelance: "2026-08-21", ownerId: "x", userId: "x", createdBy: "x", commercialName: "najeh" },
      { abortEarly: false, stripUnknown: true }
    ).value;
    expect(validated.contactId).toBe("00000000-0000-4000-8000-000000000001");
    expect(validated.ownerId).toBeUndefined();
    expect(validated.userId).toBeUndefined();
    expect(validated.createdBy).toBeUndefined();
    expect(validated.commercialName).toBeUndefined();
  });
});
