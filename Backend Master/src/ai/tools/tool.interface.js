"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: a callable, permission-aware action the orchestrator may propose to
// a user. Concrete implementations must delegate to an existing module's
// public service — never write to a Sequelize model directly (plan §4.5,
// §10.1). No concrete tool is implemented in this infrastructure pass.
class ITool {
  get name() {
    throw new NotImplementedError("ITool", "name");
  }

  get description() {
    throw new NotImplementedError("ITool", "description");
  }

  get inputSchema() {
    throw new NotImplementedError("ITool", "inputSchema");
  }

  async execute(_input, _context) {
    throw new NotImplementedError("ITool", "execute");
  }
}

module.exports = { ITool };
