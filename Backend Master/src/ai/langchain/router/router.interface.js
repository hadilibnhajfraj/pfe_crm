"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: picks ONE destination key from a fixed set of registered routes,
// given free-form input. Deliberately returns a plain string key, not a
// chain/handler reference — WorkflowEngine (or any other consumer) owns
// the mapping from key to what actually runs, keeping "decide where to go"
// separate from "run what's there" (same split as IPlanner/WorkflowEngine).
class IRouter {
  async route(_input, _context) {
    throw new NotImplementedError("IRouter", "route");
  }
}

module.exports = { IRouter };
