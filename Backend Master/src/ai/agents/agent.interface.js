"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port only — no concrete agent is implemented in this infrastructure pass
// (scope: "Ne développer aucun Agent", see
// AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md).
class IAgent {
  get name() {
    throw new NotImplementedError("IAgent", "name");
  }

  canHandle(_intent) {
    throw new NotImplementedError("IAgent", "canHandle");
  }

  async execute(_context) {
    throw new NotImplementedError("IAgent", "execute");
  }
}

module.exports = { IAgent };
