"use strict";

require("dotenv").config();

// Règles C (création de projet) et E (administration des rôles) — vocabulaire
// des rôles v2. Aucune requête réelle : le contrôle de rôle intervient avant
// tout accès aux données (C) ou le modèle User est simulé (E).

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: jest.fn((req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    next();
  }),
}));

const request = require("supertest");
const express = require("express");
const User = require("../src/models/User");
const projectRoutes = require("../src/routes/projects.routes");
const adminRoutes = require("../src/routes/admin");
const userService = require("../src/services/user.service");

const as = (role) => ({ "x-test-user": JSON.stringify({ sub: `${role}-1`, role }) });

function app(path, routes) {
  const a = express();
  a.use(express.json());
  a.use(path, routes);
  return a;
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

describe("Règle C — POST /projects réservé au commercial (et aux administrateurs)", () => {
  test.each(["commercial_sedentaire", "accueil", "responsable_logistique_achat"])("%s → 403 (avant toute validation ou écriture)", async (role) => {
    const res = await request(app("/projects", projectRoutes)).post("/projects").set(as(role)).send({});
    expect(res.status).toBe(403);
  });

  test.each(["commercial", "admin", "superadmin", "superadmin2"])("%s → franchit le contrôle de rôle (payload vide → 400 de validation, jamais 403)", async (role) => {
    const res = await request(app("/projects", projectRoutes)).post("/projects").set(as(role)).send({});
    expect(res.status).toBe(400);
  });
});

describe("Règle E — PUT /admin/users/:id/role (7 rôles réels, \"user\" refusé)", () => {
  function mockUser() {
    const user = { id: "u1", email: "u1@example.com", role: "commercial", update: jest.fn(async (d) => Object.assign(user, d)) };
    jest.spyOn(User, "findByPk").mockResolvedValue(user);
    return user;
  }

  test.each(["commercial", "commercial_sedentaire", "accueil", "admin", "superadmin", "responsable_logistique_achat", "superadmin2"])(
    "superadmin attribue %s",
    async (role) => {
      const user = mockUser();
      const res = await request(app("/admin", adminRoutes)).put("/admin/users/u1/role").set(as("superadmin")).send({ role });
      expect(res.status).toBe(200);
      expect(user.update).toHaveBeenCalledWith({ role });
    }
  );

  test("\"user\" n'est plus un rôle attribuable (400)", async () => {
    const user = mockUser();
    const res = await request(app("/admin", adminRoutes)).put("/admin/users/u1/role").set(as("superadmin")).send({ role: "user" });
    expect(res.status).toBe(400);
    expect(user.update).not.toHaveBeenCalled();
  });

  test("un admin (non superadmin) ne peut pas changer un rôle (403, règle existante inchangée)", async () => {
    mockUser();
    const res = await request(app("/admin", adminRoutes)).put("/admin/users/u1/role").set(as("admin")).send({ role: "commercial" });
    expect(res.status).toBe(403);
  });

  test("user.service.setUserRole (utilisé par l'outil Copilot set_user_role) suit la même liste", async () => {
    mockUser();
    await expect(userService.setUserRole("u1", "commercial_sedentaire")).resolves.toMatchObject({ role: "commercial_sedentaire" });
    await expect(userService.setUserRole("u1", "user")).rejects.toMatchObject({ status: 400 });
  });
});
