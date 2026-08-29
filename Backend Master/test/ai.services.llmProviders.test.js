"use strict";

// Real ILlmProvider adapters (src/ai/services/providers/) — the two
// concrete LLM SDK integrations this kernel now has. axios itself is
// mocked (jest.mock("axios")): these tests prove the REQUEST/RESPONSE
// SHAPE each adapter builds/parses is correct, and that a failure is never
// surfaced with the raw underlying error (which could carry the API key in
// its request config) — never a live network call.

jest.mock("axios");
const axios = require("axios");

const { OpenAiProvider } = require("../src/ai/services/providers/openAiProvider");
const { AnthropicProvider } = require("../src/ai/services/providers/anthropicProvider");
const { OllamaProvider } = require("../src/ai/services/providers/ollamaProvider");
const { createLlmProvider } = require("../src/ai/services/providers");
const { LlmProviderRequestError } = require("../src/ai/services/providers/errors");
const { AiError, ConfigurationError } = require("../src/ai/utils/errors");

let postMock;

beforeEach(() => {
  postMock = jest.fn();
  axios.create.mockReturnValue({ post: postMock });
});

describe("OpenAiProvider", () => {
  test("requires an apiKey and a model", () => {
    expect(() => new OpenAiProvider({ model: "gpt-4o-mini" })).toThrow(AiError);
    expect(() => new OpenAiProvider({ apiKey: "sk-test" })).toThrow(AiError);
  });

  test("configures axios with a Bearer Authorization header and a timeout", () => {
    new OpenAiProvider({ apiKey: "sk-test", model: "gpt-4o-mini" });
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
        timeout: expect.any(Number),
      })
    );
  });

  test("complete() posts model/messages to /chat/completions and returns the assistant text", async () => {
    postMock.mockResolvedValue({ data: { choices: [{ message: { content: "Bonjour !" } }] } });
    const provider = new OpenAiProvider({ apiKey: "sk-test", model: "gpt-4o-mini" });

    const text = await provider.complete([{ role: "user", content: "Salut" }]);

    expect(text).toBe("Bonjour !");
    expect(postMock).toHaveBeenCalledWith(
      "/chat/completions",
      expect.objectContaining({ model: "gpt-4o-mini", messages: [{ role: "user", content: "Salut" }] })
    );
  });

  test("forwards options.stop as the OpenAI `stop` field", async () => {
    postMock.mockResolvedValue({ data: { choices: [{ message: { content: "x" } }] } });
    const provider = new OpenAiProvider({ apiKey: "sk-test", model: "gpt-4o-mini" });

    await provider.complete([], { stop: ["FIN"] });

    expect(postMock).toHaveBeenCalledWith("/chat/completions", expect.objectContaining({ stop: ["FIN"] }));
  });

  test("forwards options.temperature when provided, omits it when undefined", async () => {
    postMock.mockResolvedValue({ data: { choices: [{ message: { content: "x" } }] } });
    const provider = new OpenAiProvider({ apiKey: "sk-test", model: "gpt-4o-mini" });

    await provider.complete([], { temperature: 0.2 });
    expect(postMock).toHaveBeenCalledWith("/chat/completions", expect.objectContaining({ temperature: 0.2 }));

    await provider.complete([]);
    expect(postMock).toHaveBeenLastCalledWith("/chat/completions", expect.not.objectContaining({ temperature: expect.anything() }));
  });

  test("an unexpected response shape throws AiError", async () => {
    postMock.mockResolvedValue({ data: {} });
    const provider = new OpenAiProvider({ apiKey: "sk-test", model: "gpt-4o-mini" });

    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toThrow(AiError);
  });

  test("a failed HTTP call throws LlmProviderRequestError and never leaks the raw error/API key", async () => {
    postMock.mockRejectedValue(new Error("connect ETIMEDOUT — Authorization: Bearer sk-real-secret-value"));
    const provider = new OpenAiProvider({ apiKey: "sk-real-secret-value", model: "gpt-4o-mini" });

    try {
      await provider.complete([{ role: "user", content: "hi" }]);
      throw new Error("expected complete() to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(LlmProviderRequestError);
      expect(err.message).not.toContain("sk-real-secret-value");
      expect(err.message).not.toContain("ETIMEDOUT");
    }
  });
});

