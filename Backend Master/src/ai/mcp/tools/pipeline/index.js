"use strict";

const { createListPipelineStagesTool } = require("./listPipelineStagesTool");
const { createGetPipelineStageTool } = require("./getPipelineStageTool");
const { createCreatePipelineStageTool } = require("./createPipelineStageTool");
const { createUpdatePipelineStageTool } = require("./updatePipelineStageTool");
const { createDeletePipelineStageTool } = require("./deletePipelineStageTool");
const { createReorderPipelineStagesTool } = require("./reorderPipelineStagesTool");

const toolFactories = [
  createListPipelineStagesTool,
  createGetPipelineStageTool,
  createCreatePipelineStageTool,
  createUpdatePipelineStageTool,
  createDeletePipelineStageTool,
  createReorderPipelineStagesTool,
];

module.exports = {
  toolFactories,
  createListPipelineStagesTool,
  createGetPipelineStageTool,
  createCreatePipelineStageTool,
  createUpdatePipelineStageTool,
  createDeletePipelineStageTool,
  createReorderPipelineStagesTool,
};
