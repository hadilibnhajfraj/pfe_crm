"use strict";

require("dotenv").config();

// Regression test: POST /notifications/send-email had no authRequired at
// all — anyone could make the server send arbitrary emails from the org's
// SMTP account to arbitrary addresses, and create fake Notification rows
// for any toUserId (audit sécurité).

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: jest.fn((req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    next();
  }),
}));

jest.mock("../src/models/Notification", () => ({
  findAndCountAll: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
}));

jest.mock("../src/services/emailService", () => ({ send: jest.fn().mockResolvedValue(true) }));

const request = require("supertest");
const express = require("express");
const notificationsRoutes = require("../src/routes/notifications.routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/notifications", notificationsRoutes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe("POST /notifications/send-email — auth required (audit sécurité: était entièrement public)", () => {
  test("401s with no Authorization header — was previously reachable with zero auth", async () => {
    const res = await request(buildApp()).post("/notifications/send-email").send({ emailTo: "x@x.com", subject: "s", message: "m" });
    expect(res.status).toBe(401);
  });

  test("succeeds for an authenticated user", async () => {
    const emailService = require("../src/services/emailService");
    const Notification = require("../src/models/Notification");
    Notification.create.mockResolvedValue({ id: "n1" });
    const res = await request(buildApp())
      .post("/notifications/send-email")
      .set("x-test-user", JSON.stringify({ sub: "u1", role: "user" }))
      .send({ toUserId: "u2", emailTo: "x@x.com", subject: "s", message: "m" });
    expect(res.status).not.toBe(401);
    expect(emailService.send).toHaveBeenCalled();
  });
});
