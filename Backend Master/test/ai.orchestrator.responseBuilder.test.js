"use strict";

const { ResponseBuilder, GENERIC_ERROR_MESSAGE } = require("../src/ai/orchestrator/responseBuilder");
const { OrchestratorError } = require("../src/ai/orchestrator/errors");

describe("ResponseBuilder.build", () => {
  const builder = new ResponseBuilder();
  const intent = { name: "documentation_question" };

  test("shapes a qa-mode result: citations projected to a stable shape, no tool calls, no agent", () => {
    const response = builder.build({
      conversationId: "c1",
      intent,
      mode: "qa",
      answer: "voici la réponse [1]",
      citations: [{ index: 1, title: "FAQ", sourceType: "markdown", path: "docs/faq.md", excerpt: "...", score: 0.8, extraInternalField: "x" }],
    });

    expect(response).toMatchObject({
      conversationId: "c1",
      intent: "documentation_question",
      mode: "qa",
      answer: "voici la réponse [1]",
      agent: null,
      toolCalls: [],
    });
    expect(response.citations).toEqual([{ index: 1, title: "FAQ", sourceType: "markdown", path: "docs/faq.md", excerpt: "...", score: 0.8 }]);
    expect(typeof response.generatedAt).toBe("string");
  });

  test("shapes a tool_calling-mode result: toolSteps projected to {tool, input, output}", () => {
    const response = builder.build({
      intent: { name: "maintenance" },
      mode: "tool_calling",
      answer: "fait",
      toolSteps: [{ tool: "create_maintenance_request", input: { title: "x" }, output: "ok", extraneous: true }],
    });
    expect(response.toolCalls).toEqual([{ tool: "create_maintenance_request", input: { title: "x" }, output: "ok" }]);
  });

  test("defaults conversationId to null when omitted", () => {
    const response = builder.build({ intent, mode: "qa", answer: "x" });
    expect(response.conversationId).toBeNull();
  });

  test("carries the agent name through for an agent-mode result", () => {
    const response = builder.build({ intent, mode: "agent", answer: "réponse d'agent", agentName: "hr_agent" });
    expect(response.agent).toBe("hr_agent");
  });

  test("étape 11 (explications) : le champ explanation est calculé via explanationBuilder, présent quand pertinent", () => {
    const response = builder.build({
      intent: { name: "maintenance" },
      mode: "tool_calling",
      answer: "fait",
      toolSteps: [{ tool: "create_maintenance_request", input: {}, output: "ok" }],
    });
    expect(response.explanation).toBe("Réponse construite à partir de l'outil (ou des outils) : create_maintenance_request.");
  });

  test("étape 11 : explanation est null quand il n'y a rien d'utile à ajouter (qa sans citation)", () => {
    const response = builder.build({ intent, mode: "qa", answer: "x", citations: [] });
    expect(response.explanation).toBeNull();
  });

  test("Explainability Engine : explainability est TOUJOURS présent, jamais null, même sans Tool ni citation", () => {
    const response = builder.build({ intent, mode: "qa", answer: "x", citations: [] });
    expect(response.explainability).not.toBeNull();
    expect(response.explainability).toEqual({ reasoning: expect.any(String), dataUsed: [], toolsCalled: [], businessRules: [] });
  });

  test("Explainability Engine : businessRules relit les toolSteps marqués synthetic:true (règle métier), séparément des vrais Tools (dataUsed/toolsCalled)", () => {
    const response = builder.build({
      intent: { name: "projects" },
      mode: "agent",
      agentName: "project_agent",
      answer: "réponse",
      toolSteps: [
        { tool: "list_projects", input: { limit: 100 }, output: { data: [{ id: "p1" }], total: 1 } },
        { tool: "analyze_project_attention", synthetic: true, description: "Classement de 1 projet(s) par attention.", input: {}, output: [] },
      ],
    });
    expect(response.explainability.toolsCalled).toEqual(["list_projects"]);
    expect(response.explainability.dataUsed).toEqual([{ tool: "list_projects", summary: "1 enregistrement(s) récupéré(s)." }]);
    expect(response.explainability.businessRules).toEqual([{ rule: "analyze_project_attention", description: "Classement de 1 projet(s) par attention." }]);
  });

  test("Smart Suggestions : suggestions est [] par défaut quand l'appelant n'en fournit aucune", () => {
    const response = builder.build({ intent, mode: "qa", answer: "x" });
    expect(response.suggestions).toEqual([]);
  });

  test("Smart Suggestions : suggestions est projeté tel quel (id, label, reason) — aucun calcul, aucun filtrage ici", () => {
    const response = builder.build({
      intent,
      mode: "agent",
      answer: "x",
      agentName: "project_agent",
      suggestions: [{ id: "create_reminder", label: "Créer un rappel", reason: "Relance en retard de 10 jour(s)", extraneous: true }],
    });
    expect(response.suggestions).toEqual([{ id: "create_reminder", label: "Créer un rappel", reason: "Relance en retard de 10 jour(s)" }]);
  });

  test("AutomationAgent : pendingAction est null par défaut quand l'appelant n'en fournit aucun", () => {
    const response = builder.build({ intent, mode: "agent", answer: "x", agentName: "automation_agent" });
    expect(response.pendingAction).toBeNull();
  });

  test("AutomationAgent : pendingAction est projeté tel quel — une action proposée, jamais exécutée par ce champ", () => {
    const pendingAction = { id: "a1", steps: [{ tool: "create_project_action", input: { projectId: "p1" }, reason: "créer l'activité" }] };
    const response = builder.build({ intent, mode: "agent", answer: "x", agentName: "automation_agent", pendingAction });
    expect(response.pendingAction).toEqual(pendingAction);
  });

  test("étape 8 : dataQuality est [] par défaut, et projeté tel quel (projectId, projectName, warnings) quand fourni", () => {
    const withoutIt = builder.build({ intent, mode: "qa", answer: "x" });
    expect(withoutIt.dataQuality).toEqual([]);

    const withIt = builder.build({
      intent,
      mode: "agent",
      answer: "x",
      agentName: "project_agent",
      dataQuality: [{ projectId: "p1", projectName: "Chantier Test", warnings: ["Fiche incomplète (40%)."], extraneous: true }],
    });
    expect(withIt.dataQuality).toEqual([{ projectId: "p1", projectName: "Chantier Test", warnings: ["Fiche incomplète (40%)."] }]);
  });

  test("étape 11 : followUpQuestion est null quand aucun toolStep ne signale un champ requis manquant", () => {
    const response = builder.build({ intent, mode: "tool_calling", answer: "x", toolSteps: [{ tool: "list_projects", input: {}, output: "{}" }] });
    expect(response.followUpQuestion).toBeNull();
  });

  test("étape 11 : followUpQuestion est calculé automatiquement depuis toolSteps quand un Tool échoue par validation Joi (champ requis manquant)", () => {
    const response = builder.build({
      intent,
      mode: "tool_calling",
      answer: "Je n'ai pas pu créer l'événement.",
      toolSteps: [{ tool: "create_calendar_event", input: {}, output: 'Error: Invalid input for tool "create_calendar_event": "summary" is required' }],
    });
    expect(response.followUpQuestion).toContain("« summary »");
  });
});

