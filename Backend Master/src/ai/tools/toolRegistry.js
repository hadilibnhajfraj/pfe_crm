"use strict";

const { ConfigurationError } = require("../utils/errors");

// Open/closed registry (SOLID-OCP): new tools register themselves here: the
// orchestrator never needs to change to support one more tool. Empty by
// default — no tool is registered by this infrastructure pass.
class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  register(tool) {
    if (this._tools.has(tool.name)) {
      throw new ConfigurationError(`Tool "${tool.name}" is already registered.`);
    }
    this._tools.set(tool.name, tool);
  }

  get(name) {
    return this._tools.get(name) || null;
  }

  list() {
    return Array.from(this._tools.values());
  }
}

module.exports = { ToolRegistry };
