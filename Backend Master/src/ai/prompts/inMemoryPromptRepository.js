"use strict";

const { IPromptRepository } = require("./promptRepository.interface");
const { ConfigurationError } = require("../utils/errors");

// Registry adapter, empty by default — no system prompt ships with this
// infrastructure pass (plan §10.6: prompts are versioned artefacts owned by
// whoever builds the first use case, not by the kernel).
class InMemoryPromptRepository extends IPromptRepository {
  constructor() {
    super();
    this._templates = new Map();
  }

  register(promptTemplate) {
    const key = this._key(promptTemplate.name, promptTemplate.version);
    if (this._templates.has(key)) {
      throw new ConfigurationError(`Prompt "${key}" is already registered.`);
    }
    this._templates.set(key, promptTemplate);
  }

  get(name, version = 1) {
    return this._templates.get(this._key(name, version)) || null;
  }

  list() {
    return Array.from(this._templates.values());
  }

  _key(name, version) {
    return `${name}@${version}`;
  }
}

module.exports = { InMemoryPromptRepository };
