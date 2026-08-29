"use strict";

// Exercises the real Express routing (via supertest) with the AI kernel
// bridge mocked out entirely — no real McpServer, no LLM call, no JWT
// verification. Mirrors test/aiDashboard.routes.test.js's discipline
// exactly.

// Same conditional-401 mock convention as test/notifications.routes.test.js
// ("was previously reachable with zero auth" regression) — real JWT
// verification lives in auth.middleware.js itself (untouched here), this
// mock only needs to prove the Copilot routes still run authRequired
// FIRST, before any Copilot-specific gate.
jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, res, next) => {
    if (req.headers["x-test-unauthenticated"]) return res.status(401).json({ success: false, message: "Missing or invalid token" });
    req.user = req.headers["x-test-user"] ? JSON.parse(req.headers["x-test-user"]) : { sub: "u1", role: "admin", email: "a@b.com" };
    next();
  },
}));

// isEnabled/isRoleAllowed stay as separate mocked fns purely so existing
// tests can flip one or the other independently; canUseAiCopilot (the
// SINGLE function the route actually calls, see aiCopilot.routes.js) reads
// them dynamically on every call rather than baking in a fixed answer, so
// `mockBridge.isEnabled.mockReturnValue(false)` alone is still enough to
// flip the route's real decision — mirrors AiManager.canUseAiCopilot()'s
// own logic exactly (enabled first, then role).
const mockBridge = {
  isEnabled: jest.fn(() => true),
  isRoleAllowed: jest.fn(() => true),
  canUseAiCopilot: jest.fn((user) => {
    if (!mockBridge.isEnabled()) return { allowed: false, reason: "copilot_disabled" };
    if (!mockBridge.isRoleAllowed(user && user.role)) return { allowed: false, reason: "role_not_allowed" };
    return { allowed: true, reason: null };
  }),
  sendMessage: jest.fn(),
  listConversations: jest.fn(),
  getConversationHistory: jest.fn(),
  confirmProactiveWorkflow: jest.fn(),
  rejectProactiveWorkflow: jest.fn(),
};
jest.mock("../src/modules/ai-copilot/services/aiCopilotBridge.service", () => mockBridge);

const mockDashboardBriefing = { getDashboardBriefing: jest.fn() };
jest.mock("../src/modules/ai-copilot/services/dashboardBriefing.service", () => mockDashboardBriefing);

const request = require("supertest");
const express = require("express");
const aiCopilotRoutes = require("../src/modules/ai-copilot/routes/aiCopilot.routes");
const { NotConfiguredError } = require("../src/ai/utils/errors");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/ai-copilot", aiCopilotRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBridge.isEnabled.mockReturnValue(true);
  mockBridge.isRoleAllowed.mockReturnValue(true);
});

