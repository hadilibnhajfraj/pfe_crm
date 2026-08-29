"use strict";

const { buildExplanation } = require("../src/ai/orchestrator/explanationBuilder");

describe("buildExplanation — étape 11 du workflow (ajouter des explications si nécessaire)", () => {
  test("mode qa avec citations : explique le nombre de sources documentaires", () => {
    expect(buildExplanation({ mode: "qa", citations: [{ index: 1 }] })).toBe(
      "Réponse basée sur 1 source documentaire du CRM."
    );
    expect(buildExplanation({ mode: "qa", citations: [{ index: 1 }, { index: 2 }] })).toBe(
      "Réponse basée sur 2 sources documentaires du CRM."
    );
  });

  test("mode qa sans citation : rien à expliquer (null)", () => {
    expect(buildExplanation({ mode: "qa", citations: [] })).toBeNull();
  });

  test("mode tool_calling avec des outils appelés : les nomme, dédupliqués", () => {
    const explanation = buildExplanation({
      mode: "tool_calling",
      toolSteps: [
        { tool: "list_projects", input: {}, output: "[]" },
        { tool: "list_projects", input: {}, output: "[]" },
        { tool: "get_dashboard_kpis", input: {}, output: "{}" },
      ],
    });
    expect(explanation).toBe("Réponse construite à partir de l'outil (ou des outils) : list_projects, get_dashboard_kpis.");
  });

  test("mode tool_calling sans outil appelé : rien à expliquer (null)", () => {
    expect(buildExplanation({ mode: "tool_calling", toolSteps: [] })).toBeNull();
  });

  test("mode agent : nomme l'agent, sans outils appelés", () => {
    expect(buildExplanation({ mode: "agent", agentName: "hr_agent", toolSteps: [] })).toBe(
      'Traité par l\'agent spécialisé "hr_agent".'
    );
  });

  test("mode agent avec outils appelés : nomme l'agent ET les outils", () => {
    const explanation = buildExplanation({
      mode: "agent",
      agentName: "maintenance_agent",
      toolSteps: [{ tool: "list_all_maintenance_requests", input: {}, output: "[]" }],
    });
    expect(explanation).toBe(
      'Traité par l\'agent spécialisé "maintenance_agent". Outils consultés : list_all_maintenance_requests.'
    );
  });

  test("mode error : rien à expliquer (null)", () => {
    expect(buildExplanation({ mode: "error" })).toBeNull();
  });

  test("valeurs par défaut : un appel avec seulement {mode} ne lève jamais, renvoie null par défaut", () => {
    expect(buildExplanation({ mode: "qa" })).toBeNull();
    expect(buildExplanation({ mode: "tool_calling" })).toBeNull();
  });
});
