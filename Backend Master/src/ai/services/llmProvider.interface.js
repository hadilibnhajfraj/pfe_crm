"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port only — the sole point of the whole kernel that would know about a
// concrete LLM SDK, and no SDK is wired in this infrastructure pass. The
// provider is a Sprint 0 product decision (plan §13.2); this adapter is
// Phase 1.
class ILlmProvider {
  async complete(_messages, _options) {
    throw new NotImplementedError("ILlmProvider", "complete");
  }

  async *stream(_messages, _options) {
    throw new NotImplementedError("ILlmProvider", "stream");
  }
}

module.exports = { ILlmProvider };