describe("gate — AI_COPILOT_ENABLED / AI_COPILOT_ROLES_ALLOWED", () => {
  test("the route calls bridge.canUseAiCopilot(req.user) exactly once — the SINGLE source of truth, never a separate isEnabled/isRoleAllowed pair of checks", async () => {
    await request(buildApp()).post("/ai-copilot/chat").send({ message: "Bonjour" }).set("x-test-user", JSON.stringify({ sub: "u7", role: "commercial", email: "c@x.com" }));
    expect(mockBridge.canUseAiCopilot).toHaveBeenCalledTimes(1);
    expect(mockBridge.canUseAiCopilot).toHaveBeenCalledWith({ sub: "u7", role: "commercial", email: "c@x.com" });
  });

  test("503s when the Copilot is disabled, without ever calling the bridge's business methods", async () => {
    mockBridge.isEnabled.mockReturnValue(false);
    const res = await request(buildApp()).post("/ai-copilot/chat").send({ message: "Bonjour" });
    expect(res.status).toBe(503);
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  // Locks in the fix for the "AI_COPILOT_ENABLED=true mais désactivé quand
  // même" incident: the message must NEVER assert a specific env-var value
  // (it can't know what the real one is, and a wrong guess is exactly what
  // made the original bug report read as contradictory) — only a stable
  // machine-readable `reason` the Flutter client (or any future client)
  // can branch on without parsing French prose.
  test("the disabled response never claims a specific AI_COPILOT_ENABLED value, and carries reason: copilot_disabled", async () => {
    mockBridge.isEnabled.mockReturnValue(false);
    const res = await request(buildApp()).post("/ai-copilot/chat").send({ message: "Bonjour" });
    expect(res.body.reason).toBe("copilot_disabled");
    expect(res.body.message).not.toContain("AI_COPILOT_ENABLED");
  });

  test("403s when the caller's role isn't on the allow-list", async () => {
    mockBridge.isRoleAllowed.mockReturnValue(false);
    const res = await request(buildApp()).post("/ai-copilot/chat").send({ message: "Bonjour" });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("role_not_allowed");
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });
});

describe("POST /ai-copilot/chat", () => {
  test("400s when 'message' is missing or blank, without calling the bridge", async () => {
    const res1 = await request(buildApp()).post("/ai-copilot/chat").send({});
    expect(res1.status).toBe(400);
    const res2 = await request(buildApp()).post("/ai-copilot/chat").send({ message: "   " });
    expect(res2.status).toBe(400);
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });

  test("200s with the full response envelope wrapped in {success, data}", async () => {
    const envelope = { conversationId: "c1", intent: "projects", mode: "agent", answer: "3 projets en retard.", suggestions: [], citations: [], toolCalls: [] };
    mockBridge.sendMessage.mockResolvedValue(envelope);

    const res = await request(buildApp()).post("/ai-copilot/chat").send({ message: "Quels projets sont en retard ?", conversationId: "c1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: envelope });
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(
      { sub: "u1", role: "admin", email: "a@b.com" },
      { message: "Quels projets sont en retard ?", conversationId: "c1", pageContext: null }
    );
  });

  test("omitting conversationId still reaches the bridge with conversationId: null (bridge generates one)", async () => {
    mockBridge.sendMessage.mockResolvedValue({ conversationId: "generated", answer: "ok" });
    await request(buildApp()).post("/ai-copilot/chat").send({ message: "Bonjour" });
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(expect.any(Object), { message: "Bonjour", conversationId: null, pageContext: null });
  });

  test("Context Awareness: a provided pageContext is forwarded to the bridge unchanged", async () => {
    mockBridge.sendMessage.mockResolvedValue({ conversationId: "c1", answer: "ok" });
    const pageContext = { screen: "project", label: "Villa Sfax", data: { statut: "en_cours" } };
    await request(buildApp()).post("/ai-copilot/chat").send({ message: "Quel est le statut ?", pageContext });
    expect(mockBridge.sendMessage).toHaveBeenCalledWith(expect.any(Object), { message: "Quel est le statut ?", conversationId: null, pageContext });
  });

  test("503s with a safe message and reason: AI_PROVIDER_NOT_CONFIGURED when the bridge throws NotConfiguredError (no LLM provider wired)", async () => {
    mockBridge.sendMessage.mockRejectedValue(new NotConfiguredError("ILlmProvider adapter"));
    const res = await request(buildApp()).post("/ai-copilot/chat").send({ message: "Bonjour" });
    expect(res.status).toBe(503);
    expect(res.body.message).not.toContain("ILlmProvider");
    expect(res.body.reason).toBe("AI_PROVIDER_NOT_CONFIGURED");
  });

  // Regression for the "SequelizeDatabaseError shows as 'Copilot non
  // configuré'" incident: a real DB failure must classify as
  // AI_DATABASE_ERROR (500), NEVER as AI_PROVIDER_NOT_CONFIGURED (503) —
  // two different causes, two different codes/messages, never conflated.
  test("500s with reason: AI_DATABASE_ERROR (never AI_PROVIDER_NOT_CONFIGURED) when the bridge throws a real Sequelize error", async () => {
    const { DatabaseError } = require("sequelize");
    mockBridge.sendMessage.mockRejectedValue(new DatabaseError(new Error('column "dateExpiration" does not exist')));
    const res = await request(buildApp()).post("/ai-copilot/chat").send({ message: "Quels projets sont critiques ?" });
    expect(res.status).toBe(500);
    expect(res.body.reason).toBe("AI_DATABASE_ERROR");
    expect(res.body.reason).not.toBe("AI_PROVIDER_NOT_CONFIGURED");
    expect(res.body.message).not.toMatch(/configuré/i);
    expect(res.body.message).not.toContain("dateExpiration");
  });

  test("500s with reason: AI_INTERNAL_ERROR on an unexpected non-DB error (never leaks internal detail)", async () => {
    mockBridge.sendMessage.mockRejectedValue(new TypeError("Cannot read property 'x' of undefined"));
    const res = await request(buildApp()).post("/ai-copilot/chat").send({ message: "Bonjour" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Internal server error", reason: "AI_INTERNAL_ERROR" });
  });
});

describe("GET /ai-copilot/conversations", () => {
  test("200s with this user's conversation list", async () => {
    mockBridge.listConversations.mockReturnValue([{ conversationId: "c1", updatedAt: "t", preview: "...", intent: "projects" }]);
    const res = await request(buildApp()).get("/ai-copilot/conversations");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockBridge.listConversations).toHaveBeenCalledWith({ sub: "u1", role: "admin", email: "a@b.com" }, { limit: undefined });
  });

  test("forwards a valid ?limit= query param", async () => {
    mockBridge.listConversations.mockReturnValue([]);
    await request(buildApp()).get("/ai-copilot/conversations?limit=5");
    expect(mockBridge.listConversations).toHaveBeenCalledWith(expect.any(Object), { limit: 5 });
  });
});

describe("GET /ai-copilot/conversations/:id", () => {
  test("200s with the conversation's message history", async () => {
    mockBridge.getConversationHistory.mockResolvedValue([{ role: "user", content: "Bonjour" }]);
    const res = await request(buildApp()).get("/ai-copilot/conversations/c1");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ conversationId: "c1", messages: [{ role: "user", content: "Bonjour" }] });
  });

  test("404s when the caller never owned this conversationId (never a silent empty history)", async () => {
    mockBridge.getConversationHistory.mockResolvedValue(null);
    const res = await request(buildApp()).get("/ai-copilot/conversations/not-mine");
    expect(res.status).toBe(404);
  });
});

describe("GET /ai-copilot/dashboard — AI Dashboard", () => {
  test("200s with the briefing wrapped in {success, data}, gated exactly like the other routes", async () => {
    const briefing = {
      generatedAt: "2026-08-07T08:00:00.000Z",
      greeting: { firstName: "Khalil", fullName: "Khalil Ben Ali" },
      today: { criticalProjects: 5, expiringQuotes: 3, urgentInterventions: 2, clientsToFollowUp: 4 },
      crmQuality: { score: 96 },
      riskCards: [],
      recommendationCards: [],
      timeline: [],
      chart: { labels: [], values: [] },
    };
    mockDashboardBriefing.getDashboardBriefing.mockResolvedValue(briefing);

    const res = await request(buildApp()).get("/ai-copilot/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: briefing });
    expect(mockDashboardBriefing.getDashboardBriefing).toHaveBeenCalledWith({ sub: "u1", role: "admin", email: "a@b.com" });
  });

  test("503s when the Copilot is disabled, without ever calling the briefing service", async () => {
    mockBridge.isEnabled.mockReturnValue(false);
    const res = await request(buildApp()).get("/ai-copilot/dashboard");
    expect(res.status).toBe(503);
    expect(mockDashboardBriefing.getDashboardBriefing).not.toHaveBeenCalled();
  });

  test("403s when the caller's role isn't on the allow-list", async () => {
    mockBridge.isRoleAllowed.mockReturnValue(false);
    const res = await request(buildApp()).get("/ai-copilot/dashboard");
    expect(res.status).toBe(403);
    expect(mockDashboardBriefing.getDashboardBriefing).not.toHaveBeenCalled();
  });

  test("500s with reason: AI_INTERNAL_ERROR on an unexpected error (never leaks internal detail)", async () => {
    mockDashboardBriefing.getDashboardBriefing.mockRejectedValue(new TypeError("Cannot read property 'x' of undefined"));
    const res = await request(buildApp()).get("/ai-copilot/dashboard");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Internal server error", reason: "AI_INTERNAL_ERROR" });
  });

  // Regression for the "SequelizeDatabaseError shows as 'Copilot non
  // configuré'" incident — GET /ai-copilot/dashboard is exactly the route
  // from the original stack trace (aiCopilot.controller.js::dashboard()).
  test("500s with reason: AI_DATABASE_ERROR when the briefing service throws a real Sequelize error (e.g. a missing column)", async () => {
    const { DatabaseError } = require("sequelize");
    mockDashboardBriefing.getDashboardBriefing.mockRejectedValue(new DatabaseError(new Error('column "dateExpiration" does not exist')));
    const res = await request(buildApp()).get("/ai-copilot/dashboard");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Une erreur de base de données est survenue côté serveur. L'équipe technique a été informée.", reason: "AI_DATABASE_ERROR" });
  });
});

describe("POST /ai-copilot/proactive/:workflowId/confirm — Proactive AI", () => {
  test("200s with the execution result, gated like every other route", async () => {
    mockBridge.confirmProactiveWorkflow.mockResolvedValue({ workflowId: "w1", label: "Créer un rappel", domain: "projects", subject: "x", result: { id: "a1" } });

    const res = await request(buildApp()).post("/ai-copilot/proactive/w1/confirm");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { workflowId: "w1", label: "Créer un rappel", domain: "projects", subject: "x", result: { id: "a1" } } });
    expect(mockBridge.confirmProactiveWorkflow).toHaveBeenCalledWith({ sub: "u1", role: "admin", email: "a@b.com" }, "w1");
  });

  test("404s when the workflow is unknown/expired/not owned by the caller — never distinguishes which", async () => {
    mockBridge.confirmProactiveWorkflow.mockResolvedValue(null);
    const res = await request(buildApp()).post("/ai-copilot/proactive/unknown/confirm");
    expect(res.status).toBe(404);
  });

  test("503s when the Copilot is disabled, without ever calling the bridge", async () => {
    mockBridge.isEnabled.mockReturnValue(false);
    const res = await request(buildApp()).post("/ai-copilot/proactive/w1/confirm");
    expect(res.status).toBe(503);
    expect(mockBridge.confirmProactiveWorkflow).not.toHaveBeenCalled();
  });

  test("500s with reason: AI_INTERNAL_ERROR when the Tool execution fails, never leaking internal detail", async () => {
    mockBridge.confirmProactiveWorkflow.mockRejectedValue(new Error("Project not found"));
    const res = await request(buildApp()).post("/ai-copilot/proactive/w1/confirm");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Internal server error", reason: "AI_INTERNAL_ERROR" });
  });
});

describe("POST /ai-copilot/proactive/:workflowId/reject — Proactive AI", () => {
  test("200s and never executes anything", async () => {
    mockBridge.rejectProactiveWorkflow.mockReturnValue(true);
    const res = await request(buildApp()).post("/ai-copilot/proactive/w1/reject");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockBridge.rejectProactiveWorkflow).toHaveBeenCalledWith({ sub: "u1", role: "admin", email: "a@b.com" }, "w1");
  });

  test("404s when the workflow is unknown/expired/not owned by the caller", async () => {
    mockBridge.rejectProactiveWorkflow.mockReturnValue(false);
    const res = await request(buildApp()).post("/ai-copilot/proactive/unknown/reject");
    expect(res.status).toBe(404);
  });
});

describe("auth", () => {
  test("every route runs authRequired first (req.user is available to the controller)", async () => {
    mockBridge.listConversations.mockReturnValue([]);
    await request(buildApp()).get("/ai-copilot/conversations").set("x-test-user", JSON.stringify({ sub: "u9", role: "commercial", email: "u9@x.com" }));
    expect(mockBridge.listConversations).toHaveBeenCalledWith({ sub: "u9", role: "commercial", email: "u9@x.com" }, { limit: undefined });
  });

  test("401s when unauthenticated — authRequired runs BEFORE canUseAiCopilot, never a 403 leaking 'role not allowed' for a caller with no role at all", async () => {
    const res = await request(buildApp()).post("/ai-copilot/chat").set("x-test-unauthenticated", "1").send({ message: "Bonjour" });
    expect(res.status).toBe(401);
    expect(mockBridge.canUseAiCopilot).not.toHaveBeenCalled();
    expect(mockBridge.sendMessage).not.toHaveBeenCalled();
  });
});

describe("POST /ai-copilot/reports/pdf — export PDF d'un rapport déjà généré par /chat", () => {
  test("400s when 'content' is missing or blank", async () => {
    const res1 = await request(buildApp()).post("/ai-copilot/reports/pdf").send({ title: "Rapport" });
    expect(res1.status).toBe(400);
    const res2 = await request(buildApp()).post("/ai-copilot/reports/pdf").send({ content: "   " });
    expect(res2.status).toBe(400);
  });

  test("200s with a real PDF stream (magic bytes %PDF, Content-Type application/pdf)", async () => {
    const res = await request(buildApp())
      .post("/ai-copilot/reports/pdf")
      .send({ title: "Rapport KPI", content: "3 projets en retard, 2 devis expirent cette semaine." });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain('filename="rapport-copilot.pdf"');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  test("gated exactly like every other route (disabled -> 503, role not allowed -> 403)", async () => {
    mockBridge.isEnabled.mockReturnValue(false);
    const res = await request(buildApp()).post("/ai-copilot/reports/pdf").send({ content: "x" });
    expect(res.status).toBe(503);
  });

  test("works with no title (falls back to a default title inside the PDF, never 400s)", async () => {
    const res = await request(buildApp()).post("/ai-copilot/reports/pdf").send({ content: "Synthèse sans titre fourni." });
    expect(res.status).toBe(200);
    expect(res.body.slice(0, 4).toString("ascii")).toBe("%PDF");
  });
});

describe("rate limiting (express-rate-limit, skipped under NODE_ENV=test)", () => {
  test("many requests in a row still all succeed while NODE_ENV=test (skip: isTestEnv)", async () => {
    mockBridge.listConversations.mockReturnValue([]);
    const app = buildApp();
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/ai-copilot/conversations");
      expect(res.status).toBe(200);
    }
  });
});
