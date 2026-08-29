"use strict";

const { AiError, NotConfiguredError, ConfigurationError } = require("../utils/errors");

// Typed errors for the Proactive AI subsystem (src/ai/proactive).
class ProactiveError extends AiError {}

module.exports = { ProactiveError, NotConfiguredError, ConfigurationError };
