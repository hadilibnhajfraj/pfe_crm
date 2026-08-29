"use strict";

// Exercises the real Express routing/param-parsing (via supertest) with the
// AI kernel bridge mocked out entirely — no real McpServer, no Sequelize
// models, no JWT verification. Mirrors the no-real-dependency discipline
// used throughout this session's test suite; the full app.js (real DB,
// real 73 Tools) is deliberately NOT booted here.

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, _res, next) => {
    req.user = req.headers["x-test-user"] ? JSON.parse(req.headers["x-test-user"]) : { sub: "u1", role: "admin", email: "a@b.com" };
    next();
  },
}));

const mockBridge = {
  DOMAIN_NAMES: ["projects", "pipeline", "sales", "maintenance", "hr", "industrial", "kpi"],
  getSnapshot: jest.fn(),
  getDomainSnapshot: jest.fn(),
};
jest.mock("../src/modules/ai-dashboard/services/aiDashboardBridge.service", () => mockBridge);

const request = require("supertest");
const express = require("express");
const aiDashboardRoutes = require("../src/modules/ai-dashboard/routes/aiDashboard.routes");
const { DashboardPermissionError } = require("../src/ai/dashboard/errors");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/ai-dashboard", aiDashboardRoutes);
  return app;
}

const EMPTY_SUMMARY = { alerts: [], recommendations: [], anomalies: [], forecasts: [], risks: [], dataQuality: [] };

beforeEach(() => jest.clearAllMocks());

describe("GET /ai-dashboard", () => {
  test("200s with the full snapshot wrapped in {success, data}", async () => {
    mockBridge.getSnapshot.mockResolvedValue({ generatedAt: "t", domains: {}, summary: EMPTY_SUMMARY });
    const res = await request(buildApp()).get("/ai-dashboard");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { generatedAt: "t", domains: {}, summary: EMPTY_SUMMARY } });
  });

  test("500s with a generic message when the bridge throws an unexpected error (never leaks internal detail)", async () => {
    mockBridge.getSnapshot.mockRejectedValue(new TypeError("Cannot read property 'x' of undefined"));
    const res = await request(buildApp()).get("/ai-dashboard");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Internal server error" });
  });
});

describe("GET /ai-dashboard/:domain", () => {
  test("200s with one domain's insights for a valid domain", async () => {
    mockBridge.getDomainSnapshot.mockResolvedValue({ domain: "projects", alerts: [], risks: [] });
    const res = await request(buildApp()).get("/ai-dashboard/projects");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { domain: "projects", alerts: [], risks: [] } });
    expect(mockBridge.getDomainSnapshot).toHaveBeenCalledWith({ sub: "u1", role: "admin", email: "a@b.com" }, "projects");
  });

  test("400s for an unknown domain, without ever calling the bridge", async () => {
    const res = await request(buildApp()).get("/ai-dashboard/not_a_real_domain");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockBridge.getDomainSnapshot).not.toHaveBeenCalled();
  });

  test("403s when the bridge rejects with DashboardPermissionError, exposing its (safe) message", async () => {
    mockBridge.getDomainSnapshot.mockRejectedValue(new DashboardPermissionError("industrial", "user"));
    const res = await request(buildApp()).get("/ai-dashboard/industrial");
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not allowed/);
  });
});

describe("GET /ai-dashboard/insights/:category", () => {
  test("200s with just that category's flattened list across domains", async () => {
    mockBridge.getSnapshot.mockResolvedValue({ generatedAt: "t", domains: {}, summary: { ...EMPTY_SUMMARY, alerts: [{ domain: "kpi", type: "x" }] } });
    const res = await request(buildApp()).get("/ai-dashboard/insights/alerts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ domain: "kpi", type: "x" }] });
  });

  test("maps the kebab-case 'data-quality' URL segment to the camelCase 'dataQuality' summary key", async () => {
    mockBridge.getSnapshot.mockResolvedValue({ generatedAt: "t", domains: {}, summary: { ...EMPTY_SUMMARY, dataQuality: [{ domain: "hr", type: "missing_field" }] } });
    const res = await request(buildApp()).get("/ai-dashboard/insights/data-quality");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ domain: "hr", type: "missing_field" }]);
  });

  test("400s for an unknown category", async () => {
    const res = await request(buildApp()).get("/ai-dashboard/insights/not_a_real_category");
    expect(res.status).toBe(400);
    expect(mockBridge.getSnapshot).not.toHaveBeenCalled();
  });

  test("the /insights/:category route is matched before /:domain (never treats 'insights' as a domain name)", async () => {
    mockBridge.getSnapshot.mockResolvedValue({ generatedAt: "t", domains: {}, summary: EMPTY_SUMMARY });
    const res = await request(buildApp()).get("/ai-dashboard/insights/alerts");
    expect(res.status).toBe(200);
    expect(mockBridge.getDomainSnapshot).not.toHaveBeenCalled();
  });
});

describe("auth", () => {
  test("every route runs authRequired first (req.user is available to the controller)", async () => {
    mockBridge.getDomainSnapshot.mockResolvedValue({ domain: "kpi" });
    await request(buildApp()).get("/ai-dashboard/kpi").set("x-test-user", JSON.stringify({ sub: "u9", role: "user", email: "u9@x.com" }));
    expect(mockBridge.getDomainSnapshot).toHaveBeenCalledWith({ sub: "u9", role: "user", email: "u9@x.com" }, "kpi");
  });
});

describe("rate limiting (express-rate-limit, skipped under NODE_ENV=test)", () => {
  // NODE_ENV is already "test" for the whole Jest run (see the shared
  // `isTestEnv` convention in routes/auth.routes.js) — this confirms the
  // limiter is wired without ever tripping in the test suite itself, then
  // exercises it directly (bypassing the skip) to prove it actually limits.
  test("many requests in a row still all succeed while NODE_ENV=test (skip: isTestEnv)", async () => {
    mockBridge.getSnapshot.mockResolvedValue({ generatedAt: "t", domains: {}, summary: EMPTY_SUMMARY });
    const app = buildApp();
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/ai-dashboard");
      expect(res.status).toBe(200);
    }
  });

  test("with NODE_ENV temporarily not 'test', the limiter actually rejects past its cap", async () => {
    jest.resetModules();
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      jest.doMock("../src/middleware/auth.middleware", () => ({
        authRequired: (req, _res, next) => {
          req.user = { sub: "u1", role: "admin", email: "a@b.com" };
          next();
        },
      }));
      jest.doMock("../src/modules/ai-dashboard/services/aiDashboardBridge.service", () => ({
        ...mockBridge,
        getSnapshot: jest.fn().mockResolvedValue({ generatedAt: "t", domains: {}, summary: EMPTY_SUMMARY }),
      }));
      const freshRoutes = require("../src/modules/ai-dashboard/routes/aiDashboard.routes");
      const freshExpress = require("express");
      const app = freshExpress();
      app.use(freshExpress.json());
      app.use("/ai-dashboard", freshRoutes);

      let sawTooManyRequests = false;
      for (let i = 0; i < 65; i++) {
        const res = await request(app).get("/ai-dashboard");
        if (res.status === 429) {
          sawTooManyRequests = true;
          break;
        }
      }
      expect(sawTooManyRequests).toBe(true);
    } finally {
      process.env.NODE_ENV = previousEnv;
      jest.dontMock("../src/middleware/auth.middleware");
      jest.dontMock("../src/modules/ai-dashboard/services/aiDashboardBridge.service");
      jest.resetModules();
    }
  });
});
