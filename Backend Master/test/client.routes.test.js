"use strict";

// client.routes.js requires models/client.model.js -> db.js, which throws
// at require-time without DB_* env vars (Sequelize pool construction only,
// never a real connection — see src/db.js). Normally loaded as a side
// effect of app.js's dotenv.config(); load it explicitly since this file
// never touches app.js.
require("dotenv").config();

// Regression test for two CRITICAL findings from a security audit:
// POST /api/clients/import-csv and POST /api/clients/import-factures had
// NO authRequired at all — anyone on the internet could bulk-create/update
// client records (including financial fields) from an uploaded Excel file,
// with no size limit on the upload and no rate limit. Fixed by adding
// authRequired + requireRole(admin-tier) + a 20MB multer limit + an
// hourly rate limiter.

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: jest.fn((req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    next();
  }),
}));

jest.mock("../src/models/client.model", () => ({
  findAll: jest.fn(),
  bulkCreate: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const clientRoutes = require("../src/routes/client.routes");
const { authRequired } = require("../src/middleware/auth.middleware");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/clients", clientRoutes);
  return app;
}

const ADMIN = { sub: "a1", role: "admin" };
const REGULAR_USER = { sub: "u1", role: "user" };

beforeEach(() => jest.clearAllMocks());

describe("POST /api/clients/import-csv — auth + role required (audit sécurité: était entièrement public)", () => {
  test("401s with no Authorization at all — was previously reachable with zero auth", async () => {
    const res = await request(buildApp()).post("/api/clients/import-csv").attach("file", Buffer.from("x"), "x.csv");
    expect(res.status).toBe(401);
    expect(authRequired).toHaveBeenCalled();
  });

  test("403s for an authenticated but non-admin-tier user", async () => {
    const res = await request(buildApp())
      .post("/api/clients/import-csv")
      .set("x-test-user", JSON.stringify(REGULAR_USER))
      .attach("file", Buffer.from("x"), "x.csv");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/clients/import-factures — auth + role required (audit sécurité: était entièrement public)", () => {
  test("401s with no Authorization at all", async () => {
    const res = await request(buildApp()).post("/api/clients/import-factures").attach("file", Buffer.from("x"), "x.csv");
    expect(res.status).toBe(401);
  });

  test("403s for an authenticated but non-admin-tier user", async () => {
    const res = await request(buildApp())
      .post("/api/clients/import-factures")
      .set("x-test-user", JSON.stringify(REGULAR_USER))
      .attach("file", Buffer.from("x"), "x.csv");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/clients/all — unaffected by the fix (still authRequired-only, no role restriction)", () => {
  test("still works for any authenticated user", async () => {
    const Client = require("../src/models/client.model");
    Client.findAll.mockResolvedValue([]);
    const res = await request(buildApp()).get("/api/clients/all").set("x-test-user", JSON.stringify(REGULAR_USER));
    expect(res.status).toBe(200);
  });
});
