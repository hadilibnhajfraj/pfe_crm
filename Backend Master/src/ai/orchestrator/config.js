"use strict";

// Loads and validates the AI_ORCHESTRATOR_* environment surface — same
// pattern as config/ai.config.js, rag/config.js and langchain/config.js
// (Joi, frozen object, sane defaults). Bounds how the orchestrator behaves
// by default; none of these are secrets.
const Joi = require("joi");
const { ConfigurationError } = require("./errors");

const schema = Joi.object({
  AI_ORCHESTRATOR_DEFAULT_INTENT: Joi.string().min(1).default("general_chat"),
  AI_ORCHESTRATOR_MAX_CANDIDATE_TOOLS: Joi.number().integer().min(1).max(20).default(5),
  AI_ORCHESTRATOR_MAX_HISTORY_MESSAGES: Joi.number().integer().min(0).max(100).default(20),
})
  .unknown(true)
  .prefs({ convert: true });

function loadOrchestratorConfig(env = process.env) {
  const { value, error } = schema.validate(env, { abortEarly: false });
  if (error) {
    throw new ConfigurationError(`Invalid orchestrator configuration: ${error.message}`);
  }

  return Object.freeze({
    defaultIntent: value.AI_ORCHESTRATOR_DEFAULT_INTENT,
    maxCandidateTools: value.AI_ORCHESTRATOR_MAX_CANDIDATE_TOOLS,
    maxHistoryMessages: value.AI_ORCHESTRATOR_MAX_HISTORY_MESSAGES,
  });
}

module.exports = { loadOrchestratorConfig };
