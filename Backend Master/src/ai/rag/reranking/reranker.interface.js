"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: re-scores/reorders the vector store's candidate list against the
// raw query text. Kept async by contract even though the shipped adapter
// is synchronous under the hood — a future cross-encoder/reranking-API
// adapter will need to make a network call here without changing callers.
class IReranker {
  async rerank(_query, _candidates) {
    throw new NotImplementedError("IReranker", "rerank");
  }
}

module.exports = { IReranker };
