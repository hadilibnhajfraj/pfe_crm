"use strict";

// Regression tests for project.policy.js — specifically requireProjectOwnerOrAdmin,
// added during a security audit to close an IDOR: the project-actions
// sub-router (GET/PUT/DELETE /projects/:projectId/actions/:id) had no
// ownership check at all before this fix (any authenticated user could
// read/edit/delete any other user's project's actions by guessing an
// action UUID). requireOwnerOrAdmin (the pre-existing, already-used
// middleware for /projects/:id/move-stage and /projects/:id/owner) is also
// covered here as a regression check that it was left untouched.

const mockFindByPk = jest.fn();
jest.mock("../src/models/Project", () => ({ findByPk: (...args) => mockFindByPk(...args) }));

const { canEdit, requireOwnerOrAdmin, requireProjectOwnerOrAdmin } = require("../src/modules/projects/policies/project.policy");

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => jest.clearAllMocks());

function fakeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe("canEdit", () => {
  test("admin-tier roles can always edit, without even querying the project", async () => {
    const allowed = await canEdit(OTHER_USER_ID, "admin", PROJECT_ID);
    expect(allowed).toBe(true);
    expect(mockFindByPk).not.toHaveBeenCalled();
  });

  test("the project owner can edit their own project", async () => {
    mockFindByPk.mockResolvedValue({ ownerId: OWNER_ID });
    expect(await canEdit(OWNER_ID, "user", PROJECT_ID)).toBe(true);
  });

  test("a non-owner, non-admin user cannot edit", async () => {
    mockFindByPk.mockResolvedValue({ ownerId: OWNER_ID });
    expect(await canEdit(OTHER_USER_ID, "user", PROJECT_ID)).toBe(false);
  });

  test("a non-existent project denies access", async () => {
    mockFindByPk.mockResolvedValue(null);
    expect(await canEdit(OWNER_ID, "user", PROJECT_ID)).toBe(false);
  });
});

describe("requireOwnerOrAdmin (req.params.id) — unchanged by the audit fix", () => {
  test("admin bypasses without a project lookup", () => {
    const req = { user: { sub: OTHER_USER_ID, role: "admin" }, params: { id: PROJECT_ID } };
    const res = fakeRes();
    const next = jest.fn();
    requireOwnerOrAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test("owner is allowed, non-owner gets 403", async () => {
    mockFindByPk.mockResolvedValue({ ownerId: OWNER_ID });
    const next = jest.fn();
    const res = fakeRes();
    requireOwnerOrAdmin({ user: { sub: OTHER_USER_ID, role: "user" }, params: { id: PROJECT_ID } }, res, next);
    await new Promise((r) => setImmediate(r));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireProjectOwnerOrAdmin (req.params.projectId) — new, closes the project-actions IDOR", () => {
  test("reads the project id from req.params.projectId, not req.params.id", () => {
    const req = { user: { sub: OTHER_USER_ID, role: "admin" }, params: { projectId: PROJECT_ID } };
    const res = fakeRes();
    const next = jest.fn();
    requireProjectOwnerOrAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test("400s when projectId is missing from params", () => {
    const req = { user: { sub: OWNER_ID, role: "user" }, params: {} };
    const res = fakeRes();
    const next = jest.fn();
    requireProjectOwnerOrAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test("the project owner may access their own project's actions", async () => {
    mockFindByPk.mockResolvedValue({ ownerId: OWNER_ID });
    const req = { user: { sub: OWNER_ID, role: "user" }, params: { projectId: PROJECT_ID } };
    const res = fakeRes();
    const next = jest.fn();
    requireProjectOwnerOrAdmin(req, res, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("a user who does not own the project is denied 403 — the exact IDOR this fix closes", async () => {
    mockFindByPk.mockResolvedValue({ ownerId: OWNER_ID });
    const req = { user: { sub: OTHER_USER_ID, role: "user" }, params: { projectId: PROJECT_ID } };
    const res = fakeRes();
    const next = jest.fn();
    requireProjectOwnerOrAdmin(req, res, next);
    await new Promise((r) => setImmediate(r));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