describe("ResponseBuilder.buildErrorResponse", () => {
  const builder = new ResponseBuilder();

  test("exposes the message of a typed kernel error (AiError subclass)", () => {
    const response = builder.buildErrorResponse(new OrchestratorError("message métier sûr à exposer"));
    expect(response).toMatchObject({ mode: "error", answer: null, explanation: null, error: { message: "message métier sûr à exposer" } });
  });

  test("hides the message of an unexpected/unknown error behind a generic message", () => {
    const response = builder.buildErrorResponse(new TypeError("Cannot read property 'x' of undefined — internal detail"));
    expect(response.error.message).toBe(GENERIC_ERROR_MESSAGE);
  });

  test("carries conversationId/intent through when provided", () => {
    const response = builder.buildErrorResponse(new Error("boom"), { conversationId: "c1", intent: { name: "hr" } });
    expect(response.conversationId).toBe("c1");
    expect(response.intent).toBe("hr");
  });

  test("intent defaults to null when not provided (e.g. detection itself failed)", () => {
    const response = builder.buildErrorResponse(new Error("boom"));
    expect(response.intent).toBeNull();
  });

  test("Explainability Engine : être transparent inclut d'expliquer un ÉCHEC — explainability n'est jamais null en mode 'error'", () => {
    const response = builder.buildErrorResponse(new OrchestratorError("permission refusée"));
    expect(response.explainability).not.toBeNull();
    expect(response.explainability.reasoning).toContain("permission refusée");
    expect(response.explainability.dataUsed).toEqual([]);
    expect(response.explainability.toolsCalled).toEqual([]);
    expect(response.explainability.businessRules).toEqual([]);
  });
});

describe("ResponseBuilder.buildClarificationResponse — gérer l'ambiguïté (ConversationContextResolver)", () => {
  const builder = new ResponseBuilder();

  test("mode 'clarification', distinct de 'error' — pas une exception, un tour légitime", () => {
    const response = builder.buildClarificationResponse({ conversationId: "c1", message: "Pouvez-vous préciser ?" });
    expect(response).toMatchObject({
      conversationId: "c1",
      intent: null,
      mode: "clarification",
      answer: "Pouvez-vous préciser ?",
      explanation: null,
      citations: [],
      toolCalls: [],
      agent: null,
    });
    expect(typeof response.generatedAt).toBe("string");
  });

  test("message par défaut si omis", () => {
    const response = builder.buildClarificationResponse();
    expect(response.answer).toMatch(/préciser/i);
    expect(response.conversationId).toBeNull();
  });

  test("Explainability Engine : explainability n'est jamais null en mode 'clarification' — explique l'ambiguïté détectée", () => {
    const response = builder.buildClarificationResponse({ conversationId: "c1", message: "Pouvez-vous préciser ?" });
    expect(response.explainability).not.toBeNull();
    expect(response.explainability.reasoning).toMatch(/référence ou une correction/i);
    expect(response.explainability.dataUsed).toEqual([]);
    expect(response.explainability.toolsCalled).toEqual([]);
    expect(response.explainability.businessRules).toEqual([]);
  });
});
