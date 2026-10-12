"use strict";

require("dotenv").config();

// Règles A (visibilité) et B (affectation) des contacts commerciaux —
// vocabulaire des rôles v2. Modèles réels (définitions Sequelize), méthodes
// d'accès aux données simulées : aucune requête réelle.

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: jest.fn((req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    next();
  }),
}));

const request = require("supertest");
const express = require("express");
const { Op } = require("sequelize");
const CommercialContact = require("../src/models/CommercialContact");
const CommercialContactRelance = require("../src/models/CommercialContactRelance");
const User = require("../src/models/User");
const routes = require("../src/routes/commercial_contacts.routes");
const { isCommercialEligibleRole, NON_COMMERCIAL_ROLES } = require("../src/constants/commercialRoles");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/commercial-contacts", routes);
  return app;
}

const as = (user) => ({ "x-test-user": JSON.stringify(user) });
const SEDENTAIRE = { sub: "sed-1", role: "commercial_sedentaire" };
const COMMERCIAL = { sub: "com-1", role: "commercial" };
const ADMIN = { sub: "adm-1", role: "superadmin" };
const ACCUEIL = { sub: "acc-1", role: "accueil" };

let findAll;
let update;
let findOneUser;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  findAll = jest.spyOn(CommercialContact, "findAll").mockResolvedValue([]);
  update = jest.spyOn(CommercialContact, "update").mockResolvedValue([2]);
  jest.spyOn(CommercialContactRelance, "findAll").mockResolvedValue([{ commercialContactId: "ct-relance" }]);
  findOneUser = jest.spyOn(User, "findOne");
});

// Clés du WHERE effectivement passé à CommercialContact.findAll.
function scopeOf(call) {
  const where = call[0].where;
  const and = where[Op.and] || [];
  return and.find((c) => c[Op.or]) || null;
}

describe("Règle A — GET /commercial-contacts (visibilité)", () => {
  test("commercial_sedentaire : vue complète (aucun filtre de périmètre)", async () => {
    const res = await request(buildApp()).get("/commercial-contacts").set(as(SEDENTAIRE));
    expect(res.status).toBe(200);
    expect(scopeOf(findAll.mock.calls[0])).toBeNull();
  });

  test("commercial : uniquement ses contacts — créés, affectés (commercialId) ou suivis via une relance", async () => {
    const res = await request(buildApp()).get("/commercial-contacts").set(as(COMMERCIAL));
    expect(res.status).toBe(200);
    const scope = scopeOf(findAll.mock.calls[0]);
    expect(scope[Op.or]).toEqual([
      { createdBy: "com-1" },
      { commercialId: "com-1" },
      { id: { [Op.in]: ["ct-relance"] } },
    ]);
  });

  test("administrateurs et accueil : vue complète inchangée", async () => {
    for (const u of [ADMIN, ACCUEIL]) {
      findAll.mockClear();
      await request(buildApp()).get("/commercial-contacts").set(as(u));
      expect(scopeOf(findAll.mock.calls[0])).toBeNull();
    }
  });
});

