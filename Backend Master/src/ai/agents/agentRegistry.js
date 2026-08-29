"use strict";

const { ConfigurationError } = require("../utils/errors");

// Pure plumbing (register/lookup), not an agent implementation: lets
// AiManager be wired end-to-end before any agent exists. Empty by design —
// register() is the only extension point a future agent needs (SOLID-OCP).
class AgentRegistry {
  constructor() {
    this._agents = new Map();
  }

  register(agent) {
    if (this._agents.has(agent.name)) {
      throw new ConfigurationError(`Agent "${agent.name}" is already registered.`);
    }
    this._agents.set(agent.name, agent);
  }

  get(name) {
    return this._agents.get(name) || null;
  }

  list() {
    return Array.from(this._agents.values());
  }

  findHandler(intent) {
    return this.list().find((agent) => agent.canHandle(intent)) || null;
  }
}

module.exports = { AgentRegistry };
