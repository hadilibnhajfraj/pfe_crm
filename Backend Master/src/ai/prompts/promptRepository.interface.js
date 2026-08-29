"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: named, versioned storage/lookup for prompt templates. No prompt
// content is defined by this infrastructure pass — see PromptTemplate for
// the pure rendering utility and plan §10.6 for the versioning convention.
class IPromptRepository {
  register(_promptTemplate) {
    throw new NotImplementedError("IPromptRepository", "register");
  }

  get(_name, _version) {
    throw new NotImplementedError("IPromptRepository", "get");
  }

  list() {
    throw new NotImplementedError("IPromptRepository", "list");
  }
}

module.exports = { IPromptRepository };
