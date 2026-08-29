"use strict";

// Loads and validates the REDIS_*/MEMORY_* environment surface — same
// pattern as config/ai.config.js, rag/config.js, langchain/config.js and
// orchestrator/config.js (Joi, frozen object, sane defaults). Bounds how
// long each of the 5 memory components keeps data alive by default; none of
// these are secrets except REDIS_URL (may embed a password), which is
// carried through but never logged (same discipline as AI_LLM_API_KEY in
// config/ai.config.js).
const Joi = require("joi");
const { ConfigurationError } = require("./errors");

const schema = Joi.object({
  REDIS_URL: Joi.string().uri().default("redis://127.0.0.1:6379"),
  MEMORY_KEY_PREFIX: Joi.string().min(1).default("ai:"),
  // ShortTermMemory — the volatile, recent-message transcript of one
  // conversation. Short by design: 30 minutes of inactivity, capped to the
  // last 50 messages.
  MEMORY_SHORT_TERM_TTL_SECONDS: Joi.number().integer().min(1).default(1800),
  MEMORY_SHORT_TERM_MAX_MESSAGES: Joi.number().integer().min(1).default(50),
  // SessionMemory — the session envelope (userId, active conversation,
  // last-active timestamp). 1 hour sliding timeout, refreshed on every touch.
  MEMORY_SESSION_TTL_SECONDS: Joi.number().integer().min(1).default(3600),
  // ContextMemory — structured "current focus" slots for one conversation
  // (e.g. last module/entity discussed). Same lifetime class as
  // ShortTermMemory: it should die with the conversation's active window.
  MEMORY_CONTEXT_TTL_SECONDS: Joi.number().integer().min(1).default(1800),
  // LongTermMemory / PreferenceMemory — durable, cross-session facts and
  // user preferences. 0 means "no TTL, never expires" (the honest meaning
  // of "long term") — this is the ONLY ttl in this file allowed to be 0.
  MEMORY_LONG_TERM_TTL_SECONDS: Joi.number().integer().min(0).default(0),
  MEMORY_PREFERENCE_TTL_SECONDS: Joi.number().integer().min(0).default(0),
})
  .unknown(true)
  .prefs({ convert: true });

function loadMemoryConfig(env = process.env) {
  const { value, error } = schema.validate(env, { abortEarly: false });
  if (error) {
    throw new ConfigurationError(`Invalid memory configuration: ${error.message}`);
  }

  return Object.freeze({
    redisUrl: value.REDIS_URL,
    keyPrefix: value.MEMORY_KEY_PREFIX,
    shortTerm: Object.freeze({ ttlSeconds: value.MEMORY_SHORT_TERM_TTL_SECONDS, maxMessages: value.MEMORY_SHORT_TERM_MAX_MESSAGES }),
    session: Object.freeze({ ttlSeconds: value.MEMORY_SESSION_TTL_SECONDS }),
    context: Object.freeze({ ttlSeconds: value.MEMORY_CONTEXT_TTL_SECONDS }),
    longTerm: Object.freeze({ ttlSeconds: value.MEMORY_LONG_TERM_TTL_SECONDS || null }),
    preference: Object.freeze({ ttlSeconds: value.MEMORY_PREFERENCE_TTL_SECONDS || null }),
  });
}

module.exports = { loadMemoryConfig };
