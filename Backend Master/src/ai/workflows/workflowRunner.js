"use strict";

const { withNamespace } = require("../utils/logger");

const logger = withNamespace("workflows");

// Generic sequential step executor (SOLID-SRP: the only thing this class
// does is run IWorkflowStep[] in order, threading the returned context
// through). No concrete workflow is defined by this infrastructure pass.
class WorkflowRunner {
  async run(steps, context) {
    let currentContext = context;
    for (const step of steps) {
      logger.info(`running step "${step.name}"`);
      const result = await step.run(currentContext);
      currentContext = result === undefined ? currentContext : result;
    }
    return currentContext;
  }
}

module.exports = { WorkflowRunner };
