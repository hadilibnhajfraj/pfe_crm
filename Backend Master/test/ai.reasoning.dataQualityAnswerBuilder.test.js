"use strict";

const { buildDataQualityAnswer } = require("../src/ai/reasoning/dataQualityAnswerBuilder");

function emptyCategories(overrides = {}) {
  return {
    duplicates: [],
    missingInformation: [],
    invalidEmails: [],
    invalidPhones: [],
    missingDocuments: [],
    inconsistencies: [],
    workflowErrors: [],
    orphanedData: [],
    ...overrides,
  };
}

describe("buildDataQualityAnswer", () => {
  test("affiche toujours le Score Qualité en en-tête, quel que soit le contenu", () => {
    const answer = buildDataQualityAnswer({ qualityScore: 87, totalProjects: 12, categories: emptyCategories() });
    expect(answer).toContain("Score Qualité : 87/100");
    expect(answer).toContain("12 projet(s)");
  });

  test("aucun problème détecté : message explicite, jamais une section vide", () => {
    const answer = buildDataQualityAnswer({ qualityScore: 100, totalProjects: 5, categories: emptyCategories() });
    expect(answer).toMatch(/[Aa]ucun problème détecté/);
    expect(answer).not.toContain("###");
  });

  test("chaque élément affiché cite sa raison ET sa correction proposée", () => {
    const answer = buildDataQualityAnswer({
      qualityScore: 60,
      totalProjects: 3,
      categories: emptyCategories({
        invalidEmails: [{ label: "Chantier Sfax", reason: 'Email ingénieur invalide : "abc".', correction: 'Corriger le format de "Email ingénieur".' }],
      }),
    });
    expect(answer).toContain("### Emails invalides");
    expect(answer).toContain("Chantier Sfax — Email ingénieur invalide");
    expect(answer).toContain("Correction proposée : Corriger le format");
  });

  test("seules les catégories non vides apparaissent", () => {
    const answer = buildDataQualityAnswer({
      qualityScore: 90,
      totalProjects: 4,
      categories: emptyCategories({ orphanedData: [{ label: "X", reason: "r", correction: "c" }] }),
    });
    expect(answer).toContain("### Données orphelines");
    expect(answer).not.toContain("### Doublons");
    expect(answer).not.toContain("### Erreurs de workflow");
  });
});
