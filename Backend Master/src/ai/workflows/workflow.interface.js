"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: one step of a multi-step AI use case (e.g. "build context" →
// "call LLM" → "post-process"). No concrete workflow is defined by this
// infrastructure pass — steps are supplied by whoever builds a use case.
class IWorkflowStep {
  get name() {
    throw new NotImplementedError("IWorkflowStep", "name");
  }

  async run(_context) {
    throw new NotImplementedError("IWorkflowStep", "run");
  }
}

module.exports = { IWorkflowStep };
