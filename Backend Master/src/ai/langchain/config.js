"use strict";

// Loads and validates the LANGCHAIN_* environment surface — same pattern as
// src/ai/config/ai.config.js and src/ai/rag/config.js (Joi, frozen object,
// sane defaults). None of these are secrets; they bound how much a
// Planner/ToolCallingChain is allowed to do in one run.
const Joi = require("joi");
const { ConfigurationError } = require("./errors");

const schema = Joi.object({
  LANGCHAIN_MAX_PLAN_STEPS: Joi.number().integer().min(1).max(50).default(8),
  LANGCHAIN_MAX_TOOL_CALLS: Joi.number().integer().min(1).max(20).default(5),
  LANGCHAIN_MAX_HISTORY_MESSAGES: Joi.number().integer().min(0).max(100).default(6),
  LANGCHAIN_MAX_CITATIONS: Joi.number().integer().min(0).max(50).default(5),
})
  .unknown(true)
  .prefs({ convert: true });

function loadLangChainConfig(env = process.env) {
  const { value, error } = schema.validate(env, { abortEarly: false });
  if (error) {
    throw new ConfigurationError(`Invalid LangChain configuration: ${error.message}`);
  }

  return Object.freeze({
    maxPlanSteps: value.LANGCHAIN_MAX_PLAN_STEPS,
    maxToolCalls: value.LANGCHAIN_MAX_TOOL_CALLS,
    maxHistoryMessages: value.LANGCHAIN_MAX_HISTORY_MESSAGES,
    maxCitations: value.LANGCHAIN_MAX_CITATIONS,
  });
}

module.exports = { loadLangChainConfig };
