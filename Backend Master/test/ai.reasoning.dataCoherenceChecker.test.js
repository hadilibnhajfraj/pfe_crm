"use strict";

const { checkProjectCoherence, checkProjectsCoherence, DEFAULT_COMPLETION_THRESHOLD } = require("../src/ai/reasoning/dataCoherenceChecker");

function project(overrides = {}) {
  return {
    id: "p1",
    nomProjet: "Chantier Test",
    completionRate: 100,
    missingFields: [],
    montantMarche: 5000,
    pourcentageReussite: 50,
    stage: { name: "Ouvert", isWonStage: false, isLostStage: false },
    ...overrides,
  };
}

describe("checkProjectCoherence — fiche incomplète (réutilise completionRate/missingFields déjà calculés par le CRM)", () => {
  test("aucun avertissement quand completionRate est au-dessus du seuil par défaut", () => {
    expect(checkProjectCoherence(project({ completionRate: 80 }))).toEqual([]);
  });

  test("avertissement quand completionRate est en-dessous du seuil, citant les champs manquants réels", () => {
    const warnings = checkProjectCoherence(project({ completionRate: 40, missingFields: ["Adresse non renseignée", "Montant marché non renseigné"] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("40%");
    expect(warnings[0]).toContain("Adresse non renseignée");
    expect(warnings[0]).toContain("Montant marché non renseigné");
  });

  test("le seuil est configurable", () => {
    expect(checkProjectCoherence(project({ completionRate: 70 }), { completionThreshold: 80 })).toHaveLength(1);
    expect(checkProjectCoherence(project({ completionRate: 70 }), { completionThreshold: 60 })).toEqual([]);
  });

  test("frontière exacte du seuil par défaut", () => {
    expect(checkProjectCoherence(project({ completionRate: DEFAULT_COMPLETION_THRESHOLD }))).toEqual([]); // égal au seuil : pas signalé
    expect(checkProjectCoherence(project({ completionRate: DEFAULT_COMPLETION_THRESHOLD - 1 }))).toHaveLength(1);
  });

  test("completionRate absent (pas un nombre) : pas de crash, pas d'avertissement de ce type", () => {
    expect(checkProjectCoherence(project({ completionRate: null }))).toEqual([]);
  });
});

describe("checkProjectCoherence — incohérences logiques", () => {
  test("étape marquée 'gagnée' avec avancement à 100% : cohérent, aucun avertissement", () => {
    const warnings = checkProjectCoherence(project({ stage: { name: "Gagné", isWonStage: true }, pourcentageReussite: 100 }));
    expect(warnings).toEqual([]);
  });

  test("étape marquée 'gagnée' mais avancement < 100% : incohérence signalée", () => {
    const warnings = checkProjectCoherence(project({ stage: { name: "Gagné", isWonStage: true }, pourcentageReussite: 60 }));
    expect(warnings.some((w) => w.includes("gagnée") && w.includes("60%"))).toBe(true);
  });

  test("étape ouverte (pas gagnée) avec avancement faible : jamais cette incohérence, c'est un état normal", () => {
    const warnings = checkProjectCoherence(project({ stage: { name: "Ouvert", isWonStage: false }, pourcentageReussite: 10 }));
    expect(warnings.some((w) => w.includes("gagnée"))).toBe(false);
  });

  test("montant marché renseigné mais aucun avancement suivi (null) : incohérence signalée", () => {
    const warnings = checkProjectCoherence(project({ montantMarche: 20000, pourcentageReussite: null }));
    expect(warnings.some((w) => w.includes("Montant marché renseigné") && w.includes("20000"))).toBe(true);
  });

  test("montant marché absent : jamais cette incohérence (rien à comparer)", () => {
    const warnings = checkProjectCoherence(project({ montantMarche: null, pourcentageReussite: null }));
    expect(warnings.some((w) => w.includes("Montant marché renseigné"))).toBe(false);
  });

  test("un projet parfaitement cohérent et complet ne produit AUCUN avertissement fabriqué", () => {
    expect(checkProjectCoherence(project())).toEqual([]);
  });
});

describe("checkProjectsCoherence — agrégation sur une liste", () => {
  test("ne renvoie qu'un élément par projet EFFECTIVEMENT signalé, jamais un élément vide", () => {
    const projects = [
      project({ id: "clean", completionRate: 100 }),
      project({ id: "incomplete", completionRate: 20, missingFields: ["Adresse non renseignée"] }),
    ];
    const flagged = checkProjectsCoherence(projects);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ projectId: "incomplete", projectName: "Chantier Test" });
    expect(flagged[0].warnings).toHaveLength(1);
  });

  test("liste vide => résultat vide", () => {
    expect(checkProjectsCoherence([])).toEqual([]);
  });

  test("le nom du projet retombe sur un repli si nomProjet est absent", () => {
    const flagged = checkProjectsCoherence([{ id: "x", completionRate: 10, missingFields: [] }]);
    expect(flagged[0].projectName).toBe("Projet sans nom");
  });
});
