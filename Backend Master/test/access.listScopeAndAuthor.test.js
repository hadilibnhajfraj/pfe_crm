"use strict";

// Contrôle d'accès — audit de sécurité « fuites entre utilisateurs » :
//   1. listes pipeline / Kanban : un non-administrateur ne peut plus élargir
//      la liste avec ?userId=, ?ownerId= ou ?mine=false ;
//   2. création d'action : l'auteur vient du jeton, jamais du corps de la requête ;
//   3. GET /api/clients/all : réservé aux administrateurs.
// Aucune base de données : services et modèles sont remplacés.

require("dotenv").config();

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    return next();
  },
}));

const mockListProjects = jest.fn();
jest.mock("../src/modules/projects/services/project.service", () => ({
  listProjects: (...args) => mockListProjects(...args),
}));

const mockGetKanbanBoard = jest.fn();
jest.mock("../src/modules/kanban/services/kanban.service", () => ({
  getKanbanBoard: (...args) => mockGetKanbanBoard(...args),
  getStagesWithCount: jest.fn(),
  moveStageFast: jest.fn(),
}));

jest.mock("../src/modules/projects/policies/project.policy", () => ({
  requireOwnerOrAdmin: (req, res, next) => next(),
  requireProjectOwnerOrAdmin: (req, res, next) => next(),
  canEdit: jest.fn(),
}));

const mockModels = {
  Project: { findByPk: jest.fn(), findOne: jest.fn() },
  UserProject: { findOne: jest.fn(), findAll: jest.fn() },
  ProjectAction: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() },
  ProjectReminder: { create: jest.fn() },
};
jest.mock("../src/models/associations", () => mockModels);

jest.mock("../src/models/client.model", () => ({ findAll: jest.fn(), bulkCreate: jest.fn() }));

const request = require("supertest");
const express = require("express");
const kanbanRoutes = require("../src/modules/kanban/routes/kanban.routes");
const projectActionsRoutes = require("../src/routes/projectActions.routes");
const actionController = require("../src/controllers/projectAction.controller");
const clientRoutes = require("../src/routes/client.routes");
const Client = require("../src/models/client.model");
const { scopeListQuery } = require("../src/modules/projects/policies/projectAccess.policy");

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const P_MINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const P_OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const NON_ADMINS = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat"];
const ADMINS = ["admin", "superadmin", "superadmin2"];
const as = (role, sub = ME) => JSON.stringify({ sub, role });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/pipeline", kanbanRoutes);
  app.use("/projetactions", projectActionsRoutes);
  app.use("/api/clients", clientRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockListProjects.mockResolvedValue({ data: [], stats: {} });
  mockGetKanbanBoard.mockResolvedValue([]);
  mockModels.Project.findByPk.mockImplementation(async (id) => (id === P_MINE ? { id, ownerId: ME } : id === P_OTHER ? { id, ownerId: OTHER } : null));
  mockModels.UserProject.findOne.mockResolvedValue(null);
  mockModels.ProjectAction.create.mockResolvedValue({ id: "act-1" });
  mockModels.ProjectAction.findByPk.mockResolvedValue({ id: "act-1" });
  Client.findAll.mockResolvedValue([]);
});

