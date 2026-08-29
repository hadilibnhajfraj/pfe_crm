"use strict";

// Orchestration layer: composes MCP (Tools) + RAG (Retriever) + LangChain
// (Chains/Planner/Router/Workflow Engine/Context Builder) into one
// conversation-turn entry point, `AIManager`. See
// Backend Master/src/ai/README.md ("Le AIManager") for the architecture
// writeup, and test/ai.orchestrator.policy.test.js for the mechanical
// guarantee that nothing here reads CRM business data directly (same rule
// as rag/ and langchain/ — see those modules' policy tests for the
// symmetric rules on the RAG and MCP sides).
const { OrchestratorError, IntentDetectionError } = require("./errors");
const { createOrchestratorLogger } = require("./logger");
const { loadOrchestratorConfig } = require("./config");
const { DEFAULT_INTENT_CATALOG } = require("./intentCatalog");
const { ConversationManager } = require("./conversationManager");
const { IIntentDetector } = require("./intentDetector.interface");
const { IntentDetector, createLexicalIntentDetector } = require("./intentDetector");
const { ToolRouter } = require("./toolRouter");
const { AgentRouter } = require("./agentRouter");
const { WorkflowManager } = require("./workflowManager");
const { ResponseBuilder, GENERIC_ERROR_MESSAGE } = require("./responseBuilder");
const { AIManager } = require("./aiManager");
const { createAiOrchestrator, buildToolModuleIndex } = require("./pipeline");

module.exports = {
  OrchestratorError,
  IntentDetectionError,
  createOrchestratorLogger,
  loadOrchestratorConfig,
  DEFAULT_INTENT_CATALOG,
  ConversationManager,
  IIntentDetector,
  IntentDetector,
  createLexicalIntentDetector,
  ToolRouter,
  AgentRouter,
  WorkflowManager,
  ResponseBuilder,
  GENERIC_ERROR_MESSAGE,
  AIManager,
  createAiOrchestrator,
  buildToolModuleIndex,
};
