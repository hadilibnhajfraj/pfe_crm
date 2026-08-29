"use strict";

const {
  analyzeKpiDomain,
  analyzeProjectsDomain,
  analyzeSalesDomain,
  analyzePipelineDomain,
  analyzeDevisDomain,
  analyzeActivitiesDomain,
  analyzeInterventionsDomain,
  analyzePerformanceDomain,
} = require("../src/ai/reasoning/businessAnalyzer");

describe("analyzeKpiDomain — get_dashboard_kpis (forme admin)", () => {
  test("cite le nombre réel de projets et le taux de validation", () => {
    const analysis = analyzeKpiDomain({ role: "admin", stats: { totalProjects: 100, totalValidated: 80, validationRate: 80 } });
    expect(analysis.supported).toBe(true);
    expect(analysis.result[0]).toContain("100");
    expect(analysis.result[0]).toContain("80");
  });

  test("taux de validation < 50% : cause, risque et recommandation", () => {
    const analysis = analyzeKpiDomain({ role: "admin", stats: { totalProjects: 100, totalValidated: 40, validationRate: 40 } });
    expect(analysis.causes.some((c) => c.includes("40"))).toBe(true);
    expect(analysis.risks.length).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  test("taux de validation >= 50% : aucune cause liée à ce seuil", () => {
    const analysis = analyzeKpiDomain({ role: "admin", stats: { totalProjects: 100, totalValidated: 80, validationRate: 80 } });
    expect(analysis.causes).toEqual([]);
  });

  test("projets en attente > 0 : risque signalé", () => {
    const analysis = analyzeKpiDomain({ role: "admin", stats: { totalProjects: 10, validationRate: 90, totalPending: 5 } });
    expect(analysis.risks.some((r) => r.includes("5"))).toBe(true);
  });
});

describe("analyzeKpiDomain — get_dashboard_kpis (forme personnelle)", () => {
  test("relances personnelles en retard : cause, risque et recommandation", () => {
    const analysis = analyzeKpiDomain({ role: "user", stats: { myProjects: 8, successRate: 60, myRelancesLate: 3 } });
    expect(analysis.causes.some((c) => c.includes("3"))).toBe(true);
    expect(analysis.risks.length).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  test("aucune relance en retard : aucune cause", () => {
    const analysis = analyzeKpiDomain({ role: "user", stats: { myProjects: 8, successRate: 60, myRelancesLate: 0 } });
    expect(analysis.causes).toEqual([]);
  });
});

describe("analyzeProjectsDomain — list_projects (réutilise ProjectAttentionAnalyzer/dataCoherenceChecker)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = new Date("2026-06-01T00:00:00.000Z");
  const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();

  function project(overrides = {}) {
    return {
      id: "p1",
      nomProjet: "Chantier Test",
      nextRelanceDate: null,
      dateLimiteIngenieur: null,
      lastAction: null,
      pipelineStageId: "s1",
      stage: { name: "Ouvert", isWonStage: false, isLostStage: false },
      pourcentageReussite: 80,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(1),
      montantMarche: 5000,
      completionRate: 100,
      missingFields: [],
      ...overrides,
    };
  }

  test("un projet en retard : cité en cause, recommandation liée à la dimension 'retard'", () => {
    const analysis = analyzeProjectsDomain([project({ nextRelanceDate: daysAgo(40) })], { now: NOW });
    expect(analysis.causes.some((c) => c.includes("Chantier Test") && c.includes("retard"))).toBe(true);
    expect(analysis.recommendations).toContain("Programmer une relance ou une réunion pour les projets en retard.");
  });

  test("un projet en priorité critique est cité explicitement dans les risques", () => {
    const analysis = analyzeProjectsDomain(
      [project({ nextRelanceDate: daysAgo(40), dateLimiteIngenieur: daysAgo(40), montantMarche: 200000, pourcentageReussite: 10 })],
      { now: NOW }
    );
    expect(analysis.risks.some((r) => r.includes("CRITIQUE") && r.includes("Chantier Test"))).toBe(true);
  });

  test("une fiche incomplète déclenche un risque de fiabilité des données", () => {
    const analysis = analyzeProjectsDomain([project({ nextRelanceDate: daysAgo(40), completionRate: 20, missingFields: ["Adresse non renseignée"] })], { now: NOW });
    expect(analysis.risks.some((r) => r.includes("incomplète"))).toBe(true);
  });

  test("aucun projet signalé : résultat honnête, pas de cause fabriquée", () => {
    const analysis = analyzeProjectsDomain([project()], { now: NOW });
    expect(analysis.causes).toEqual([]);
    expect(analysis.result[0]).toContain("0 nécessitent une attention");
  });
});

describe("analyzeSalesDomain — get_commercial_contact_kpi / _analytics", () => {
  test("cite le nombre réel de contacts et d'appels", () => {
    const analysis = analyzeSalesDomain({ global: { totalContacts: 100, totalCalls: 50, averageCallsPerContact: 0.5 } });
    expect(analysis.result[0]).toContain("100");
    expect(analysis.result[0]).toContain("50");
  });

  test("proportion de contacts non validés >= 30% : cause, risque et recommandation", () => {
    const analysis = analyzeSalesDomain({ global: { totalContacts: 100, totalCalls: 50, contactsNonValides: 40 } });
    expect(analysis.causes.some((c) => c.includes("40"))).toBe(true);
    expect(analysis.risks.length).toBeGreaterThan(0);
  });

  test("proportion de contacts non validés < 30% : aucune cause liée", () => {
    const analysis = analyzeSalesDomain({ global: { totalContacts: 100, totalCalls: 50, contactsNonValides: 10 } });
    expect(analysis.causes).toEqual([]);
  });
});

describe("analyzePipelineDomain — get_professional_dashboard.pipeline", () => {
  test("identifie l'étape ouverte qui concentre le plus d'opportunités", () => {
    const analysis = analyzePipelineDomain({
      stages: [
        { name: "Prospect", count: 10, isWonStage: false, isLostStage: false },
        { name: "Devis envoyé", count: 3, isWonStage: false, isLostStage: false },
        { name: "Gagné", count: 5, isWonStage: true, isLostStage: false },
      ],
      conversions: { total: 20, won: 5, lost: 2, active: 13, conversionRate: 25 },
    });
    expect(analysis.causes.some((c) => c.includes("Prospect") && c.includes("10"))).toBe(true);
    expect(analysis.result[0]).toContain("25");
  });

  test("taux de conversion faible (< 20%) : risque et recommandation", () => {
    const analysis = analyzePipelineDomain({ stages: [], conversions: { total: 20, conversionRate: 10 } });
    expect(analysis.risks.length).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  test("taux de conversion correct (>= 20%) : aucun risque lié à ce seuil", () => {
    const analysis = analyzePipelineDomain({ stages: [], conversions: { total: 20, conversionRate: 30 } });
    expect(analysis.risks).toEqual([]);
  });
});

describe("analyzeDevisDomain — garantie 'ne jamais inventer une donnée'", () => {
  test("aucun Tool existant n'expose de métrique devis : supported: false, aucune valeur inventée", () => {
    const analysis = analyzeDevisDomain();
    expect(analysis.supported).toBe(false);
    expect(analysis.result).toEqual([]);
    expect(analysis.causes).toEqual([]);
    expect(analysis.risks).toEqual([]);
    expect(analysis.recommendations).toEqual([]);
    expect(analysis.note).toMatch(/[Aa]ucun AI Tool existant/);
  });
});

describe("analyzeActivitiesDomain — list_projects (actionsCount)", () => {
  test("cite le nombre réel d'actions et de projets sans aucune action", () => {
    const analysis = analyzeActivitiesDomain([{ actionsCount: 5 }, { actionsCount: 0 }, { actionsCount: 0 }]);
    expect(analysis.result[0]).toContain("5 action");
    expect(analysis.causes.some((c) => c.includes("2"))).toBe(true);
    expect(analysis.risks.length).toBeGreaterThan(0);
  });

  test("tous les projets ont au moins une action : aucun risque lié", () => {
    const analysis = analyzeActivitiesDomain([{ actionsCount: 5 }, { actionsCount: 2 }]);
    expect(analysis.causes).toEqual([]);
    expect(analysis.risks).toEqual([]);
  });
});

describe("analyzeInterventionsDomain — get_maintenance_stats", () => {
  test("demandes critiques : risque et recommandation", () => {
    const analysis = analyzeInterventionsDomain({ total: 20, enAttente: 5, enCours: 5, terminee: 8, critique: 2 });
    expect(analysis.risks.some((r) => r.includes("2") && r.includes("CRITIQUE"))).toBe(true);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  test("proportion de demandes en attente >= 40% : cause et recommandation", () => {
    const analysis = analyzeInterventionsDomain({ total: 10, enAttente: 5, enCours: 2, terminee: 3, critique: 0 });
    expect(analysis.causes.some((c) => c.includes("5"))).toBe(true);
  });

  test("aucune demande critique, peu de demandes en attente : pas de risque fabriqué", () => {
    const analysis = analyzeInterventionsDomain({ total: 10, enAttente: 1, enCours: 4, terminee: 5, critique: 0 });
    expect(analysis.risks).toEqual([]);
  });
});

describe("analyzePerformanceDomain — get_professional_dashboard", () => {
  test("alertes réelles (overdueProjects/missingValidation/missingDocuments) toutes citées", () => {
    const analysis = analyzePerformanceDomain({
      summary: { totalProjects: 50, validationRate: 60, successRate: 70 },
      alerts: { overdueProjects: 3, missingValidation: 2, missingDocuments: 1, unreadNotifications: 0 },
    });
    expect(analysis.causes.some((c) => c.includes("3"))).toBe(true);
    expect(analysis.causes.some((c) => c.includes("2"))).toBe(true);
    expect(analysis.risks.some((r) => r.includes("1"))).toBe(true);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  test("aucune alerte : aucune cause/risque fabriqué", () => {
    const analysis = analyzePerformanceDomain({
      summary: { totalProjects: 50, validationRate: 90, successRate: 90 },
      alerts: { overdueProjects: 0, missingValidation: 0, missingDocuments: 0, unreadNotifications: 0 },
    });
    expect(analysis.causes).toEqual([]);
    expect(analysis.risks).toEqual([]);
  });
});
