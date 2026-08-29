"use strict";

// Regression test: GET /utils/geocode had no authRequired, no rate limit,
// and an unbounded in-memory cache (a key is only purged when re-accessed —
// never if it's a one-off unique query) — an unauthenticated attacker could
// flood the server's outbound requests to Nominatim (third-party ban risk)
// and grow the cache Map without limit (audit sécurité).

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: jest.fn((req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    next();
  }),
}));

jest.mock("axios");
const axios = require("axios");

const request = require("supertest");
const express = require("express");
// Required once — NODE_ENV is "test" under Jest by default, matching the
// same `skip: isTestEnv` convention already used across this codebase's
// rate limiters (routes/auth.routes.js, modules/ai-dashboard/routes/...).
const geocodeRoutes = require("../src/routes/geocode.routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/utils", geocodeRoutes);
  return app;
}

const USER = { sub: "u1", role: "user" };

beforeEach(() => {
  axios.get.mockReset();
});

describe("GET /utils/geocode — auth required (audit sécurité: était public, sans limite d'appels)", () => {
  test("401s with no Authorization header — was previously reachable with zero auth", async () => {
    const app = buildApp();
    const res = await request(app).get("/utils/geocode").query({ q: "Tunis" });
    expect(res.status).toBe(401);
  });

  test("succeeds for an authenticated user", async () => {
    axios.get.mockResolvedValue({ data: [{ display_name: "Tunis, Tunisia", lat: "36.8", lon: "10.1" }] });
    const app = buildApp();
    const res = await request(app).get("/utils/geocode").query({ q: "Tunis" }).set("x-test-user", JSON.stringify(USER));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("geocode cache — bounded size (audit sécurité: croissance non bornée)", () => {
  test("evicts the oldest entry once MAX_CACHE_ENTRIES is exceeded", async () => {
    axios.get.mockImplementation((_url, { params }) =>
      Promise.resolve({ data: [{ display_name: params.q, lat: "1", lon: "1" }] })
    );
    const app = buildApp();

    // Fill the cache well past its 500-entry cap with unique queries.
    for (let i = 0; i < 505; i++) {
      await request(app).get("/utils/geocode").query({ q: `query-number-${i}` }).set("x-test-user", JSON.stringify(USER));
    }

    // The very first query's cache entry must have been evicted — a repeat
    // call has to hit Nominatim again rather than serving a stale cache hit.
    const callsBefore = axios.get.mock.calls.length;
    await request(app).get("/utils/geocode").query({ q: "query-number-0" }).set("x-test-user", JSON.stringify(USER));
    expect(axios.get.mock.calls.length).toBe(callsBefore + 1);
  }, 15000);
});
