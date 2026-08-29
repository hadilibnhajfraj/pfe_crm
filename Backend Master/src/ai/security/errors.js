"use strict";

const { AiError, NotConfiguredError, ConfigurationError } = require("../utils/errors");

// Typed errors for the security subsystem (src/ai/security).
class SecurityError extends AiError {}

// Thrown by RateLimiter.consume() once a key exceeds its budget for the
// current window — the message is deliberately generic about WHO (never
// echoes the raw key, which may embed a userId/email) but specific about
// the limit itself, safe to return to a client as-is (mirrors
// PermissionDeniedError/AgentPermissionError: a denial stays visible,
// never silently absorbed).
class RateLimitExceededError extends SecurityError {
  constructor(limit, windowSeconds) {
    super(`Rate limit exceeded: more than ${limit} call(s) per ${windowSeconds}s.`);
    this.limit = limit;
    this.windowSeconds = windowSeconds;
  }
}

// Thrown by PromptInjectionGuard.scan() in "block" mode when a suspicious
// pattern is detected — never echoes the flagged text itself (could BE the
// injection attempt) or the matched values, only the rule names that fired.
class PromptInjectionDetectedError extends SecurityError {
  constructor(matchedRuleNames = []) {
    super(`Prompt injection pattern(s) detected: ${matchedRuleNames.join(", ") || "unknown"}.`);
    this.matchedRuleNames = matchedRuleNames;
  }
}

module.exports = {
  SecurityError,
  RateLimitExceededError,
  PromptInjectionDetectedError,
  NotConfiguredError,
  ConfigurationError,
};
