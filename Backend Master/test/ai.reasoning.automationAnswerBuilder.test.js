"use strict";

const {
  buildProposalAnswer,
  buildExecutedAnswer,
  buildCancelledAnswer,
  buildToolsUnavailableAnswer,
  buildExpiredOrMissingAnswer,
  buildNoActionAnswer,
} = require("../src/ai/reasoning/automationAnswerBuilder");

describe("buildProposalAnswer", () => {
  test("liste chaque étape avec son Tool, ses paramètres et sa raison, et demande explicitement confirme/annule", () => {
    const action = { steps: [{ tool: "create_project_action", input: { projectId: "p1" }, reason: "créer l'activité demandée" }] };
    const answer = buildProposalAnswer(action);

    expect(answer).toContain("Je propose d'exécuter 1 action :");
    expect(answer).toContain('- create_project_action {"projectId":"p1"} — créer l\'activité demandée.');
    expect(answer).toContain("Répondez « confirme » pour exécuter, ou « annule » pour abandonner.");
    expect(answer).toContain("expire dans 15 minutes");
  });

  test("pluralise correctement pour plusieurs étapes, et respecte une expiration personnalisée", () => {
    const action = {
      steps: [
        { tool: "create_calendar_event", input: {}, reason: "programmer le rendez-vous" },
        { tool: "send_notification_email", input: {}, reason: "prévenir le client" },
      ],
    };
    const answer = buildProposalAnswer(action, { expiresInMinutes: 5 });

    expect(answer).toContain("Je propose d'exécuter 2 actions :");
    expect(answer).toContain("expire dans 5 minutes");
  });

  test("une étape sans paramètre l'indique explicitement plutôt qu'un objet vide ambigu", () => {
    const action = { steps: [{ tool: "get_dashboard_kpis", input: {}, reason: "générer le rapport" }] };
    expect(buildProposalAnswer(action)).toContain("- get_dashboard_kpis (aucun paramètre) — générer le rapport.");
  });

  test("une raison absente reste honnête plutôt que fabriquée", () => {
    const action = { steps: [{ tool: "create_project_action", input: {} }] };
    expect(buildProposalAnswer(action)).toContain("raison non précisée");
  });
});

describe("buildExecutedAnswer", () => {
  test("confirme le nombre d'étapes réellement exécutées, une ligne par Tool", () => {
    const toolSteps = [{ tool: "create_project_action", input: {}, output: {} }, { tool: "send_notification_email", input: {}, output: {} }];
    const answer = buildExecutedAnswer(toolSteps);
    expect(answer).toContain("Action confirmée — 2 étape(s) exécutée(s) :");
    expect(answer).toContain("- create_project_action : exécuté.");
    expect(answer).toContain("- send_notification_email : exécuté.");
  });
});

describe("buildCancelledAnswer", () => {
  test("récapitule ce qui N'A PAS été exécuté", () => {
    const action = { steps: [{ tool: "create_project_action" }, { tool: "create_calendar_event" }] };
    const answer = buildCancelledAnswer(action);
    expect(answer).toContain("2 étape(s) proposée(s)");
    expect(answer).toContain("create_project_action, create_calendar_event");
    expect(answer).toContain("n'ont pas été exécutées");
  });
});

describe("réponses honnêtes pour les cas limites", () => {
  test("buildToolsUnavailableAnswer explique pourquoi rien n'a été exécuté", () => {
    expect(buildToolsUnavailableAnswer()).toMatch(/ne sont plus disponibles.*action annulée/i);
  });

  test("buildExpiredOrMissingAnswer ne prétend jamais qu'une action existe", () => {
    expect(buildExpiredOrMissingAnswer()).toMatch(/aucune action en attente/i);
  });

  test("buildNoActionAnswer ne prétend jamais avoir agi", () => {
    expect(buildNoActionAnswer()).toMatch(/aucune action exécutable/i);
  });
});
