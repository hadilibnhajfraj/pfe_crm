"use strict";

const axios = require("axios");
const { ILlmProvider } = require("../llmProvider.interface");
const { AiError } = require("../../utils/errors");
const { withNamespace } = require("../../utils/logger");
const { classifyProviderHttpError, describeProviderHttpError } = require("./errors");
const { withControlledRetry } = require("./retry");

const logger = withNamespace("llm:anthropic");

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Real ILlmProvider adapter for the Anthropic Messages API. The ONLY file
 * that knows Anthropic's request shape — same contract boundary, same
 * error classification/retry policy, and same "no native tool-calling"
 * discipline as `openAiProvider.js` (see that file's own header comment).
 * One vendor-specific translation `complete()` must do that OpenAI's shape
 * doesn't need: Anthropic rejects a `system` role INSIDE `messages`, it
 * wants system content as a separate top-level field — so `system`
 * messages are extracted and joined before the call, never sent through
 * untranslated.
 */
class AnthropicProvider extends ILlmProvider {
  constructor({ apiKey, model, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, maxTokens = DEFAULT_MAX_TOKENS, retry } = {}) {
    super();
    if (!apiKey) throw new AiError("AnthropicProvider requires an apiKey");
    if (!model) throw new AiError("AnthropicProvider requires a model");
    this.model = model;
    this.maxTokens = maxTokens;
    this._retryOptions = retry;
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, "Content-Type": "application/json" },
    });
  }

  async complete(messages, options = {}) {
    return withControlledRetry(() => this._completeOnce(messages, options), this._retryOptions);
  }

  async _completeOnce(messages, options) {
    const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    const conversational = messages.filter((m) => m.role !== "system");
    try {
      const response = await this.http.post("/messages", {
        model: this.model,
        max_tokens: this.maxTokens,
        ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
        messages: conversational,
        ...(options.stop ? { stop_sequences: Array.isArray(options.stop) ? options.stop : [options.stop] } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      });
      const block = response.data && Array.isArray(response.data.content) && response.data.content.find((b) => b.type === "text");
      if (!block || typeof block.text !== "string") {
        throw new AiError("Anthropic returned an unexpected response shape");
      }
      const usage = response.data && response.data.usage;
      if (usage) {
        logger.info(`token usage: input=${usage.input_tokens} output=${usage.output_tokens}`);
      }
      return block.text;
    } catch (err) {
      if (err instanceof AiError) throw err;
      logger.error(`message request failed — ${describeProviderHttpError(err)}`);
      throw classifyProviderHttpError(err, "Anthropic");
    }
  }
}

module.exports = { AnthropicProvider };
