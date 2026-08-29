"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: turns a free-form user message into a structured Intent
// (`{ name, moduleKey, requiresRag, requiresTools, description }`).
// Deliberately separate from IRouter (langchain/router/router.interface.js):
// IRouter picks a bare string key from a fixed set of routes; IIntentDetector
// is the CRM-specific layer on top that resolves that key into the metadata
// AIManager actually needs to decide what to do next (same split as
// IPlanner vs IWorkflowEngine — "decide" stays separate from "run/act on").
class IIntentDetector {
  async detect(_message, _context) {
    throw new NotImplementedError("IIntentDetector", "detect");
  }
}

module.exports = { IIntentDetector };
