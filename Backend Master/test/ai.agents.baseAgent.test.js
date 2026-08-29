"use strict";

const { BaseAgent } = require("../src/ai/agents/baseAgent");
const { AgentError, AgentPermissionError, ConfigurationError } = require("../src/ai/agents/errors");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");

function fakeWorkflowEngine() {
  return {
    run: jest.fn(async (steps, state) => {
      const step = steps[0];
      const input = step.buildInput ? step.buildInput(state) : state;
      const output = await step.chain.invoke(input);
      return { ...state, [step.outputKey]: output };
    }),
  };
}

function fakeChatModel(reply) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => reply) } });
}

function fakeMemory(history = []) {
  return { getHistory: jest.fn(async () => history) };
}

const USER = { id: "u1", role: "user" };

describe("BaseAgent construction", () => {
  const base = { chatModel: fakeChatModel("x"), workflowEngine: fakeWorkflowEngine() };

  test("requires a name", () => {
    expect(() => new BaseAgent({ ...base, systemPrompt: "p" })).toThrow(ConfigurationError);
  });

  test("requires a systemPrompt", () => {
    expect(() => new BaseAgent({ ...base, name: "x" })).toThrow(ConfigurationError);
  });

  test("requires a chatModel", () => {
    expect(() => new BaseAgent({ name: "x", systemPrompt: "p", workflowEngine: fakeWorkflowEngine() })).toThrow(ConfigurationError);
  });

  test("requires a workflowEngine", () => {
    expect(() => new BaseAgent({ name: "x", systemPrompt: "p", chatModel: fakeChatModel("x") })).toThrow(ConfigurationError);
  });
});

describe("BaseAgent.canHandle", () => {
  test("true only for intents named in intentNames", () => {
    const agent = new BaseAgent({ name: "x", systemPrompt: "p", intentNames: ["hr"], chatModel: fakeChatModel("x"), workflowEngine: fakeWorkflowEngine() });
    expect(agent.canHandle({ name: "hr" })).toBe(true);
    expect(agent.canHandle({ name: "maintenance" })).toBe(false);
    expect(agent.canHandle(null)).toBe(false);
  });
});

describe("BaseAgent.execute — permissions", () => {
  test("throws AgentPermissionError (not swallowed) for a role outside requiredRoles", async () => {
    const agent = new BaseAgent({
      name: "restricted_agent",
      systemPrompt: "p",
      intentNames: ["x"],
      requiredRoles: ["admin"],
      chatModel: fakeChatModel("x"),
      workflowEngine: fakeWorkflowEngine(),
      qaChain: { invoke: jest.fn() },
    });
    await expect(agent.execute({ intent: { name: "x" }, message: "m", user: USER, conversationId: null })).rejects.toThrow(AgentPermissionError);
  });

  test("allows an authorized role through to _run", async () => {
    const qaChain = { name: "qa_chain", invoke: jest.fn(async () => ({ answer: "ok", citations: [] })) };
    const agent = new BaseAgent({
      name: "restricted_agent",
      systemPrompt: "p",
      intentNames: ["x"],
      requiredRoles: ["user"],
      chatModel: fakeChatModel("x"),
      workflowEngine: fakeWorkflowEngine(),
      qaChain,
    });
    await expect(agent.execute({ intent: { name: "x" }, message: "m", user: USER, conversationId: null })).resolves.toMatchObject({ answer: "ok" });
  });

  test("an unauthenticated user (no id/role) is denied even with requiredRoles: []", async () => {
    const agent = new BaseAgent({ name: "open_agent", systemPrompt: "p", chatModel: fakeChatModel("x"), workflowEngine: fakeWorkflowEngine(), qaChain: { invoke: jest.fn() } });
    await expect(agent.execute({ intent: { name: "x" }, message: "m", user: null, conversationId: null })).rejects.toThrow(AgentPermissionError);
  });
});

