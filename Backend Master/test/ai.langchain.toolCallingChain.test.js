"use strict";

// AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md — reproduced live
// against Ollama/qwen3:8b: ToolCallingChain could return a "final_answer"
// whose TEXT claims a Tool was used ("J'utilise l'outil list_projects...")
// and even states a fabricated result, while `steps` (the ONLY real record
// of Tools actually invoked) stayed empty. The model's own protocol
// adherence is not trustworthy enough to be the source of truth for "was a
// Tool really called" — these tests lock in the `requireToolUse` guard,
// which decides PURELY from `steps.length` (the chain's own real state),
// never from parsing/pattern-matching the model's text.

const { ToolCallingChain, UNVERIFIED_FINAL_ANSWER_MESSAGE, truncateToolResultForPrompt, MAX_TOOL_RESULT_CHARS } = require("../src/ai/langchain/chains/toolCallingChain");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");

function chatModelSequence(...decisions) {
  const complete = jest.fn();
  decisions.forEach((decision) => complete.mockResolvedValueOnce(JSON.stringify(decision)));
  return new LlmProviderChatModel({ llmProvider: { complete } });
}

function fakeTool(name, output = "{}") {
  return { name, description: "d", invoke: jest.fn(async () => output) };
}

describe("ToolCallingChain — requireToolUse: false (défaut, comportement inchangé)", () => {
  test("un final_answer au premier tour, sans aucun appel d'outil, est retourné TEL QUEL — comportement historique préservé", async () => {
    const chatModel = chatModelSequence({ action: "final_answer", answer: "Réponse directe, sans Tool." });
    const chain = new ToolCallingChain({ chatModel, tools: [fakeTool("list_projects")] });

    const result = await chain.invoke({ instruction: "une question" });

    expect(result.answer).toBe("Réponse directe, sans Tool.");
    expect(result.steps).toEqual([]);
    expect(result.unverifiedFinalAnswerRejected).toBeUndefined();
  });
});

describe("ToolCallingChain — requireToolUse: true (garantie backend, jamais le texte du LLM)", () => {
  test("un final_answer au premier tour, avec ZÉRO appel d'outil réel, est REJETÉ et remplacé par le message honnête fixe — même si le texte prétend avoir utilisé un Tool", async () => {
    const chatModel = chatModelSequence({
      action: "final_answer",
      answer: 'J\'utilise l\'outil list_projects avec le filtre ownerId=Hadil pour récupérer les projets associés à Hadil. Aucun projet ne correspond à ce filtre dans les données disponibles.',
    });
    const chain = new ToolCallingChain({ chatModel, tools: [fakeTool("list_projects")], requireToolUse: true });

    const result = await chain.invoke({ instruction: "Donne-moi les projets associés à Hadil." });

    expect(result.answer).toBe(UNVERIFIED_FINAL_ANSWER_MESSAGE);
    expect(result.answer).not.toContain("J'utilise l'outil");
    expect(result.answer).not.toContain("Aucun projet ne correspond");
    expect(result.steps).toEqual([]);
    expect(result.unverifiedFinalAnswerRejected).toBe(true);
  });

  test("la garde se base UNIQUEMENT sur steps.length, jamais sur le contenu du texte — un final_answer sans AUCUNE formulation suspecte est rejeté tout autant", async () => {
    // Aucune phrase du type "j'utilise"/"j'ai utilisé" ici — prouve que la
    // garde ne fait AUCUNE détection de motif textuel (interdit par la
    // consigne), seulement `steps.length === 0`.
    const chatModel = chatModelSequence({ action: "final_answer", answer: "Il y a 12 projets actifs pour ce compte." });
    const chain = new ToolCallingChain({ chatModel, tools: [fakeTool("list_projects")], requireToolUse: true });

    const result = await chain.invoke({ instruction: "Donne-moi les projets associés à Hadil." });

    expect(result.answer).toBe(UNVERIFIED_FINAL_ANSWER_MESSAGE);
  });

  test("un final_answer qui arrive APRÈS un vrai appel d'outil est accepté tel quel — la garde ne bloque jamais une réponse réellement fondée", async () => {
    const tool = fakeTool("list_projects", JSON.stringify({ data: [{ id: "p1" }], total: 1 }));
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "list_projects", input: { mine: true } },
      { action: "final_answer", answer: "Vous avez 1 projet." }
    );
    const chain = new ToolCallingChain({ chatModel, tools: [tool], requireToolUse: true });

    const result = await chain.invoke({ instruction: "Donne-moi mes projets." });

    expect(tool.invoke).toHaveBeenCalledWith({ mine: true });
    expect(result.answer).toBe("Vous avez 1 projet.");
    expect(result.steps).toHaveLength(1);
    expect(result.unverifiedFinalAnswerRejected).toBeUndefined();
  });

  test("un final_answer sans aucun Tool disponible (tools: []) est aussi rejeté — requireToolUse ne dépend pas de la présence de Tools, seulement de steps.length", async () => {
    const chatModel = chatModelSequence({ action: "final_answer", answer: "Voici une réponse inventée." });
    const chain = new ToolCallingChain({ chatModel, tools: [], requireToolUse: true });

    const result = await chain.invoke({ instruction: "une question" });

    expect(result.answer).toBe(UNVERIFIED_FINAL_ANSWER_MESSAGE);
  });
});

