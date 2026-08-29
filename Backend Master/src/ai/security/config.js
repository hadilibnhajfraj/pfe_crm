"use strict";

// Loads and validates the AI_SECURITY_* environment surface — same pattern
// as every other config.js in this kernel (Joi, frozen object, sane
// defaults). None of these are secrets.
const Joi = require("joi");
const { ConfigurationError } = require("./errors");

const schema = Joi.object({
  // RateLimiter — a per-key (typically actingUser.id + Tool name) budget.
  AI_SECURITY_RATE_LIMIT_MAX: Joi.number().integer().min(1).default(30),
  AI_SECURITY_RATE_LIMIT_WINDOW_SECONDS: Joi.number().integer().min(1).default(60),
  // AuditLog — durable-ish (long TTL, not indefinite like LongTermMemory:
  // an audit trail should eventually roll off, not grow forever) and capped.
  AI_SECURITY_AUDIT_MAX_ENTRIES: Joi.number().integer().min(1).default(10000),
  AI_SECURITY_AUDIT_TTL_SECONDS: Joi.number().integer().min(0).default(60 * 60 * 24 * 90), // 90 jours
  // PromptInjectionGuard — "flag" (report only), "sanitize" (wrap
  // suspicious content as untrusted data before it reaches a prompt), or
  // "block" (refuse outright). See security/promptInjectionGuard.js.
  AI_SECURITY_PROMPT_INJECTION_MODE: Joi.string().valid("flag", "sanitize", "block").default("sanitize"),
})
  .unknown(true)
  .prefs({ convert: true });

function loadSecurityConfig(env = process.env) {
  const { value, error } = schema.validate(env, { abortEarly: false });
  if (error) {
    throw new ConfigurationError(`Invalid security configuration: ${error.message}`);
  }

  return Object.freeze({
    rateLimit: Object.freeze({ max: value.AI_SECURITY_RATE_LIMIT_MAX, windowSeconds: value.AI_SECURITY_RATE_LIMIT_WINDOW_SECONDS }),
    audit: Object.freeze({ maxEntries: value.AI_SECURITY_AUDIT_MAX_ENTRIES, ttlSeconds: value.AI_SECURITY_AUDIT_TTL_SECONDS }),
    promptInjectionMode: value.AI_SECURITY_PROMPT_INJECTION_MODE,
  });
}

module.exports = { loadSecurityConfig };