describe("BaseAgent._run — default behavior (tool-calling, RAG fallback)", () => {
  test("uses a ToolCallingChain scoped to the allowed Tools when at least one is available", async () => {
    const workflowEngine = fakeWorkflowEngine();
    const model = fakeChatModel(JSON.stringify({ action: "final_answer", answer: "42" }));
    const tool = { name: "list_projects", description: "Liste les projets", invoke: jest.fn() };
    const otherTool = { name: "delete_everything", description: "hors périmètre", invoke: jest.fn() };
    const agent = new BaseAgent({
      name: "project_agent",
      systemPrompt: "Tu es l'agent projets.",
      intentNames: ["projects"],
      chatModel: model,
      tools: [tool, otherTool],
      allowedToolNames: ["list_projects"],
      workflowEngine,
    });

    const result = await agent.execute({ intent: { name: "projects" }, message: "liste les projets", user: USER, conversationId: null });

    expect(result).toEqual({ answer: "42", citations: [], toolSteps: [] });
    const [steps] = workflowEngine.run.mock.calls[0];
    expect(steps[0].chain.toolsByName.has("list_projects")).toBe(true);
    expect(steps[0].chain.toolsByName.has("delete_everything")).toBe(false);
  });

  // AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md — requireToolUse
  // defaults to false (this file's other tests, unchanged, prove that); this
  // locks in that BaseAgent forwards an explicit `true` to the ToolCallingChain
  // it builds, and that the chain's own guard actually applies end-to-end.
  test("requireToolUse: true is forwarded to the constructed ToolCallingChain and rejects an unverified final_answer", async () => {
    const workflowEngine = fakeWorkflowEngine();
    const model = fakeChatModel(JSON.stringify({ action: "final_answer", answer: "J'ai consulté les données : tout va bien." }));
    const tool = { name: "list_projects", description: "Liste les projets", invoke: jest.fn() };
    const agent = new BaseAgent({
      name: "project_agent",
      systemPrompt: "Tu es l'agent projets.",
      intentNames: ["projects"],
      chatModel: model,
      tools: [tool],
      allowedToolNames: ["list_projects"],
      workflowEngine,
      requireToolUse: true,
    });

    const result = await agent.execute({ intent: { name: "projects" }, message: "liste les projets", user: USER, conversationId: null });

    expect(result.answer).toBe("Je n'ai pas pu récupérer les données CRM nécessaires pour répondre à cette question.");
    expect(result.toolSteps).toEqual([]);
    expect(tool.invoke).not.toHaveBeenCalled();
    const [steps] = workflowEngine.run.mock.calls[0];
    expect(steps[0].chain.requireToolUse).toBe(true);
  });

  test("falls back to qaChain when no allowed Tool is available", async () => {
    const workflowEngine = fakeWorkflowEngine();
    const qaChain = { name: "qa_chain", invoke: jest.fn(async ({ question }) => ({ answer: `réponse: ${question}`, citations: [{ index: 1 }] })) };
    const agent = new BaseAgent({
      name: "assistant_agent",
      systemPrompt: "Tu es l'assistant général.",
      intentNames: ["general_chat"],
      chatModel: fakeChatModel("unused"),
      tools: [],
      allowedToolNames: [],
      workflowEngine,
      qaChain,
    });

    const result = await agent.execute({ intent: { name: "general_chat" }, message: "bonjour", user: USER, conversationId: "c1" });

    expect(qaChain.invoke).toHaveBeenCalledWith({ question: "bonjour", user: USER, scope: { conversationId: "c1" } });
    expect(result).toEqual({ answer: "réponse: bonjour", citations: [{ index: 1 }], toolSteps: [] });
  });

  test("includes recent conversation history (via memory) in the instruction sent to the model", async () => {
    const workflowEngine = fakeWorkflowEngine();
    const model = fakeChatModel(JSON.stringify({ action: "final_answer", answer: "ok" }));
    const tool = { name: "t", description: "d", invoke: jest.fn() };
    const memory = fakeMemory([{ role: "user", content: "précédent message" }]);
    const agent = new BaseAgent({
      name: "x",
      systemPrompt: "SYSTEM PROMPT MARKER",
      intentNames: ["x"],
      chatModel: model,
      tools: [tool],
      workflowEngine,
      memory,
      maxHistoryMessages: 3,
    });

    await agent.execute({ intent: { name: "x" }, message: "nouvelle demande", user: USER, conversationId: "c1" });

    expect(memory.getHistory).toHaveBeenCalledWith("c1", { limit: 3 });
    const instructionSent = model.llmProvider.complete.mock.calls[0][0].find((m) => m.role === "user").content;
    expect(instructionSent).toContain("SYSTEM PROMPT MARKER");
    expect(instructionSent).toContain("précédent message");
    expect(instructionSent).toContain("nouvelle demande");
  });

  test("gestion des erreurs: a Chain failure is absorbed into a degraded (but valid) answer, not thrown", async () => {
    const workflowEngine = { run: jest.fn(async () => { throw new Error("boom"); }) };
    const tool = { name: "t", description: "d", invoke: jest.fn() };
    const agent = new BaseAgent({ name: "flaky_agent", systemPrompt: "p", intentNames: ["x"], chatModel: fakeChatModel("x"), tools: [tool], workflowEngine });

    const result = await agent.execute({ intent: { name: "x" }, message: "m", user: USER, conversationId: null });
    expect(result.answer).toContain("flaky_agent");
    expect(result.citations).toEqual([]);
    expect(result.toolSteps).toEqual([]);
  });

  test("gestion des erreurs: throws (internally) then degrades gracefully when neither a Tool nor a qaChain is configured", async () => {
    const agent = new BaseAgent({ name: "useless_agent", systemPrompt: "p", intentNames: ["x"], chatModel: fakeChatModel("x"), tools: [], workflowEngine: fakeWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "x" }, message: "m", user: USER, conversationId: null });
    expect(result.answer).toContain("useless_agent");
  });
});

