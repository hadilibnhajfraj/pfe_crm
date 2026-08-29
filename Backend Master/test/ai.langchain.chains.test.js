"use strict";

const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { QaChain, SummarizationChain, ToolCallingChain, parseDecision } = require("../src/ai/langchain/chains");
const { LangChainError, UnknownToolError, PlanningError, ToolCallLimitExceededError } = require("../src/ai/langchain/errors");

function fakeModel(reply) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => reply) } });
}

describe("QaChain", () => {
  const fakeContextBuilder = {
    buildContext: jest.fn(async (_user, scope) => ({
      contextText: "[1] (FAQ) Use the forgot-password link.",
      citations: [{ index: 1, title: "FAQ", excerpt: "Use the forgot-password link." }],
      query: scope.query,
    })),
  };

  beforeEach(() => jest.clearAllMocks());

  test("name is 'qa_chain'", () => {
    expect(new QaChain({ chatModel: fakeModel("x"), contextBuilder: fakeContextBuilder }).name).toBe("qa_chain");
  });

  test("throws LangChainError for an empty question, without calling the context builder", async () => {
    const chain = new QaChain({ chatModel: fakeModel("x"), contextBuilder: fakeContextBuilder });
    await expect(chain.invoke({ question: "" })).rejects.toThrow(LangChainError);
    expect(fakeContextBuilder.buildContext).not.toHaveBeenCalled();
  });

  test("builds context for the question, then returns the model's answer with the context's citations", async () => {
    const chain = new QaChain({ chatModel: fakeModel("Use the link [1]."), contextBuilder: fakeContextBuilder });
    const result = await chain.invoke({ question: "How do I reset my password?", user: { id: "u1" } });

    expect(fakeContextBuilder.buildContext).toHaveBeenCalledWith({ id: "u1" }, { query: "How do I reset my password?" });
    expect(result.answer).toBe("Use the link [1].");
    expect(result.citations).toEqual([{ index: 1, title: "FAQ", excerpt: "Use the forgot-password link." }]);
  });

  test("forwards extra scope fields (e.g. conversationId) to the context builder", async () => {
    const chain = new QaChain({ chatModel: fakeModel("ok"), contextBuilder: fakeContextBuilder });
    await chain.invoke({ question: "q", user: { id: "u1" }, scope: { conversationId: "c1" } });
    expect(fakeContextBuilder.buildContext).toHaveBeenCalledWith({ id: "u1" }, { conversationId: "c1", query: "q" });
  });

  test("génération de réponse : le prompt système envoyé au modèle porte les principes de base (sans rôle)", async () => {
    const { RESPONSE_PRINCIPLES } = require("../src/ai/langchain/prompts/responsePrompts");
    const llmProvider = { complete: jest.fn(async () => "ok") };
    const chain = new QaChain({ chatModel: new LlmProviderChatModel({ llmProvider }), contextBuilder: fakeContextBuilder });
    await chain.invoke({ question: "q", user: { id: "u1" } });
    const [messages] = llmProvider.complete.mock.calls[0];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain(RESPONSE_PRINCIPLES);
  });

  test("génération de réponse : un rôle configuré à la construction adapte le ton du prompt système", async () => {
    const { ROLE_TONE_GUIDANCE } = require("../src/ai/langchain/prompts/responsePrompts");
    const llmProvider = { complete: jest.fn(async () => "ok") };
    const chain = new QaChain({ chatModel: new LlmProviderChatModel({ llmProvider }), contextBuilder: fakeContextBuilder, role: "direction" });
    await chain.invoke({ question: "q", user: { id: "u1" } });
    const [messages] = llmProvider.complete.mock.calls[0];
    expect(messages[0].content).toContain(ROLE_TONE_GUIDANCE.direction);
  });
});

