"use strict";

// Contrôle d'accès par périmètre sur les routes historiques des projets
// (src/routes/projects.routes.js) — audit de sécurité « fuites entre
// utilisateurs ». Avant correction, tout utilisateur authentifié pouvait :
//   - lister tous les projets (GET /projects), ou ceux d'un autre avec ?userId= ;
//   - lire devis, bons de commande et commentaires de n'importe quel projet ;
//   - supprimer ou modifier l'action ou le rappel d'un projet qui n'est pas le sien ;
//   - lire la liste de tous les utilisateurs avec leurs projets.
//
// Aucune base de données : les modèles Sequelize réels sont chargés mais
// toutes leurs méthodes d'accès sont remplacées (jest.spyOn). La politique
// projectAccess.policy.js est exécutée réellement.

require("dotenv").config();

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    return next();
  },
}));

const request = require("supertest");
const express = require("express");
const { Op } = require("sequelize");
const { Project, UserProject, User, ProjectAction, ProjectReminder, ProjectDevis, ProjectComment } = require("../src/models/associations");
const projectRoutes = require("../src/routes/projects.routes");

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const P_MINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const P_OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const P_SHARED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"; // partagé avec ME en lecture seule
const P_NONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9";
const A_MINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const A_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const A_NONE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9";
const R_OTHER = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

const NON_ADMINS = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat"];
const ADMINS = ["admin", "superadmin", "superadmin2"];

const PROJECTS = { [P_MINE]: ME, [P_OTHER]: OTHER, [P_SHARED]: OTHER };
const destroyed = { action: jest.fn(), reminder: jest.fn() };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/projects", projectRoutes);
  return app;
}
const as = (role, sub = ME) => JSON.stringify({ sub, role, email: `${role}@test.local` });
const get = (path, role, sub) => request(buildApp()).get(path).set("x-test-user", as(role, sub));
const del = (path, role) => request(buildApp()).delete(path).set("x-test-user", as(role));

// Périmètre posé par la politique : soit directement dans where, soit sous [Op.and].
const scopeIn = (where) => (where && where[Op.and] ? where[Op.and][0] : where);
function expectScopedToMe(where) {
  const scope = scopeIn(where);
  expect(scope[Op.or]).toEqual([{ ownerId: ME }, { id: { [Op.in]: [P_SHARED] } }]);
}

beforeEach(() => {
  jest.restoreAllMocks();
  destroyed.action.mockReset();
  destroyed.reminder.mockReset();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});

  jest.spyOn(Project, "findByPk").mockImplementation(async (id) => (PROJECTS[id] ? { id, ownerId: PROJECTS[id] } : null));
  jest.spyOn(Project, "findAll").mockResolvedValue([]);
  jest.spyOn(Project, "findAndCountAll").mockResolvedValue({ count: 0, rows: [] });
  jest.spyOn(Project, "count").mockResolvedValue(0);
  jest.spyOn(UserProject, "findAll").mockImplementation(async ({ where } = {}) => (where && where.userId === ME ? [{ projectId: P_SHARED }] : []));
  jest.spyOn(UserProject, "findOne").mockImplementation(async ({ where } = {}) =>
    where && where.userId === ME && where.projectId === P_SHARED ? { permission: "viewer" } : null
  );
  jest.spyOn(User, "findAll").mockResolvedValue([]);
  jest.spyOn(User, "findByPk").mockImplementation(async (id) => ({ id, email: "u@test.local", Projects: [] }));
  jest.spyOn(ProjectDevis, "findAll").mockResolvedValue([]);
  jest.spyOn(ProjectComment, "findAll").mockResolvedValue([]);
  jest.spyOn(ProjectAction, "findByPk").mockImplementation(async (id) => {
    if (id === A_MINE) return { id, projectId: P_MINE, destroy: destroyed.action };
    if (id === A_OTHER) return { id, projectId: P_OTHER, destroy: destroyed.action };
    return null;
  });
  jest.spyOn(ProjectReminder, "findByPk").mockImplementation(async (id) => (id === R_OTHER ? { id, projectId: P_OTHER, destroy: destroyed.reminder } : null));
  jest.spyOn(ProjectReminder, "findAll").mockResolvedValue([]);
  jest.spyOn(ProjectReminder, "destroy").mockResolvedValue(1);
  jest.spyOn(ProjectReminder, "create").mockResolvedValue({ id: "r-new" });
});

describe("Sans jeton → 401 (aucune route de données n'est publique)", () => {
  test.each([
    "/projects",
    "/projects/applicateur",
    "/projects/revendeur",
    "/projects/calendar",
    "/projects/projectsusers",
    "/projects/dashboard/commercial",
    "/projects/kpi/projects-per-user-summary",
    "/projects/reminders/upcoming",
    `/projects/${P_OTHER}/devis`,
    `/projects/${P_OTHER}/comments`,
    `/projects/${P_OTHER}/bondecommande`,
  ])("GET %s", async (path) => {
    const res = await request(buildApp()).get(path);
    expect(res.status).toBe(401);
    expect(Project.findAll).not.toHaveBeenCalled();
    expect(Project.findAndCountAll).not.toHaveBeenCalled();
  });
});

