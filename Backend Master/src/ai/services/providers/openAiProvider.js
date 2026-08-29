"use strict";

const axios = require("axios");
const { ILlmProvider } = require("../llmProvider.interface");
const { AiError } = require("../../utils/errors");
const { withNamespace } = require("../../utils/logger");
const { classifyProviderHttpError, describeProviderHttpError } = require("./errors");
const { withControlledRetry } = require("./retry");

const logger = withNamespace("llm:openai");

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Real ILlmProvider adapter for the OpenAI Chat Completions API (also
 * compatible with Azure OpenAI/most OpenAI-compatible gateways via
 * `baseUrl`). The ONLY file that knows the OpenAI request/response shape —
 * everything above `ILlmProvider` (LangChain chains, WorkflowManager,
 * Agents) stays unaware of which vendor answered, per
 * `llmProviderChatModel.js`'s own contract comment.
 *
 * Deliberately does NOT use OpenAI's native `tools`/`function_call`
 * parameters or `response_format` (structured output/JSON mode): tool
 * selection in this kernel already happens one layer up, in plain text,
 * via LangChain's ToolCallingChain (see llmProviderChatModel.js's own
 * comment — `complete()` is a pure text-in/text-out contract, `{role,
 * content}[] -> string`) — adding a second, native tool-calling mechanism
 * here would duplicate that, tie every future ILlmProvider adapter to
 * OpenAI-specific request shapes, and touch nothing anything currently
 * consumes. See AI-Business-Copilot/08_LLM_PROVIDER_OPENAI.md for the full
 * reasoning.
 */
class OpenAiProvider extends ILlmProvider {
  constructor({ apiKey, model, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, retry } = {}) {
    super();
    if (!apiKey) throw new AiError("OpenAiProvider requires an apiKey");
    if (!model) throw new AiError("OpenAiProvider requires a model");
    this.model = model;
    // Test-only seam — production code never passes this, always gets the
    // real bounded retry (see retry.js).
    this._retryOptions = retry;
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
  }

  async complete(messages, options = {}) {
    return withControlledRetry(() => this._completeOnce(messages, options), this._retryOptions);
  }

  async _completeOnce(messages, options) {
    try {
      const response = await this.http.post("/chat/completions", {
        model: this.model,
        messages,
        ...(options.stop ? { stop: options.stop } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      });
      const text = response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content;
      if (typeof text !== "string") {
        throw new AiError("OpenAI returned an unexpected response shape");
      }
      // Visibility only — the `complete()` contract returns a plain string
      // (see llmProviderChatModel.js), never restructured to carry usage,
      // so this is logged, never returned. Token counts are not secret.
      const usage = response.data && response.data.usage;
      if (usage) {
        logger.info(`token usage: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`);
      }
      return text;
    } catch (err) {
      if (err instanceof AiError) throw err;
      logger.error(`chat completion request failed — ${describeProviderHttpError(err)}`);
      throw classifyProviderHttpError(err, "OpenAI");
    }
  }
}

module.exports = { OpenAiProvider };
