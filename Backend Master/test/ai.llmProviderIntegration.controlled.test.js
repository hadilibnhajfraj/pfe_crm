"use strict";

// ÉTAPE 9 of "configurer réellement le fournisseur LLM" (see
// AI-Business-Copilot/08_LLM_PROVIDER_OPENAI.md): a CONTROLLED integration
// test proving the full real chain —
//   HTTP route -> aiCopilotBridge -> AiManager (gate) -> createLlmProvider
//   -> REAL OpenAiProvider -> LlmProviderChatModel -> AIManager.handleMessage()
//   -> ResponseBuilder -> HTTP response
// — with ONLY the actual outbound network call mocked (jest.mock("axios")).
// Every other layer (routes, bridge, gate, RAG ingestion, MCP server,
// intent detection, ResponseBuilder) is the REAL production code — no
// FakeListChatModel-style stand-in for OpenAiProvider itself, unlike the
// Tier 2 corpus test (ai.validation.copilotEndToEnd.test.js), which uses a
// hand-rolled fake `{complete: jest.fn()}` rather than this real class.
//
// The "key absent -> AI_PROVIDER_NOT_CONFIGURED" and "role gate" cases are
// already covered in isolation elsewhere (test/ai.copilotConfig.httpIntegration.test.js,
// test/aiCopilot.routes.test.js) — deliberately NOT repeated here: the
// aiCopilotBridge's gate-manager singleton is built ONCE per process and
// cached (see aiCopilotBridge.service.js::getGateManager), so mixing a
// "configured" and a "not configured" scenario in the SAME test file would
// either require jest.resetModules() gymnastics or silently test against a
// stale cached singleton — this file stays focused on the ONE thing it
// exists to prove.
//
// No real API key is used or required — the placeholder below is never
// sent anywhere (axios itself is mocked, so no real HTTP call happens,
// ever).

jest.mock("axios");
const axios = require("axios");

const postMock = jest.fn();
axios.create.mockReturnValue({ post: postMock });

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, _res, next) => {
    req.user = { sub: "controlled-integration-user", role: "user", email: "u@crmprobar.com" };
    next();
  },
}));

const request = require("supertest");
const express = require("express");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/ai-copilot", require("../src/modules/ai-copilot/routes/aiCopilot.routes"));
  return app;
}

describe("Controlled real-provider integration — AI_LLM_PROVIDER=openai, axios mocked, everything else real", () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    Object.assign(process.env, {
      AI_COPILOT_ENABLED: "true",
      AI_COPILOT_ROLES_ALLOWED: "user",
      AI_LLM_PROVIDER: "openai",
      AI_LLM_MODEL: "gpt-4o-mini",
      AI_LLM_API_KEY: "sk-test-controlled-integration-only",
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test(
    "\"Réponds simplement : Copilot opérationnel.\" flows through the REAL AIManager + REAL OpenAiProvider (mocked HTTP call) and returns that exact text",
    async () => {
      postMock.mockResolvedValue({ data: { choices: [{ message: { content: "Copilot opérationnel." } }] } });

      const res = await request(buildApp())
        .post("/ai-copilot/chat")
        .send({ message: "Réponds simplement : Copilot opérationnel." });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer).toBe("Copilot opérationnel.");
      expect(res.body.data.mode).not.toBe("error");
      // The real OpenAI request shape was actually built and sent to the
      // (mocked) HTTP layer — proves OpenAiProvider really was constructed
      // and really was called, not skipped.
      expect(postMock).toHaveBeenCalledWith(
        "/chat/completions",
        expect.objectContaining({ model: "gpt-4o-mini", messages: expect.any(Array) })
      );
      // Never the fake key anywhere in the response.
      expect(JSON.stringify(res.body)).not.toContain("sk-test-controlled-integration-only");
    },
    60000
  );
});
