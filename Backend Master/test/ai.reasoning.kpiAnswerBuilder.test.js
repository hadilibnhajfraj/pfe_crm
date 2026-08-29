"use strict";

const { buildKpiAnswer } = require("../src/ai/reasoning/kpiAnswerBuilder");

const FIELD_LABELS = { total: "Nombre de projets créés", validated: "Nombre de projets validés" };

function baseArgs(overrides = {}) {
  return {
    kpiAnalysis: { result: ["20 projets au total, dont 8 validés (40%)."], causes: [], risks: [], recommendations: [] },
    comparison: { supported: false, note: "Historique insuffisant (moins de 2 mois de données) pour établir une comparaison." },
    forecasts: [
      { field: "total", label: FIELD_LABELS.total, forecast: { supported: false, note: 'Historique insuffisant pour estimer une prévision sur "total".' } },
      { field: "validated", label: FIELD_LABELS.validated, forecast: { supported: false, note: 'Historique insuffisant pour estimer une prévision sur "validated".' } },
    ],
    chart: { supported: false, note: "Aucune série mensuelle disponible pour construire un graphique." },
    explanations: [
      { field: "total", text: "Nombre de projets créés : historique insuffisant pour expliquer son évolution." },
      { field: "validated", text: "Nombre de projets validés : historique insuffisant pour expliquer son évolution." },
    ],
    alerts: [],
    fieldLabels: FIELD_LABELS,
    ...overrides,
  };
}

describe("buildKpiAnswer", () => {
  test("toujours les 6 sections principales présentes, même quand tout est non supporté", () => {
    const answer = buildKpiAnswer(baseArgs());
    expect(answer).toContain("### Résultat");
    expect(answer).toContain("### Comparaison (mois précédent → mois en cours)");
    expect(answer).toContain("### Pourquoi ces indicateurs évoluent-ils ?");
    expect(answer).toContain("### Prévision (mois prochain, estimation heuristique)");
    expect(answer).toContain("### Alertes");
    expect(answer).toContain("### Graphique (données)");
  });

  test("historique insuffisant : la note honnête apparaît, jamais une section masquée en silence", () => {
    const answer = buildKpiAnswer(baseArgs());
    expect(answer).toContain("Historique insuffisant (moins de 2 mois de données) pour établir une comparaison.");
    expect(answer).toContain("Aucune série mensuelle disponible pour construire un graphique.");
  });

  test("comparaison supportée : une ligne par champ, avec delta et direction", () => {
    const answer = buildKpiAnswer(
      baseArgs({
        comparison: {
          supported: true,
          metrics: [
            { field: "total", supported: true, previousValue: 10, currentValue: 14, delta: 4, deltaPct: 40, direction: "hausse" },
            { field: "validated", supported: true, previousValue: 4, currentValue: 6, delta: 2, deltaPct: 50, direction: "hausse" },
          ],
        },
      })
    );
    expect(answer).toContain("- Nombre de projets créés : 10 → 14 (+4, +40%) — hausse.");
    expect(answer).toContain("- Nombre de projets validés : 4 → 6 (+2, +50%) — hausse.");
  });

  test("prévision supportée : la valeur estimée et la tendance apparaissent", () => {
    const answer = buildKpiAnswer(
      baseArgs({
        forecasts: [{ field: "total", label: FIELD_LABELS.total, forecast: { supported: true, estimatedNextValue: 18, trendPerMonth: 4, basedOnMonths: ["2026-06", "2026-07"] } }],
      })
    );
    expect(answer).toContain("- Nombre de projets créés : environ 18 estimé le mois prochain (tendance +4/mois, basé sur 2026-06, 2026-07).");
  });

  test("aucune alerte : le dit explicitement plutôt que de laisser la section vide", () => {
    const answer = buildKpiAnswer(baseArgs({ alerts: [] }));
    expect(answer).toContain("Aucune alerte détectée.");
  });

  test("alertes présentes : une puce par alerte", () => {
    const answer = buildKpiAnswer(baseArgs({ alerts: ["3 projet(s) en retard.", "1 notification(s) non lue(s)."] }));
    expect(answer).toContain("- 3 projet(s) en retard.");
    expect(answer).toContain("- 1 notification(s) non lue(s).");
  });

  test("recommandations : section ajoutée seulement si non vide", () => {
    const withRecs = buildKpiAnswer(baseArgs({ kpiAnalysis: { result: ["r"], causes: [], risks: [], recommendations: ["Faire X."] } }));
    expect(withRecs).toContain("### Recommandations\n- Faire X.");

    const withoutRecs = buildKpiAnswer(baseArgs());
    expect(withoutRecs).not.toContain("### Recommandations");
  });

  test("graphique supporté : labels et séries apparaissent", () => {
    const answer = buildKpiAnswer(
      baseArgs({
        chart: { supported: true, labels: ["2026-06", "2026-07"], series: [{ name: "total", data: [10, 14] }, { name: "validated", data: [4, 6] }] },
      })
    );
    expect(answer).toContain("Labels (mois) : 2026-06, 2026-07");
    expect(answer).toContain("- total : [10, 14]");
    expect(answer).toContain("- validated : [4, 6]");
  });

  test("extraSections (répartition produit, vue historique) sont ajoutées à la fin, dans l'ordre fourni", () => {
    const answer = buildKpiAnswer(baseArgs({ extraSections: ["### Répartition par famille et diamètre de produit\n- Famille \"PEHD\" : 4 projet(s)."] }));
    expect(answer.endsWith('### Répartition par famille et diamètre de produit\n- Famille "PEHD" : 4 projet(s).')).toBe(true);
  });
});
