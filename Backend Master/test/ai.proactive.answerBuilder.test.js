"use strict";

const { buildProjectAlert, buildDashboardAlert, formatAlertMessage } = require("../src/ai/proactive/proactiveAnswerBuilder");

function attentionEntry(overrides = {}) {
  return {
    projectId: "p1",
    projectName: "Chantier Alpha",
    priority: "critique",
    score: 42,
    factors: [{ dimension: "retard", reason: "Relance en retard de 40 jour(s) (échéance dépassée le 2020-01-01)." }],
    ...overrides,
  };
}

describe("buildProjectAlert — analyse, explication, suggestion, workflow", () => {
  test("un projet en retard : explanation reprend EXACTEMENT la raison calculée, suggestion vient de DIMENSION_RECOMMENDATIONS", () => {
    const alert = buildProjectAlert(attentionEntry());

    expect(alert.domain).toBe("projects");
    expect(alert.severity).toBe("critique");
    expect(alert.subject).toBe('Projet "Chantier Alpha" — priorité critique');
    expect(alert.analysis).toEqual({ score: 42, priority: "critique", factors: attentionEntry().factors });
    expect(alert.explanation).toBe("Relance en retard de 40 jour(s) (échéance dépassée le 2020-01-01).");
    expect(alert.suggestion).toBe("Programmer une relance ou une réunion pour les projets en retard.");
    expect(alert.suggestedActions).toEqual([]);
    expect(alert.context).toEqual({ projectId: "p1", projectName: "Chantier Alpha", dimensions: ["retard"] });
  });

  test("plusieurs facteurs (dimensions différentes) : explanation concatène toutes les raisons, suggestion déduplique les dimensions", () => {
    const entry = attentionEntry({
      factors: [
        { dimension: "retard", reason: "Relance en retard de 10 jour(s)." },
        { dimension: "budget", reason: "Montant marché élevé, avancement faible." },
      ],
    });
    const alert = buildProjectAlert(entry);

    expect(alert.explanation).toBe("Relance en retard de 10 jour(s). Montant marché élevé, avancement faible.");
    expect(alert.suggestion).toContain("Programmer une relance");
    expect(alert.suggestion).toContain("Vérifier le suivi budgétaire");
  });

  test("deux facteurs de la MÊME dimension ne dupliquent jamais la même recommandation", () => {
    const entry = attentionEntry({
      factors: [
        { dimension: "activite", reason: "Aucune mise à jour depuis 30 jours." },
        { dimension: "activite", reason: "Aucune action enregistrée." },
      ],
    });
    const alert = buildProjectAlert(entry);
    const occurrences = (alert.suggestion.match(/Reprendre contact/g) || []).length;
    expect(occurrences).toBe(1);
  });

  test("les actions suggérées reprennent les libellés des suggestions fournies (SuggestionEngine), jamais rien d'exécutable", () => {
    const suggestions = [{ id: "create_reminder", label: "Créer un rappel", reason: "x" }, { id: "schedule_meeting", label: "Programmer une réunion", reason: "x" }];
    const alert = buildProjectAlert(attentionEntry(), { suggestions });
    expect(alert.suggestedActions).toEqual(["Créer un rappel", "Programmer une réunion"]);
    for (const action of alert.suggestedActions) expect(typeof action).toBe("string");
  });

  test("une dimension sans recommandation connue retombe sur un suivi générique honnête, jamais un texte vide", () => {
    const entry = attentionEntry({ factors: [{ dimension: "inconnue", reason: "x" }] });
    const alert = buildProjectAlert(entry);
    expect(alert.suggestion).toBe('Suivre de près le projet "Chantier Alpha".');
  });

  test("workflowTemplate reste null quand aucune suggestion 'create_activity'/'create_reminder' n'est fournie — jamais un Tool inventé", () => {
    const alert = buildProjectAlert(attentionEntry(), { suggestions: [{ id: "prepare_email", label: "Préparer un email", reason: "x" }] });
    expect(alert.workflowTemplate).toBeNull();
  });

  test("workflowTemplate reste null sans aucune suggestion", () => {
    expect(buildProjectAlert(attentionEntry()).workflowTemplate).toBeNull();
  });

  test("une suggestion 'create_reminder' produit un workflowTemplate exécutable avec une entrée complète (projectId + raison réelle)", () => {
    const suggestions = [{ id: "create_reminder", label: "Créer un rappel", reason: "Relance en retard de 40 jour(s)." }];
    const alert = buildProjectAlert(attentionEntry(), { suggestions });

    expect(alert.workflowTemplate).toEqual({
      label: "Créer un rappel",
      reason: "Relance en retard de 40 jour(s).",
      tool: "create_project_action",
      input: {
        projectId: "p1",
        commentaire: "[Copilot IA — surveillance proactive] Relance en retard de 40 jour(s).",
        dateAction: expect.any(String),
      },
    });
  });

  test("une suggestion 'create_activity' produit aussi un workflowTemplate (même Tool sous-jacent)", () => {
    const suggestions = [{ id: "create_activity", label: "Créer une activité", reason: "x" }];
    const alert = buildProjectAlert(attentionEntry(), { suggestions });
    expect(alert.workflowTemplate.tool).toBe("create_project_action");
  });
});

