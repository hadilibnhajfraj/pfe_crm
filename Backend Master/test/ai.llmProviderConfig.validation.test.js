"use strict";

// ÉTAPE 8 of "configurer réellement le fournisseur LLM" (see
// AI-Business-Copilot/08_LLM_PROVIDER_OPENAI.md): a dedicated configuration
// validation test — provider=openai, key present, model present, provider
// correctly instantiated — and a guarantee the key's VALUE never appears
// anywhere in a test result/assertion output. Never a live network call.

const { loadAiConfig } = require("../src/ai/config");
const { createLlmProvider, OpenAiProvider, AnthropicProvider, OllamaProvider } = require("../src/ai/services/providers");

const FAKE_KEY = "sk-test-do-not-use-1234567890";

describe("LLM provider configuration validation — AI_LLM_PROVIDER=openai", () => {
  test("a fully configured openai environment resolves provider/model/apiKey correctly", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: FAKE_KEY });
    expect(config.llm.provider).toBe("openai");
    expect(config.llm.model).toBe("gpt-4o-mini");
    expect(Boolean(config.llm.apiKey)).toBe(true);
  });

  test("createLlmProvider() instantiates a REAL OpenAiProvider (not a generic object, not AnthropicProvider) once all three are present", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: FAKE_KEY });
    const provider = createLlmProvider(config.llm);
    expect(provider).toBeInstanceOf(OpenAiProvider);
    expect(provider).not.toBeInstanceOf(AnthropicProvider);
  });

  test("the provider NAME is case-insensitive (\"OpenAI\"/\"OPENAI\" all resolve the same factory)", () => {
    for (const raw of ["openai", "OpenAI", "OPENAI"]) {
      const config = loadAiConfig({ AI_LLM_PROVIDER: raw, AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: FAKE_KEY });
      expect(createLlmProvider(config.llm)).toBeInstanceOf(OpenAiProvider);
    }
  });

  test.each([
    ["provider missing", { AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: FAKE_KEY }],
    ["model missing", { AI_LLM_PROVIDER: "openai", AI_LLM_API_KEY: FAKE_KEY }],
    ["key missing", { AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini" }],
  ])("%s -> createLlmProvider() returns null, never a half-built provider", (_label, env) => {
    const config = loadAiConfig(env);
    expect(createLlmProvider(config.llm)).toBeNull();
  });

  // The exact guarantee ÉTAPE 8 asks for: the key's VALUE must never leak
  // into any observable test result — config object, provider instance
  // (own enumerable properties), or thrown error.
  test("the API key VALUE never appears in the loaded config's JSON representation, nor in the provider instance's own properties", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: FAKE_KEY });
    // config.llm.apiKey legitimately holds the raw value in memory (it must,
    // to build the provider) — the guarantee is about what gets SERIALISED
    // or otherwise surfaced, never this in-memory field itself.
    const provider = createLlmProvider(config.llm);
    expect(JSON.stringify(provider)).not.toContain(FAKE_KEY);
    expect(Object.keys(provider)).not.toContain("apiKey"); // never stored as its own property
  });

  test("an unrecognised AI_LLM_PROVIDER value fails loudly at configuration time, never silently falls back to openai", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "gemini", AI_LLM_MODEL: "m", AI_LLM_API_KEY: FAKE_KEY });
    expect(() => createLlmProvider(config.llm)).toThrow(/Unknown AI_LLM_PROVIDER "gemini"/);
  });
});

// Mirrors the describe block above, one-for-one, for AI_LLM_PROVIDER=anthropic
// — added alongside the Anthropic provider work (see
// AI-Business-Copilot/19_ANTHROPIC_PROVIDER.md). loadAiConfig() itself never
// hardcodes "openai" (src/ai/config/ai.config.js reads AI_LLM_PROVIDER as a
// plain string — the only place a provider NAME is validated is the
// factory, createLlmProvider()), so switching AI_LLM_PROVIDER=anthropic must
// behave identically to the openai path on every one of these axes.
describe("LLM provider configuration validation — AI_LLM_PROVIDER=anthropic", () => {
  test("a fully configured anthropic environment resolves provider/model/apiKey correctly", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "anthropic", AI_LLM_MODEL: "claude-3-5-sonnet-latest", AI_LLM_API_KEY: FAKE_KEY });
    expect(config.llm.provider).toBe("anthropic");
    expect(config.llm.model).toBe("claude-3-5-sonnet-latest");
    expect(Boolean(config.llm.apiKey)).toBe(true);
  });

  test("createLlmProvider() instantiates a REAL AnthropicProvider (not a generic object, not OpenAiProvider) once all three are present", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "anthropic", AI_LLM_MODEL: "claude-3-5-sonnet-latest", AI_LLM_API_KEY: FAKE_KEY });
    const provider = createLlmProvider(config.llm);
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider).not.toBeInstanceOf(OpenAiProvider);
  });

  test("the provider NAME is case-insensitive (\"Anthropic\"/\"ANTHROPIC\" all resolve the same factory)", () => {
    for (const raw of ["anthropic", "Anthropic", "ANTHROPIC"]) {
      const config = loadAiConfig({ AI_LLM_PROVIDER: raw, AI_LLM_MODEL: "claude-3-5-sonnet-latest", AI_LLM_API_KEY: FAKE_KEY });
      expect(createLlmProvider(config.llm)).toBeInstanceOf(AnthropicProvider);
    }
  });

  test.each([
    ["provider missing", { AI_LLM_MODEL: "claude-3-5-sonnet-latest", AI_LLM_API_KEY: FAKE_KEY }],
    ["model missing", { AI_LLM_PROVIDER: "anthropic", AI_LLM_API_KEY: FAKE_KEY }],
    ["key missing", { AI_LLM_PROVIDER: "anthropic", AI_LLM_MODEL: "claude-3-5-sonnet-latest" }],
  ])("%s -> createLlmProvider() returns null, never a half-built provider", (_label, env) => {
    const config = loadAiConfig(env);
    expect(createLlmProvider(config.llm)).toBeNull();
  });

  test("the API key VALUE never appears in the loaded config's JSON representation, nor in the provider instance's own properties", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "anthropic", AI_LLM_MODEL: "claude-3-5-sonnet-latest", AI_LLM_API_KEY: FAKE_KEY });
    const provider = createLlmProvider(config.llm);
    expect(JSON.stringify(provider)).not.toContain(FAKE_KEY);
    expect(Object.keys(provider)).not.toContain("apiKey");
  });

  test("switching AI_LLM_PROVIDER between openai and anthropic with the SAME AI_LLM_API_KEY changes only which provider class is built", () => {
    const openaiConfig = loadAiConfig({ AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: FAKE_KEY });
    const anthropicConfig = loadAiConfig({ AI_LLM_PROVIDER: "anthropic", AI_LLM_MODEL: "claude-3-5-sonnet-latest", AI_LLM_API_KEY: FAKE_KEY });
    expect(createLlmProvider(openaiConfig.llm)).toBeInstanceOf(OpenAiProvider);
    expect(createLlmProvider(anthropicConfig.llm)).toBeInstanceOf(AnthropicProvider);
  });
});

