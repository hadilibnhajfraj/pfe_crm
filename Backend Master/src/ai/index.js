"use strict";

// Public entry point of the AI kernel (src/ai). This gate (isEnabled()/
// isRoleAllowed()) IS mounted into app.js now — see
// modules/ai-copilot/routes/aiCopilot.routes.js — README.md "Ce que ce
// module ne fait pas" documents what remains genuinely out of scope.
const { AiManager, createDefaultAiManager } = require("./manager");

module.exports = { AiManager, createDefaultAiManager };
