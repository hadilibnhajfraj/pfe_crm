"use strict";

// Routes /machines : rôles, validation et règles métier du service
// (repository simulé — aucune base).

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: jest.fn((req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    next();
  }),
}));

jest.mock("../src/modules/machines/repositories/machine.repository", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  countFiches: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const repo = require("../src/modules/machines/repositories/machine.repository");
const machineRoutes = require("../src/modules/machines/routes/machine.routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/machines", machineRoutes);
  return app;
}

const ADMIN = { sub: "a1", role: "admin" };
const LOGISTIQUE = { sub: "l1", role: "responsable_logistique_achat" };
const COMMERCIAL = { sub: "c1", role: "commercial" };

const ID = "11111111-1111-4111-8111-111111111111";

function machineRow(values = {}) {
  const row = {
    id: ID,
    code: "PROBAR-01",
    nom: "Machine PROBAR 1",
    typeMachine: "PROBAR",
    numero: 1,
    statut: "ACTIVE",
    description: null,
    ...values,
  };
  return { ...row, get: () => row, toJSON: () => row };
}

const as = (user) => ({ "x-test-user": JSON.stringify(user) });

beforeEach(() => {
  jest.clearAllMocks();
  repo.update.mockImplementation(async (instance, data) => machineRow({ ...instance.toJSON(), ...data }));
  repo.create.mockImplementation(async (data) => machineRow(data));
});

describe("accès par rôle", () => {
  test("401 sans authentification", async () => {
    const res = await request(buildApp()).get("/machines");
    expect(res.status).toBe(401);
  });

  test("la LISTE est consultable par tout utilisateur connecté (équipements des demandes de maintenance)", async () => {
    repo.findAll.mockResolvedValue([machineRow()]);
    const res = await request(buildApp()).get("/machines").set(as(COMMERCIAL));
    expect(res.status).toBe(200);
  });

  test("…mais le détail et toute écriture restent interdits hors espace industriel (commercial → 403)", async () => {
    const app = buildApp();
    expect((await request(app).get(`/machines/${ID}`).set(as(COMMERCIAL))).status).toBe(403);
    expect((await request(app).post("/machines").set(as(COMMERCIAL)).send({ typeMachine: "PROBAR", numero: 5 })).status).toBe(403);
    expect((await request(app).put(`/machines/${ID}/statut`).set(as(COMMERCIAL)).send({ statut: "INACTIVE" })).status).toBe(403);
  });

  test("responsable_logistique_achat peut consulter…", async () => {
    repo.findAll.mockResolvedValue([machineRow()]);
    const res = await request(buildApp()).get("/machines").set(as(LOGISTIQUE));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  test("…et gérer le référentiel (règle D) : créer, modifier, changer le statut", async () => {
    const app = buildApp();
    repo.findById.mockResolvedValue(machineRow());
    expect((await request(app).post("/machines").set(as(LOGISTIQUE)).send({ typeMachine: "PROBAR", numero: 5 })).status).toBe(201);
    expect((await request(app).put(`/machines/${ID}`).set(as(LOGISTIQUE)).send({ nom: "x" })).status).toBe(200);
    expect((await request(app).put(`/machines/${ID}/statut`).set(as(LOGISTIQUE)).send({ statut: "INACTIVE" })).status).toBe(200);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledTimes(2);
  });

  test("commercial_sedentaire et accueil : aucune gestion ni détail", async () => {
    const app = buildApp();
    for (const role of ["commercial_sedentaire", "accueil"]) {
      expect((await request(app).get(`/machines/${ID}`).set(as({ sub: "x", role }))).status).toBe(403);
      expect((await request(app).post("/machines").set(as({ sub: "x", role })).send({ typeMachine: "PROBAR", numero: 5 })).status).toBe(403);
    }
    expect(repo.create).not.toHaveBeenCalled();
  });

  test("G/H. ajout de PROBAR-05 puis PROMESH-05 par le responsable logistique (code et nom déduits)", async () => {
    const app = buildApp();
    const r1 = await request(app).post("/machines").set(as(LOGISTIQUE)).send({ typeMachine: "PROBAR", numero: 5 });
    const r2 = await request(app).post("/machines").set(as(LOGISTIQUE)).send({ typeMachine: "PROMESH", numero: 5 });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.data).toMatchObject({ code: "PROBAR-05", typeMachine: "PROBAR", numero: 5, statut: "ACTIVE" });
    expect(r2.body.data).toMatchObject({ code: "PROMESH-05", typeMachine: "PROMESH", numero: 5, statut: "ACTIVE" });
  });

  test("aucune route de suppression (une machine se désactive)", async () => {
    const res = await request(buildApp()).delete(`/machines/${ID}`).set(as(ADMIN));
    expect(res.status).toBe(404);
  });
});

describe("GET /machines", () => {
  test("filtres typeMachine/statut transmis (normalisés en majuscules)", async () => {
    repo.findAll.mockResolvedValue([]);
    await request(buildApp()).get("/machines?typeMachine=promesh&statut=active").set(as(ADMIN));
    expect(repo.findAll).toHaveBeenCalledWith({ typeMachine: "PROMESH", statut: "ACTIVE" });
  });

  test("400 sur un type inconnu", async () => {
    const res = await request(buildApp()).get("/machines?typeMachine=MELANGE").set(as(ADMIN));
    expect(res.status).toBe(400);
  });
});

describe("GET /machines/:id", () => {
  test("détail + nombre de fiches rattachées", async () => {
    repo.findById.mockResolvedValue(machineRow());
    repo.countFiches.mockResolvedValue({ production: 13, porPromesh: 0, recuperables: 1, total: 14 });
    const res = await request(buildApp()).get(`/machines/${ID}`).set(as(LOGISTIQUE));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ code: "PROBAR-01", fiches: { total: 14 } });
  });

  test("404 pour un id non-UUID (pas d'erreur PostgreSQL 500)", async () => {
    const res = await request(buildApp()).get("/machines/abc").set(as(ADMIN));
    expect(res.status).toBe(404);
    expect(repo.findById).not.toHaveBeenCalled();
  });
});