describe("AnthropicProvider", () => {
  test("requires an apiKey and a model", () => {
    expect(() => new AnthropicProvider({ model: "claude-3-5-sonnet-latest" })).toThrow(AiError);
    expect(() => new AnthropicProvider({ apiKey: "sk-ant-test" })).toThrow(AiError);
  });

  test("configures axios with x-api-key/anthropic-version headers", () => {
    new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-sonnet-latest" });
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "sk-ant-test", "anthropic-version": expect.any(String) }),
      })
    );
  });

  test("complete() extracts system messages into the top-level `system` field, never inside `messages`", async () => {
    postMock.mockResolvedValue({ data: { content: [{ type: "text", text: "réponse" }] } });
    const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-sonnet-latest" });

    const text = await provider.complete([
      { role: "system", content: "Tu es un assistant CRM." },
      { role: "user", content: "Bonjour" },
    ]);

    expect(text).toBe("réponse");
    expect(postMock).toHaveBeenCalledWith(
      "/messages",
      expect.objectContaining({
        system: "Tu es un assistant CRM.",
        messages: [{ role: "user", content: "Bonjour" }],
      })
    );
  });

  test("forwards options.stop as `stop_sequences`", async () => {
    postMock.mockResolvedValue({ data: { content: [{ type: "text", text: "x" }] } });
    const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-sonnet-latest" });

    await provider.complete([{ role: "user", content: "hi" }], { stop: "FIN" });

    expect(postMock).toHaveBeenCalledWith("/messages", expect.objectContaining({ stop_sequences: ["FIN"] }));
  });

  test("forwards options.temperature when provided, omits it when undefined", async () => {
    postMock.mockResolvedValue({ data: { content: [{ type: "text", text: "x" }] } });
    const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-sonnet-latest" });

    await provider.complete([{ role: "user", content: "hi" }], { temperature: 0.2 });
    expect(postMock).toHaveBeenCalledWith("/messages", expect.objectContaining({ temperature: 0.2 }));

    await provider.complete([{ role: "user", content: "hi" }]);
    expect(postMock).toHaveBeenLastCalledWith("/messages", expect.not.objectContaining({ temperature: expect.anything() }));
  });

  test("an unexpected response shape throws AiError", async () => {
    postMock.mockResolvedValue({ data: { content: [] } });
    const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-sonnet-latest" });

    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toThrow(AiError);
  });

  test("a failed HTTP call throws LlmProviderRequestError and never leaks the raw error/API key", async () => {
    postMock.mockRejectedValue(new Error("401 — x-api-key: sk-ant-real-secret"));
    const provider = new AnthropicProvider({ apiKey: "sk-ant-real-secret", model: "claude-3-5-sonnet-latest" });

    try {
      await provider.complete([{ role: "user", content: "hi" }]);
      throw new Error("expected complete() to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(LlmProviderRequestError);
      expect(err.message).not.toContain("sk-ant-real-secret");
    }
  });
});

