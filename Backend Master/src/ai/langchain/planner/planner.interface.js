"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: decomposes a goal into an ordered list of steps, each optionally
// naming a tool to use. A planner never executes anything itself — that is
// WorkflowEngine's job (see workflow/) — it only produces a plan for
// something else to run, which keeps "decide what to do" and "do it" as
// two separately testable responsibilities.
class IPlanner {
  // Returns PlanStep[]: { tool: string|null, input: object, reason: string }
  async plan(_goal, _context) {
    throw new NotImplementedError("IPlanner", "plan");
  }
}

module.exports = { IPlanner };
