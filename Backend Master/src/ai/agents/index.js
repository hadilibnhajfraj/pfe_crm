"use strict";

const { IAgent } = require("./agent.interface");
const { AgentRegistry } = require("./agentRegistry");
const { BaseAgent } = require("./baseAgent");
const { AgentError, AgentPermissionError } = require("./errors");
const { createAgentLogger } = require("./logger");
const { createAssistantAgent } = require("./assistantAgent");
const { createSearchAgent } = require("./searchAgent");
const { createCrmAssistantAgent } = require("./crmAssistantAgent");
const { createProjectAgent } = require("./projectAgent");
const { createCommercialAgent } = require("./commercialAgent");
const { createPipelineAgent } = require("./pipelineAgent");
const { createKpiAgent } = require("./kpiAgent");
const { createReportingAgent, ReportingAgent } = require("./reportingAgent");
const { createMaintenanceAgent } = require("./maintenanceAgent");
const { createIndustrialAgent } = require("./industrialAgent");
const { createNotificationAgent } = require("./notificationAgent");
const { createAutomationAgent, AutomationAgent } = require("./automationAgent");
const { createBusinessAnalystAgent, BusinessAnalystAgent } = require("./businessAnalystAgent");
const { createRecommendationAgent, RecommendationAgent } = require("./recommendationAgent");
const { createDataQualityAgent, DataQualityAgent } = require("./dataQualityAgent");
const { createAdvancedSearchAgent, AdvancedSearchAgent } = require("./advancedSearchAgent");
const { defaultAgentFactories, loadDefaultAgents } = require("./manifest");

module.exports = {
  IAgent,
  AgentRegistry,
  BaseAgent,
  AgentError,
  AgentPermissionError,
  createAgentLogger,
  createAssistantAgent,
  createSearchAgent,
  createCrmAssistantAgent,
  createProjectAgent,
  createCommercialAgent,
  createPipelineAgent,
  createKpiAgent,
  createReportingAgent,
  ReportingAgent,
  createMaintenanceAgent,
  createIndustrialAgent,
  createNotificationAgent,
  createAutomationAgent,
  AutomationAgent,
  createBusinessAnalystAgent,
  BusinessAnalystAgent,
  createRecommendationAgent,
  RecommendationAgent,
  createDataQualityAgent,
  DataQualityAgent,
  createAdvancedSearchAgent,
  AdvancedSearchAgent,
  defaultAgentFactories,
  loadDefaultAgents,
};