describe("OllamaProvider", () => {
  test("requires a model, but NEVER an apiKey (local, unauthenticated server)", () => {
    expect(() => new OllamaProvider({})).toThrow(AiError);
    expect(() => new OllamaProvider({ model: "qwen3:8b" })).not.toThrow();
  });

  test("configures axios with the local base URL, a timeout, and NO Authorization/x-api-key header", () => {
    new OllamaProvider({ model: "qwen3:8b" });
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "http://localhost:11434",
        timeout: expect.any(Number),
        headers: expect.not.objectContaining({ Authorization: expect.anything(), "x-api-key": expect.anything() }),
      })
    );
  });

  test("a custom baseUrl is honoured (e.g. a non-default OLLAMA_BASE_URL)", () => {
    new OllamaProvider({ model: "qwen3:8b", baseUrl: "http://192.168.1.50:11434" });
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "http://192.168.1.50:11434" }));
  });

  // AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md — mission
  // "DIAGNOSTIQUER ET CORRIGER LE TIMEOUT OLLAMA DU COPILOT IA" : 180 000ms
  // measured live as insufficient (a real, non-buggy por_promesh_agent turn
  // took 179 681ms) — 240 000ms restores real headroom over that measured
  // worst case. See ollamaProvider.js DEFAULT_TIMEOUT_MS for the full
  // measurement.
  test("defaults the axios timeout to 240000ms (DEFAULT_TIMEOUT_MS)", () => {
    new OllamaProvider({ model: "qwen3:8b" });
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 240000 }));
  });

  test("a custom timeoutMs (e.g. from OLLAMA_TIMEOUT_MS) overrides the default", () => {
    new OllamaProvider({ model: "qwen3:8b", timeoutMs: 90000 });
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 90000 }));
  });

  test("complete() posts model/messages/stream:false to /api/chat and returns the assistant text", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "Bonjour !" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b" });

    const text = await provider.complete([{ role: "user", content: "Salut" }]);

    expect(text).toBe("Bonjour !");
    expect(postMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ model: "qwen3:8b", messages: [{ role: "user", content: "Salut" }], stream: false })
    );
  });

  // AI-Business-Copilot/22_OLLAMA_PERFORMANCE.md — measured live: leaving
  // `think` unset lets Ollama default it to true for qwen3:8b, costing
  // 6-30x the latency of the SAME turn with think:false, for no benefit to
  // this kernel's strict JSON/text protocol (chain-of-thought tokens are
  // never read downstream). `think` must always be sent explicitly — never
  // left to Ollama's own default.
  test("sends think:false by default (top-level, not nested under options) — never left to Ollama's own default", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "OK" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b" });

    await provider.complete([{ role: "user", content: "hi" }]);

    expect(postMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ think: false }));
  });

  test("honours an explicit think:true override (constructor-level, for a future caller that genuinely needs it)", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "OK" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b", think: true });

    await provider.complete([{ role: "user", content: "hi" }]);

    expect(postMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ think: true }));
  });

  // AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md — a safety ceiling
  // against pathological/looping generation (qwen3:8b's Modelfile sets
  // repeat_penalty:1, no extra anti-repetition pressure), never a normal
  // truncation point — every real completion observed for por_promesh_agent
  // during the diagnosis stayed well under this value (max measured: 227
  // tokens); reduced from 1024 to 768 to also bound worst-case generation
  // exposure (still >3x the measured worst case).
  test("sends num_predict:768 by default, nested under options (a sampling knob, unlike think)", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "OK" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b" });

    await provider.complete([{ role: "user", content: "hi" }]);

    expect(postMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ options: expect.objectContaining({ num_predict: 768 }) }));
  });

  test("honours a custom numPredict override, and omits num_predict entirely when explicitly set to null", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "OK" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b", numPredict: 256 });
    await provider.complete([{ role: "user", content: "hi" }]);
    expect(postMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ options: expect.objectContaining({ num_predict: 256 }) }));

    const unbounded = new OllamaProvider({ model: "qwen3:8b", numPredict: null });
    await unbounded.complete([{ role: "user", content: "hi" }]);
    expect(postMock).toHaveBeenLastCalledWith("/api/chat", expect.not.objectContaining({ options: expect.objectContaining({ num_predict: expect.anything() }) }));
  });

  // AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md — `GET /api/ps`
  // showed live that Ollama silently defaults an unset num_ctx to 4096,
  // while a real por_promesh_agent turn (2e appel) already measures
  // ~2762-3839 prompt tokens — leaving almost no margin before num_predict
  // pushes the total past 4096, forcing a slow context shift mid-generation.
  // Sent explicitly on every call from now on so that silent default never
  // applies.
  test("sends num_ctx:8192 by default, nested under options", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "OK" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b" });

    await provider.complete([{ role: "user", content: "hi" }]);

    expect(postMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ options: expect.objectContaining({ num_ctx: 8192 }) }));
  });

  test("honours a custom numCtx override, and omits num_ctx entirely when explicitly set to null", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "OK" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b", numCtx: 16384 });
    await provider.complete([{ role: "user", content: "hi" }]);
    expect(postMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ options: expect.objectContaining({ num_ctx: 16384 }) }));

    const unbounded = new OllamaProvider({ model: "qwen3:8b", numCtx: null });
    await unbounded.complete([{ role: "user", content: "hi" }]);
    expect(postMock).toHaveBeenLastCalledWith("/api/chat", expect.not.objectContaining({ options: expect.objectContaining({ num_ctx: expect.anything() }) }));
  });

  test("sends the system role INSIDE messages, unlike Anthropic — no extraction needed", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "OK" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b" });

    await provider.complete([
      { role: "system", content: "Tu es un assistant CRM." },
      { role: "user", content: "Réponds uniquement OK." },
    ]);

    expect(postMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        messages: [
          { role: "system", content: "Tu es un assistant CRM." },
          { role: "user", content: "Réponds uniquement OK." },
        ],
      })
    );
  });

  test("forwards options.stop and options.temperature nested under Ollama's own `options` field, alongside the default num_predict ceiling", async () => {
    postMock.mockResolvedValue({ data: { message: { role: "assistant", content: "x" }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b" });

    await provider.complete([{ role: "user", content: "hi" }], { stop: "FIN", temperature: 0.2 });

    // AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md — num_predict AND
    // num_ctx are now always present (safety ceiling + explicit context
    // window, see DEFAULT_NUM_PREDICT/DEFAULT_NUM_CTX), so `options` is
    // never entirely absent even when stop/temperature aren't passed —
    // exact-shape assertion updated accordingly, never bypassed.
    expect(postMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ options: { stop: ["FIN"], temperature: 0.2, num_predict: 768, num_ctx: 8192 } }));

    await provider.complete([{ role: "user", content: "hi" }]);
    expect(postMock).toHaveBeenLastCalledWith("/api/chat", expect.objectContaining({ options: { num_predict: 768, num_ctx: 8192 } }));
  });

  test("an unexpected response shape throws AiError", async () => {
    postMock.mockResolvedValue({ data: { done: true } }); // no `message`
    const provider = new OllamaProvider({ model: "qwen3:8b" });

    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toThrow(AiError);
  });

  test("a failed HTTP call (e.g. Ollama not running) throws LlmProviderRequestError, never the raw error", async () => {
    postMock.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { code: "ECONNREFUSED" }));
    const provider = new OllamaProvider({ model: "qwen3:8b" });

    try {
      await provider.complete([{ role: "user", content: "hi" }]);
      throw new Error("expected complete() to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(LlmProviderRequestError);
      expect(err.message).not.toContain("ECONNREFUSED");
    }
  });

  describe("checkHealth() — diagnostic only, never called from the request path", () => {
    test("reports available + whether the configured model is pulled, via GET /api/tags", async () => {
      const getMock = jest.fn().mockResolvedValue({ data: { models: [{ name: "qwen3:8b" }, { name: "llama3:8b" }] } });
      axios.create.mockReturnValue({ post: postMock, get: getMock });
      const provider = new OllamaProvider({ model: "qwen3:8b" });

      const health = await provider.checkHealth();

      expect(getMock).toHaveBeenCalledWith("/api/tags");
      expect(health).toEqual({ available: true, modelAvailable: true, models: ["qwen3:8b", "llama3:8b"] });
    });

    test("a model NOT in the pulled list reports modelAvailable:false without throwing", async () => {
      const getMock = jest.fn().mockResolvedValue({ data: { models: [{ name: "llama3:8b" }] } });
      axios.create.mockReturnValue({ post: postMock, get: getMock });
      const provider = new OllamaProvider({ model: "qwen3:8b" });

      await expect(provider.checkHealth()).resolves.toEqual({ available: true, modelAvailable: false, models: ["llama3:8b"] });
    });

    test("Ollama unreachable reports available:false without throwing", async () => {
      const getMock = jest.fn().mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
      axios.create.mockReturnValue({ post: postMock, get: getMock });
      const provider = new OllamaProvider({ model: "qwen3:8b" });

      const health = await provider.checkHealth();
      expect(health.available).toBe(false);
      expect(health.modelAvailable).toBe(false);
    });
  });
});

