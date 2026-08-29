"use strict";

const { analyzeProjectAttention, DEFAULT_BUSINESS_RULES } = require("../src/ai/reasoning/projectAttentionAnalyzer");

const NOW = new Date("2026-06-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(days) {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}
function isoDaysFromNow(days) {
  return new Date(NOW.getTime() + days * DAY).toISOString();
}

// Aucun signal sur aucune des 6 dimensions — sert de socle "propre" pour
// isoler une seule dimension à la fois dans les tests ci-dessous.
function neutralProject(overrides = {}) {
  return {
    id: "p1",
    nomProjet: "Projet Neutre",
    nextRelanceDate: null,
    dateLimiteIngenieur: null,
    lastAction: null,
    pipelineStageId: "stage-1",
    stage: { name: "En cours", isWonStage: false, isLostStage: false },
    pourcentageReussite: 80,
    createdAt: isoDaysAgo(10),
    updatedAt: isoDaysAgo(1),
    montantMarche: 5000,
    ...overrides,
  };
}

function analyzeOne(overrides) {
  return analyzeProjectAttention([neutralProject(overrides)], { now: NOW })[0];
}

function factorOf(result, dimension) {
  return result.factors.find((f) => f.dimension === dimension) || null;
}

describe("ProjectAttentionAnalyzer — socle neutre", () => {
  test("un projet sans aucun signal sur aucune dimension a un score de 0 et une priorité 'faible'", () => {
    const result = analyzeOne({});
    expect(result.score).toBe(0);
    expect(result.priority).toBe("faible");
    expect(result.factors).toEqual([]);
  });
});

describe("ProjectAttentionAnalyzer — dimension Retard (nextRelanceDate)", () => {
  test("aucune nextRelanceDate : pas de signal", () => {
    expect(factorOf(analyzeOne({ nextRelanceDate: null }), "retard")).toBeNull();
  });

  test("nextRelanceDate dans le futur : pas de signal", () => {
    expect(factorOf(analyzeOne({ nextRelanceDate: isoDaysFromNow(5) }), "retard")).toBeNull();
  });

  test("nextRelanceDate aujourd'hui (0 jour de retard) : pas encore un signal", () => {
    expect(factorOf(analyzeOne({ nextRelanceDate: NOW.toISOString() }), "retard")).toBeNull();
  });

  test.each([
    [3, 1],
    [6, 1],
    [7, 2],
    [29, 2],
    [30, 3],
    [45, 3],
  ])("en retard de %i jour(s) => sévérité %i", (daysLate, expectedSeverity) => {
    const factor = factorOf(analyzeOne({ nextRelanceDate: isoDaysAgo(daysLate) }), "retard");
    expect(factor.severity).toBe(expectedSeverity);
    expect(factor.weight).toBe(DEFAULT_BUSINESS_RULES.weights.retard);
    expect(factor.reason).toMatch(new RegExp(`retard de ${daysLate} jour`));
  });
});

describe("ProjectAttentionAnalyzer — dimension Échéances (dateLimiteIngenieur)", () => {
  test("aucune dateLimiteIngenieur : pas de signal", () => {
    expect(factorOf(analyzeOne({ dateLimiteIngenieur: null }), "echeance")).toBeNull();
  });

  test("échéance dépassée de 15 jours : sévérité 2", () => {
    const factor = factorOf(analyzeOne({ dateLimiteIngenieur: isoDaysAgo(15) }), "echeance");
    expect(factor.severity).toBe(2);
    expect(factor.reason).toMatch(/dépassée de 15 jour/);
  });

  test("échéance dans 3 jours (dans la fenêtre 'due soon' de 7 jours) : sévérité 1", () => {
    const factor = factorOf(analyzeOne({ dateLimiteIngenieur: isoDaysFromNow(3) }), "echeance");
    expect(factor.severity).toBe(1);
    expect(factor.reason).toMatch(/dans 3 jour/);
  });

  test("échéance dans 10 jours (au-delà de la fenêtre 'due soon') : pas de signal", () => {
    expect(factorOf(analyzeOne({ dateLimiteIngenieur: isoDaysFromNow(10) }), "echeance")).toBeNull();
  });
});

describe("ProjectAttentionAnalyzer — dimension Blocages (lastAction)", () => {
  test("aucune lastAction : pas de signal", () => {
    expect(factorOf(analyzeOne({ lastAction: null }), "blocage")).toBeNull();
  });

  test.each(["Terminé", "Annulé"])("lastAction au statut '%s', même en retard : jamais un blocage", (statut) => {
    const factor = factorOf(analyzeOne({ lastAction: { statut, dateAction: isoDaysAgo(40), commentaire: "x" } }), "blocage");
    expect(factor).toBeNull();
  });

  test("lastAction en attente ('A faire') mais programmée dans le futur : pas encore un blocage", () => {
    const factor = factorOf(analyzeOne({ lastAction: { statut: "A faire", dateAction: isoDaysFromNow(3), commentaire: "x" } }), "blocage");
    expect(factor).toBeNull();
  });

  test.each([
    [5, 1],
    [20, 2],
    [40, 3],
  ])("lastAction en attente, en retard de %i jour(s) => sévérité %i", (daysStuck, expectedSeverity) => {
    const factor = factorOf(
      analyzeOne({ lastAction: { statut: "En cours", dateAction: isoDaysAgo(daysStuck), commentaire: "Relance client", actionType: { name: "Relance" } } }),
      "blocage"
    );
    expect(factor.severity).toBe(expectedSeverity);
    expect(factor.reason).toContain("Relance");
    expect(factor.reason).toContain("En cours");
  });
});

describe("ProjectAttentionAnalyzer — dimension Pipeline", () => {
  test("aucune étape assignée : sévérité 2 fixe, quel que soit l'avancement", () => {
    const factor = factorOf(analyzeOne({ pipelineStageId: null, stage: null, pourcentageReussite: 90 }), "pipeline");
    expect(factor.severity).toBe(2);
    expect(factor.reason).toMatch(/[Aa]ucune étape/);
  });

  test.each(["isWonStage", "isLostStage"])("étape marquée '%s' : jamais de signal, même très ancien et peu avancé", (flag) => {
    const factor = factorOf(
      analyzeOne({ stage: { name: "Clôturé", isWonStage: false, isLostStage: false, [flag]: true }, pourcentageReussite: 0, createdAt: isoDaysAgo(400) }),
      "pipeline"
    );
    expect(factor).toBeNull();
  });

  test("étape ouverte, avancement suffisant (>= 30%) : pas de signal même si le projet est ancien", () => {
    const factor = factorOf(analyzeOne({ pourcentageReussite: 30, createdAt: isoDaysAgo(400) }), "pipeline");
    expect(factor).toBeNull();
  });

  test.each([
    [70, 1],
    [130, 2],
    [200, 3],
  ])("étape ouverte, avancement faible, créé il y a %i jour(s) => sévérité %i", (ageDays, expectedSeverity) => {
    const factor = factorOf(analyzeOne({ pourcentageReussite: 10, createdAt: isoDaysAgo(ageDays) }), "pipeline");
    expect(factor.severity).toBe(expectedSeverity);
    expect(factor.reason).toMatch(new RegExp(`Ouvert depuis ${ageDays} jour`));
  });

  test("avancement non renseigné (null) est traité comme 0% — peut déclencher le signal si le projet est ancien", () => {
    const factor = factorOf(analyzeOne({ pourcentageReussite: null, createdAt: isoDaysAgo(70) }), "pipeline");
    expect(factor.severity).toBe(1);
  });
});

describe("ProjectAttentionAnalyzer — dimension Activité (updatedAt)", () => {
  test("mise à jour récente (< 14 jours) : pas de signal", () => {
    expect(factorOf(analyzeOne({ updatedAt: isoDaysAgo(5) }), "activite")).toBeNull();
  });

  test.each([
    [20, 1],
    [45, 2],
    [90, 3],
  ])("aucune mise à jour depuis %i jour(s) => sévérité %i", (daysSince, expectedSeverity) => {
    const factor = factorOf(analyzeOne({ updatedAt: isoDaysAgo(daysSince) }), "activite");
    expect(factor.severity).toBe(expectedSeverity);
    expect(factor.reason).toMatch(new RegExp(`depuis ${daysSince} jour`));
  });
});

describe("ProjectAttentionAnalyzer — dimension Budget (montantMarche)", () => {
  test("montantMarche non renseigné (null) : sévérité 1, 'budget non défini'", () => {
    const factor = factorOf(analyzeOne({ montantMarche: null }), "budget");
    expect(factor.severity).toBe(1);
    expect(factor.reason).toMatch(/non renseigné/);
  });

  test("montantMarche à 0 n'est PAS traité comme 'non renseigné' (0 est une valeur, pas une absence)", () => {
    const factor = factorOf(analyzeOne({ montantMarche: 0 }), "budget");
    expect(factor).toBeNull();
  });

  test("montantMarche élevé (>= 100000) avec avancement faible (< 30%) : sévérité 2", () => {
    const factor = factorOf(analyzeOne({ montantMarche: 150000, pourcentageReussite: 20 }), "budget");
    expect(factor.severity).toBe(2);
    expect(factor.reason).toMatch(/élevé/);
  });

  test("montantMarche élevé mais avancement suffisant (>= 30%) : pas de signal", () => {
    expect(factorOf(analyzeOne({ montantMarche: 150000, pourcentageReussite: 30 }), "budget")).toBeNull();
  });

  test("montantMarche modeste (< 100000), même avec avancement faible : pas de signal", () => {
    expect(factorOf(analyzeOne({ montantMarche: 50000, pourcentageReussite: 5 }), "budget")).toBeNull();
  });
});

describe("ProjectAttentionAnalyzer — score total, classement en priorité, tri", () => {
  test("l'exemple documenté dans BUSINESS_REASONING.md : retard(2×3=6) + échéance(3×3=9) + pipeline(1×2=2) = 17 => 'elevee'", () => {
    const result = analyzeOne({
      nextRelanceDate: isoDaysAgo(10), // sévérité 2 -> contribution 6
      dateLimiteIngenieur: isoDaysAgo(40), // sévérité 3 -> contribution 9
      pourcentageReussite: 15,
      createdAt: isoDaysAgo(90), // sévérité 1 -> contribution 2
    });
    expect(result.score).toBe(17);
    expect(result.priority).toBe("elevee");
    expect(result.factors.map((f) => f.dimension)).toEqual(["echeance", "retard", "pipeline"]); // trié par contribution décroissante
  });

  test("frontière 'moyenne' : score 3 reste 'faible', score 4 devient 'moyenne'", () => {
    const scoreThree = analyzeOne({ lastAction: { statut: "En cours", dateAction: isoDaysAgo(3), commentaire: "x" } }); // blocage sévérité1 × poids3 = 3
    expect(scoreThree.score).toBe(3);
    expect(scoreThree.priority).toBe("faible");

    const scoreFour = analyzeOne({ pipelineStageId: null, stage: null }); // pipeline sévérité2 × poids2 = 4
    expect(scoreFour.score).toBe(4);
    expect(scoreFour.priority).toBe("moyenne");
  });

  test("frontière 'elevee' : score 9 reste 'moyenne', score 10 devient 'elevee'", () => {
    const scoreNine = analyzeOne({ lastAction: { statut: "A faire", dateAction: isoDaysAgo(40), commentaire: "x" } }); // blocage sévérité3 × poids3 = 9
    expect(scoreNine.score).toBe(9);
    expect(scoreNine.priority).toBe("moyenne");

    const scoreTen = analyzeOne({
      lastAction: { statut: "A faire", dateAction: isoDaysAgo(40), commentaire: "x" }, // 9
      montantMarche: null, // budget sévérité1 × poids1 = 1
    });
    expect(scoreTen.score).toBe(10);
    expect(scoreTen.priority).toBe("elevee");
  });

  test("frontière 'critique' : score 19 reste 'elevee', score 20 devient 'critique'", () => {
    const scoreNineteen = analyzeOne({
      nextRelanceDate: isoDaysAgo(40), // retard sévérité3 × poids3 = 9
      dateLimiteIngenieur: isoDaysAgo(40), // échéance sévérité3 × poids3 = 9
      montantMarche: null, // budget sévérité1 × poids1 = 1
    });
    expect(scoreNineteen.score).toBe(19);
    expect(scoreNineteen.priority).toBe("elevee");

    const scoreTwenty = analyzeOne({
      nextRelanceDate: isoDaysAgo(40), // 9
      dateLimiteIngenieur: isoDaysAgo(40), // 9
      montantMarche: 200000,
      pourcentageReussite: 10, // budget sévérité2 × poids1 = 2
    });
    expect(scoreTwenty.score).toBe(20);
    expect(scoreTwenty.priority).toBe("critique");
  });

  test("analyzeProjectAttention trie l'ensemble des projets par score décroissant", () => {
    const projects = [
      neutralProject({ id: "low", nomProjet: "Faible" }),
      neutralProject({ id: "high", nomProjet: "Critique", nextRelanceDate: isoDaysAgo(40), dateLimiteIngenieur: isoDaysAgo(40) }),
      neutralProject({ id: "mid", nomProjet: "Moyen", pipelineStageId: null, stage: null }),
    ];
    const ranked = analyzeProjectAttention(projects, { now: NOW });
    expect(ranked.map((r) => r.projectId)).toEqual(["high", "mid", "low"]);
  });

  test("le nom du projet est repris tel quel (nomProjet), avec un repli si absent", () => {
    const result = analyzeOne({ nomProjet: "Réhabilitation Sfax" });
    expect(result.projectName).toBe("Réhabilitation Sfax");

    const noName = analyzeProjectAttention([{ id: "x" }], { now: NOW })[0];
    expect(noName.projectName).toBe("Projet sans nom");
  });
});

describe("ProjectAttentionAnalyzer — DEFAULT_BUSINESS_RULES est configurable", () => {
  test("des règles personnalisées remplacent entièrement les règles par défaut", () => {
    const customRules = {
      weights: { ...DEFAULT_BUSINESS_RULES.weights, retard: 100 },
      thresholds: DEFAULT_BUSINESS_RULES.thresholds,
      priorityBands: DEFAULT_BUSINESS_RULES.priorityBands,
    };
    const result = analyzeProjectAttention([neutralProject({ nextRelanceDate: isoDaysAgo(3) })], { now: NOW, rules: customRules })[0];
    expect(result.factors[0].weight).toBe(100);
    expect(result.score).toBe(100); // sévérité 1 × poids 100
  });
});
