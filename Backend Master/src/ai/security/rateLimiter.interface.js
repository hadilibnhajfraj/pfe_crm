"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: "limitation des appels" — a fixed-window budget per key (typically
// one actingUser + one Tool/action). Deliberately a single method: callers
// decide key composition (see rateLimiter.js::defaultRateLimitKey), this
// port only decides "may this key act again right now".
class IRateLimiter {
  async consume(_key) {
    throw new NotImplementedError("IRateLimiter", "consume");
  }
}

module.exports = { IRateLimiter };