describe("buildDashboardAlert — pipeline/ventes/maintenance/RH/industrial/KPI, jamais d'action fabriquée", () => {
  const domainResult = {
    domain: "sales",
    recommendations: [{ domain: "sales", message: "Envisager une revue des relances en cours." }],
  };

  test("un item 'alerts' : severity='alerte', explanation=le message réel, suggestion=les recommandations du même instantané, workflowTemplate=null", () => {
    const item = { domain: "sales", type: "low_commercial_performance", metric: "score", value: 0.2, message: "Le score commercial global (0.2) est en dessous du seuil d'alerte (0.3)." };
    const alert = buildDashboardAlert(domainResult, item, "alerts");

    expect(alert.domain).toBe("sales");
    expect(alert.severity).toBe("alerte");
    expect(alert.analysis).toEqual({ type: "low_commercial_performance", metric: "score", value: 0.2, category: "alerts" });
    expect(alert.explanation).toBe("Le score commercial global (0.2) est en dessous du seuil d'alerte (0.3).");
    expect(alert.suggestion).toBe("Envisager une revue des relances en cours.");
    expect(alert.suggestedActions).toEqual([]);
    expect(alert.workflowTemplate).toBeNull();
    expect(alert.context).toEqual({ type: "low_commercial_performance", metric: "score", value: 0.2 });
  });

  test("un item 'risks' : severity='risque'", () => {
    const alert = buildDashboardAlert(domainResult, { message: "x" }, "risks");
    expect(alert.severity).toBe("risque");
  });

  test("un item 'anomalies' : severity='anomalie'", () => {
    const alert = buildDashboardAlert(domainResult, { message: "x" }, "anomalies");
    expect(alert.severity).toBe("anomalie");
  });

  test("aucune recommandation disponible dans l'instantané : le dit honnêtement, jamais une suggestion inventée", () => {
    const alert = buildDashboardAlert({ domain: "kpi", recommendations: [] }, { message: "x" }, "alerts");
    expect(alert.suggestion).toBe("Aucune recommandation automatique disponible pour ce domaine — revue manuelle nécessaire.");
  });

  test("un item sans message reste honnête plutôt que d'inventer une explication", () => {
    const alert = buildDashboardAlert(domainResult, {}, "alerts");
    expect(alert.explanation).toBe("Problème détecté, sans message détaillé fourni par l'analyseur.");
  });
});

describe("formatAlertMessage — le texte envoyé, jamais un second appel au modèle", () => {
  test("inclut toujours l'analyse et la suggestion", () => {
    const text = formatAlertMessage({ explanation: "P", suggestion: "S", suggestedActions: [], workflowTemplate: null });
    expect(text).toContain("Analyse : P");
    expect(text).toContain("Suggestion : S");
  });

  test("mentionne les actions suggérées SEULEMENT si présentes (et sans workflow), et précise qu'elles ne sont jamais exécutées automatiquement", () => {
    const withActions = formatAlertMessage({ explanation: "P", suggestion: "S", suggestedActions: ["Créer un rappel"], workflowTemplate: null });
    expect(withActions).toContain("jamais exécutées automatiquement");
    expect(withActions).toContain("Créer un rappel");

    const withoutActions = formatAlertMessage({ explanation: "P", suggestion: "S", suggestedActions: [], workflowTemplate: null });
    expect(withoutActions).not.toContain("Actions possibles");
  });

  test("un workflowTemplate présent est mentionné en priorité, jamais confondu avec suggestedActions", () => {
    const text = formatAlertMessage({
      explanation: "P",
      suggestion: "S",
      suggestedActions: ["Créer un rappel"],
      workflowTemplate: { label: "Créer un rappel", reason: "x", tool: "create_project_action", input: {} },
    });
    expect(text).toContain("Workflow proposé");
    expect(text).toContain("nécessite votre confirmation");
    expect(text).not.toContain("Actions possibles");
  });
});
