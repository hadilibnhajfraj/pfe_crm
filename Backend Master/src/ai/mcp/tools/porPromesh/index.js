"use strict";

const { createCreatePorPromeshTool } = require("./createPorPromeshTool");
const { createCreateOrOpenPorPromeshDraftTool } = require("./createOrOpenPorPromeshDraftTool");
const { createListPorPromeshOperatorsTool } = require("./listPorPromeshOperatorsTool");
const { createListPorPromeshTool } = require("./listPorPromeshTool");
const { createGetPorPromeshDashboardTool } = require("./getPorPromeshDashboardTool");
const { createGetPorPromeshStatsTool } = require("./getPorPromeshStatsTool");
const { createGetPorPromeshTool } = require("./getPorPromeshTool");
const { createUpdatePorPromeshTool } = require("./updatePorPromeshTool");
const { createDeletePorPromeshTool } = require("./deletePorPromeshTool");
const { createValidatePorPromeshTool } = require("./validatePorPromeshTool");

// addAttachment/getPorPromeshPdf volontairement absents : upload de fichier
// et sortie binaire PDF, hors périmètre d'un Tool MCP JSON (voir
// Backend Master/src/ai/README.md).
const toolFactories = [
  createCreatePorPromeshTool,
  createCreateOrOpenPorPromeshDraftTool,
  createListPorPromeshOperatorsTool,
  createListPorPromeshTool,
  createGetPorPromeshDashboardTool,
  createGetPorPromeshStatsTool,
  createGetPorPromeshTool,
  createUpdatePorPromeshTool,
  createDeletePorPromeshTool,
  createValidatePorPromeshTool,
];

module.exports = {
  toolFactories,
  createCreatePorPromeshTool,
  createCreateOrOpenPorPromeshDraftTool,
  createListPorPromeshOperatorsTool,
  createListPorPromeshTool,
  createGetPorPromeshDashboardTool,
  createGetPorPromeshStatsTool,
  createGetPorPromeshTool,
  createUpdatePorPromeshTool,
  createDeletePorPromeshTool,
  createValidatePorPromeshTool,
};
