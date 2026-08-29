"use strict";

const {
  identifyPriorities,
  identifyImportantTasks,
  identifyClientsToFollowUp,
  identifyCriticalProjects,
  identifyRisks,
  identifyAnomalies,
  DEFAULT_PRIORITY_LIMIT,
} = require("../src/ai/reasoning/recommendationEngine");

// Fixtures au format EXACT renvoyé par ProjectAttentionAnalyzer.analyzeProjectAttention()
// (voir reasoning/projectAttentionAnalyzer.js) — factors déjà triés par
// contribution décroissante par ce module, réutilisés tels quels ici.
function entry({ projectId, projectName, score, priority, factors = [] }) {
  return { projectId, projectName, score, priority, factors };
}
function factor({ dimension, reason, severity = 2 }) {
  return { dimension, label: dimension, severity, weight: 3, contribution: severity * 3, reason };
}

describe("identifyPriorities", () => {
  test("exclut les projets 'faible', conserve l'ordre et cite la première raison", () => {
    const ranked = [
      entry({ projectId: "c1", projectName: "Chantier Critique", score: 20, priority: "critique", factors: [factor({ dimension: "retard", reason: "Relance en retard de 40 jour(s)" })] }),
      entry({ projectId: "f1", projectName: "Chantier OK", score: 0, priority: "faible", factors: [] }),
      entry({ projectId: "e1", projectName: "Chantier Élevé", score: 12, priority: "elevee", factors: [factor({ dimension: "budget", reason: "Budget élevé (150000) avec avancement faible (10%)" })] }),
    ];
    const result = identifyPriorities(ranked);
    expect(result.map((r) => r.label)).toEqual(["Chantier Critique", "Chantier Élevé"]);
    expect(result[0].reason).toBe("Relance en retard de 40 jour(s)");
    expect(result[0].priority).toBe("critique");
  });

  test("respecte la limite configurable (par défaut 5)", () => {
    expect(DEFAULT_PRIORITY_LIMIT).toBe(5);
    const ranked = Array.from({ length: 8 }, (_, i) =>
      entry({ projectId: `p${i}`, projectName: `Projet ${i}`, score: 10, priority: "moyenne", factors: [factor({ dimension: "retard", reason: "x" })] })
    );
    expect(identifyPriorities(ranked)).toHaveLength(5);
    expect(identifyPriorities(ranked, { limit: 2 })).toHaveLength(2);
  });

  test("aucun projet signalé => liste vide, jamais une priorité fabriquée", () => {
    const ranked = [entry({ projectId: "f1", projectName: "Chantier OK", score: 0, priority: "faible", factors: [] })];
    expect(identifyPriorities(ranked)).toEqual([]);
  });
});

describe("identifyImportantTasks — dimension 'blocage' uniquement", () => {
  test("un projet avec une action bloquée est cité, avec la raison exacte", () => {
    const ranked = [
      entry({
        projectId: "p1",
        projectName: "Chantier Bloqué",
        score: 9,
        priority: "moyenne",
        factors: [factor({ dimension: "blocage", reason: 'Dernière action ("Relance client", statut "En cours") bloquée depuis 20 jour(s)' })],
      }),
    ];
    expect(identifyImportantTasks(ranked)).toEqual([
      { label: "Chantier Bloqué", reason: 'Dernière action ("Relance client", statut "En cours") bloquée depuis 20 jour(s)', priority: "moyenne" },
    ]);
  });

  test("un projet en retard mais sans blocage n'apparaît pas dans les tâches importantes", () => {
    const ranked = [entry({ projectId: "p1", projectName: "X", score: 6, priority: "moyenne", factors: [factor({ dimension: "retard", reason: "x" })] })];
    expect(identifyImportantTasks(ranked)).toEqual([]);
  });
});

