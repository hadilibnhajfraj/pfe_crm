"use strict";

const { createCreateIndustrialRecordTool } = require("./createIndustrialRecordTool");
const { createListMachinesTool } = require("./listMachinesTool");
const { createListIndustrialRecordsTool } = require("./listIndustrialRecordsTool");
const { createGetIndustrialRecordTool } = require("./getIndustrialRecordTool");
const { createUpdateIndustrialRecordTool } = require("./updateIndustrialRecordTool");
const { createDeleteIndustrialRecordTool } = require("./deleteIndustrialRecordTool");
const { createGetIndustrialStatisticsTool } = require("./getIndustrialStatisticsTool");

const toolFactories = [
  createCreateIndustrialRecordTool,
  createListIndustrialRecordsTool,
  createGetIndustrialRecordTool,
  createUpdateIndustrialRecordTool,
  createDeleteIndustrialRecordTool,
  createGetIndustrialStatisticsTool, createListMachinesTool];

module.exports = {
  toolFactories,
  createCreateIndustrialRecordTool,
  createListIndustrialRecordsTool,
  createGetIndustrialRecordTool,
  createUpdateIndustrialRecordTool,
  createDeleteIndustrialRecordTool,
  createGetIndustrialStatisticsTool,
};
