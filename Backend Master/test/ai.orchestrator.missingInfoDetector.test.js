"use strict";

const { detectMissingFields, buildFollowUpQuestion } = require("../src/ai/orchestrator/missingInfoDetector");

// Forme EXACTE produite en production : ValidationManager.validateToolInput()
// -> ToolValidationError (mcp/errors.js: `Invalid input for tool "X": <Joi>`)
// -> ErrorHandler.toResponse() (message inchangé) -> mcpToolAdapter.js
// (`throw new Error(response.error.message)`) -> ToolCallingChain
// (`Error: ${err.message}`) — voir missingInfoDetector.js pour la traçabilité
// complète.
function joiValidationFailure(toolName, ...fields) {
  const detail = fields.map((f) => `"${f}" is required`).join(". ");
  return `Error: Invalid input for tool "${toolName}": ${detail}`;
}

describe("detectMissingFields", () => {
  test("extrait le nom du champ depuis un message d'échec de validation Joi réel", () => {
    const toolSteps = [{ tool: "create_calendar_event", input: {}, output: joiValidationFailure("create_calendar_event", "summary") }];
    expect(detectMissingFields(toolSteps)).toEqual(["summary"]);
  });

  test("extrait PLUSIEURS champs manquants d'un même échec (abortEarly: false)", () => {
    const toolSteps = [{ tool: "create_calendar_event", input: {}, output: joiValidationFailure("create_calendar_event", "summary", "startDateTime") }];
    expect(detectMissingFields(toolSteps)).toEqual(["summary", "startDateTime"]);
  });

  test("fusionne les champs de PLUSIEURS toolSteps, dédupliqués, dans l'ordre de première apparition", () => {
    const toolSteps = [
      { tool: "t1", input: {}, output: joiValidationFailure("t1", "a", "b") },
      { tool: "t2", input: {}, output: joiValidationFailure("t2", "b", "c") },
    ];
    expect(detectMissingFields(toolSteps)).toEqual(["a", "b", "c"]);
  });

  test("un toolStep réussi (pas de préfixe 'Error: ') n'est jamais scanné", () => {
    const toolSteps = [{ tool: "list_projects", input: {}, output: JSON.stringify({ data: [] }) }];
    expect(detectMissingFields(toolSteps)).toEqual([]);
  });

  test("une erreur qui n'est PAS une validation Joi ('champ requis') n'est jamais confondue avec une information manquante", () => {
    const toolSteps = [
      { tool: "t1", input: {}, output: "Error: Tool \"t1\" failed to execute." },
      { tool: "t2", input: {}, output: 'Error: Invalid input for tool "t2": "limit" must be a number' },
    ];
    expect(detectMissingFields(toolSteps)).toEqual([]);
  });

  test("aucun toolStep => aucun champ manquant", () => {
    expect(detectMissingFields([])).toEqual([]);
    expect(detectMissingFields()).toEqual([]);
  });

  test("un output qui n'est pas une chaîne (ex. la sortie structurée de analyze_project_attention) est ignoré sans planter", () => {
    const toolSteps = [{ tool: "analyze_project_attention", input: {}, output: [{ projectId: "p1" }] }];
    expect(detectMissingFields(toolSteps)).toEqual([]);
  });
});

describe("buildFollowUpQuestion", () => {
  test("null quand aucun champ ne manque — rien à demander", () => {
    expect(buildFollowUpQuestion([])).toBeNull();
  });

  test("un seul champ manquant : question au singulier, citant le nom du champ", () => {
    const question = buildFollowUpQuestion(["dateRelance"]);
    expect(question).toContain("« dateRelance »");
    expect(question).toMatch(/l'information suivante/);
    expect(question).toMatch(/la préciser/);
  });

  test("plusieurs champs manquants : question au pluriel, citant chaque champ", () => {
    const question = buildFollowUpQuestion(["summary", "startDateTime"]);
    expect(question).toContain("« summary »");
    expect(question).toContain("« startDateTime »");
    expect(question).toMatch(/les informations suivantes/);
    expect(question).toMatch(/les préciser/);
  });
});
