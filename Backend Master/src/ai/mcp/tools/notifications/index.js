"use strict";

const { createListMyNotificationsTool } = require("./listMyNotificationsTool");
const { createMarkAllNotificationsReadTool } = require("./markAllNotificationsReadTool");
const { createMarkNotificationReadTool } = require("./markNotificationReadTool");
const { createDeleteNotificationTool } = require("./deleteNotificationTool");
const { createSendNotificationEmailTool } = require("./sendNotificationEmailTool");

const toolFactories = [
  createListMyNotificationsTool,
  createMarkAllNotificationsReadTool,
  createMarkNotificationReadTool,
  createDeleteNotificationTool,
  createSendNotificationEmailTool,
];

module.exports = {
  toolFactories,
  createListMyNotificationsTool,
  createMarkAllNotificationsReadTool,
  createMarkNotificationReadTool,
  createDeleteNotificationTool,
  createSendNotificationEmailTool,
};
