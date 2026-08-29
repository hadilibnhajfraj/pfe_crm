"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: a system/scheduler-triggered routine — as opposed to IAgent
// (agents/agent.interface.js), which handles ONE conversational turn.
// `run(context)` never throws for a per-item failure inside a batch (see
// BaseAutomation) — it always resolves to a structured
// `{success, actions, errors}` report, so a scheduler can log/alert without
// special-casing exceptions.
class IAutomation {
  get name() {
    throw new NotImplementedError("IAutomation", "name");
  }

  async run(_context) {
    throw new NotImplementedError("IAutomation", "run");
  }
}

module.exports = { IAutomation };
