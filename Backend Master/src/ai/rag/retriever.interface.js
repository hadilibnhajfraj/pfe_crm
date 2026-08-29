"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port only — no retrieval/embedding logic is implemented in this
// infrastructure pass (scope: "Ne développer aucun RAG", see
// AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md §8 Phase 4).
class IRetriever {
  async retrieve(_query, _options) {
    throw new NotImplementedError("IRetriever", "retrieve");
  }
}

module.exports = { IRetriever };
