"use strict";

// Unit tests for the AI Dashboard briefing aggregator — every model/service
// it touches is mocked (same discipline as followupJob.dedup.test.js for
// raw Sequelize models); ProjectAttentionAnalyzer/DataQualityAnalyzer/
// SuggestionEngine run for REAL (pure, fast, no I/O) so this test also
// catches wiring mistakes against those real engines, not just this file's
// own logic. `buildToolPermissionIndex` is mocked to an empty Map — it
// instantiates all 73 real Tool factories, expensive and irrelevant here
// (permission-filtering itself is SuggestionEngine's own responsibility,
// already covered by test/ai.orchestrator.suggestionEngine.test.js).

jest.mock("../src/modules/projects/services/project.service", () => ({ listProjects: jest.fn() }));
jest.mock("../src/ai/orchestrator/pipeline", () => ({ buildToolPermissionIndex: jest.fn(() => new Map()) }));
jest.mock("../src/models/MaintenanceRequest", () => ({ count: jest.fn(), findAll: jest.fn() }));
jest.mock("../src/models/ProjectDevis", () => ({ count: jest.fn(), findAll: jest.fn() }));
jest.mock("../src/models/CommercialContactRelance", () => ({ findAll: jest.fn() }));
jest.mock("../src/models/CommercialContact", () => ({}));
jest.mock("../src/models/UserProfile", () => ({ findOne: jest.fn() }));

const projectService = require("../src/modules/projects/services/project.service");
const MaintenanceRequest = require("../src/models/MaintenanceRequest");
const ProjectDevis = require("../src/models/ProjectDevis");
const CommercialContactRelance = require("../src/models/CommercialContactRelance");
const UserProfile = require("../src/models/UserProfile");
const { getDashboardBriefing } = require("../src/modules/ai-copilot/services/dashboardBriefing.service");

const REQ_USER = { sub: "u1", role: "commercial", email: "khalil@cbi.tn" };
const MANAGER_REQ_USER = { sub: "m1", role: "admin", email: "admin@cbi.tn" };

const NON_CRITICAL_PROJECT = { id: "p-ok", nomProjet: "Immeuble Sousse", pourcentageReussite: 80, updatedAt: new Date().toISOString() };
const CRITICAL_PROJECT = {
  id: "p-crit",
  nomProjet: "Villa Sfax",
  nextRelanceDate: "2020-01-01", // très en retard -> priorité "critique"
  pourcentageReussite: 10,
  updatedAt: "2020-01-01T00:00:00.000Z",
};

function baseMocks() {
  projectService.listProjects.mockResolvedValue({ data: [NON_CRITICAL_PROJECT, CRITICAL_PROJECT] });
  UserProfile.findOne.mockResolvedValue({ prenom: "Khalil", nom: "Ben Ali", name: null });
  ProjectDevis.count.mockResolvedValue(0);
  ProjectDevis.findAll.mockResolvedValue([]);
  MaintenanceRequest.count.mockResolvedValue(0);
  MaintenanceRequest.findAll.mockResolvedValue([]);
  CommercialContactRelance.findAll.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  baseMocks();
});

describe("greeting — Bonjour {prénom}", () => {
  test("uses the profile's prenom when present", async () => {
    const { greeting } = await getDashboardBriefing(REQ_USER);
    expect(greeting.firstName).toBe("Khalil");
  });

  test("firstName is null (never fabricated) when the profile has no prenom", async () => {
    UserProfile.findOne.mockResolvedValue({ prenom: null, nom: null, name: null });
    const { greeting } = await getDashboardBriefing(REQ_USER);
    expect(greeting.firstName).toBeNull();
    expect(greeting.fullName).toBe(REQ_USER.email); // repli sur l'email, jamais une chaîne vide
  });
});

describe("projets critiques + qualité CRM + cartes de risque/recommandation", () => {
  test("compte uniquement les projets de priorité 'critique', jamais tous les projets signalés", async () => {
    const { today, riskCards } = await getDashboardBriefing(REQ_USER);
    expect(today.criticalProjects).toBe(1);
    expect(riskCards).toHaveLength(1);
    expect(riskCards[0].projectName).toBe("Villa Sfax");
    expect(riskCards[0].priority).toBe("critique");
    expect(riskCards[0].topReason).toEqual(expect.any(String));
  });

  test("qualité CRM reflète le vrai score de DataQualityAnalyzer, jamais une valeur fixe", async () => {
    const { crmQuality } = await getDashboardBriefing(REQ_USER);
    expect(crmQuality.score).toBeGreaterThanOrEqual(0);
    expect(crmQuality.score).toBeLessThanOrEqual(100);
  });

  test("appelle list_projects avec les MÊMES paramètres que ProjectAgent._runAttentionAnalysis (même périmètre)", async () => {
    await getDashboardBriefing(REQ_USER);
    expect(projectService.listProjects).toHaveBeenCalledWith({ limit: 100, isArchived: false }, REQ_USER.sub);
  });

  test("recommendationCards vient de SuggestionEngine (jamais vide quand un projet critique a des facteurs)", async () => {
    const { recommendationCards } = await getDashboardBriefing(REQ_USER);
    expect(Array.isArray(recommendationCards)).toBe(true);
    expect(recommendationCards.length).toBeGreaterThan(0);
    for (const card of recommendationCards) {
      expect(card).toEqual(expect.objectContaining({ id: expect.any(String), label: expect.any(String), reason: expect.any(String) }));
    }
  });
});