describe("GET /projects — la liste est limitée au périmètre, ?userId= ne l'élargit pas", () => {
  test.each(NON_ADMINS)("%s avec ?userId=<autre> : filtre ignoré, périmètre imposé (liste ET statistiques)", async (role) => {
    const res = await get(`/projects?userId=${OTHER}`, role);
    expect(res.status).toBe(200);
    const { where } = Project.findAndCountAll.mock.calls[0][0];
    expect(where.ownerId).toBeUndefined();
    expectScopedToMe(where);
    expect(Project.count).toHaveBeenCalled();
    for (const [args] of Project.count.mock.calls) expectScopedToMe(args.where);
  });

  test.each(NON_ADMINS)("%s sans paramètre : jamais « tous les projets »", async (role) => {
    await get("/projects", role);
    expectScopedToMe(Project.findAndCountAll.mock.calls[0][0].where);
  });

  test.each(ADMINS)("%s : vue globale, et ?userId= filtre bien sur l'utilisateur demandé", async (role) => {
    await get("/projects", role);
    const all = Project.findAndCountAll.mock.calls[0][0].where;
    expect(all.ownerId).toBeUndefined();
    expect(all[Op.and]).toBeUndefined();

    await get(`/projects?userId=${OTHER}`, role);
    expect(Project.findAndCountAll.mock.calls[1][0].where.ownerId).toBe(OTHER);
  });
});

describe("Listes par modèle, calendrier, projets-utilisateurs : même périmètre", () => {
  const LISTS = ["/projects/revendeur", "/projects/applicateur", "/projects/calendar", "/projects/projectsusers"];
  const lastWhere = () => {
    const call = Project.findAll.mock.calls[0] || Project.findAndCountAll.mock.calls[0];
    return call[0].where;
  };

  test.each(LISTS.flatMap((p) => NON_ADMINS.map((r) => [r, p])))("%s → GET %s : périmètre imposé", async (role, path) => {
    const res = await get(path, role);
    expect(res.status).toBe(200);
    expectScopedToMe(lastWhere());
  });

  test.each(LISTS.flatMap((p) => ADMINS.map((r) => [r, p])))("%s → GET %s : aucune restriction", async (role, path) => {
    const res = await get(path, role);
    expect(res.status).toBe(200);
    expect(scopeIn(lastWhere())[Op.or]).toBeUndefined();
  });
});

describe("Sous-ressources d'un projet (devis, commentaires, bons de commande)", () => {
  const SUBS = ["devis", "comments", "bondecommande"];

  test.each(SUBS.flatMap((s) => NON_ADMINS.map((r) => [r, s])))("%s ne lit pas /%s d'un projet hors périmètre → 403", async (role, sub) => {
    const res = await get(`/projects/${P_OTHER}/${sub}`, role);
    expect(res.status).toBe(403);
    expect(ProjectDevis.findAll).not.toHaveBeenCalled();
    expect(ProjectComment.findAll).not.toHaveBeenCalled();
  });

  test.each(NON_ADMINS)("%s lit les devis de SON projet → 200", async (role) => {
    expect((await get(`/projects/${P_MINE}/devis`, role)).status).toBe(200);
  });

  test.each(NON_ADMINS)("%s lit les devis d'un projet partagé avec lui → 200", async (role) => {
    expect((await get(`/projects/${P_SHARED}/devis`, role)).status).toBe(200);
  });

  test.each(NON_ADMINS)("%s : projet inexistant → 404", async (role) => {
    expect((await get(`/projects/${P_NONE}/devis`, role)).status).toBe(404);
  });

  test.each(ADMINS)("%s lit les devis de n'importe quel projet → 200", async (role) => {
    expect((await get(`/projects/${P_OTHER}/devis`, role)).status).toBe(200);
  });

  test("le périmètre suit le jeton, pas l'URL : l'autre utilisateur lit son projet, pas le mien", async () => {
    expect((await get(`/projects/${P_OTHER}/devis`, "commercial", OTHER)).status).toBe(200);
    expect((await get(`/projects/${P_MINE}/devis`, "commercial", OTHER)).status).toBe(403);
  });
});

