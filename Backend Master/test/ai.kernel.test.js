"use strict";

// Smoke tests for the AI kernel infrastructure (src/ai). No app.js, no DB:
// this module is not mounted anywhere yet, so these tests only prove the
// composition root wires up correctly and stays inert until explicitly
// enabled — not any Copilot behaviour (there is none yet).

const { createDefaultAiManager, AiManager } = require("../src/ai");
const { InMemoryEventBus } = require("../src/ai/events");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PromptTemplate, InMemoryPromptRepository } = require("../src/ai/prompts");
const { ToolRegistry } = require("../src/ai/tools");
const { NotImplementedError, NotConfiguredError } = require("../src/ai/utils/errors");

describe("AI kernel — disabled by default", () => {
  test("createDefaultAiManager() is disabled without AI_COPILOT_ENABLED", () => {
    const manager = createDefaultAiManager({});
    expect(manager.isEnabled()).toBe(false);
    expect(manager.isRoleAllowed("admin")).toBe(false);
    expect(manager.isRoleAllowed("user")).toBe(false);
  });

  test("createDefaultAiManager() enables and scopes roles when configured", () => {
    const manager = createDefaultAiManager({
      AI_COPILOT_ENABLED: "true",
      AI_COPILOT_ROLES_ALLOWED: "admin, superadmin",
    });
    expect(manager.isEnabled()).toBe(true);
    expect(manager.isRoleAllowed("admin")).toBe(true);
    expect(manager.isRoleAllowed("commercial")).toBe(false);
  });

  test("empty AI_COPILOT_ROLES_ALLOWED means every role is allowed once enabled", () => {
    const manager = createDefaultAiManager({ AI_COPILOT_ENABLED: "true" });
    expect(manager.isRoleAllowed("user")).toBe(true);
    expect(manager.isRoleAllowed("commercial")).toBe(true);
  });

  test("getStatus() reports wired adapters without leaking the API key", () => {
    const manager = createDefaultAiManager({
      AI_LLM_PROVIDER: "acme",
      AI_LLM_API_KEY: "should-not-appear-in-status",
    });
    const status = manager.getStatus();
    expect(status.adapters.eventBus).toBe(true);
    expect(status.adapters.llmProvider).toBe(false);
    expect(JSON.stringify(status)).not.toContain("should-not-appear-in-status");
  });

  test("requireLlmProvider() throws NotConfiguredError when no adapter is wired", () => {
    const manager = createDefaultAiManager({});
    expect(() => manager.requireLlmProvider()).toThrow(NotConfiguredError);
  });

  test("wires a real llmProvider once AI_LLM_PROVIDER/MODEL/API_KEY are all set", () => {
    const manager = createDefaultAiManager({
      AI_LLM_PROVIDER: "openai",
      AI_LLM_MODEL: "gpt-4o-mini",
      AI_LLM_API_KEY: "sk-test",
    });
    expect(manager.getStatus().adapters.llmProvider).toBe(true);
    expect(() => manager.requireLlmProvider()).not.toThrow();
  });

  test("an unrecognised AI_LLM_PROVIDER fails loudly at construction, not silently later", () => {
    expect(() =>
      createDefaultAiManager({ AI_LLM_PROVIDER: "acme", AI_LLM_MODEL: "m", AI_LLM_API_KEY: "k" })
    ).toThrow(/Unknown AI_LLM_PROVIDER/);
  });
});

