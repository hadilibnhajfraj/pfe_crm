"use strict";

// `ILlmProvider` now has two real adapters (see providers/) — `createLlmProvider()`
// is the factory that picks one from AI_LLM_PROVIDER. Guardrails/contextBuilder
// remain ports only — no adapter implemented for either in this pass.
const { ILlmProvider } = require("./llmProvider.interface");
const { IGuardrails } = require("./guardrails.interface");
const { IContextBuilder } = require("./contextBuilder.interface");
const { createLlmProvider, OpenAiProvider, AnthropicProvider } = require("./providers");

module.exports = { ILlmProvider, IGuardrails, IContextBuilder, createLlmProvider, OpenAiProvider, AnthropicProvider };