// AI_LLM_PROVIDER=ollama — the one provider that deliberately does NOT
// follow the "all three AI_LLM_* present" rule tested above: Ollama is a
// local, unauthenticated server, so AI_LLM_API_KEY is never required for
// it (see createLlmProvider(), providers/index.js). Added alongside the
// Ollama provider work (see AI-Business-Copilot/20_OLLAMA_PROVIDER.md).
describe("LLM provider configuration validation — AI_LLM_PROVIDER=ollama", () => {
  test("a fully configured ollama environment resolves provider/model correctly, with NO apiKey required", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "ollama", AI_LLM_MODEL: "qwen3:8b" });
    expect(config.llm.provider).toBe("ollama");
    expect(config.llm.model).toBe("qwen3:8b");
    expect(config.llm.apiKey).toBeNull();
  });

  test("createLlmProvider() instantiates a REAL OllamaProvider (never OpenAiProvider/AnthropicProvider) with apiKey absent", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "ollama", AI_LLM_MODEL: "qwen3:8b" });
    const provider = createLlmProvider(config.llm);
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider).not.toBeInstanceOf(OpenAiProvider);
    expect(provider).not.toBeInstanceOf(AnthropicProvider);
  });

  test("the provider NAME is case-insensitive (\"Ollama\"/\"OLLAMA\")", () => {
    for (const raw of ["ollama", "Ollama", "OLLAMA"]) {
      const config = loadAiConfig({ AI_LLM_PROVIDER: raw, AI_LLM_MODEL: "qwen3:8b" });
      expect(createLlmProvider(config.llm)).toBeInstanceOf(OllamaProvider);
    }
  });

  test("OLLAMA_MODEL overrides AI_LLM_MODEL for this provider only", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "ollama", AI_LLM_MODEL: "gpt-4o-mini", OLLAMA_MODEL: "qwen3:8b" });
    const provider = createLlmProvider(config.llm);
    expect(provider.model).toBe("qwen3:8b");
  });

  test("OLLAMA_BASE_URL is read and forwarded; defaults to http://localhost:11434 when unset", () => {
    const withCustomUrl = loadAiConfig({ AI_LLM_PROVIDER: "ollama", AI_LLM_MODEL: "qwen3:8b", OLLAMA_BASE_URL: "http://192.168.1.50:11434" });
    expect(createLlmProvider(withCustomUrl.llm).baseUrl).toBe("http://192.168.1.50:11434");

    const withDefaultUrl = loadAiConfig({ AI_LLM_PROVIDER: "ollama", AI_LLM_MODEL: "qwen3:8b" });
    expect(createLlmProvider(withDefaultUrl.llm).baseUrl).toBe("http://localhost:11434");
  });

  test("model missing (neither AI_LLM_MODEL nor OLLAMA_MODEL) -> createLlmProvider() returns null", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "ollama" });
    expect(createLlmProvider(config.llm)).toBeNull();
  });

  test("no OLLAMA_* variable ever leaks into the openai/anthropic path — both remain apiKey-gated exactly as before", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini", OLLAMA_MODEL: "qwen3:8b", OLLAMA_BASE_URL: "http://localhost:11434" });
    expect(createLlmProvider(config.llm)).toBeNull(); // AI_LLM_API_KEY still absent — openai still requires it
  });

  // AI-Business-Copilot/24_OLLAMA_TIMEOUT_DIAGNOSIS.md
  test("OLLAMA_TIMEOUT_MS is read and forwarded; falls back to OllamaProvider's own default (240000ms) when unset", () => {
    const withCustomTimeout = loadAiConfig({ AI_LLM_PROVIDER: "ollama", AI_LLM_MODEL: "qwen3:8b", OLLAMA_TIMEOUT_MS: "90000" });
    expect(createLlmProvider(withCustomTimeout.llm).timeoutMs).toBe(90000);

    const withDefaultTimeout = loadAiConfig({ AI_LLM_PROVIDER: "ollama", AI_LLM_MODEL: "qwen3:8b" });
    expect(createLlmProvider(withDefaultTimeout.llm).timeoutMs).toBe(240000);
  });
});
