"use strict";

const { createCreateMaintenanceRequestTool } = require("./createMaintenanceRequestTool");
const { createAcceptMaintenanceRequestTool } = require("./acceptMaintenanceRequestTool");
const { createRejectMaintenanceRequestTool } = require("./rejectMaintenanceRequestTool");
const { createAssignMaintenanceTechnicianTool } = require("./assignMaintenanceTechnicianTool");
const { createStartMaintenanceRequestTool } = require("./startMaintenanceRequestTool");
const { createCompleteMaintenanceRequestTool } = require("./completeMaintenanceRequestTool");
const { createDeleteMaintenanceRequestTool } = require("./deleteMaintenanceRequestTool");
const { createGetMaintenanceStatsTool } = require("./getMaintenanceStatsTool");
const { createListMyMaintenanceRequestsTool } = require("./listMyMaintenanceRequestsTool");
const { createListAllMaintenanceRequestsTool } = require("./listAllMaintenanceRequestsTool");
const { createGetMaintenanceRequestTool } = require("./getMaintenanceRequestTool");
const { createListMaintenanceTechniciansTool } = require("./listMaintenanceTechniciansTool");
const { createAddMaintenanceCommentTool } = require("./addMaintenanceCommentTool");
const { createListMaintenanceCommentsTool } = require("./listMaintenanceCommentsTool");
const { createGetMaintenanceHistoryTool } = require("./getMaintenanceHistoryTool");

const toolFactories = [
  createCreateMaintenanceRequestTool,
  createAcceptMaintenanceRequestTool,
  createRejectMaintenanceRequestTool,
  createAssignMaintenanceTechnicianTool,
  createStartMaintenanceRequestTool,
  createCompleteMaintenanceRequestTool,
  createDeleteMaintenanceRequestTool,
  createGetMaintenanceStatsTool,
  createListMyMaintenanceRequestsTool,
  createListAllMaintenanceRequestsTool,
  createGetMaintenanceRequestTool,
  createListMaintenanceTechniciansTool,
  createAddMaintenanceCommentTool,
  createListMaintenanceCommentsTool,
  createGetMaintenanceHistoryTool,
];

module.exports = {
  toolFactories,
  createCreateMaintenanceRequestTool,
  createAcceptMaintenanceRequestTool,
  createRejectMaintenanceRequestTool,
  createAssignMaintenanceTechnicianTool,
  createStartMaintenanceRequestTool,
  createCompleteMaintenanceRequestTool,
  createDeleteMaintenanceRequestTool,
  createGetMaintenanceStatsTool,
  createListMyMaintenanceRequestsTool,
  createListAllMaintenanceRequestsTool,
  createGetMaintenanceRequestTool,
  createListMaintenanceTechniciansTool,
  createAddMaintenanceCommentTool,
  createListMaintenanceCommentsTool,
  createGetMaintenanceHistoryTool,
};
