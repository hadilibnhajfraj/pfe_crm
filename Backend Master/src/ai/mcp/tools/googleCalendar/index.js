"use strict";

const { createGetCalendarStatusTool } = require("./getCalendarStatusTool");
const { createCreateCalendarEventTool } = require("./createCalendarEventTool");
const { createUpdateCalendarEventTool } = require("./updateCalendarEventTool");
const { createDeleteCalendarEventTool } = require("./deleteCalendarEventTool");

const toolFactories = [createGetCalendarStatusTool, createCreateCalendarEventTool, createUpdateCalendarEventTool, createDeleteCalendarEventTool];

module.exports = {
  toolFactories,
  createGetCalendarStatusTool,
  createCreateCalendarEventTool,
  createUpdateCalendarEventTool,
  createDeleteCalendarEventTool,
};