// AI-Business-Copilot/22_OLLAMA_PERFORMANCE.md — mesuré en direct : un
// résultat de Tool non scopé (ex. list_projects sur 253 projets) réinjecté
// tel quel gonflait un tour de 1 759 à 42 115 caractères, cause dominante
// des dépassements de timeout en inférence locale. Ces tests verrouillent
// la troncature du texte réinjecté AU MODÈLE, sans jamais toucher à
// `steps` (l'audit trail réel renvoyé à l'appelant).
describe("ToolCallingChain — troncature du résultat d'un Tool réinjecté (performance, jamais l'audit trail)", () => {
  test("truncateToolResultForPrompt() laisse un texte court inchangé", () => {
    expect(truncateToolResultForPrompt("court")).toBe("court");
  });

  test("truncateToolResultForPrompt() raccourcit un texte long et l'annonce explicitement", () => {
    const long = "x".repeat(MAX_TOOL_RESULT_CHARS + 500);
    const result = truncateToolResultForPrompt(long);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain("tronqué");
    expect(result.startsWith("x".repeat(MAX_TOOL_RESULT_CHARS))).toBe(true);
  });

  test("un résultat de Tool volumineux est tronqué dans le message réinjecté au modèle, mais `steps[].output` garde le résultat COMPLET", async () => {
    const bigOutput = JSON.stringify({ data: Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, nomProjet: `Projet ${i}` })) });
    expect(bigOutput.length).toBeGreaterThan(MAX_TOOL_RESULT_CHARS);

    const tool = fakeTool("list_projects", bigOutput);
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "list_projects", input: {} },
      { action: "final_answer", answer: "Voici un résumé." }
    );
    const chain = new ToolCallingChain({ chatModel, tools: [tool] });

    const result = await chain.invoke({ instruction: "liste les projets" });

    // L'audit trail (steps) garde le résultat RÉEL et complet — jamais raccourci.
    expect(result.steps[0].output).toBe(bigOutput);
    expect(result.steps[0].output.length).toBe(bigOutput.length);

    // Le message envoyé au modèle pour le tour suivant, lui, est tronqué.
    const secondCallMessages = chatModel.llmProvider.complete.mock.calls[1][0];
    const injectedResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(injectedResultMessage.content.length).toBeLessThan(bigOutput.length);
    expect(injectedResultMessage.content).toContain("tronqué");
  });

  test("un résultat de Tool court n'est jamais altéré dans le message réinjecté", async () => {
    const smallOutput = JSON.stringify({ data: [{ id: "p1" }], total: 1 });
    const tool = fakeTool("list_projects", smallOutput);
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "list_projects", input: { mine: true } },
      { action: "final_answer", answer: "Vous avez 1 projet." }
    );
    const chain = new ToolCallingChain({ chatModel, tools: [tool] });

    await chain.invoke({ instruction: "mes projets" });

    const secondCallMessages = chatModel.llmProvider.complete.mock.calls[1][0];
    const injectedResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(injectedResultMessage.content).toBe(`Résultat de l'outil "list_projects": ${smallOutput}`);
  });
});
