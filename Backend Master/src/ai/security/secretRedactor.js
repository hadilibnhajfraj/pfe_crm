"use strict";

// Re-exports utils/secretRedaction.js under the security/ umbrella for
// discoverability ("protection des secrets" is one of the 8 requested
// pillars) — the actual implementation lives in utils/ so that
// utils/logger.js (the lowest layer, used by every subsystem including this
// one) can depend on it without a utils -> security dependency inversion.
// See utils/secretRedaction.js for the real logic and its own doc comment.
module.exports = require("../utils/secretRedaction");
