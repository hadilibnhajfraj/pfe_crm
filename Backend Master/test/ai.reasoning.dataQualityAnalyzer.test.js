"use strict";

const {
  detectDuplicates,
  detectMissingInformation,
  detectInvalidEmails,
  detectInvalidPhones,
  detectMissingDocuments,
  detectInconsistencies,
  detectWorkflowErrors,
  detectOrphanedData,
  computeQualityScore,
  analyzeDataQuality,
  QUALITY_SCORE_WEIGHTS,
} = require("../src/ai/reasoning/dataQualityAnalyzer");

function project(overrides = {}) {
  return {
    id: "p1",
    nomProjet: "Chantier Test",
    ownerId: "owner-1",
    pipelineStageId: "stage-1",
    stage: { name: "Ouvert", isWonStage: false, isLostStage: false },
    isArchived: false,
    attachmentsCount: 2,
    completionRate: 100,
    missingFields: [],
    montantMarche: 5000,
    pourcentageReussite: 50,
    emailIngenieur: null,
    emailArchitecte: null,
    telephoneIngenieur: null,
    telephoneArchitecte: null,
    ...overrides,
  };
}

describe("detectDuplicates", () => {
  test("deux projets au nom strictement identique (insensible à la casse/espaces) sont signalés", () => {
    const projects = [
      project({ id: "a", nomProjet: "Chantier Sfax" }),
      project({ id: "b", nomProjet: "  chantier sfax  " }),
      project({ id: "c", nomProjet: "Chantier Sousse" }),
    ];
    const duplicates = detectDuplicates(projects);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].projectIds.sort()).toEqual(["a", "b"]);
    expect(duplicates[0].correction).toMatch(/fusionner|distincts/i);
  });

  test("aucun nom répété => aucun doublon", () => {
    const projects = [project({ id: "a", nomProjet: "A" }), project({ id: "b", nomProjet: "B" })];
    expect(detectDuplicates(projects)).toEqual([]);
  });
});

describe("detectMissingInformation — réutilise completionRate/missingFields déjà calculés", () => {
  test("une fiche incomplète est citée avec les champs manquants réels", () => {
    const items = detectMissingInformation([project({ completionRate: 40, missingFields: ["Adresse non renseignée", "Architecte non renseigné"] })]);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toContain("40%");
    expect(items[0].correction).toContain("Adresse non renseignée");
  });

  test("une fiche complète (missingFields vide) n'est jamais signalée", () => {
    expect(detectMissingInformation([project({ completionRate: 100, missingFields: [] })])).toEqual([]);
  });
});

describe("detectInvalidEmails — même règle que routes/projects.routes.js::isValidEmail", () => {
  test("un email mal formé est signalé, jamais un email absent (c'est 'informations manquantes')", () => {
    const items = detectInvalidEmails([project({ emailIngenieur: "pas-un-email", emailArchitecte: null })]);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toContain("pas-un-email");
    expect(items[0].reason).toContain("Email ingénieur");
  });

  test("un email valide n'est jamais signalé", () => {
    expect(detectInvalidEmails([project({ emailIngenieur: "ingenieur@cbi-tunisia.com" })])).toEqual([]);
  });

  test("les deux champs email peuvent être signalés indépendamment sur le même projet", () => {
    const items = detectInvalidEmails([project({ emailIngenieur: "invalide1", emailArchitecte: "invalide2" })]);
    expect(items).toHaveLength(2);
  });
});

describe("detectInvalidPhones — même règle que routes/projects.routes.js::isValidPhone", () => {
  test("un téléphone trop court est signalé", () => {
    const items = detectInvalidPhones([project({ telephoneIngenieur: "123" })]);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toContain("123");
  });

  test("un téléphone au format valide n'est jamais signalé", () => {
    expect(detectInvalidPhones([project({ telephoneIngenieur: "+216 22 123 456" })])).toEqual([]);
  });

  test("un téléphone absent n'est jamais signalé ici (informations manquantes s'en charge)", () => {
    expect(detectInvalidPhones([project({ telephoneIngenieur: null })])).toEqual([]);
  });
});

