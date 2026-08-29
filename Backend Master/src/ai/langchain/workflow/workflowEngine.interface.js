"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: runs a declarative list of steps (chain calls, tool calls, router
// branches) against a shared state object, threading the result of each
// step into the next — the LangChain-aware sibling of
// src/ai/workflows/WorkflowRunner (which runs generic IWorkflowStep[] with
// no notion of chains/tools/routers). This port lives in langchain/ rather
// than extending the generic one because its step vocabulary is specific
// to this module's building blocks (IChain, IRouter, LangChain tools).
class IWorkflowEngine {
  async run(_steps, _state) {
    throw new NotImplementedError("IWorkflowEngine", "run");
  }
}

module.exports = { IWorkflowEngine };
