"use strict";

const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { AgentRegistry } = require("../src/ai/agents");

describe("AgentRouter", () => {
  test("returns null without an agentRegistry (the default, empty-by-construction case)", () => {
    const router = new AgentRouter();
    expect(router.select({ name: "hr" })).toBeNull();
  });

  test("returns null when no registered agent can handle the intent", () => {
    const agentRegistry = new AgentRegistry();
    agentRegistry.register({ name: "hr_agent", canHandle: () => false, execute: jest.fn() });
    const router = new AgentRouter({ agentRegistry });
    expect(router.select({ name: "maintenance" })).toBeNull();
  });

  test("returns the first registered agent whose canHandle(intent) is true", () => {
    const agentRegistry = new AgentRegistry();
    const hrAgent = { name: "hr_agent", canHandle: (intent) => intent.name === "hr", execute: jest.fn() };
    agentRegistry.register(hrAgent);
    const router = new AgentRouter({ agentRegistry });
    expect(router.select({ name: "hr" })).toBe(hrAgent);
  });
});