describe("POST /machines", () => {
  test("code et nom déduits du type et du numéro", async () => {
    const res = await request(buildApp()).post("/machines").set(as(ADMIN)).send({ typeMachine: "probar", numero: 5 });
    expect(res.status).toBe(201);
    expect(repo.create).toHaveBeenCalledWith({
      typeMachine: "PROBAR",
      numero: 5,
      code: "PROBAR-05",
      nom: "Machine PROBAR 5",
      statut: "ACTIVE",
      description: null,
    });
  });

  test("400 sans type ou sans numéro", async () => {
    const res = await request(buildApp()).post("/machines").set(as(ADMIN)).send({ nom: "X" });
    expect(res.status).toBe(400);
  });

  test("409 si le couple type/numéro existe déjà", async () => {
    repo.create.mockRejectedValue({ name: "SequelizeUniqueConstraintError", errors: [{ path: "typeMachine" }] });
    const res = await request(buildApp()).post("/machines").set(as(ADMIN)).send({ typeMachine: "PROBAR", numero: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/PROBAR n° 1 existe déjà/);
  });

  test("409 si le code est déjà utilisé", async () => {
    repo.create.mockRejectedValue({ name: "SequelizeUniqueConstraintError", errors: [{ path: "code" }] });
    const res = await request(buildApp()).post("/machines").set(as(ADMIN)).send({ typeMachine: "PROBAR", numero: 9, code: "PROBAR-01" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/PROBAR-01/);
  });
});

describe("PUT /machines/:id", () => {
  test("modification libre du nom et de la description", async () => {
    repo.findById.mockResolvedValue(machineRow());
    const res = await request(buildApp()).put(`/machines/${ID}`).set(as(ADMIN)).send({ nom: "Ligne PROBAR principale", description: "" });
    expect(res.status).toBe(200);
    expect(repo.update).toHaveBeenCalledWith(expect.anything(), { nom: "Ligne PROBAR principale", description: null });
    expect(repo.countFiches).not.toHaveBeenCalled();
  });

  test("changement de type autorisé si aucune fiche n'est rattachée", async () => {
    repo.findById.mockResolvedValue(machineRow());
    repo.countFiches.mockResolvedValue({ total: 0 });
    const res = await request(buildApp()).put(`/machines/${ID}`).set(as(ADMIN)).send({ typeMachine: "PROMESH" });
    expect(res.status).toBe(200);
    expect(res.body.data.typeMachine).toBe("PROMESH");
  });

  test("409 si le type/numéro change alors que des fiches y sont rattachées", async () => {
    repo.findById.mockResolvedValue(machineRow());
    repo.countFiches.mockResolvedValue({ total: 14 });
    const res = await request(buildApp()).put(`/machines/${ID}`).set(as(ADMIN)).send({ numero: 6 });
    expect(res.status).toBe(409);
    expect(repo.update).not.toHaveBeenCalled();
  });

  test("404 machine inexistante", async () => {
    repo.findById.mockResolvedValue(null);
    const res = await request(buildApp()).put(`/machines/${ID}`).set(as(ADMIN)).send({ nom: "x" });
    expect(res.status).toBe(404);
  });
});

describe("PUT /machines/:id/statut", () => {
  test("désactivation", async () => {
    repo.findById.mockResolvedValue(machineRow());
    const res = await request(buildApp()).put(`/machines/${ID}/statut`).set(as(ADMIN)).send({ statut: "INACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.data.statut).toBe("INACTIVE");
  });

  test("statut déjà en place → aucune écriture", async () => {
    repo.findById.mockResolvedValue(machineRow({ statut: "INACTIVE" }));
    const res = await request(buildApp()).put(`/machines/${ID}/statut`).set(as(ADMIN)).send({ statut: "inactive" });
    expect(res.status).toBe(200);
    expect(repo.update).not.toHaveBeenCalled();
  });

  test("400 statut invalide", async () => {
    const res = await request(buildApp()).put(`/machines/${ID}/statut`).set(as(ADMIN)).send({ statut: "EN_PANNE" });
    expect(res.status).toBe(400);
  });
});
