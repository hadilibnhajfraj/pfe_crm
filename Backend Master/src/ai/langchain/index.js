"use strict";

// LangChain.js integration layer. See Backend Master/src/ai/README.md for
// the architecture writeup and per-chain documentation, and
// test/ai.langchain.policy.test.js for the mechanical guarantee that
// nothing in this directory reads CRM business data directly (same rule
// as rag/ — see that module's policy test for the symmetric MCP-side rule).
const { LangChainError, UnknownToolError, PlanningError, RoutingError, WorkflowError, ToolCallLimitExceededError } = require("./errors");
const { createLangChainLogger } = require("./logger");
const { loadLangChainConfig } = require("./config");
const { LlmProviderChatModel } = require("./model");
const { createMcpToolAdapter, createMcpToolAdapters } = require("./tools");
const { IChain, QaChain, SummarizationChain, ToolCallingChain } = require("./chains");
const { IPlanner, LlmPlanner } = require("./planner");
const { IRouter, LexicalIntentRouter, LlmIntentRouter } = require("./router");
const { IWorkflowEngine, LangChainWorkflowEngine } = require("./workflow");
const { RagContextBuilder } = require("./context");
const { createLangChainPipeline } = require("./pipeline");
const { buildResponseSystemPrompt, RESPONSE_PRINCIPLES, ROLE_TONE_GUIDANCE, SUPPORTED_ROLES } = require("./prompts");

module.exports = {
  LangChainError,
  UnknownToolError,
  PlanningError,
  RoutingError,
  WorkflowError,
  ToolCallLimitExceededError,
  createLangChainLogger,
  loadLangChainConfig,
  LlmProviderChatModel,
  createMcpToolAdapter,
  createMcpToolAdapters,
  IChain,
  QaChain,
  SummarizationChain,
  ToolCallingChain,
  IPlanner,
  LlmPlanner,
  IRouter,
  LexicalIntentRouter,
  LlmIntentRouter,
  IWorkflowEngine,
  LangChainWorkflowEngine,
  RagContextBuilder,
  createLangChainPipeline,
  buildResponseSystemPrompt,
  RESPONSE_PRINCIPLES,
  ROLE_TONE_GUIDANCE,
  SUPPORTED_ROLES,
};
