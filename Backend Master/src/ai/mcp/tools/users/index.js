"use strict";

const { createListUsersTool } = require("./listUsersTool");
const { createListUsersByRoleTool } = require("./listUsersByRoleTool");
const { createListCommercialCandidatesTool } = require("./listCommercialCandidatesTool");
const { createSetUserActiveTool } = require("./setUserActiveTool");
const { createSetUserRoleTool } = require("./setUserRoleTool");
const { createGetMyProfileTool } = require("./getMyProfileTool");
const { createUpdateMyProfileTool } = require("./updateMyProfileTool");
const { createGetUserProfileTool } = require("./getUserProfileTool");
const { createUpdateUserProfileTool } = require("./updateUserProfileTool");

const toolFactories = [
  createListUsersTool,
  createListUsersByRoleTool,
  createListCommercialCandidatesTool,
  createSetUserActiveTool,
  createSetUserRoleTool,
  createGetMyProfileTool,
  createUpdateMyProfileTool,
  createGetUserProfileTool,
  createUpdateUserProfileTool,
];

module.exports = {
  toolFactories,
  createListUsersTool,
  createListUsersByRoleTool,
  createListCommercialCandidatesTool,
  createSetUserActiveTool,
  createSetUserRoleTool,
  createGetMyProfileTool,
  createUpdateMyProfileTool,
  createGetUserProfileTool,
  createUpdateUserProfileTool,
};
