"use strict";

const { loadLangChainConfig } = require("../src/ai/langchain/config");
const { ConfigurationError } = require("../src/ai/langchain/errors");

describe("loadLangChainConfig", () => {
  test("provides sane defaults when no env is set", () => {
    const config = loadLangChainConfig({});
    expect(config).toEqual({
      maxPlanSteps: 8,
      maxToolCalls: 5,
      maxHistoryMessages: 6,
      maxCitations: 5,
    });
  });

  test("respects every override", () => {
    const config = loadLangChainConfig({
      LANGCHAIN_MAX_PLAN_STEPS: "3",
      LANGCHAIN_MAX_TOOL_CALLS: "9",
      LANGCHAIN_MAX_HISTORY_MESSAGES: "12",
      LANGCHAIN_MAX_CITATIONS: "2",
    });
    expect(config).toEqual({
      maxPlanSteps: 3,
      maxToolCalls: 9,
      maxHistoryMessages: 12,
      maxCitations: 2,
    });
  });

  test.each([
    ["LANGCHAIN_MAX_PLAN_STEPS", "0"],
    ["LANGCHAIN_MAX_PLAN_STEPS", "51"],
    ["LANGCHAIN_MAX_TOOL_CALLS", "0"],
    ["LANGCHAIN_MAX_TOOL_CALLS", "21"],
    ["LANGCHAIN_MAX_HISTORY_MESSAGES", "-1"],
    ["LANGCHAIN_MAX_HISTORY_MESSAGES", "101"],
    ["LANGCHAIN_MAX_CITATIONS", "-1"],
    ["LANGCHAIN_MAX_CITATIONS", "51"],
  ])("rejects an out-of-range %s=%s", (key, value) => {
    expect(() => loadLangChainConfig({ [key]: value })).toThrow(ConfigurationError);
  });

  test("rejects a non-numeric override", () => {
    expect(() => loadLangChainConfig({ LANGCHAIN_MAX_TOOL_CALLS: "not-a-number" })).toThrow(ConfigurationError);
  });

  test("the returned config is frozen", () => {
    expect(Object.isFrozen(loadLangChainConfig({}))).toBe(true);
  });

  test("unknown LANGCHAIN_* / unrelated env vars are ignored, not rejected", () => {
    expect(() => loadLangChainConfig({ SOME_OTHER_VAR: "x", PATH: process.env.PATH })).not.toThrow();
  });
});
