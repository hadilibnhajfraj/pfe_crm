"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port only — PII redaction, prompt-injection filtering and quota checks
// are Phase 1 concerns (plan §5.1, §9 R2/R3/R6); no rule is implemented
// here.
class IGuardrails {
  async sanitizeInput(_context) {
    throw new NotImplementedError("IGuardrails", "sanitizeInput");
  }

  async sanitizeOutput(_text) {
    throw new NotImplementedError("IGuardrails", "sanitizeOutput");
  }

  async checkQuota(_userId) {
    throw new NotImplementedError("IGuardrails", "checkQuota");
  }
}

module.exports = { IGuardrails };
