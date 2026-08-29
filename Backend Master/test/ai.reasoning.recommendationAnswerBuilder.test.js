"use strict";

const { buildRecommendationAnswer } = require("../src/ai/reasoning/recommendationAnswerBuilder");

function emptyCategories(overrides = {}) {
  return {
    priorities: [],
    importantTasks: [],
    clientsToFollowUp: [],
    criticalProjects: [],
    risks: [],
    anomalies: [],
    recommendedActions: [],
    ...overrides,
  };
}

describe("buildRecommendationAnswer", () => {
  test("toutes les catégories vides => un seul message rassurant, pas 7 sections vides", () => {
    const answer = buildRecommendationAnswer(emptyCategories());
    expect(answer).toMatch(/Rien à signaler/);
    expect(answer).not.toContain("###");
  });

  test("seules les catégories non vides apparaissent, chaque élément cite sa raison", () => {
    const answer = buildRecommendationAnswer(
      emptyCategories({
        criticalProjects: [{ label: "Chantier Sfax", reason: "Score 22, priorité critique" }],
        risks: [{ label: "Maintenance", reason: "3 demande(s) critique(s)." }],
      })
    );
    expect(answer).toContain("### Projets critiques");
    expect(answer).toContain("Chantier Sfax — Score 22, priorité critique");
    expect(answer).toContain("### Risques");
    expect(answer).not.toContain("### Priorités");
    expect(answer).not.toContain("### Tâches importantes");
    expect(answer).not.toContain("### Anomalies");
    expect(answer).not.toContain("### Actions recommandées");
  });

  test("respecte l'ordre demandé : priorités, tâches, clients, projets critiques, risques, anomalies, actions", () => {
    const answer = buildRecommendationAnswer(
      emptyCategories({
        priorities: [{ label: "P", reason: "r" }],
        importantTasks: [{ label: "T", reason: "r" }],
        clientsToFollowUp: [{ label: "C", reason: "r" }],
        criticalProjects: [{ label: "CP", reason: "r" }],
        risks: [{ label: "R", reason: "r" }],
        anomalies: [{ label: "A", reason: "r" }],
        recommendedActions: [{ id: "create_reminder", label: "Créer un rappel", reason: "r" }],
      })
    );
    const order = ["### Priorités", "### Tâches importantes", "### Clients à relancer", "### Projets critiques", "### Risques", "### Anomalies", "### Actions recommandées"];
    const positions = order.map((title) => answer.indexOf(title));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  test("une recommandation issue de SuggestionEngine ({id,label,reason}) s'affiche comme les autres catégories", () => {
    const answer = buildRecommendationAnswer(emptyCategories({ recommendedActions: [{ id: "create_activity", label: "Créer une activité", reason: "Relance en retard" }] }));
    expect(answer).toContain("### Actions recommandées");
    expect(answer).toContain("Créer une activité — Relance en retard");
  });
});
