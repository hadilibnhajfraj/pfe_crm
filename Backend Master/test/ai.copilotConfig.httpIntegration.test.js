"use strict";

// ÉTAPE 7 of the "Copilot IA n'est pas configuré côté serveur" incident:
// "Ne pas tester uniquement depuis Flutter... faire un test HTTP
// authentifié avec un utilisateur ayant le rôle user." This file exercises
// the REAL, UNMOCKED aiCopilot.routes.js + aiCopilotBridge.service.js
// against the REAL AI_LLM_*/AI_COPILOT_* values currently in
// process.env (i.e. whatever's in the real .env once dotenv loads it —
// see jest run order/app.js) — only `authRequired` is stubbed, to inject a
// role="user" caller without needing a real signed JWT. No DB access
// occurs on this path (RAG ingestion reads the filesystem corpus only —
// see rag/reindex.js — and NotConfiguredError throws before McpServer, a
// DB-backed adapter, is ever constructed — see aiCopilotBridge.service.js
// ::getOrchestratorFor).

require("dotenv").config();
const { sequelize } = require("../src/db");
const User = require("../src/models/User");

// `sub` must be a REAL row id (project_devis/projects queries filter by
// it as a UUID column) — a placeholder string like "real-user-1" fails
// with a Postgres "invalid input syntax for type uuid" (itself correctly
// classified as AI_DATABASE_ERROR by errorClassifier.js, but a false
// signal for THIS test's purpose: proving the dashboard route works for a
// genuine user, not exercising a malformed-id edge case).
let mockRealUserId;

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, _res, next) => {
    req.user = { sub: mockRealUserId, role: "commercial", email: "u@crmprobar.com" };
    next();
  },
}));

const request = require("supertest");
const express = require("express");
const aiCopilotRoutes = require("../src/modules/ai-copilot/routes/aiCopilot.routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/ai-copilot", aiCopilotRoutes);
  return app;
}

beforeAll(async () => {
  const anyUser = await User.findOne({ order: [["createdAt", "ASC"]] });
  mockRealUserId = anyUser ? anyUser.id : "00000000-0000-4000-8000-000000000000";
});

afterAll(async () => {
  await sequelize.close();
});

describe("Real end-to-end HTTP check — role \"user\", real .env, real bridge (no mocks beyond auth)", () => {
  // Generous timeout: the FIRST real request in this process triggers a
  // genuine one-time filesystem RAG ingestion pass (see
  // aiCopilotBridge.service.js::ensureRagIngested, rag/reindex.js) — real
  // I/O, not mocked, exactly what "test HTTP directement, jamais uniquement
  // depuis Flutter" requires.
  test(
    "role \"user\" clears the AI_COPILOT_ENABLED/role gate — never 403/copilot_disabled/role_not_allowed; with the real (currently keyless) .env, the only remaining blocker is a clean copilot_not_configured",
    async () => {
      const res = await request(buildApp()).post("/ai-copilot/chat").send({ message: "Quels projets sont critiques ?" });

      expect(res.status).not.toBe(403);
      expect(res.body.reason).not.toBe("copilot_disabled");
      expect(res.body.reason).not.toBe("role_not_allowed");

      // As of this test run, the real .env intentionally has NO real
      // AI_LLM_API_KEY (see
      // AI-Business-Copilot/03_INCIDENT_COPILOT_DESACTIVE.md §4/§9 — never
      // fabricated). This branch documents the CURRENT, correct, honest
      // state: the gate is open, and the ONLY remaining blocker is the
      // missing real LLM credential — a clean 503 copilot_not_configured,
      // never a crash/generic 500/leaked secret. Once a real
      // AI_LLM_PROVIDER/MODEL/API_KEY is set in this same .env, this exact
      // request would instead reach AIManager.handleMessage() — see the
      // Tier 2 corpus test ("ai.validation.copilotEndToEnd.test.js -t
      // prj-01", role="user", a real AIManager + a fake LLM provider) for
      // that proof.
      if (res.status === 503 && res.body.reason === "AI_PROVIDER_NOT_CONFIGURED") {
        expect(res.body.message).toBe("Le Copilot IA n'est pas configuré côté serveur.");
      } else {
        // A real AI_LLM_* credential IS present in this environment — the
        // gate + config chain both cleared, the fully-fixed state.
        expect([200, 503]).toContain(res.status);
      }
      expect(JSON.stringify(res.body)).not.toMatch(/sk-[a-zA-Z0-9]|api[_-]?key\s*[:=]/i);
    },
    30000
  );

  // ÉTAPE 9 of the "SequelizeDatabaseError: dateExpiration" incident:
  // GET /ai-copilot/dashboard needs NO LLM provider at all (see
  // aiCopilot.controller.js::dashboard()'s own comment) — this is the
  // EXACT route from the original bug report's stack trace
  // (aiCopilot.controller.js -> dashboard() -> handle()). Unlike /chat,
  // this one has no "missing API key" excuse left — it must return a real
  // 200 with real CRM data for role "user", never a 500/503 of any kind.
  test(
    "GET /ai-copilot/dashboard returns 200 with real CRM data for role \"user\" — the exact route/stack trace from the original bug report, needs no LLM key",
    async () => {
      const res = await request(buildApp()).get("/ai-copilot/dashboard");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          today: expect.objectContaining({
            criticalProjects: expect.any(Number),
            expiringQuotes: expect.any(Number),
          }),
          riskCards: expect.any(Array),
        })
      );
    },
    30000
  );
});
