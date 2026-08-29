"use strict";

const { buildExplainability, buildErrorExplainability, buildClarificationExplainability, summarizeToolOutput } = require("../src/ai/orchestrator/explainabilityBuilder");

describe("explainabilityBuilder — présent sur CHAQUE réponse, jamais null", () => {
  test("mode 'agent' sans aucun toolStep ni citation reste un objet exploitable, jamais null", () => {
    const result = buildExplainability({ mode: "agent", agentName: "assistant_agent", toolSteps: [], citations: [] });
    expect(result).not.toBeNull();
    expect(result.dataUsed).toEqual([]);
    expect(result.toolsCalled).toEqual([]);
    expect(result.businessRules).toEqual([]);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(0);
  });
});

describe("explainabilityBuilder — pourquoi (reasoning)", () => {
  test("mode 'agent' : nomme l'agent qui a traité la demande", () => {
    const result = buildExplainability({ mode: "agent", agentName: "project_agent", toolSteps: [], citations: [] });
    expect(result.reasoning).toContain('Traité par l\'agent spécialisé "project_agent".');
  });

  test("mode 'tool_calling' : explique l'absence d'Agent dédié", () => {
    const result = buildExplainability({ mode: "tool_calling", toolSteps: [{ tool: "list_users", input: {}, output: [] }], citations: [] });
    expect(result.reasoning).toContain("chemin générique d'appel d'outils");
  });

  test("mode 'qa' : explique le chemin RAG", () => {
    const result = buildExplainability({ mode: "qa", toolSteps: [], citations: [{ index: 1, title: "FAQ" }] });
    expect(result.reasoning).toContain("recherche documentaire (RAG)");
    expect(result.reasoning).toContain("1 source documentaire du CRM");
  });

  test("plusieurs citations : pluralise correctement", () => {
    const result = buildExplainability({ mode: "qa", toolSteps: [], citations: [{ index: 1 }, { index: 2 }] });
    expect(result.reasoning).toContain("2 sources documentaires du CRM");
  });

  test("compose reasoning/tools/règles/citations dans une seule phrase cohérente quand tout est présent", () => {
    const result = buildExplainability({
      mode: "agent",
      agentName: "project_agent",
      toolSteps: [
        { tool: "list_projects", input: {}, output: { data: [{ id: "p1" }], total: 1 } },
        { tool: "analyze_project_attention", synthetic: true, description: "Classement de 1 projet(s) par attention.", input: {}, output: [] },
      ],
      citations: [],
    });
    expect(result.reasoning).toContain('Traité par l\'agent spécialisé "project_agent".');
    expect(result.reasoning).toContain("Données interrogées via : list_projects.");
    expect(result.reasoning).toContain("Règle(s) métier appliquée(s) : Classement de 1 projet(s) par attention.");
  });
});

describe("explainabilityBuilder — quelles données ont été utilisées (dataUsed)", () => {
  test("un résumé par Tool RÉEL uniquement — jamais une étape synthétique", () => {
    const result = buildExplainability({
      mode: "agent",
      agentName: "data_quality_agent",
      toolSteps: [
        { tool: "list_projects", input: {}, output: { data: [{ id: "p1" }, { id: "p2" }], total: 2 } },
        { tool: "analyze_data_quality", synthetic: true, description: "Audit.", input: {}, output: { qualityScore: 100 } },
      ],
      citations: [],
    });
    expect(result.dataUsed).toEqual([{ tool: "list_projects", summary: "2 enregistrement(s) récupéré(s)." }]);
  });

  test("mentionne le total réel quand la pagination masque des enregistrements supplémentaires", () => {
    const result = buildExplainability({
      mode: "agent",
      agentName: "project_agent",
      toolSteps: [{ tool: "list_projects", input: {}, output: { data: [{ id: "p1" }], total: 50 } }],
      citations: [],
    });
    expect(result.dataUsed[0].summary).toBe("1 enregistrement(s) récupéré(s) (sur 50 au total).");
  });

  test("un Tool en échec (best-effort) est résumé honnêtement, jamais masqué", () => {
    const result = buildExplainability({
      mode: "agent",
      agentName: "kpi_agent",
      toolSteps: [{ tool: "get_professional_dashboard", input: {}, output: "Error: forbidden for role user" }],
      citations: [],
    });
    expect(result.dataUsed[0].summary).toBe("Échec : forbidden for role user");
  });
});

describe("explainabilityBuilder — quels AI Tools ont été appelés (toolsCalled)", () => {
  test("liste dédupliquée des Tools RÉELS uniquement, jamais les étapes synthétiques", () => {
    const result = buildExplainability({
      mode: "agent",
      agentName: "kpi_agent",
      toolSteps: [
        { tool: "get_dashboard_kpis", input: {}, output: {} },
        { tool: "get_dashboard_kpis", input: {}, output: {} }, // appelé 2 fois (mise en cache ailleurs) — jamais dupliqué ici
        { tool: "get_professional_dashboard", input: {}, output: {} },
        { tool: "analyze_kpi_trends", synthetic: true, description: "x", input: {}, output: {} },
      ],
      citations: [],
    });
    expect(result.toolsCalled).toEqual(["get_dashboard_kpis", "get_professional_dashboard"]);
  });

  test("aucun Tool appelé : liste vide, jamais une invention", () => {
    const result = buildExplainability({ mode: "qa", toolSteps: [], citations: [{ index: 1 }] });
    expect(result.toolsCalled).toEqual([]);
  });
});