describe("Règle B — POST /commercial-contacts/assign (affectation)", () => {
  const body = { contactIds: ["ct-1", "ct-2"], commercialId: "yassine" };

  test("commercial_sedentaire affecte à un commercial actif : commercialId = destinataire, assignedBy = auteur, assignedAt = date", async () => {
    findOneUser.mockResolvedValue({ id: "yassine", role: "commercial", isActive: true });
    const res = await request(buildApp()).post("/commercial-contacts/assign").set(as(SEDENTAIRE)).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, updatedCount: 2, requested: 2 });
    const [values, options] = update.mock.calls[0];
    expect(values.commercialId).toBe("yassine");
    expect(values.assignedBy).toBe("sed-1");
    expect(values.assignedAt).toBeInstanceOf(Date);
    expect(values.assignedBy).not.toBe(values.commercialId);
    expect(options.where.id[Op.in]).toEqual(["ct-1", "ct-2"]);
  });

  test("un administrateur peut aussi affecter (assignedBy = l'administrateur)", async () => {
    findOneUser.mockResolvedValue({ id: "yassine", role: "commercial", isActive: true });
    const res = await request(buildApp()).post("/commercial-contacts/assign").set(as(ADMIN)).send(body);
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].assignedBy).toBe("adm-1");
  });

  test("impossible d'affecter à un commercial_sedentaire (400, aucune écriture)", async () => {
    findOneUser.mockResolvedValue({ id: "autre-sed", role: "commercial_sedentaire", isActive: true });
    const res = await request(buildApp()).post("/commercial-contacts/assign").set(as(SEDENTAIRE)).send({ ...body, commercialId: "autre-sed" });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  test("impossible d'affecter à un commercial désactivé ou inexistant", async () => {
    findOneUser.mockResolvedValue({ id: "yassine", role: "commercial", isActive: false });
    expect((await request(buildApp()).post("/commercial-contacts/assign").set(as(SEDENTAIRE)).send(body)).status).toBe(400);
    findOneUser.mockResolvedValue(null);
    expect((await request(buildApp()).post("/commercial-contacts/assign").set(as(SEDENTAIRE)).send(body)).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  test("un commercial (terrain), l'accueil ou le RLA ne peuvent pas affecter (403)", async () => {
    for (const u of [COMMERCIAL, ACCUEIL, { sub: "rla", role: "responsable_logistique_achat" }]) {
      const res = await request(buildApp()).post("/commercial-contacts/assign").set(as(u)).send(body);
      expect(res.status).toBe(403);
    }
    expect(update).not.toHaveBeenCalled();
  });
});

describe("Règle A — accès à UN contact (détail, modification, suppression) : contrôle backend centralisé", () => {
  const CID = "11111111-1111-4111-8111-111111111111";
  let relanceCount;

  // Contact affecté à com-1, créé par le sédentaire sed-1.
  function contactRow(values = {}) {
    const row = {
      id: CID,
      createdBy: "sed-1",
      commercialId: "com-1",
      statut: "ok",
      ...values,
    };
    return {
      ...row,
      toJSON: () => row,
      update: jest.fn(async () => row),
      destroy: jest.fn(async () => {}),
    };
  }

  beforeEach(() => {
    relanceCount = jest.spyOn(CommercialContactRelance, "count").mockResolvedValue(0);
  });

  const OTHER_COMMERCIAL = { sub: "com-2", role: "commercial" };
  const RLA = { sub: "rla-1", role: "responsable_logistique_achat" };

  test("1. commercial consulte SON contact (affecté) → 200", async () => {
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(contactRow());
    const res = await request(buildApp()).get(`/commercial-contacts/${CID}`).set(as(COMMERCIAL));
    expect(res.status).toBe(200);
  });

  test("1bis. commercial consulte un contact qu'il suit via une relance → 200", async () => {
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(contactRow({ commercialId: "com-9" }));
    relanceCount.mockResolvedValue(1);
    const res = await request(buildApp()).get(`/commercial-contacts/${CID}`).set(as(COMMERCIAL));
    expect(res.status).toBe(200);
    expect(relanceCount).toHaveBeenCalledWith({ where: { commercialContactId: CID, commercialId: "com-1" } });
  });

  test("2. commercial consulte le contact d'un AUTRE commercial → 403", async () => {
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(contactRow());
    const res = await request(buildApp()).get(`/commercial-contacts/${CID}`).set(as(OTHER_COMMERCIAL));
    expect(res.status).toBe(403);
  });

  test("3. commercial_sedentaire consulte le contact → 200", async () => {
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(contactRow({ createdBy: "autre-sed" }));
    const res = await request(buildApp()).get(`/commercial-contacts/${CID}`).set(as(SEDENTAIRE));
    expect(res.status).toBe(200);
  });

  test("4. administrateur consulte le contact → 200", async () => {
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(contactRow());
    const res = await request(buildApp()).get(`/commercial-contacts/${CID}`).set(as(ADMIN));
    expect(res.status).toBe(200);
  });

  test("5. utilisateur non autorisé (responsable_logistique_achat) → 403, en détail comme en liste", async () => {
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(contactRow());
    expect((await request(buildApp()).get(`/commercial-contacts/${CID}`).set(as(RLA))).status).toBe(403);
    expect((await request(buildApp()).get("/commercial-contacts").set(as(RLA))).status).toBe(403);
    expect(findAll).not.toHaveBeenCalled();
  });

  test("contact inexistant ou identifiant invalide → 404 (jamais une erreur PostgreSQL)", async () => {
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(null);
    expect((await request(buildApp()).get(`/commercial-contacts/${CID}`).set(as(ADMIN))).status).toBe(404);
    expect((await request(buildApp()).get("/commercial-contacts/pas-un-uuid").set(as(ADMIN))).status).toBe(404);
  });

  test("E. modification (PUT) du contact d'un autre commercial → 403, aucune écriture", async () => {
    const row = contactRow();
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(row);
    const res = await request(buildApp()).put(`/commercial-contacts/${CID}`).set(as(OTHER_COMMERCIAL)).send({ nom: "X" });
    expect(res.status).toBe(403);
    expect(row.update).not.toHaveBeenCalled();
  });

  test("E. actions et relances d'un contact non autorisé → 403", async () => {
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(contactRow());
    const app = buildApp();
    expect((await request(app).get(`/commercial-contacts/${CID}/actions`).set(as(OTHER_COMMERCIAL))).status).toBe(403);
    expect((await request(app).post(`/commercial-contacts/${CID}/actions`).set(as(OTHER_COMMERCIAL)).send({})).status).toBe(403);
    expect((await request(app).post(`/commercial-contacts/${CID}/relances`).set(as(OTHER_COMMERCIAL)).send({})).status).toBe(403);
    expect((await request(app).put(`/commercial-contacts/${CID}/relances/r1`).set(as(OTHER_COMMERCIAL)).send({})).status).toBe(403);
  });

  test("suppression : un contact seulement affecté ne suffit pas (commercial → 403) ; sédentaire → 200", async () => {
    const row = contactRow();
    jest.spyOn(CommercialContact, "findByPk").mockResolvedValue(row);
    expect((await request(buildApp()).delete(`/commercial-contacts/${CID}`).set(as(COMMERCIAL))).status).toBe(403);
    expect(row.destroy).not.toHaveBeenCalled();
    expect((await request(buildApp()).delete(`/commercial-contacts/${CID}`).set(as(SEDENTAIRE))).status).toBe(200);
    expect(row.destroy).toHaveBeenCalled();
  });
});

describe("Éligibilité « Commercial » (destinataire d'affectation / de relance, GET /users/commercials)", () => {
  test("seul le rôle commercial est éligible", () => {
    expect(isCommercialEligibleRole("commercial")).toBe(true);
    for (const r of ["commercial_sedentaire", "accueil", "admin", "superadmin", "superadmin2", "responsable_logistique_achat"]) {
      expect(isCommercialEligibleRole(r)).toBe(false);
    }
    expect(NON_COMMERCIAL_ROLES).toContain("commercial_sedentaire");
  });
});
