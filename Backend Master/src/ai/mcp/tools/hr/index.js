"use strict";

const { createListHrRequestsTool } = require("./listHrRequestsTool");
const { createGetHrRequestTool } = require("./getHrRequestTool");
const { createCreateHrRequestTool } = require("./createHrRequestTool");
const { createAcceptHrRequestTool } = require("./acceptHrRequestTool");
const { createRejectHrRequestTool } = require("./rejectHrRequestTool");
const { createMarkHrRequestProcessedTool } = require("./markHrRequestProcessedTool");
const { createAddHrRequestCommentTool } = require("./addHrRequestCommentTool");
const { createGetHrRequestHistoryTool } = require("./getHrRequestHistoryTool");
const { createDeleteHrRequestTool } = require("./deleteHrRequestTool");

// getHrRequestPdf/getHrRequestPdfBuffer volontairement absents : sortie
// binaire (PDF/Buffer), pas de réponse JSON — hors périmètre d'un Tool MCP
// (voir Backend Master/src/ai/README.md).
const toolFactories = [
  createListHrRequestsTool,
  createGetHrRequestTool,
  createCreateHrRequestTool,
  createAcceptHrRequestTool,
  createRejectHrRequestTool,
  createMarkHrRequestProcessedTool,
  createAddHrRequestCommentTool,
  createGetHrRequestHistoryTool,
  createDeleteHrRequestTool,
];

module.exports = {
  toolFactories,
  createListHrRequestsTool,
  createGetHrRequestTool,
  createCreateHrRequestTool,
  createAcceptHrRequestTool,
  createRejectHrRequestTool,
  createMarkHrRequestProcessedTool,
  createAddHrRequestCommentTool,
  createGetHrRequestHistoryTool,
  createDeleteHrRequestTool,
};
