"use strict";

const { LlmProviderUnavailableError, LlmProviderTimeoutError } = require("./errors");

const DEFAULT_MAX_ATTEMPTS = 2; // 1 real call + 1 retry — "contrôlé", never unbounded
const DEFAULT_RETRY_DELAY_MS = 500;
const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Only transient failures are worth a retry — an auth error (bad API key)
// or a malformed-request error will fail identically every time, so
// retrying would only waste quota/time and delay the honest error. Shared
// by every concrete provider (see errors.js::classifyProviderHttpError,
// the classification this predicate is built to match).
function isRetryableProviderError(err) {
  return err instanceof LlmProviderUnavailableError || err instanceof LlmProviderTimeoutError;
}

/**
 * Runs `fn()`, retrying up to `attempts` TOTAL times (default 2 — one
 * retry) only while `isRetryable(err)` is true, waiting `delayMs` between
 * attempts. Never retries a non-retryable error, never exceeds `attempts`.
 * `wait` is injectable so tests never need a real timer.
 */
async function withControlledRetry(fn, { attempts = DEFAULT_MAX_ATTEMPTS, isRetryable = isRetryableProviderError, delayMs = DEFAULT_RETRY_DELAY_MS, wait = defaultWait } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isRetryable(err)) throw err;
      await wait(delayMs);
    }
  }
  throw lastErr;
}

module.exports = { withControlledRetry, isRetryableProviderError, DEFAULT_MAX_ATTEMPTS, DEFAULT_RETRY_DELAY_MS };