describe("detectMissingDocuments — proxy attachmentsCount", () => {
  test("aucune pièce jointe => document manquant signalé", () => {
    const items = detectMissingDocuments([project({ attachmentsCount: 0 })]);
    expect(items).toHaveLength(1);
  });

  test("au moins une pièce jointe => jamais signalé", () => {
    expect(detectMissingDocuments([project({ attachmentsCount: 1 })])).toEqual([]);
  });
});

describe("detectInconsistencies — réutilise dataCoherenceChecker.js intégralement", () => {
  test("étape gagnée avec avancement incomplet est bien remontée (règle déjà testée ailleurs, réutilisée ici)", () => {
    const items = detectInconsistencies([project({ stage: { name: "Gagné", isWonStage: true, isLostStage: false }, pourcentageReussite: 50 })]);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toMatch(/gagnée/);
  });

  test("un projet cohérent et complet ne produit aucune incohérence fabriquée", () => {
    expect(detectInconsistencies([project()])).toEqual([]);
  });
});

describe("detectWorkflowErrors — projet archivé mais étape toujours ouverte", () => {
  test("archivé + étape ouverte (ni gagnée ni perdue) => erreur de workflow", () => {
    const items = detectWorkflowErrors([project({ isArchived: true, stage: { name: "Négociation", isWonStage: false, isLostStage: false } })]);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toContain("Négociation");
  });

  test("archivé mais étape correctement close (gagnée) => aucune erreur", () => {
    expect(detectWorkflowErrors([project({ isArchived: true, stage: { name: "Gagné", isWonStage: true, isLostStage: false } })])).toEqual([]);
  });

  test("étape ouverte mais projet NON archivé => aucune erreur (état normal)", () => {
    expect(detectWorkflowErrors([project({ isArchived: false, stage: { name: "Négociation", isWonStage: false, isLostStage: false } })])).toEqual([]);
  });
});

describe("detectOrphanedData — sans propriétaire et/ou sans étape", () => {
  test("sans propriétaire ET sans étape => 2 anomalies distinctes", () => {
    const items = detectOrphanedData([project({ ownerId: null, pipelineStageId: null })]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.reason)).toEqual(expect.arrayContaining([expect.stringContaining("propriétaire"), expect.stringContaining("étape")]));
  });

  test("propriétaire ET étape assignés => aucune donnée orpheline", () => {
    expect(detectOrphanedData([project({ ownerId: "u1", pipelineStageId: "s1" })])).toEqual([]);
  });
});

describe("computeQualityScore — pénalité moyenne par projet", () => {
  test("aucun problème => score 100", () => {
    expect(computeQualityScore({}, 10)).toBe(100);
  });

  test("suit exactement la formule documentée (Σ poids×occurrences / nombre de projets)", () => {
    // 2 doublons(8) + 1 email invalide(5) => pénalité = 2*8 + 1*5 = 21, /10 projets = 2.1 => 100-2.1=97.9 => arrondi 98
    const categories = { duplicates: [{}, {}], invalidEmails: [{}] };
    expect(computeQualityScore(categories, 10)).toBe(98);
  });

  test("jamais négatif, même avec énormément de problèmes", () => {
    const categories = { duplicates: Array(100).fill({}) };
    expect(computeQualityScore(categories, 1)).toBe(0);
  });

  test("aucun projet dans le jeu de données => score 100 par convention (rien à auditer)", () => {
    expect(computeQualityScore({ duplicates: [{}] }, 0)).toBe(100);
  });
});

describe("analyzeDataQuality — intégration des 8 catégories", () => {
  test("renvoie categories/qualityScore/totalProjects cohérents avec les fonctions individuelles", () => {
    const projects = [
      project({ id: "a", nomProjet: "Chantier X", ownerId: null }),
      project({ id: "b", nomProjet: "Chantier X" }), // doublon avec "a"
    ];
    const result = analyzeDataQuality(projects);
    expect(result.totalProjects).toBe(2);
    expect(result.categories.duplicates).toHaveLength(1);
    expect(result.categories.orphanedData).toHaveLength(1);
    expect(result.qualityScore).toBeLessThan(100);
    expect(Object.keys(QUALITY_SCORE_WEIGHTS).sort()).toEqual(Object.keys(result.categories).sort());
  });

  test("un jeu de données parfaitement propre obtient le score maximal", () => {
    const result = analyzeDataQuality([project()]);
    expect(result.qualityScore).toBe(100);
    for (const items of Object.values(result.categories)) expect(items).toEqual([]);
  });
});
