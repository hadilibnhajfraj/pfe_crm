"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port only. A future concrete implementation must call only repositories
// already used by an existing controller (plan §4.4) — never a new raw
// query written specifically for the Copilot — so that no permission scope
// is introduced that the rest of the CRM doesn't already enforce.
class IContextBuilder {
  async buildContext(_user, _scope) {
    throw new NotImplementedError("IContextBuilder", "buildContext");
  }
}

module.exports = { IContextBuilder };