describe("SummarizationChain", () => {
  test("name is 'summarization_chain'", () => {
    expect(new SummarizationChain({ chatModel: fakeModel("x") }).name).toBe("summarization_chain");
  });

  test("throws LangChainError for empty text", async () => {
    const chain = new SummarizationChain({ chatModel: fakeModel("x") });
    await expect(chain.invoke({ text: "   " })).rejects.toThrow(LangChainError);
  });

  test("returns the model's summary", async () => {
    const chain = new SummarizationChain({ chatModel: fakeModel("Short summary.") });
    await expect(chain.invoke({ text: "A long piece of text to summarize." })).resolves.toEqual({ summary: "Short summary." });
  });

  test("includes the maxWords bound and an optional focus in the instruction sent to the model", async () => {
    const llmProvider = { complete: jest.fn(async () => "ok") };
    const model = new LlmProviderChatModel({ llmProvider });
    const chain = new SummarizationChain({ chatModel: model, maxWords: 42 });
    await chain.invoke({ text: "some text", focus: "pricing" });
    const [messages] = llmProvider.complete.mock.calls[0];
    expect(messages[0].content).toContain("42 mots");
    expect(messages[0].content).toContain("pricing");
  });
});

describe("parseDecision", () => {
  test("parses clean JSON directly", () => {
    expect(parseDecision('{"action":"final_answer","answer":"hi"}')).toEqual({ action: "final_answer", answer: "hi" });
  });

  test("extracts JSON even when wrapped in extra text/code fences", () => {
    const wrapped = "Here is my decision:\n```json\n{\"action\":\"final_answer\",\"answer\":\"hi\"}\n```\nDone.";
    expect(parseDecision(wrapped)).toEqual({ action: "final_answer", answer: "hi" });
  });

  test("throws PlanningError when no JSON object can be found", () => {
    expect(() => parseDecision("not json at all")).toThrow(PlanningError);
  });
});