describe("Liste pipeline / Kanban — filtres de périmètre envoyés par le client", () => {
  test.each(NON_ADMINS)("%s : ?userId, ?ownerId et ?mine=false sont écartés, « mes projets » est imposé", async (role) => {
    const res = await request(buildApp())
      .get(`/pipeline/projects?userId=${OTHER}&ownerId=${OTHER}&mine=false&myProjects=false&search=abc`)
      .set("x-test-user", as(role));
    expect(res.status).toBe(200);
    const [query, authUserId] = mockListProjects.mock.calls[0];
    expect(query).toEqual({ search: "abc", mine: "true" });
    expect(authUserId).toBe(ME);
  });

  test.each(ADMINS)("%s : filtres transmis tels quels", async (role) => {
    await request(buildApp()).get(`/pipeline/projects?userId=${OTHER}&mine=false`).set("x-test-user", as(role));
    expect(mockListProjects.mock.calls[0][0]).toEqual({ userId: OTHER, mine: "false" });
  });

  test.each(NON_ADMINS)("%s : tableau Kanban limité à ses projets même avec ?mine=false", async (role) => {
    await request(buildApp()).get("/pipeline/kanban?mine=false").set("x-test-user", as(role));
    expect(mockGetKanbanBoard.mock.calls[0][0]).toMatchObject({ mine: "true", userId: ME });
  });

  test.each(ADMINS)("%s : tableau Kanban global possible", async (role) => {
    await request(buildApp()).get("/pipeline/kanban?mine=false").set("x-test-user", as(role));
    expect(mockGetKanbanBoard.mock.calls[0][0]).toMatchObject({ mine: "false" });
  });

  test("scopeListQuery (utilisée aussi par GET /projects/pipeline) ne modifie pas l'objet reçu", () => {
    const query = { userId: OTHER, statut: "Prospect" };
    expect(scopeListQuery(query, { sub: ME, role: "commercial" })).toEqual({ statut: "Prospect", mine: "true" });
    expect(query).toEqual({ userId: OTHER, statut: "Prospect" });
    expect(scopeListQuery(query, { sub: ME, role: "admin" })).toBe(query);
  });

  test("sans jeton → 401", async () => {
    expect((await request(buildApp()).get("/pipeline/projects")).status).toBe(401);
    expect(mockListProjects).not.toHaveBeenCalled();
  });
});

describe("Création d'action de projet (POST /projetactions/projects/:projectId/actions)", () => {
  const res = () => {
    const r = { statusCode: 200, body: null };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };

  test("l'auteur est celui du jeton, même si le corps en désigne un autre", async () => {
    const out = res();
    await actionController.createAction(
      { params: { projectId: P_MINE }, user: { sub: ME, role: "commercial" }, body: { createdBy: OTHER, typeAction: "Visite", dateAction: "2026-09-01" } },
      out
    );
    expect(out.statusCode).toBe(201);
    expect(mockModels.ProjectAction.create.mock.calls[0][0].createdBy).toBe(ME);
  });

  test.each(NON_ADMINS)("%s ne crée pas d'action sur le projet d'un autre → 403", async (role) => {
    const r = await request(buildApp())
      .post(`/projetactions/projects/${P_OTHER}/actions`)
      .set("x-test-user", as(role))
      .send({ typeAction: "Visite", dateAction: "2026-09-01" });
    expect(r.status).toBe(403);
    expect(mockModels.ProjectAction.create).not.toHaveBeenCalled();
  });

  test("projet inexistant → 404", async () => {
    const r = await request(buildApp())
      .post("/projetactions/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9/actions")
      .set("x-test-user", as("commercial"))
      .send({ typeAction: "Visite" });
    expect(r.status).toBe(404);
  });

  test("le propriétaire franchit le contrôle d'accès", async () => {
    const r = await request(buildApp())
      .post(`/projetactions/projects/${P_MINE}/actions`)
      .set("x-test-user", as("commercial"))
      .send({ typeAction: "Visite", dateAction: "2026-09-01" });
    expect([401, 403, 404]).not.toContain(r.status);
  });

  test("sans jeton → 401", async () => {
    expect((await request(buildApp()).post(`/projetactions/projects/${P_MINE}/actions`).send({})).status).toBe(401);
  });
});

describe("GET /api/clients/all — liste complète réservée aux administrateurs", () => {
  test("sans jeton → 401", async () => {
    expect((await request(buildApp()).get("/api/clients/all")).status).toBe(401);
    expect(Client.findAll).not.toHaveBeenCalled();
  });

  test.each(NON_ADMINS)("%s → 403, aucune lecture", async (role) => {
    expect((await request(buildApp()).get("/api/clients/all").set("x-test-user", as(role))).status).toBe(403);
    expect(Client.findAll).not.toHaveBeenCalled();
  });

  test.each(ADMINS)("%s → 200", async (role) => {
    expect((await request(buildApp()).get("/api/clients/all").set("x-test-user", as(role))).status).toBe(200);
    expect(Client.findAll).toHaveBeenCalledTimes(1);
  });
});
