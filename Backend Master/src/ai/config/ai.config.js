"use strict";

// Loads and validates the AI_* environment surface. Disabled by default —
// mirrors the existing feature-flag pattern already used for
// AUTO_EMAIL_JOBS_ENABLED / MFA_ENABLED (see src/config/mfaConfig.js).
// No LLM SDK is selected here: AI_LLM_PROVIDER/MODEL/API_KEY are read and
// carried through, but nothing in this infrastructure pass consumes them.

const Joi = require("joi");
const { ConfigurationError } = require("../utils/errors");
const { withNamespace } = require("../utils/logger");

const logger = withNamespace("config");

// AI_COPILOT_ENABLED is READ AS A PLAIN STRING here on purpose (never
// Joi.boolean().truthy("true").falsy("false")): that combinator does an
// EXACT string match, so a real-world value like " TRUE " (padded, a
// different case — copy-pasted into a .env by hand) would fail Joi
// validation entirely rather than parse as enabled. A misconfigured CRM
// flag must never crash the whole process at boot — it must fail CLOSED
// (disabled) or open EXACTLY on intent, never crash. Also never
// `if (!process.env.AI_COPILOT_ENABLED)`: the STRING "false" is truthy in
// JavaScript, so that idiom would enable the Copilot for ANY non-empty
// value, including the literal word "false" — the exact bug this project
// was built to avoid.
function parseBooleanFlag(raw) {
  return String(raw ?? "").trim().toLowerCase() === "true";
}

const schema = Joi.object({
  AI_COPILOT_ENABLED: Joi.string().allow("").default(""),
  AI_COPILOT_ROLES_ALLOWED: Joi.string().allow("").default(""),
  AI_LLM_PROVIDER: Joi.string().allow("").default(""),
  AI_LLM_MODEL: Joi.string().allow("").default(""),
  AI_LLM_API_KEY: Joi.string().allow("").default(""),
  // Ollama-only (local provider, see providers/ollamaProvider.js): a
  // configurable base URL because, unlike OpenAI/Anthropic, there is no
  // single public endpoint — a self-hosted server's address varies per
  // machine. OLLAMA_MODEL is a separate, OPTIONAL override of AI_LLM_MODEL
  // for the ollama provider specifically (falls back to AI_LLM_MODEL when
  // unset — see createLlmProvider(), providers/index.js) since a model tag
  // like "qwen3:8b" is meaningless to any other provider.
  OLLAMA_BASE_URL: Joi.string().allow("").default(""),
  OLLAMA_MODEL: Joi.string().allow("").default(""),
  // AI-Business-Copilot/23_OLLAMA_TIMEOUT_STABILIZATION.md — optional
  // override of OllamaProvider's own DEFAULT_TIMEOUT_MS. Read as a plain
  // string (never Joi.number(), same "a malformed value must never crash
  // the process" discipline as AI_COPILOT_ENABLED above) — parsed and
  // validated in loadAiConfig() below; an unparsable value is IGNORED
  // (falls back to the provider's own default), never a boot-time crash.
  OLLAMA_TIMEOUT_MS: Joi.string().allow("").default(""),
})
  .unknown(true)
  .prefs({ convert: true });

function parseRolesAllowed(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
}

function loadAiConfig(env = process.env) {
  const { value, error } = schema.validate(env, { abortEarly: false, stripUnknown: false });
  if (error) {
    throw new ConfigurationError(`Invalid AI configuration: ${error.message}`);
  }

  const enabled = parseBooleanFlag(value.AI_COPILOT_ENABLED);
  const provider = value.AI_LLM_PROVIDER.trim() || null;
  const parsedOllamaTimeoutMs = Number.parseInt(value.OLLAMA_TIMEOUT_MS.trim(), 10);
  const ollamaTimeoutMs = Number.isFinite(parsedOllamaTimeoutMs) && parsedOllamaTimeoutMs > 0 ? parsedOllamaTimeoutMs : null;

  // [AI-COPILOT] diagnostic log, at every config load (boot AND the
  // lazy first-request read — see aiCopilotBridge.service.js::getGateManager) —
  // grep-able in `pm2 logs`. Never the API key, never the roles-allowed
  // list content (could be considered internal), only what's needed to
  // answer "is it on, and did it pick a provider": see AI-Business-Copilot
  // finalization report for the incident this log line was added for
  // (AI_COPILOT_ENABLED silently defaulting to false because the real
  // .env never had the AI_* block at all — this log makes that instantly
  // visible instead of requiring a code read to discover).
  logger.info(`[AI-COPILOT] enabled=${enabled} provider=${provider || "none"}`);

  return Object.freeze({
    enabled,
    rolesAllowed: Object.freeze(parseRolesAllowed(value.AI_COPILOT_ROLES_ALLOWED)),
    llm: Object.freeze({
      provider,
      model: value.AI_LLM_MODEL.trim() || null,
      // Never logged, never included in getStatus()/toJSON() output — see
      // manager/aiManager.js getStatus(), which reports presence, not value.
      apiKey: value.AI_LLM_API_KEY.trim() || null,
      // Ollama-only — see createLlmProvider(), providers/index.js. Never
      // populated for openai/anthropic, harmless when present but unused.
      ollamaBaseUrl: value.OLLAMA_BASE_URL.trim() || null,
      ollamaModel: value.OLLAMA_MODEL.trim() || null,
      ollamaTimeoutMs,
    }),
  });
}

module.exports = { loadAiConfig };