describe("Écritures : un partage en lecture seule ne permet pas de modifier", () => {
  const post = (path, role) => request(buildApp()).post(path).set("x-test-user", as(role)).send({ dateRelance: "2026-09-30", message: "x" });

  test.each(NON_ADMINS)("%s ne crée pas de rappel sur un projet hors périmètre → 403", async (role) => {
    expect((await post(`/projects/${P_OTHER}/reminders`, role)).status).toBe(403);
    expect(ProjectReminder.create).not.toHaveBeenCalled();
  });

  test("partage « viewer » : lecture oui, création de rappel non → 403", async () => {
    expect((await post(`/projects/${P_SHARED}/reminders`, "commercial")).status).toBe(403);
    expect(ProjectReminder.create).not.toHaveBeenCalled();
  });

  test("propriétaire : création de rappel autorisée → 201", async () => {
    expect((await post(`/projects/${P_MINE}/reminders`, "commercial")).status).toBe(201);
  });
});

describe("Actions et rappels désignés par leur identifiant", () => {
  test.each(NON_ADMINS)("%s ne supprime pas l'action d'un projet hors périmètre → 403, rien n'est supprimé", async (role) => {
    const res = await del(`/projects/actions/${A_OTHER}`, role);
    expect(res.status).toBe(403);
    expect(destroyed.action).not.toHaveBeenCalled();
    expect(ProjectReminder.destroy).not.toHaveBeenCalled();
  });

  test.each(NON_ADMINS)("%s : action inexistante → 404", async (role) => {
    expect((await del(`/projects/actions/${A_NONE}`, role)).status).toBe(404);
  });

  test("le propriétaire supprime l'action de son projet → 200", async () => {
    expect((await del(`/projects/actions/${A_MINE}`, "commercial")).status).toBe(200);
    expect(destroyed.action).toHaveBeenCalledTimes(1);
  });

  test.each(ADMINS)("%s supprime l'action de n'importe quel projet → 200", async (role) => {
    expect((await del(`/projects/actions/${A_OTHER}`, role)).status).toBe(200);
  });

  test.each(NON_ADMINS)("%s ne supprime pas le rappel d'un projet hors périmètre → 403", async (role) => {
    expect((await del(`/projects/reminders/${R_OTHER}`, role)).status).toBe(403);
    expect(destroyed.reminder).not.toHaveBeenCalled();
  });

  test.each(NON_ADMINS)("%s ne pose pas de rappel sur l'action d'un autre → 403", async (role) => {
    const res = await request(buildApp()).post(`/projects/actions/${A_OTHER}/reminders`).set("x-test-user", as(role)).send({ dateRelance: "2026-09-30" });
    expect(res.status).toBe(403);
    expect(ProjectReminder.create).not.toHaveBeenCalled();
  });
});

describe("Vues transverses sur les utilisateurs", () => {
  test.each(NON_ADMINS)("%s n'obtient pas la liste des utilisateurs et de leurs projets → 403", async (role) => {
    expect((await get("/projects/dashboard/commercial", role)).status).toBe(403);
    expect(User.findAll).not.toHaveBeenCalled();
  });

  test.each(ADMINS)("%s y accède → 200", async (role) => {
    expect((await get("/projects/dashboard/commercial", role)).status).toBe(200);
  });

  const STATS = ["daily", "weekly", "monthly", "summary"].map((p) => `/projects/kpi/projects-per-user-${p}`);
  test.each(STATS.flatMap((p) => ["commercial", "commercial_sedentaire", "responsable_logistique_achat"].map((r) => [r, p])))(
    "%s → GET %s → 403",
    async (role, path) => {
      expect((await get(path, role)).status).toBe(403);
    }
  );

  test.each([...ADMINS, "accueil"])("%s franchit le contrôle de rôle des statistiques par utilisateur", async (role) => {
    const res = await get("/projects/kpi/projects-per-user-summary", role);
    expect([401, 403]).not.toContain(res.status);
  });

  test.each(NON_ADMINS)("%s ne lit pas les projets d'un AUTRE utilisateur (GET /projects/:userId/projects) → 403", async (role) => {
    expect((await get(`/projects/${OTHER}/projects`, role)).status).toBe(403);
    expect(User.findByPk).not.toHaveBeenCalled();
  });

  test.each(NON_ADMINS)("%s lit ses propres projets par cette route → 200", async (role) => {
    expect((await get(`/projects/${ME}/projects`, role)).status).toBe(200);
  });

  test.each(ADMINS)("%s lit les projets de n'importe quel utilisateur → 200", async (role) => {
    expect((await get(`/projects/${OTHER}/projects`, role)).status).toBe(200);
  });
});

describe("GET /projects/reminders/upcoming", () => {
  test.each(NON_ADMINS)("%s : rappels limités aux projets de son périmètre", async (role) => {
    const res = await get("/projects/reminders/upcoming", role);
    expect(res.status).toBe(200);
    const [include] = ProjectReminder.findAll.mock.calls[0][0].include;
    expect(include.required).toBe(true);
    expectScopedToMe(include.where);
  });

  test.each(ADMINS)("%s : tous les rappels", async (role) => {
    await get("/projects/reminders/upcoming", role);
    expect(ProjectReminder.findAll.mock.calls[0][0].include).toEqual([Project]);
  });
});
