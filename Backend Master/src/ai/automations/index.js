"use strict";

// AI-driven automations: system/scheduler-triggered routines that, like
// Agents, only ever touch CRM data through the existing 69+ MCP AI Tools —
// never a business service or Sequelize model directly. See
// Backend Master/src/ai/README.md ("Les automatisations IA") for the
// architecture writeup, and test/ai.automations.policy.test.js for the
// mechanical guarantee behind "Toutes les automatisations doivent utiliser
// les AI Tools existants" (same rule as agents/, orchestrator/, langchain/,
// rag/ and memory/ — see those modules' policy tests for the symmetric
// rules elsewhere in the kernel).
const { IAutomation } = require("./automation.interface");
const { AutomationError, UnknownAutomationToolError, AutomationPermissionError } = require("./errors");
const { createAutomationLogger } = require("./logger");
const { BaseAutomation } = require("./baseAutomation");
const { AutoCreationAutomation, createAutoCreationAutomation, DEFAULT_CREATION_MAP } = require("./autoCreationAutomation");
const { ReminderAutomation, createReminderAutomation, DEFAULT_SOURCES: REMINDER_DEFAULT_SOURCES } = require("./reminderAutomation");
const { EmailAutomation, createEmailAutomation } = require("./emailAutomation");
const {
  NotificationHousekeepingAutomation,
  createNotificationHousekeepingAutomation,
  defaultShouldDelete,
  DEFAULT_MAX_AGE_DAYS,
} = require("./notificationHousekeepingAutomation");
const { GoogleCalendarAutomation, createGoogleCalendarAutomation } = require("./googleCalendarAutomation");
const { AnalysisAutomation, createAnalysisAutomation, DEFAULT_SOURCES: ANALYSIS_DEFAULT_SOURCES } = require("./analysisAutomation");
const { RecommendationAutomation, createRecommendationAutomation, DEFAULT_RULES } = require("./recommendationAutomation");
const { DataQualityAutomation, createDataQualityAutomation, DEFAULT_CHECKS } = require("./dataQualityAutomation");
const { defaultAutomationFactories, createDefaultAutomations } = require("./manifest");
const { createAutomationsPipeline } = require("./pipeline");

module.exports = {
  IAutomation,
  AutomationError,
  UnknownAutomationToolError,
  AutomationPermissionError,
  createAutomationLogger,
  BaseAutomation,
  AutoCreationAutomation,
  createAutoCreationAutomation,
  DEFAULT_CREATION_MAP,
  ReminderAutomation,
  createReminderAutomation,
  REMINDER_DEFAULT_SOURCES,
  EmailAutomation,
  createEmailAutomation,
  NotificationHousekeepingAutomation,
  createNotificationHousekeepingAutomation,
  defaultShouldDelete,
  DEFAULT_MAX_AGE_DAYS,
  GoogleCalendarAutomation,
  createGoogleCalendarAutomation,
  AnalysisAutomation,
  createAnalysisAutomation,
  ANALYSIS_DEFAULT_SOURCES,
  RecommendationAutomation,
  createRecommendationAutomation,
  DEFAULT_RULES,
  DataQualityAutomation,
  createDataQualityAutomation,
  DEFAULT_CHECKS,
  defaultAutomationFactories,
  createDefaultAutomations,
  createAutomationsPipeline,
};
