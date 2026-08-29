"use strict";

const { createGetDashboardKpisTool } = require("./getDashboardKpisTool");
const { createGetLegacyDashboardKpisTool } = require("./getLegacyDashboardKpisTool");
const { createGetProfessionalDashboardTool } = require("./getProfessionalDashboardTool");
const { createGetUserDashboardTool } = require("./getUserDashboardTool");

const toolFactories = [
  createGetDashboardKpisTool,
  createGetLegacyDashboardKpisTool,
  createGetProfessionalDashboardTool,
  createGetUserDashboardTool,
];

module.exports = {
  toolFactories,
  createGetDashboardKpisTool,
  createGetLegacyDashboardKpisTool,
  createGetProfessionalDashboardTool,
  createGetUserDashboardTool,
};
