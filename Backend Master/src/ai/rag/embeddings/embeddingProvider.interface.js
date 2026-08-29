"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: text -> fixed-dimension numeric vector. Every adapter behind this
// port must return vectors of the same dimension for a given instance, so
// they stay comparable in the vector store.
class IEmbeddingProvider {
  get dimensions() {
    throw new NotImplementedError("IEmbeddingProvider", "dimensions");
  }

  async embed(_text) {
    throw new NotImplementedError("IEmbeddingProvider", "embed");
  }

  async embedBatch(_texts) {
    throw new NotImplementedError("IEmbeddingProvider", "embedBatch");
  }
}

module.exports = { IEmbeddingProvider };
