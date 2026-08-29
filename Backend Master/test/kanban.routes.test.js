"use strict";

// Regression test for the kanban drag-and-drop IDOR fix (audit sécurité):
// PUT /pipeline/projects/:id/stage called kanban.service.js::moveStageFast(),
// a raw SQL UPDATE with NO ownership check of its own — any authenticated
// user (any role) could move ANY other user's project to any stage. Fixed
// by adding requireOwnerOrAdmin (the same policy already used by the full
// move-stage endpoint, and already unit-tested directly in isolation in
// test/project.policy.test.js — this file instead proves it is actually
// WIRED into the route) to the route.
//
// project.policy.js itself is mocked (rather than models/Project) because
// kanban.controller.js also requires modules/projects/services/project.service.js
// at its top, which transitively requires models/associations.js — loading
// the REAL associations graph while only models/Project is mocked breaks
// unrelated Sequelize.hasMany() calls on other real models. Mocking the
// policy module sidesteps that entirely while still proving the route
// wiring (not just the policy function in isolation).

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, _res, next) => {
    req.user = req.headers["x-test-user"] ? JSON.parse(req.headers["x-test-user"]) : { sub: "u1", role: "user" };
    next();
  },
}));

const mockRequireOwnerOrAdmin = jest.fn((req, res, next) => next());
jest.mock("../src/modules/projects/policies/project.policy", () => ({
  requireOwnerOrAdmin: (req, res, next) => mockRequireOwnerOrAdmin(req, res, next),
}));

jest.mock("../src/modules/projects/services/project.service", () => ({}));

const mockMoveStageFast = jest.fn();
jest.mock("../src/modules/kanban/services/kanban.service", () => ({
  getKanbanBoard: jest.fn(),
  getStagesWithCount: jest.fn(),
  moveStageFast: (...args) => mockMoveStageFast(...args),
}));

const request = require("supertest");
const express = require("express");
const kanbanRoutes = require("../src/modules/kanban/routes/kanban.routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/pipeline", kanbanRoutes);
  return app;
}

const OWNER = { sub: "owner-1", role: "user" };
const PROJECT_ID = "proj-1";

beforeEach(() => jest.clearAllMocks());

describe("PUT /pipeline/projects/:id/stage — requireOwnerOrAdmin is wired into the route (audit sécurité)", () => {
  test("requireOwnerOrAdmin runs BEFORE moveStageFast, scoped to this project id", async () => {
    mockMoveStageFast.mockResolvedValue({ id: PROJECT_ID, pipelineStageId: "s2" });

    const res = await request(buildApp())
      .put(`/pipeline/projects/${PROJECT_ID}/stage`)
      .set("x-test-user", JSON.stringify(OWNER))
      .send({ stageId: "s2" });

    expect(res.status).toBe(200);
    expect(mockRequireOwnerOrAdmin).toHaveBeenCalledTimes(1);
    expect(mockRequireOwnerOrAdmin.mock.calls[0][0].params.id).toBe(PROJECT_ID);
    expect(mockMoveStageFast).toHaveBeenCalledWith(PROJECT_ID, "s2");
  });

  test("when requireOwnerOrAdmin denies (403), moveStageFast is never reached — the exact IDOR this fix closes", async () => {
    mockRequireOwnerOrAdmin.mockImplementation((_req, res) => res.status(403).json({ message: "Forbidden: not project owner" }));

    const res = await request(buildApp())
      .put(`/pipeline/projects/${PROJECT_ID}/stage`)
      .set("x-test-user", JSON.stringify(OWNER))
      .send({ stageId: "s2" });

    expect(res.status).toBe(403);
    expect(mockMoveStageFast).not.toHaveBeenCalled();
  });
});
