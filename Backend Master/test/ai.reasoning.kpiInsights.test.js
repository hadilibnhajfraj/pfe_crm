"use strict";

const { compareMonthlyEvolution, forecastNextPeriod, buildChartSeries, explainMetricMovement, formatProfessionalAlerts } = require("../src/ai/reasoning/kpiInsights");

const SERIES = [
  { month: "2026-05", total: 8, validated: 3 },
  { month: "2026-06", total: 10, validated: 4 },
  { month: "2026-07", total: 14, validated: 6 },
];

describe("kpiInsights — compareMonthlyEvolution", () => {
  test("compare les 2 DERNIERS points, même si la série a plus de 2 points", () => {
    const result = compareMonthlyEvolution(SERIES, ["total", "validated"]);
    expect(result.supported).toBe(true);
    expect(result.previousMonth).toBe("2026-06");
    expect(result.currentMonth).toBe("2026-07");

    const total = result.metrics.find((m) => m.field === "total");
    expect(total).toEqual({ field: "total", supported: true, previousMonth: "2026-06", currentMonth: "2026-07", previousValue: 10, currentValue: 14, delta: 4, deltaPct: 40, direction: "hausse" });
  });

  test("trie la série par mois avant de comparer, quel que soit l'ordre d'entrée", () => {
    const shuffled = [SERIES[2], SERIES[0], SERIES[1]];
    const result = compareMonthlyEvolution(shuffled, ["total"]);
    expect(result.previousMonth).toBe("2026-06");
    expect(result.currentMonth).toBe("2026-07");
  });

  test("direction 'baisse' et 'stable' calculées correctement", () => {
    const down = compareMonthlyEvolution([{ month: "2026-06", total: 10 }, { month: "2026-07", total: 6 }], ["total"]);
    expect(down.metrics[0].direction).toBe("baisse");
    expect(down.metrics[0].delta).toBe(-4);

    const stable = compareMonthlyEvolution([{ month: "2026-06", total: 10 }, { month: "2026-07", total: 10 }], ["total"]);
    expect(stable.metrics[0].direction).toBe("stable");
  });

  test("moins de 2 points : jamais une comparaison fabriquée", () => {
    expect(compareMonthlyEvolution([{ month: "2026-07", total: 5 }], ["total"])).toEqual({
      supported: false,
      note: "Historique insuffisant (moins de 2 mois de données) pour établir une comparaison.",
    });
    expect(compareMonthlyEvolution([], ["total"]).supported).toBe(false);
  });

  test("valeur précédente nulle : deltaPct explicitement null, jamais une division par zéro fabriquée", () => {
    const result = compareMonthlyEvolution([{ month: "2026-06", total: 0 }, { month: "2026-07", total: 5 }], ["total"]);
    expect(result.metrics[0].deltaPct).toBeNull();
    expect(result.metrics[0].delta).toBe(5);
  });

  test("champ absent d'un des deux points : ce champ n'est pas supporté, les autres le restent", () => {
    const result = compareMonthlyEvolution([{ month: "2026-06", total: 10 }, { month: "2026-07", total: 14, validated: 6 }], ["total", "validated"]);
    expect(result.metrics.find((m) => m.field === "total").supported).toBe(true);
    expect(result.metrics.find((m) => m.field === "validated")).toEqual({ field: "validated", supported: false });
  });
});

describe("kpiInsights — forecastNextPeriod", () => {
  test("tendance moyenne des 3 derniers points reportée sur le mois suivant", () => {
    const result = forecastNextPeriod(SERIES, "total");
    expect(result.supported).toBe(true);
    expect(result.trendPerMonth).toBe(3); // (10-8 + 14-10) / 2 = 3
    expect(result.estimatedNextValue).toBe(17); // 14 + 3
    expect(result.basedOnMonths).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  test("ne descend jamais sous 0, même avec une tendance fortement négative", () => {
    const declining = [{ month: "2026-06", total: 2 }, { month: "2026-07", total: 0 }];
    const result = forecastNextPeriod(declining, "total");
    expect(result.estimatedNextValue).toBe(0);
  });

  test("moins de 2 points : jamais une prévision fabriquée", () => {
    const result = forecastNextPeriod([{ month: "2026-07", total: 5 }], "total");
    expect(result.supported).toBe(false);
    expect(result.note).toContain("total");
  });
});

describe("kpiInsights — buildChartSeries", () => {
  test("construit {labels, series} triés par mois, un champ manquant devient 0 (jamais null dans un graphique)", () => {
    const result = buildChartSeries([{ month: "2026-07", total: 14 }, { month: "2026-06", total: 10, validated: 4 }], ["total", "validated"]);
    expect(result.supported).toBe(true);
    expect(result.labels).toEqual(["2026-06", "2026-07"]);
    expect(result.series).toEqual([
      { name: "total", data: [10, 14] },
      { name: "validated", data: [4, 0] },
    ]);
  });

  test("série vide : jamais un graphique fabriqué", () => {
    expect(buildChartSeries([], ["total"]).supported).toBe(false);
  });
});

describe("kpiInsights — explainMetricMovement", () => {
  test("hausse/baisse : phrase avec delta et facteurs présentés comme corrélation, jamais une causalité affirmée", () => {
    const comparison = compareMonthlyEvolution(SERIES, ["total"]).metrics[0];
    const text = explainMetricMovement("Nombre de projets créés", comparison, ["Cause X.", "Cause Y."]);
    expect(text).toContain("est en hausse : 10 → 14 entre 2026-06 et 2026-07");
    expect(text).toContain("+4, soit +40%");
    expect(text).toContain("corrélation, pas une causalité prouvée");
    expect(text).toContain("Cause X. ; Cause Y.");
  });

  test("stable : phrase dédiée, sans facteurs", () => {
    const comparison = compareMonthlyEvolution([{ month: "2026-06", total: 10 }, { month: "2026-07", total: 10 }], ["total"]).metrics[0];
    const text = explainMetricMovement("Nombre de projets créés", comparison, ["Cause X."]);
    expect(text).toBe("Nombre de projets créés est resté stable (10) entre 2026-06 et 2026-07.");
  });

  test("aucun facteur connu : la phrase de base reste honnête, sans inventer de cause", () => {
    const comparison = compareMonthlyEvolution(SERIES, ["total"]).metrics[0];
    const text = explainMetricMovement("Nombre de projets créés", comparison, []);
    expect(text).not.toContain("Facteur");
  });

  test("comparaison non supportée : le dit explicitement", () => {
    const text = explainMetricMovement("Nombre de projets créés", { supported: false }, []);
    expect(text).toBe("Nombre de projets créés : historique insuffisant pour expliquer son évolution.");
  });
});

describe("kpiInsights — formatProfessionalAlerts", () => {
  test("ne formate que les compteurs réellement positifs, jamais un seuil inventé", () => {
    const alerts = formatProfessionalAlerts({ overdueProjects: 2, missingDocuments: 0, missingValidation: 1, unreadNotifications: 0 });
    expect(alerts).toEqual(["2 projet(s) en retard.", "1 projet(s) en attente de validation."]);
  });

  test("objet vide/absent : aucune alerte fabriquée", () => {
    expect(formatProfessionalAlerts({})).toEqual([]);
    expect(formatProfessionalAlerts(null)).toEqual([]);
    expect(formatProfessionalAlerts(undefined)).toEqual([]);
  });
});