describe("explainabilityBuilder — quelles règles métier ont été appliquées (businessRules)", () => {
  test("relit la description déjà écrite par l'Agent, jamais reformulée", () => {
    const description = "Classement de 3 projet(s) par attention sur 6 dimensions.";
    const result = buildExplainability({
      mode: "agent",
      agentName: "project_agent",
      toolSteps: [{ tool: "analyze_project_attention", synthetic: true, description, input: {}, output: [] }],
      citations: [],
    });
    expect(result.businessRules).toEqual([{ rule: "analyze_project_attention", description }]);
  });

  test("plusieurs règles dans le même tour (ex. BusinessAnalystAgent, plusieurs domaines) — toutes tracées, dans l'ordre", () => {
    const result = buildExplainability({
      mode: "agent",
      agentName: "business_analyst_agent",
      toolSteps: [
        { tool: "analyze_business_domain", synthetic: true, description: "Domaine A.", input: { domain: "a" }, output: {} },
        { tool: "analyze_business_domain", synthetic: true, description: "Domaine B.", input: { domain: "b" }, output: {} },
      ],
      citations: [],
    });
    expect(result.businessRules.map((r) => r.description)).toEqual(["Domaine A.", "Domaine B."]);
  });

  test("une étape synthétique SANS description explicite retombe sur un résumé générique honnête, jamais une invention", () => {
    const result = buildExplainability({
      mode: "agent",
      agentName: "x",
      toolSteps: [{ tool: "some_rule", synthetic: true, input: {}, output: { a: 1, b: 2 } }],
      citations: [],
    });
    expect(result.businessRules[0].rule).toBe("some_rule");
    expect(result.businessRules[0].description).toContain("Données récupérées");
  });

  test("aucune règle métier appliquée (ex. simple tool-calling) : liste vide", () => {
    const result = buildExplainability({ mode: "tool_calling", toolSteps: [{ tool: "list_users", input: {}, output: [] }], citations: [] });
    expect(result.businessRules).toEqual([]);
  });
});

describe("explainabilityBuilder — être transparent inclut d'expliquer un ÉCHEC, pas seulement un succès", () => {
  test("buildErrorExplainability explique pourquoi rien n'a été produit, jamais un champ vide sans justification", () => {
    const result = buildErrorExplainability(new Error("permission refusée"));
    expect(result.reasoning).toContain("permission refusée");
    expect(result.dataUsed).toEqual([]);
    expect(result.toolsCalled).toEqual([]);
    expect(result.businessRules).toEqual([]);
  });

  test("buildErrorExplainability sans message d'erreur reste honnête plutôt que de planter", () => {
    const result = buildErrorExplainability({});
    expect(result.reasoning).toContain("une erreur interne");
  });

  test("buildClarificationExplainability explique l'ambiguïté détectée", () => {
    const result = buildClarificationExplainability();
    expect(result.reasoning).toMatch(/référence ou une correction/i);
    expect(result.dataUsed).toEqual([]);
    expect(result.toolsCalled).toEqual([]);
    expect(result.businessRules).toEqual([]);
  });
});

describe("summarizeToolOutput — jamais rien d'inventé sur une forme de sortie inconnue", () => {
  test.each([
    [null, "Aucune donnée retournée."],
    [undefined, "Aucune donnée retournée."],
    ["", "Résultat vide."],
    ["un texte", "un texte"],
    [[1, 2, 3], "3 élément(s) retourné(s)."],
    [{}, "Résultat vide."],
    [42, "Résultat récupéré."],
    [true, "Résultat récupéré."],
  ])("%p => %p", (output, expected) => {
    expect(summarizeToolOutput(output)).toBe(expected);
  });

  test("une chaîne déjà résumée par l'Agent (ex. ProjectAgent/DataQualityAgent) est reprise telle quelle, jamais remplacée par un texte générique plus pauvre", () => {
    expect(summarizeToolOutput("12 projet(s) analysé(s).")).toBe("12 projet(s) analysé(s).");
  });

  test("un objet avec .data (forme list_projects) résume le compte, pas le contenu", () => {
    expect(summarizeToolOutput({ data: [{ id: 1 }, { id: 2 }], total: 2 })).toBe("2 enregistrement(s) récupéré(s).");
  });

  test("un objet quelconque liste ses champs (au plus 5), sans inventer leur signification", () => {
    expect(summarizeToolOutput({ qualityScore: 90, totalProjects: 10 })).toBe("Données récupérées (champ(s) : qualityScore, totalProjects).");
  });

  test("plus de 5 champs : tronqué honnêtement avec '...'", () => {
    const output = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 };
    expect(summarizeToolOutput(output)).toBe("Données récupérées (champ(s) : a, b, c, d, e, ...).");
  });
});
