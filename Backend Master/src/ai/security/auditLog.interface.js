"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: "audit" — a structured, queryable trail of security-relevant
// events (a permission denial, a tool call, an automation run, a flagged
// prompt injection attempt), distinct from ordinary logging (see
// security/logger.js): logging is for operators debugging in real time,
// audit is for answering "who did what, when" after the fact.
class IAuditLog {
  async record(_event) {
    throw new NotImplementedError("IAuditLog", "record");
  }

  async list(_options) {
    throw new NotImplementedError("IAuditLog", "list");
  }
}

module.exports = { IAuditLog };
