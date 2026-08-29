"use strict";

// Cross-cutting security subsystem: rate limiting, audit logging, prompt
// injection detection, secret redaction — the 8 pillars requested for
// "sécuriser tout le module IA" are covered here plus the pre-existing
// mechanisms this subsystem reuses rather than duplicates: permission
// control (utils/authorization.js, already shared by mcp/, agents/,
// automations/, dashboard/), input validation (mcp/validationManager.js,
// Joi on every Tool), and error handling (mcp/errorHandler.js,
// ResponseBuilder — never leak internals). See
// Backend Master/src/ai/README.md ("Sécurité du module IA") for the full
// writeup, and test/ai.security.policy.test.js for the mechanical guarantee
// that this subsystem never touches CRM business data directly (same rule
// as every other subsystem in this kernel).
const { SecurityError, RateLimitExceededError, PromptInjectionDetectedError } = require("./errors");
const { createSecurityLogger } = require("./logger");
const { loadSecurityConfig } = require("./config");
const { IRateLimiter } = require("./rateLimiter.interface");
const { RateLimiter, defaultRateLimitKey } = require("./rateLimiter");
const { IAuditLog } = require("./auditLog.interface");
const { AuditLog, VALID_OUTCOMES } = require("./auditLog");
const { IPromptInjectionGuard } = require("./promptInjectionGuard.interface");
const { PromptInjectionGuard, DEFAULT_PATTERNS, wrapAsUntrusted } = require("./promptInjectionGuard");
const { redact, redactString } = require("./secretRedactor");
const { createSecurityPipeline } = require("./pipeline");

module.exports = {
  SecurityError,
  RateLimitExceededError,
  PromptInjectionDetectedError,
  createSecurityLogger,
  loadSecurityConfig,
  IRateLimiter,
  RateLimiter,
  defaultRateLimitKey,
  IAuditLog,
  AuditLog,
  VALID_OUTCOMES,
  IPromptInjectionGuard,
  PromptInjectionGuard,
  DEFAULT_PATTERNS,
  wrapAsUntrusted,
  redact,
  redactString,
  createSecurityPipeline,
};
