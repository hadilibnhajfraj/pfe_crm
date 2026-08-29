"use strict";

const { buildAttentionAnswer } = require("../src/ai/reasoning/attentionAnswerBuilder");

function entry(overrides = {}) {
  return {
    projectId: "p1",
    projectName: "Projet Test",
    score: 10,
    priority: "elevee",
    factors: [{ dimension: "retard", label: "Retard", severity: 2, weight: 3, contribution: 6, reason: "Relance en retard de 10 jour(s)" }],
    ...overrides,
  };
}

describe("buildAttentionAnswer — aucun projet signalé", () => {
  test("un classement où tout est 'faible' produit un message rassurant, sans halluciner un problème", () => {
    const answer = buildAttentionAnswer([entry({ priority: "faible", factors: [] })]);
    expect(answer).toMatch(/[Aa]ucun projet ne nécessite/);
  });

  test("un tableau vide produit le même message rassurant", () => {
    expect(buildAttentionAnswer([])).toMatch(/[Aa]ucun projet ne nécessite/);
  });
});

describe("buildAttentionAnswer — projets signalés", () => {
  test("un seul projet signalé : une ligne, la priorité et les raisons exactes citées", () => {
    const answer = buildAttentionAnswer([entry()]);
    expect(answer).toContain("1 projet(s)");
    expect(answer).toContain("Projet Test");
    expect(answer).toContain("ÉLEVÉE");
    expect(answer).toContain("score 10");
    expect(answer).toContain("Relance en retard de 10 jour(s)");
  });

  test("plusieurs raisons pour un même projet sont toutes citées, séparées", () => {
    const answer = buildAttentionAnswer([
      entry({
        factors: [
          { dimension: "echeance", label: "Échéance", severity: 3, weight: 3, contribution: 9, reason: "Échéance dépassée de 40 jour(s)" },
          { dimension: "retard", label: "Retard", severity: 2, weight: 3, contribution: 6, reason: "Relance en retard de 10 jour(s)" },
        ],
      }),
    ]);
    expect(answer).toContain("Échéance dépassée de 40 jour(s)");
    expect(answer).toContain("Relance en retard de 10 jour(s)");
  });

  test("seuls les projets de priorité != 'faible' sont mentionnés", () => {
    const answer = buildAttentionAnswer([entry({ projectId: "flagged" }), entry({ projectId: "ok", priority: "faible", factors: [] })]);
    expect(answer).toContain("1 projet(s)");
    expect(answer).not.toContain("ok");
  });

  test("respecte topN : au-delà, un décompte du reste sans les détailler", () => {
    const many = Array.from({ length: 8 }, (_, i) => entry({ projectId: `p${i}`, projectName: `Projet ${i}` }));
    const answer = buildAttentionAnswer(many, { topN: 3 });
    expect(answer).toContain("Projet 0");
    expect(answer).toContain("Projet 1");
    expect(answer).toContain("Projet 2");
    expect(answer).not.toContain("Projet 3");
    expect(answer).toContain("5 autre(s) projet(s)");
  });

  test("classé par ordre déjà fourni (l'appelant est responsable du tri, pas ce builder)", () => {
    const answer = buildAttentionAnswer([entry({ projectName: "Second", score: 5 }), entry({ projectName: "Premier", score: 20 })]);
    expect(answer.indexOf("Second")).toBeLessThan(answer.indexOf("Premier"));
  });
});
