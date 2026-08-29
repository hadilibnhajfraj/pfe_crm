"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port only — no vector database adapter is implemented in this
// infrastructure pass; selecting one is a Phase 4 decision (plan §8, §13.3).
class IVectorStore {
  async upsert(_collection, _records) {
    throw new NotImplementedError("IVectorStore", "upsert");
  }

  async query(_collection, _vector, _options) {
    throw new NotImplementedError("IVectorStore", "query");
  }

  async delete(_collection, _ids) {
    throw new NotImplementedError("IVectorStore", "delete");
  }
}

module.exports = { IVectorStore };
