"use strict";

const { loadSecurityConfig } = require("./config");
const { InMemoryKeyValueStore } = require("../memory");
const { RateLimiter } = require("./rateLimiter");
const { AuditLog } = require("./auditLog");
const { PromptInjectionGuard } = require("./promptInjectionGuard");

/**
 * Composition root for the security subsystem (mirrors manager/index.js,
 * rag/pipeline.js, langchain/pipeline.js, memory/pipeline.js,
 * automations/pipeline.js and dashboard/pipeline.js): wires `RateLimiter`
 * and `AuditLog` over ONE `IKeyValueStore`, plus a `PromptInjectionGuard`.
 *
 * `store` defaults to a fresh `InMemoryKeyValueStore()` — a genuinely safe,
 * always-available default (unlike Redis, which needs external infra),
 * exactly like `HashingEmbeddingProvider` is RAG's safe offline default.
 * That default is only correct for a **single process**: rate limits and
 * the audit trail would NOT be shared across multiple instances of this
 * backend. For a real multi-instance deployment, pass the SAME
 * `RedisKeyValueStore` already built by
 * `memory/pipeline.js::createRedisMemoryPipeline().store` — one Redis
 * connection, shared between conversational memory and security, rather
 * than a second one opened just for this.
 */
function createSecurityPipeline({ store = null, env = process.env } = {}) {
  const config = loadSecurityConfig(env);
  const resolvedStore = store || new InMemoryKeyValueStore();

  const rateLimiter = new RateLimiter({
    store: resolvedStore,
    max: config.rateLimit.max,
    windowSeconds: config.rateLimit.windowSeconds,
  });
  const auditLog = new AuditLog({
    store: resolvedStore,
    maxEntries: config.audit.maxEntries,
    ttlSeconds: config.audit.ttlSeconds,
  });
  const promptInjectionGuard = new PromptInjectionGuard({ mode: config.promptInjectionMode });

  return { config, store: resolvedStore, rateLimiter, auditLog, promptInjectionGuard };
}

module.exports = { createSecurityPipeline };
