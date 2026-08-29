"use strict";

const { parseMonthDateRange, parseAmountThreshold, computeStartOfWeek, filterByThreshold, usersWithNoActivitySince } = require("../src/ai/reasoning/searchQueryParser");

describe("searchQueryParser — parseMonthDateRange", () => {
  test("reconnaît un mois français et construit la plage du mois, année en cours par défaut", () => {
    const result = parseMonthDateRange("Montre les projets créés en juin.", { now: new Date("2026-08-04T00:00:00Z") });
    expect(result).toEqual({ supported: true, month: 6, year: 2026, dateFrom: "2026-06-01", dateTo: "2026-06-30", label: "juin 2026" });
  });

  test("utilise l'année explicitement mentionnée si présente", () => {
    const result = parseMonthDateRange("Projets créés en mars 2025.", { now: new Date("2026-08-04T00:00:00Z") });
    expect(result.year).toBe(2025);
    expect(result.dateFrom).toBe("2025-03-01");
    expect(result.dateTo).toBe("2025-03-31");
  });

  test("calcule correctement le dernier jour du mois (fevrier, annee bissextile)", () => {
    const result = parseMonthDateRange("Projets créés en février.", { now: new Date("2028-01-01T00:00:00Z") });
    expect(result.dateTo).toBe("2028-02-29");
  });

  test("aucun mois reconnu : jamais une plage fabriquée", () => {
    const result = parseMonthDateRange("Montre les projets récents.", {});
    expect(result).toEqual({ supported: false, note: "Aucun mois reconnu dans la demande." });
  });
});

describe("searchQueryParser — parseAmountThreshold", () => {
  test("reconnaît un montant avec séparateur d'espace et le symbole €", () => {
    const result = parseAmountThreshold("Quels devis dépassent 50 000 € ?");
    expect(result).toEqual({ supported: true, amount: 50000, operator: "gt", operatorLabel: "supérieur à" });
  });

  test("reconnaît un montant collé au symbole, sans espace", () => {
    const result = parseAmountThreshold("Projets à plus de 12000€.");
    expect(result.amount).toBe(12000);
  });

  test("reconnaît 'euros' en toutes lettres", () => {
    const result = parseAmountThreshold("Projets de plus de 8000 euros.");
    expect(result.amount).toBe(8000);
  });

  test("un mot d'infériorité bascule l'opérateur sur 'lt'", () => {
    const result = parseAmountThreshold("Projets dont le montant est inférieur à 5000 €.");
    expect(result).toEqual({ supported: true, amount: 5000, operator: "lt", operatorLabel: "inférieur à" });
  });

  test("aucun montant reconnu : jamais un seuil fabriqué", () => {
    expect(parseAmountThreshold("Quels projets sont en retard ?").supported).toBe(false);
  });
});

describe("searchQueryParser — computeStartOfWeek", () => {
  test("un mercredi : revient au lundi de la même semaine, à minuit", () => {
    const start = computeStartOfWeek(new Date("2026-08-05T15:30:00")); // mercredi
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(3);
    expect(start.getHours()).toBe(0);
  });

  test("un dimanche : revient au lundi PRÉCÉDENT, pas au dimanche lui-même", () => {
    const start = computeStartOfWeek(new Date("2026-08-09T10:00:00")); // dimanche
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(3);
  });

  test("un lundi : reste sur ce même lundi, à minuit", () => {
    const start = computeStartOfWeek(new Date("2026-08-03T18:00:00")); // lundi
    expect(start.getDate()).toBe(3);
    expect(start.getHours()).toBe(0);
  });
});

describe("searchQueryParser — filterByThreshold", () => {
  const items = [{ nomProjet: "A", montantMarche: 10000 }, { nomProjet: "B", montantMarche: 60000 }, { nomProjet: "C" }];

  test("gt : ne garde que les valeurs numériques strictement supérieures", () => {
    expect(filterByThreshold(items, "montantMarche", "gt", 50000)).toEqual([{ nomProjet: "B", montantMarche: 60000 }]);
  });

  test("lt : ne garde que les valeurs numériques strictement inférieures", () => {
    expect(filterByThreshold(items, "montantMarche", "lt", 50000)).toEqual([{ nomProjet: "A", montantMarche: 10000 }]);
  });

  test("un champ non numérique/absent n'est jamais compté, jamais planté", () => {
    expect(filterByThreshold(items, "montantMarche", "gt", 0).length).toBe(2);
  });
});

describe("searchQueryParser — usersWithNoActivitySince", () => {
  const sinceDate = new Date("2026-08-03T00:00:00");

  test("signale un utilisateur sans lastActivity du tout", () => {
    const result = usersWithNoActivitySince([{ userId: "u1", lastActivity: null }], sinceDate);
    expect(result).toEqual([{ userId: "u1", lastActivity: null }]);
  });

  test("signale un utilisateur dont la dernière activité est avant la date de référence", () => {
    const result = usersWithNoActivitySince([{ userId: "u1", lastActivity: "2026-07-20T10:00:00Z" }], sinceDate);
    expect(result).toHaveLength(1);
  });

  test("n'inclut jamais un utilisateur actif depuis la date de référence", () => {
    const result = usersWithNoActivitySince([{ userId: "u1", lastActivity: "2026-08-04T10:00:00Z" }], sinceDate);
    expect(result).toEqual([]);
  });
});