describe("identifyClientsToFollowUp — dimension 'retard' uniquement", () => {
  test("un projet en retard de relance est cité comme client à relancer", () => {
    const ranked = [
      entry({
        projectId: "p1",
        projectName: "Chantier Sfax",
        score: 6,
        priority: "moyenne",
        factors: [factor({ dimension: "retard", reason: "Relance en retard de 10 jour(s) (échéance dépassée le 2026-05-20)" })],
      }),
    ];
    expect(identifyClientsToFollowUp(ranked)).toEqual([
      { label: "Chantier Sfax", reason: "Relance en retard de 10 jour(s) (échéance dépassée le 2026-05-20)", priority: "moyenne" },
    ]);
  });

  test("un projet bloqué mais sans relance en retard n'apparaît pas ici", () => {
    const ranked = [entry({ projectId: "p1", projectName: "X", score: 9, priority: "moyenne", factors: [factor({ dimension: "blocage", reason: "x" })] })];
    expect(identifyClientsToFollowUp(ranked)).toEqual([]);
  });
});

describe("identifyCriticalProjects", () => {
  test("seuls les projets de priorité 'critique' sont retenus", () => {
    const ranked = [
      entry({ projectId: "c1", projectName: "Critique", score: 22, priority: "critique", factors: [factor({ dimension: "echeance", reason: "x" })] }),
      entry({ projectId: "e1", projectName: "Élevé", score: 12, priority: "elevee", factors: [] }),
    ];
    const result = identifyCriticalProjects(ranked);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Critique");
    expect(result[0].score).toBe(22);
  });
});

describe("identifyRisks", () => {
  test("inclut TOUS les facteurs des projets critiques/élevés (pas seulement le premier)", () => {
    const ranked = [
      entry({
        projectId: "c1",
        projectName: "Chantier",
        score: 20,
        priority: "critique",
        factors: [factor({ dimension: "retard", reason: "raison 1", severity: 3 }), factor({ dimension: "echeance", reason: "raison 2", severity: 3 })],
      }),
    ];
    const risks = identifyRisks(ranked);
    expect(risks).toHaveLength(2);
    expect(risks.map((r) => r.reason)).toEqual(["raison 1", "raison 2"]);
  });

  test("exclut les projets de priorité 'moyenne' ou 'faible'", () => {
    const ranked = [entry({ projectId: "m1", projectName: "Moyen", score: 4, priority: "moyenne", factors: [factor({ dimension: "pipeline", reason: "x" })] })];
    expect(identifyRisks(ranked)).toEqual([]);
  });

  test("ajoute un risque agrégé de maintenance quand get_maintenance_stats signale des demandes critiques", () => {
    const risks = identifyRisks([], { maintenanceStats: { critique: 3 } });
    expect(risks).toEqual([{ label: "Maintenance", reason: "3 demande(s) de maintenance de niveau critique en cours.", severity: 3 }]);
  });

  test("aucune demande de maintenance critique => aucun risque de maintenance ajouté", () => {
    expect(identifyRisks([], { maintenanceStats: { critique: 0 } })).toEqual([]);
    expect(identifyRisks([], { maintenanceStats: null })).toEqual([]);
  });
});

describe("identifyAnomalies — dataCoherenceChecker", () => {
  test("un avertissement par ligne, jamais fabriqué", () => {
    const dataQuality = [{ projectId: "p1", projectName: "Chantier Incomplet", warnings: ["Fiche incomplète (30%) — manque : Adresse non renseignée."] }];
    expect(identifyAnomalies(dataQuality)).toEqual([{ label: "Chantier Incomplet", reason: "Fiche incomplète (30%) — manque : Adresse non renseignée." }]);
  });

  test("plusieurs avertissements sur le même projet produisent plusieurs anomalies distinctes", () => {
    const dataQuality = [{ projectId: "p1", projectName: "X", warnings: ["Anomalie A", "Anomalie B"] }];
    expect(identifyAnomalies(dataQuality)).toHaveLength(2);
  });

  test("aucune fiche signalée => aucune anomalie", () => {
    expect(identifyAnomalies([])).toEqual([]);
  });
});