describe("ToolCallingChain", () => {
  function fakeTool(name, impl) {
    return { name, description: `${name} tool`, invoke: impl || jest.fn(async (input) => JSON.stringify(input)) };
  }

  test("name is 'tool_calling_chain'", () => {
    expect(new ToolCallingChain({ chatModel: fakeModel("x"), tools: [] }).name).toBe("tool_calling_chain");
  });

  test("throws LangChainError for an empty instruction", async () => {
    const chain = new ToolCallingChain({ chatModel: fakeModel("x"), tools: [] });
    await expect(chain.invoke({ instruction: "" })).rejects.toThrow(LangChainError);
  });

  test("returns a direct final_answer without calling any tool", async () => {
    const model = fakeModel(JSON.stringify({ action: "final_answer", answer: "42" }));
    const chain = new ToolCallingChain({ chatModel: model, tools: [fakeTool("noop")] });
    const result = await chain.invoke({ instruction: "what is the answer?" });
    expect(result).toEqual({ answer: "42", steps: [] });
  });

  test("calls the named tool, feeds its result back, and returns the eventual final_answer with a step trace", async () => {
    const toolImpl = jest.fn(async (input) => JSON.stringify({ echoed: input.message }));
    const responses = [
      JSON.stringify({ action: "call_tool", tool: "echo_tool", input: { message: "hi" } }),
      JSON.stringify({ action: "final_answer", answer: "done" }),
    ];
    let call = 0;
    const model = new LlmProviderChatModel({ llmProvider: { complete: async () => responses[call++] } });
    const chain = new ToolCallingChain({ chatModel: model, tools: [fakeTool("echo_tool", toolImpl)] });

    const result = await chain.invoke({ instruction: "echo hi" });
    expect(toolImpl).toHaveBeenCalledWith({ message: "hi" });
    expect(result.answer).toBe("done");
    expect(result.steps).toEqual([{ tool: "echo_tool", input: { message: "hi" }, output: '{"echoed":"hi"}' }]);
  });

  test("throws UnknownToolError when the model names a tool that was not provided", async () => {
    const model = fakeModel(JSON.stringify({ action: "call_tool", tool: "ghost_tool", input: {} }));
    const chain = new ToolCallingChain({ chatModel: model, tools: [fakeTool("echo_tool")] });
    await expect(chain.invoke({ instruction: "do something" })).rejects.toThrow(UnknownToolError);
  });

  test("a tool that throws does not abort the run — the error is fed back to the model as the tool's output", async () => {
    const failingTool = fakeTool("failing_tool", async () => {
      throw new Error("boom");
    });
    const responses = [
      JSON.stringify({ action: "call_tool", tool: "failing_tool", input: {} }),
      JSON.stringify({ action: "final_answer", answer: "recovered" }),
    ];
    let call = 0;
    const model = new LlmProviderChatModel({ llmProvider: { complete: async () => responses[call++] } });
    const chain = new ToolCallingChain({ chatModel: model, tools: [failingTool] });

    const result = await chain.invoke({ instruction: "try the failing tool" });
    expect(result.answer).toBe("recovered");
    expect(result.steps[0].output).toContain("Error: boom");
  });

  test("throws ToolCallLimitExceededError when maxToolCalls is reached without a final_answer", async () => {
    const model = fakeModel(JSON.stringify({ action: "call_tool", tool: "echo_tool", input: {} }));
    const chain = new ToolCallingChain({ chatModel: model, tools: [fakeTool("echo_tool")], maxToolCalls: 2 });
    await expect(chain.invoke({ instruction: "loop forever" })).rejects.toThrow(ToolCallLimitExceededError);
  });

  test("throws PlanningError for an unrecognized action", async () => {
    const model = fakeModel(JSON.stringify({ action: "do_something_else" }));
    const chain = new ToolCallingChain({ chatModel: model, tools: [] });
    await expect(chain.invoke({ instruction: "x" })).rejects.toThrow(PlanningError);
  });

  test("génération de réponse : le prompt système porte les principes de base ET le protocole JSON, sans rôle", async () => {
    const { RESPONSE_PRINCIPLES } = require("../src/ai/langchain/prompts/responsePrompts");
    const llmProvider = { complete: jest.fn(async () => JSON.stringify({ action: "final_answer", answer: "42" })) };
    const chain = new ToolCallingChain({ chatModel: new LlmProviderChatModel({ llmProvider }), tools: [fakeTool("echo_tool")] });
    await chain.invoke({ instruction: "une question" });
    const [messages] = llmProvider.complete.mock.calls[0];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain(RESPONSE_PRINCIPLES);
    expect(messages[0].content).toContain("echo_tool");
    expect(messages[0].content).toContain('"action":"call_tool"');
  });

  test("génération de réponse : un rôle configuré à la construction adapte le ton, avant le protocole JSON", async () => {
    const { ROLE_TONE_GUIDANCE } = require("../src/ai/langchain/prompts/responsePrompts");
    const llmProvider = { complete: jest.fn(async () => JSON.stringify({ action: "final_answer", answer: "42" })) };
    const chain = new ToolCallingChain({ chatModel: new LlmProviderChatModel({ llmProvider }), tools: [], role: "maintenance" });
    await chain.invoke({ instruction: "une question" });
    const [messages] = llmProvider.complete.mock.calls[0];
    expect(messages[0].content).toContain(ROLE_TONE_GUIDANCE.maintenance);
  });

  test("appelle PLUSIEURS Tools différents avant de répondre, et fusionne les deux résultats dans une seule réponse (« Quels projets sont en retard ? »)", async () => {
    const listProjects = fakeTool("list_projects", async () => JSON.stringify({ projects: [{ id: "p1", nomProjet: "Usine A", pourcentageReussite: 20 }] }));
    const getDashboardKpis = fakeTool("get_dashboard_kpis", async () => JSON.stringify({ retardMoyenJours: 12 }));

    const responses = [
      JSON.stringify({ action: "call_tool", tool: "list_projects", input: {} }),
      JSON.stringify({ action: "call_tool", tool: "get_dashboard_kpis", input: {} }),
      JSON.stringify({ action: "final_answer", answer: "Le projet 'Usine A' est en retard (12 jours en moyenne)." }),
    ];
    let call = 0;
    const model = new LlmProviderChatModel({ llmProvider: { complete: async () => responses[call++] } });
    const chain = new ToolCallingChain({ chatModel: model, tools: [listProjects, getDashboardKpis], maxToolCalls: 5 });

    const result = await chain.invoke({ instruction: "Quels projets sont en retard ?" });

    expect(result.answer).toBe("Le projet 'Usine A' est en retard (12 jours en moyenne).");
    // Les DEUX Tools ont bien été appelés, dans l'ordre, et tracés — c'est
    // ici que la fusion "plusieurs Tools dans une même réponse" se vérifie :
    // le modèle a vu le résultat du premier Tool AVANT de décider d'appeler
    // le second (chaque résultat est réinjecté comme message avant le tour
    // suivant), et `answer` de synthétise les deux dans une seule phrase.
    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((s) => s.tool)).toEqual(["list_projects", "get_dashboard_kpis"]);
    expect(result.steps[0].output).toContain("Usine A");
    expect(result.steps[1].output).toContain("12");
  });
});
