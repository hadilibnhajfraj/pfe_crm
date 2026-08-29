"use strict";

const { createCreateIndustrialRecordTool } = require("./createIndustrialRecordTool");
const { createListIndustrialRecordsTool } = require("./listIndustrialRecordsTool");
const { createGetIndustrialRecordTool } = require("./getIndustrialRecordTool");
const { createUpdateIndustrialRecordTool } = require("./updateIndustrialRecordTool");
const { createDeleteIndustrialRecordTool } = require("./deleteIndustrialRecordTool");

const toolFactories = [
  createCreateIndustrialRecordTool,
  createListIndustrialRecordsTool,
  createGetIndustrialRecordTool,
  createUpdateIndustrialRecordTool,
  createDeleteIndustrialRecordTool,
];

module.exports = {
  toolFactories,
  createCreateIndustrialRecordTool,
  createListIndustrialRecordsTool,
  createGetIndustrialRecordTool,
  createUpdateIndustrialRecordTool,
  createDeleteIndustrialRecordTool,
};