describe("BaseAgent — AgentError", () => {
  test("is a distinguishable error type", () => {
    expect(new AgentError("x")).toBeInstanceOf(Error);
  });
});

// AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md, étape 1 — "ne pas
// masquer l'erreur" : quand _run() échoue, execute() doit journaliser
// l'erreur TECHNIQUE réelle (code de classification, conversationId,
// message, stack via `err`) avant de renvoyer la réponse dégradée
// générique — jamais seulement "n'a pas pu traiter cette demande" côté
// logs serveur.
describe("BaseAgent.execute — journalisation de l'échec (étape 1, ne pas masquer l'erreur)", () => {
  function agentWithFailingWorkflow({ logger }) {
    const failingWorkflowEngine = { run: jest.fn(async () => { throw new Error("upstream boom"); }) };
    return new BaseAgent({
      name: "some_agent",
      systemPrompt: "prompt",
      chatModel: fakeChatModel({}),
      tools: [{ name: "some_tool", description: "d", invoke: jest.fn() }],
      workflowEngine: failingWorkflowEngine,
      logger,
    });
  }

  test("logge le code de classification (AI_AGENT_ERROR pour une erreur générique) et le conversationId, avant de renvoyer la réponse dégradée", async () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const agent = agentWithFailingWorkflow({ logger });

    const result = await agent.execute({ intent: { name: "x" }, message: "m", user: USER, conversationId: "conv-42" });

    expect(result.answer).toBe("Désolé, some_agent n'a pas pu traiter cette demande pour le moment. Merci de réessayer ou de reformuler.");
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [loggedMessage, loggedErr] = logger.error.mock.calls[0];
    expect(loggedMessage).toContain("[AI_AGENT_ERROR]");
    expect(loggedMessage).toContain("conversationId=conv-42");
    expect(loggedMessage).toContain('intent "x"');
    expect(loggedMessage).toContain("upstream boom");
    expect(loggedErr).toBeInstanceOf(Error);
    expect(loggedErr.message).toBe("upstream boom");
  });

  test("un conversationId absent (nouvelle conversation) est journalisé lisiblement, jamais 'undefined'", async () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const agent = agentWithFailingWorkflow({ logger });

    await agent.execute({ intent: { name: "x" }, message: "m", user: USER, conversationId: null });

    const [loggedMessage] = logger.error.mock.calls[0];
    expect(loggedMessage).toContain("conversationId=n/a");
  });

  test("la stack loggée est la VRAIE stack d'origine, jamais une pile factice pointant vers l'utilitaire de redaction", async () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const agent = agentWithFailingWorkflow({ logger });

    await agent.execute({ intent: { name: "x" }, message: "m", user: USER, conversationId: "c1" });

    const [, loggedErr] = logger.error.mock.calls[0];
    expect(loggedErr.stack).toContain("upstream boom");
    expect(loggedErr.stack).not.toContain("secretRedaction.js");
  });
});
