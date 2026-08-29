"use strict";

const { LexicalIntentRouter, LlmIntentRouter } = require("../src/ai/langchain/router");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { RoutingError } = require("../src/ai/langchain/errors");

describe("LexicalIntentRouter", () => {
  test("constructor throws RoutingError with no routes", () => {
    expect(() => new LexicalIntentRouter({ routes: [] })).toThrow(RoutingError);
  });

  test("routes to the candidate with the highest keyword overlap", async () => {
    const router = new LexicalIntentRouter({
      routes: [
        { key: "hr", keywords: ["conge", "vacances", "rh"] },
        { key: "maintenance", keywords: ["panne", "reparation"] },
      ],
    });
    await expect(router.route("je veux poser un conge pour les vacances")).resolves.toBe("hr");
    await expect(router.route("il y a une panne sur la machine")).resolves.toBe("maintenance");
  });

  test("falls back to defaultRoute when nothing matches", async () => {
    const router = new LexicalIntentRouter({ routes: [{ key: "hr", keywords: ["conge"] }], defaultRoute: "qa" });
    await expect(router.route("bonjour, comment ca va")).resolves.toBe("qa");
  });

  test("throws RoutingError when nothing matches and no defaultRoute is configured", async () => {
    const router = new LexicalIntentRouter({ routes: [{ key: "hr", keywords: ["conge"] }] });
    await expect(router.route("totally unrelated text")).rejects.toThrow(RoutingError);
  });
});

describe("LlmIntentRouter", () => {
  const ROUTES = [
    { key: "hr", description: "HR requests" },
    { key: "maintenance", description: "Maintenance requests" },
  ];

  function modelReturning(text) {
    return new LlmProviderChatModel({ llmProvider: { complete: async () => text } });
  }

  test("constructor throws RoutingError with no routes", () => {
    expect(() => new LlmIntentRouter({ chatModel: modelReturning("x"), routes: [] })).toThrow(RoutingError);
  });

  test("returns the route the model chose, when it is a known key", async () => {
    const router = new LlmIntentRouter({ chatModel: modelReturning(JSON.stringify({ route: "maintenance" })), routes: ROUTES });
    await expect(router.route("my machine is broken")).resolves.toBe("maintenance");
  });

  test("falls back to fallbackRouter when the model output is not valid JSON", async () => {
    const fallback = { route: jest.fn(async () => "hr") };
    const router = new LlmIntentRouter({ chatModel: modelReturning("garbage"), routes: ROUTES, fallbackRouter: fallback });
    await expect(router.route("input", { some: "context" })).resolves.toBe("hr");
    expect(fallback.route).toHaveBeenCalledWith("input", { some: "context" });
  });

  test("falls back to fallbackRouter when the model chooses an unknown route", async () => {
    const fallback = { route: jest.fn(async () => "hr") };
    const router = new LlmIntentRouter({
      chatModel: modelReturning(JSON.stringify({ route: "not_a_real_route" })),
      routes: ROUTES,
      fallbackRouter: fallback,
    });
    await expect(router.route("input")).resolves.toBe("hr");
  });

  test("throws RoutingError when there is no fallbackRouter and the model fails to choose a valid route", async () => {
    const router = new LlmIntentRouter({ chatModel: modelReturning("garbage"), routes: ROUTES });
    await expect(router.route("input")).rejects.toThrow(RoutingError);
  });
});
