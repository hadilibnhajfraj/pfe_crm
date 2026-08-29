"use strict";

// Conversational memory subsystem. See Backend Master/src/ai/README.md
// ("La mémoire conversationnelle") for the architecture writeup, and
// test/ai.memory.policy.test.js for the mechanical guarantee that nothing
// here reads CRM business data directly (same rule as rag/, langchain/,
// orchestrator/ and agents/ — see those modules' policy tests for the
// symmetric rules elsewhere in the kernel).
const { IConversationMemory } = require("./conversationMemory.interface");
const { InMemoryConversationMemory } = require("./inMemoryConversationMemory");
const { MemoryError, MemoryNotConnectedError } = require("./errors");
const { createMemoryLogger } = require("./logger");
const { loadMemoryConfig } = require("./config");
const { IKeyValueStore } = require("./keyValueStore.interface");
const { InMemoryKeyValueStore } = require("./inMemoryKeyValueStore");
const { createHashBucket } = require("./hashMemoryBase");
const { ShortTermMemory } = require("./shortTermMemory");
const { ISessionMemory } = require("./sessionMemory.interface");
const { SessionMemory } = require("./sessionMemory");
const { IContextMemory } = require("./contextMemory.interface");
const { ContextMemory } = require("./contextMemory");
const { ILongTermMemory } = require("./longTermMemory.interface");
const { LongTermMemory } = require("./longTermMemory");
const { IPreferenceMemory } = require("./preferenceMemory.interface");
const { PreferenceMemory } = require("./preferenceMemory");
const { createRedisClient } = require("./redis/redisClient");
const { RedisKeyValueStore } = require("./redis/redisKeyValueStore");
const { createRedisMemoryPipeline } = require("./pipeline");

module.exports = {
  IConversationMemory,
  InMemoryConversationMemory,
  MemoryError,
  MemoryNotConnectedError,
  createMemoryLogger,
  loadMemoryConfig,
  IKeyValueStore,
  InMemoryKeyValueStore,
  createHashBucket,
  ShortTermMemory,
  ISessionMemory,
  SessionMemory,
  IContextMemory,
  ContextMemory,
  ILongTermMemory,
  LongTermMemory,
  IPreferenceMemory,
  PreferenceMemory,
  createRedisClient,
  RedisKeyValueStore,
  createRedisMemoryPipeline,
};