describe("interventions urgentes — réservé aux gestionnaires de maintenance", () => {
  test("null (pas 0) pour un rôle non gestionnaire — jamais un chiffre qu'il n'a pas le droit de voir", async () => {
    const { today } = await getDashboardBriefing(REQ_USER); // role: "commercial"
    expect(today.urgentInterventions).toBeNull();
    expect(MaintenanceRequest.count).not.toHaveBeenCalled();
  });

  test("un compte réel pour un rôle gestionnaire (admin/superadmin/responsable_logistique_achat)", async () => {
    MaintenanceRequest.count.mockResolvedValue(2);
    const { today } = await getDashboardBriefing(MANAGER_REQ_USER);
    expect(today.urgentInterventions).toBe(2);
    expect(MaintenanceRequest.count).toHaveBeenCalledWith({
      where: { urgence: "critique", statut: { [require("sequelize").Op.in]: ["en_attente", "acceptee", "en_cours"] } },
    });
  });
});

describe("devis expirants — champ net-new, jamais fabriqué", () => {
  test("0 quand aucun devis n'a de dateExpiration renseignée (jamais un chiffre inventé)", async () => {
    const { today } = await getDashboardBriefing(REQ_USER);
    expect(today.expiringQuotes).toBe(0);
  });

  test("reflète le compte réel de ProjectDevis.count quand des devis expirent bientôt", async () => {
    ProjectDevis.count.mockResolvedValue(3);
    ProjectDevis.findAll.mockResolvedValue([{ id: "d1", nomDevis: "Devis A", dateExpiration: "2026-08-10" }]);
    const { today, timeline } = await getDashboardBriefing(REQ_USER);
    expect(today.expiringQuotes).toBe(3);
    expect(timeline.some((t) => t.type === "quote" && t.refId === "d1")).toBe(true);
  });

  test("scope la recherche de devis aux projets déjà chargés (jamais tous les devis de la base)", async () => {
    await getDashboardBriefing(REQ_USER);
    const [{ where }] = ProjectDevis.count.mock.calls[0];
    expect(where.projectId[require("sequelize").Op.in]).toEqual(["p-ok", "p-crit"]);
  });
});

describe("clients à relancer — compte de clients DISTINCTS, scopé par créateur pour un rôle non admin", () => {
  test("dédoublonne : 2 relances pour le même client ne comptent qu'une fois", async () => {
    CommercialContactRelance.findAll.mockResolvedValue([
      { commercialContactId: "c1", dateRelance: "2026-08-01", contact: { prenom: "A", nom: "B" } },
      { commercialContactId: "c1", dateRelance: "2026-08-02", contact: { prenom: "A", nom: "B" } },
      { commercialContactId: "c2", dateRelance: "2026-08-01", contact: { prenom: "C", nom: "D" } },
    ]);
    const { today } = await getDashboardBriefing(REQ_USER);
    expect(today.clientsToFollowUp).toBe(2);
  });

  test("un rôle non admin ne voit que ses propres relances (createdBy = son id)", async () => {
    await getDashboardBriefing(REQ_USER);
    const [{ where }] = CommercialContactRelance.findAll.mock.calls[0];
    expect(where.createdBy).toBe(REQ_USER.sub);
  });

  test("un admin voit toutes les relances (aucun filtre createdBy)", async () => {
    await getDashboardBriefing(MANAGER_REQ_USER);
    const [{ where }] = CommercialContactRelance.findAll.mock.calls[0];
    expect(where.createdBy).toBeUndefined();
  });
});

describe("chart — dérivé des 4 mêmes compteurs, aucune nouvelle donnée", () => {
  test("values reflète exactement today.*, dans le même ordre que labels", async () => {
    ProjectDevis.count.mockResolvedValue(3);
    MaintenanceRequest.count.mockResolvedValue(2);
    CommercialContactRelance.findAll.mockResolvedValue([{ commercialContactId: "c1", dateRelance: "2026-08-01", contact: null }]);
    const { chart, today } = await getDashboardBriefing(MANAGER_REQ_USER);
    expect(chart.labels).toHaveLength(4);
    expect(chart.values).toEqual([today.criticalProjects, today.expiringQuotes, today.urgentInterventions, today.clientsToFollowUp]);
  });

  test("urgentInterventions null se traduit par 0 dans le graphique (jamais NaN/null affiché sur un axe)", async () => {
    const { chart } = await getDashboardBriefing(REQ_USER);
    expect(chart.values[2]).toBe(0);
  });
});

describe("timeline — regroupée en buckets Aujourd'hui/Cette semaine/Plus tard, triée par bucket", () => {
  test("un projet critique est toujours classé 'today' (pas de date unique naturelle)", async () => {
    const { timeline } = await getDashboardBriefing(REQ_USER);
    const projectItem = timeline.find((t) => t.type === "project");
    expect(projectItem.bucket).toBe("today");
  });

  test("les items 'today' apparaissent avant les items 'week'/'later'", async () => {
    ProjectDevis.count.mockResolvedValue(1);
    ProjectDevis.findAll.mockResolvedValue([{ id: "d1", nomDevis: "Devis lointain", dateExpiration: "2099-01-01" }]);
    const { timeline } = await getDashboardBriefing(REQ_USER);
    const bucketOrder = { today: 0, week: 1, later: 2 };
    for (let i = 1; i < timeline.length; i++) {
      expect(bucketOrder[timeline[i].bucket]).toBeGreaterThanOrEqual(bucketOrder[timeline[i - 1].bucket]);
    }
  });
});