describe("createLlmProvider — factory", () => {
  test("returns null unless provider/model/apiKey are ALL present (openai/anthropic)", () => {
    expect(createLlmProvider(null)).toBeNull();
    expect(createLlmProvider({})).toBeNull();
    expect(createLlmProvider({ provider: "openai" })).toBeNull();
    expect(createLlmProvider({ provider: "openai", apiKey: "k" })).toBeNull();
    expect(createLlmProvider({ provider: "openai", model: "m" })).toBeNull();
  });

  test("builds a real OpenAiProvider for provider=openai", () => {
    const provider = createLlmProvider({ provider: "openai", model: "gpt-4o-mini", apiKey: "k" });
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });

  test("builds a real AnthropicProvider for provider=anthropic, case-insensitively", () => {
    const provider = createLlmProvider({ provider: "Anthropic", model: "claude-3-5-sonnet-latest", apiKey: "k" });
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  test("an unrecognised provider name throws ConfigurationError rather than silently returning null", () => {
    expect(() => createLlmProvider({ provider: "acme", model: "m", apiKey: "k" })).toThrow(ConfigurationError);
  });

  test("builds a real OllamaProvider for provider=ollama WITHOUT any apiKey — never returns null for a missing key on this provider", () => {
    const provider = createLlmProvider({ provider: "ollama", model: "qwen3:8b" });
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  test("provider=ollama still returns null when no model is available from either AI_LLM_MODEL or OLLAMA_MODEL", () => {
    expect(createLlmProvider({ provider: "ollama" })).toBeNull();
  });

  test("ollamaModel (OLLAMA_MODEL) takes precedence over the shared model (AI_LLM_MODEL) for provider=ollama only", () => {
    const provider = createLlmProvider({ provider: "ollama", model: "gpt-4o-mini", ollamaModel: "qwen3:8b" });
    expect(provider.model).toBe("qwen3:8b");
  });

  test("falls back to the shared model (AI_LLM_MODEL) when OLLAMA_MODEL isn't set", () => {
    const provider = createLlmProvider({ provider: "ollama", model: "qwen3:8b" });
    expect(provider.model).toBe("qwen3:8b");
  });

  test("ollamaBaseUrl (OLLAMA_BASE_URL) is forwarded; falls back to OllamaProvider's own default when unset", () => {
    const withCustomUrl = createLlmProvider({ provider: "ollama", model: "qwen3:8b", ollamaBaseUrl: "http://192.168.1.50:11434" });
    expect(withCustomUrl.baseUrl).toBe("http://192.168.1.50:11434");

    const withDefaultUrl = createLlmProvider({ provider: "ollama", model: "qwen3:8b" });
    expect(withDefaultUrl.baseUrl).toBe("http://localhost:11434");
  });

  test("provider name is case-insensitive (\"Ollama\"/\"OLLAMA\")", () => {
    for (const raw of ["ollama", "Ollama", "OLLAMA"]) {
      expect(createLlmProvider({ provider: raw, model: "qwen3:8b" })).toBeInstanceOf(OllamaProvider);
    }
  });
});
