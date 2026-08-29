"use strict";

require("dotenv").config();

// Regression test: POST /auth/signup accepted trivially weak passwords
// (length 8-72 only, e.g. "aaaaaaaa") via isStrongPassword — the SAME check
// used by /auth/signin, deliberately kept loose there so an existing
// account's already-set password is never rejected at login. Fixed by
// switching signup specifically to isStrongPasswordForReset's stronger
// complexity rule (upper+lower+digit+special), matching the reset flow —
// signin's isStrongPassword is untouched (audit sécurité).

jest.mock("../src/models/User", () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock("../src/models/UserProfile", () => ({ create: jest.fn() }));

const request = require("supertest");
const express = require("express");
const authRoutes = require("../src/routes/auth.routes");
const User = require("../src/models/User");
const UserProfile = require("../src/models/UserProfile");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe("POST /auth/signup — password strength (audit sécurité)", () => {
  test("rejects a weak password that used to pass (length-only check)", async () => {
    const res = await request(buildApp()).post("/auth/signup").send({ email: "new@example.com", password: "aaaaaaaa" });
    expect(res.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  test("accepts a strong password (upper+lower+digit+special) and creates the account", async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({ id: "u1", email: "new@example.com", role: "user", isActive: false });
    UserProfile.create.mockResolvedValue({});

    const res = await request(buildApp()).post("/auth/signup").send({ email: "new@example.com", password: "Str0ng!Pass" });
    expect(res.status).toBe(201);
    expect(User.create).toHaveBeenCalled();
  });
});