// Locks in the diagnostic added for the "Le Copilot IA n'est pas configuré
// côté serveur." incident — pinpoints EXACTLY which of
// AI_LLM_PROVIDER/MODEL/API_KEY is missing from `pm2 logs` alone, without
// ever printing the provider name, model name, or key itself (booleans
// only — see src/ai/manager/index.js).
describe("AI kernel — [AI-COPILOT-CONFIG] diagnostic log", () => {
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function logged() {
    return logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
  }

  test("reports all three as unconfigured when AI_LLM_PROVIDER/MODEL/API_KEY are absent", () => {
    createDefaultAiManager({ AI_COPILOT_ENABLED: "true" });
    expect(logged()).toContain("[AI-COPILOT-CONFIG] enabled=true providerConfigured=false modelConfigured=false apiKeyConfigured=false llmProviderWired=false");
  });

  test("reports llmProviderWired=true only once ALL THREE are present with a recognised provider", () => {
    createDefaultAiManager({ AI_COPILOT_ENABLED: "true", AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: "sk-test" });
    expect(logged()).toContain("providerConfigured=true modelConfigured=true apiKeyConfigured=true llmProviderWired=true");
  });

  test("a PARTIAL config (e.g. provider+model but no key) still reports llmProviderWired=false — never a false positive", () => {
    createDefaultAiManager({ AI_COPILOT_ENABLED: "true", AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini" });
    expect(logged()).toContain("providerConfigured=true modelConfigured=true apiKeyConfigured=false llmProviderWired=false");
  });

  test("NEVER logs the actual API key, provider name, or model name — booleans only", () => {
    createDefaultAiManager({ AI_COPILOT_ENABLED: "true", AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: "sk-super-secret-value" });
    expect(logged()).not.toContain("sk-super-secret-value");
    expect(logged()).not.toContain("gpt-4o-mini");
    // "openai"/"anthropic" as a bare provider NAME never appears in this
    // specific log line (booleans only) — distinct from the separate
    // [AI-COPILOT] boot log (ai.config.js) which does name the provider,
    // itself never a secret.
    const configLine = logged().split("\n").find((l) => l.includes("[AI-COPILOT-CONFIG]"));
    expect(configLine).not.toMatch(/openai|anthropic/i);
  });
});

describe("AI kernel — generic infrastructure adapters", () => {
  test("InMemoryEventBus delivers published events to subscribers", () => {
    const bus = new InMemoryEventBus();
    const received = [];
    bus.subscribe("ai-response-ready", (payload) => received.push(payload));
    bus.publish("ai-response-ready", { jobId: "abc" });
    expect(received).toEqual([{ jobId: "abc" }]);
  });

  test("InMemoryConversationMemory appends and retrieves history in order", async () => {
    const memory = new InMemoryConversationMemory();
    await memory.append("conv-1", { role: "user", content: "hello" });
    await memory.append("conv-1", { role: "assistant", content: "hi" });
    const history = await memory.getHistory("conv-1");
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("PromptTemplate renders known variables and leaves unknown ones untouched", () => {
    const template = new PromptTemplate({ name: "greeting", template: "Bonjour {{name}}, solde: {{missing}}" });
    expect(template.render({ name: "Hadil" })).toBe("Bonjour Hadil, solde: {{missing}}");
  });

  test("InMemoryPromptRepository registers and retrieves by name+version", () => {
    const repo = new InMemoryPromptRepository();
    const template = new PromptTemplate({ name: "greeting", version: 2, template: "hi" });
    repo.register(template);
    expect(repo.get("greeting", 2)).toBe(template);
    expect(repo.get("greeting", 1)).toBeNull();
  });

  test("ToolRegistry rejects duplicate registration", () => {
    const registry = new ToolRegistry();
    const tool = { name: "draftRelanceMessage" };
    registry.register(tool);
    expect(() => registry.register(tool)).toThrow();
    expect(registry.get("draftRelanceMessage")).toBe(tool);
  });
});

describe("AI kernel — ports throw NotImplementedError until an adapter exists", () => {
  test.each([
    ["agents/IAgent", require("../src/ai/agents").IAgent],
    ["mcp/IMcpClient", require("../src/ai/mcp").IMcpClient],
    ["rag/IRetriever", require("../src/ai/rag").IRetriever],
    ["vector/IVectorStore", require("../src/ai/vector").IVectorStore],
    ["services/ILlmProvider", require("../src/ai/services").ILlmProvider],
  ])("%s has no default implementation", async (_label, PortClass) => {
    const instance = new PortClass();
    const firstMethod = Object.getOwnPropertyNames(PortClass.prototype).find(
      (m) => m !== "constructor"
    );
    await expect(async () => {
      const result = instance[firstMethod]();
      if (result && typeof result.then === "function") await result;
    }).rejects.toThrow(NotImplementedError);
  });
});

describe("AiManager can be constructed with a fully custom set of adapters", () => {
  test("constructor accepts only injected ports (Dependency Inversion)", () => {
    const manager = new AiManager({
      config: { enabled: true, rolesAllowed: [], llm: { provider: null, model: null, apiKey: null } },
      eventBus: new InMemoryEventBus(),
      memory: new InMemoryConversationMemory(),
      promptRepository: new InMemoryPromptRepository(),
      toolRegistry: new ToolRegistry(),
      workflowRunner: { run: async (steps, ctx) => ctx },
      agentRegistry: { register: () => {}, get: () => null, list: () => [] },
    });
    expect(manager.isEnabled()).toBe(true);
    expect(manager.llmProvider).toBeNull();
  });
});
