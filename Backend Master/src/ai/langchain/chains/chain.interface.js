"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: a named, invokable unit of work built on LangChain Runnables
// internally, but exposing the same shape as every other kernel port
// (IWorkflowStep, ITool, ...) so a WorkflowEngine or a future delivery
// layer never needs to know a given chain happens to be LangChain-based.
class IChain {
  get name() {
    throw new NotImplementedError("IChain", "name");
  }

  async invoke(_input, _context) {
    throw new NotImplementedError("IChain", "invoke");
  }
}

module.exports = { IChain };
