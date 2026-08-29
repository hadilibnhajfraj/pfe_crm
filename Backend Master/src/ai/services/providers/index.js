"use strict";

const { OpenAiProvider } = require("./openAiProvider");
const { AnthropicProvider } = require("./anthropicProvider");
const { OllamaProvider } = require("./ollamaProvider");
const { ConfigurationError } = require("../../utils/errors");

const FACTORIES = {
  openai: (llm) => new OpenAiProvider({ apiKey: llm.apiKey, model: llm.model }),
  anthropic: (llm) => new AnthropicProvider({ apiKey: llm.apiKey, model: llm.model }),
  // Local, unauthenticated server — no apiKey (see the apiKey-required check
  // below) — model defaults to the shared AI_LLM_MODEL if OLLAMA_MODEL isn't
  // set separately; baseUrl defaults to OllamaProvider's own
  // DEFAULT_BASE_URL (http://localhost:11434) when OLLAMA_BASE_URL is unset.
  // AI-Business-Copilot/23_OLLAMA_TIMEOUT_STABILIZATION.md — ollamaTimeoutMs
  // is OPTIONAL (OLLAMA_TIMEOUT_MS env var); `undefined` when absent lets
  // OllamaProvider's own constructor default (DEFAULT_TIMEOUT_MS) apply,
  // same pattern as baseUrl/model just above.
  ollama: (llm) => new OllamaProvider({ baseUrl: llm.ollamaBaseUrl || undefined, model: llm.ollamaModel || llm.model, timeoutMs: llm.ollamaTimeoutMs || undefined }),
};

// Every OTHER provider in this kernel is a paid, authenticated hosted API —
// Ollama is the first (and, by construction, only) local/unauthenticated
// exception, so it's the one name excluded from the apiKey requirement
// below rather than adding a per-provider config flag for a single case.
const PROVIDERS_WITHOUT_API_KEY = new Set(["ollama"]);

/**
 * Selects and builds a real ILlmProvider from `loadAiConfig().llm`
 * (`{provider, model, apiKey, ollamaBaseUrl, ollamaModel, ollamaTimeoutMs}`,
 * see ai.config.js) — the single place that turns `AI_LLM_PROVIDER` into a
 * concrete adapter.
 *
 * Returns `null` when provider/model aren't present, or when apiKey is
 * missing for a provider that requires one — mirrors this kernel's "absent
 * config => inert, never a crash at boot" rule (see ai.config.js,
 * AiManager.isEnabled()). Throws `ConfigurationError` only when a provider
 * NAME is given but isn't one this kernel knows how to build (a typo in
 * AI_LLM_PROVIDER is a misconfiguration worth failing loud on at boot, not a
 * silently-broken Copilot discovered later at runtime).
 */
function createLlmProvider(llm) {
  if (!llm || !llm.provider) {
    return null;
  }
  const providerName = llm.provider.toLowerCase();
  const model = providerName === "ollama" ? llm.ollamaModel || llm.model : llm.model;
  if (!model) return null;
  if (!PROVIDERS_WITHOUT_API_KEY.has(providerName) && !llm.apiKey) return null;

  const factory = FACTORIES[providerName];
  if (!factory) {
    throw new ConfigurationError(`Unknown AI_LLM_PROVIDER "${llm.provider}". Supported: ${Object.keys(FACTORIES).join(", ")}.`);
  }
  return factory(llm);
}

module.exports = { createLlmProvider, OpenAiProvider, AnthropicProvider, OllamaProvider };
