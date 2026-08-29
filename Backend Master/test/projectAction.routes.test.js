"use strict";

// Regression test for the project-actions IDOR fix (audit sécurité):
// GET/PUT/DELETE /projects/:projectId/actions/:id had NO ownership check —
// getActionById/updateAction/deleteAction in the service look an action up
// by its own id only, ignoring :projectId entirely, so any authenticated
// user could read/edit/delete any other user's project's actions by
// guessing/enumerating an action UUID. Fixed by adding
// requireProjectOwnerOrAdmin (reads req.params.projectId, already
// unit-tested in isolation in test/project.policy.test.js) to the
// project-actions router.

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, _res, next) => {
    req.user = req.headers["x-test-user"] ? JSON.parse(req.headers["x-test-user"]) : { sub: "u1", role: "user" };
    next();
  },
}));

const mockRequireProjectOwnerOrAdmin = jest.fn((req, res, next) => next());
jest.mock("../src/modules/projects/policies/project.policy", () => ({
  requireProjectOwnerOrAdmin: (req, res, next) => mockRequireProjectOwnerOrAdmin(req, res, next),
}));

const mockGetActionById = jest.fn();
const mockDeleteAction = jest.fn();
jest.mock("../src/modules/project-actions/services/projectAction.service", () => ({
  getProjectActions: jest.fn(),
  getActionById: (...args) => mockGetActionById(...args),
  createAction: jest.fn(),
  updateAction: jest.fn(),
  deleteAction: (...args) => mockDeleteAction(...args),
  retryGoogleSync: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const projectActionRoutes = require("../src/modules/project-actions/routes/projectAction.routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/projects/:projectId/actions", projectActionRoutes);
  return app;
}

const USER = { sub: "u1", role: "user" };
const PROJECT_ID = "proj-1";
const ACTION_ID = "action-1";

beforeEach(() => jest.clearAllMocks());

describe("project-actions router — requireProjectOwnerOrAdmin wired for every route (audit sécurité)", () => {
  test("GET /:id — the ownership check runs, scoped to req.params.projectId, before getActionById", async () => {
    mockGetActionById.mockResolvedValue({ id: ACTION_ID });
    const res = await request(buildApp())
      .get(`/projects/${PROJECT_ID}/actions/${ACTION_ID}`)
      .set("x-test-user", JSON.stringify(USER));

    expect(res.status).toBe(200);
    expect(mockRequireProjectOwnerOrAdmin).toHaveBeenCalledTimes(1);
    expect(mockRequireProjectOwnerOrAdmin.mock.calls[0][0].params.projectId).toBe(PROJECT_ID);
    expect(mockGetActionById).toHaveBeenCalledWith(ACTION_ID);
  });

  test("GET /:id — denied (403) never reaches getActionById — the exact IDOR this fix closes", async () => {
    mockRequireProjectOwnerOrAdmin.mockImplementation((_req, res) => res.status(403).json({ message: "Forbidden: not project owner" }));
    const res = await request(buildApp())
      .get(`/projects/${PROJECT_ID}/actions/${ACTION_ID}`)
      .set("x-test-user", JSON.stringify(USER));

    expect(res.status).toBe(403);
    expect(mockGetActionById).not.toHaveBeenCalled();
  });

  test("DELETE /:id — also gated (mutating endpoints were equally exposed)", async () => {
    mockRequireProjectOwnerOrAdmin.mockImplementation((_req, res) => res.status(403).json({ message: "Forbidden: not project owner" }));
    const res = await request(buildApp())
      .delete(`/projects/${PROJECT_ID}/actions/${ACTION_ID}`)
      .set("x-test-user", JSON.stringify(USER));

    expect(res.status).toBe(403);
    expect(mockDeleteAction).not.toHaveBeenCalled();
  });
});
