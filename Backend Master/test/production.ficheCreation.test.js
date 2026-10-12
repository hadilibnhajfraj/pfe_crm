"use strict";

// Création et validation des fiches de production, PROMESH (/por-promesh) et
// PROBAR (/industrial-records) : avertissement de fiche existante, brouillon
// vide, date de création autour de minuit, cohérence des heures à la
// validation. Routes réelles, dépôts simulés — aucune base.

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: jest.fn((req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    next();
  }),
}));

jest.mock("../src/modules/por-promesh/repositories/porPromesh.repository", () => ({
  findAll: jest.fn(),
  count: jest.fn(),
  findForAggregates: jest.fn(),
  dateRangeWhere: jest.fn(() => ({})),
  searchClause: jest.fn(() => ({})),
  findById: jest.fn(),
  findBareById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
  replaceChildren: jest.fn(),
  createAttachment: jest.fn(),
  findProcessControl: jest.fn(),
}));

jest.mock("../src/modules/industrial-records/repositories/industrialRecord.repository", () => ({
  findAll: jest.fn(),
  count: jest.fn(),
  findById: jest.fn(),
  findBareById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const promeshRepo = require("../src/modules/por-promesh/repositories/porPromesh.repository");
const probarRepo = require("../src/modules/industrial-records/repositories/industrialRecord.repository");
const promeshSvc = require("../src/modules/por-promesh/services/porPromesh.service");
const probarSvc = require("../src/modules/industrial-records/services/industrialRecord.service");
const User = require("../src/models/User");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/por-promesh", require("../src/modules/por-promesh/routes/porPromesh.routes"));
  app.use("/industrial-records", require("../src/modules/industrial-records/routes/industrialRecord.routes"));
  return app;
}

const ADMIN = { sub: "a1", role: "admin", email: "admin@test.local" };
const LOGISTIQUE = { sub: "l1", role: "responsable_logistique_achat", email: "logistique@test.local" };
const COMMERCIAL = { sub: "c1", role: "commercial", email: "commercial@test.local" };
const as = (user) => ({ "x-test-user": JSON.stringify(user) });

// Fiche PROMESH telle que le dépôt la rend (get({ plain }) comme Sequelize).
function promeshFiche(overrides = {}) {
  const plain = {
    id: "p-1",
    sequenceNumber: 200,
    dateProduction: "2026-07-17",
    heureDebut: "08:00:00",
    heureFin: "08:00:00",
    machine: "1",
    machineId: "m-1",
    poste: "matin",
    operateur: "najeh",
    createdBy: "l1",
    createdAt: new Date("2026-07-17T07:00:00Z"),
    updatedAt: new Date("2026-07-17T07:00:00Z"),
    status: "BROUILLON",
    isLocked: false,
    validatedAt: null,
    productionM2: null,
    conformite: null,
    observationsGenerales: "",
    responsable1: null,
    diametreMaille1: "",
    air: null,
    controlesQualite: [],
    arretsMachine: [],
    consommations: [],
    processControl: [],
    nonConformites: [],
    attachments: [],
    ...overrides,
  };
  return { ...plain, get: () => plain };
}

function probarFiche(overrides = {}) {
  const plain = {
    id: "b-1",
    module: "probar",
    machine: "1",
    machineId: "m-9",
    poste: "matin",
    dateFiche: "2026-07-17",
    operateur: null,
    quantiteProduite: null,
    statutQualite: null,
    description: "{}",
    observations: "",
    statut: "enregistree",
    createdBy: "l1",
    createdAt: new Date("2026-07-17T07:00:00Z"),
    ...overrides,
  };
  return { ...plain, get: () => plain };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
describe("PROMESH — GET /por-promesh/existing (avertissement avant création)", () => {
  test("401 sans jeton, 403 pour un rôle sans accès à la production", async () => {
    const app = buildApp();
    expect((await request(app).get("/por-promesh/existing?machine=1&poste=matin")).status).toBe(401);
    expect((await request(app).get("/por-promesh/existing?machine=1&poste=matin").set(as(COMMERCIAL))).status).toBe(403);
    expect(promeshRepo.findAll).not.toHaveBeenCalled();
  });

  test("400 si machine ou poste manquent, ou si la date est mal formée", async () => {
    const app = buildApp();
    for (const query of ["poste=matin", "machine=1", "machine=1&poste=soir", "machine=1&poste=matin&date=17/07/2026"]) {
      expect((await request(app).get(`/por-promesh/existing?${query}`).set(as(ADMIN))).status).toBe(400);
    }
  });

  test("aucune fiche : liste vide, rien à reprendre", async () => {
    promeshRepo.findAll.mockResolvedValue([]);
    const res = await request(buildApp()).get("/por-promesh/existing?machine=1&poste=matin&date=2026-07-17").set(as(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ machine: "1", poste: "matin", date: "2026-07-17", count: 0, emptyDraftId: null, fiches: [] });
  });

  test("la recherche porte sur la même machine, la même date et le même poste", async () => {
    promeshRepo.findAll.mockResolvedValue([]);
    await request(buildApp()).get("/por-promesh/existing?machine=2&poste=nuit&date=2026-07-17").set(as(ADMIN));
    expect(promeshRepo.findAll.mock.calls[0][0]).toEqual({ machine: "2", poste: "nuit", dateProduction: "2026-07-17" });
  });

  test("sans date : aujourd'hui dans le fuseau métier, y compris juste après minuit", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval"] }).setSystemTime(new Date("2026-07-17T23:04:31Z"));
    promeshRepo.findAll.mockResolvedValue([]);
    const res = await request(buildApp()).get("/por-promesh/existing?machine=1&poste=nuit").set(as(ADMIN));
    expect(res.body.data.date).toBe("2026-07-18");
    expect(promeshRepo.findAll.mock.calls[0][0].dateProduction).toBe("2026-07-18");
  });

  test("responsable_logistique_achat ne voit que ses propres fiches (même règle que la liste)", async () => {
    promeshRepo.findAll.mockResolvedValue([]);
    await request(buildApp()).get("/por-promesh/existing?machine=1&poste=matin&date=2026-07-17").set(as(LOGISTIQUE));
    expect(promeshRepo.findAll.mock.calls[0][0]).toMatchObject({ createdBy: "l1" });
  });

  test("plusieurs fiches légitimes : toutes signalées, aucune n'est un brouillon vide", async () => {
    promeshRepo.findAll.mockResolvedValue([
      promeshFiche({ id: "p-54", sequenceNumber: 54, status: "VALIDE", isLocked: true, productionM2: "2500.00", conformite: "conforme" }),
      promeshFiche({ id: "p-56", sequenceNumber: 56, status: "VALIDE", isLocked: true, productionM2: "4500.00", heureFin: "11:00:00" }),
    ]);
    const res = await request(buildApp()).get("/por-promesh/existing?machine=1&poste=matin&date=2026-06-29").set(as(ADMIN));
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.emptyDraftId).toBeNull();
    expect(res.body.data.fiches.map((f) => f.isEmptyDraft)).toEqual([false, false]);
    expect(res.body.data.fiches[0]).toMatchObject({ id: "p-54", sequenceNumber: 54, status: "VALIDE", productionM2: "2500.00" });
  });

  test("un brouillon resté vide est repéré et proposé à la reprise", async () => {
    promeshRepo.findAll.mockResolvedValue([
      promeshFiche({ id: "p-72", sequenceNumber: 72, productionM2: "1270.00", conformite: "conforme" }),
      promeshFiche({ id: "p-76", sequenceNumber: 76 }),
    ]);
    const res = await request(buildApp()).get("/por-promesh/existing?machine=2&poste=matin&date=2026-07-17").set(as(ADMIN));
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.emptyDraftId).toBe("p-76");
    expect(res.body.data.fiches.map((f) => f.isEmptyDraft)).toEqual([false, true]);
  });

  test("cette lecture ne crée, ne modifie et ne supprime rien", async () => {
    promeshRepo.findAll.mockResolvedValue([promeshFiche()]);
    await request(buildApp()).get("/por-promesh/existing?machine=1&poste=matin&date=2026-07-17").set(as(ADMIN));
    for (const fn of ["create", "update", "destroy", "replaceChildren"]) expect(promeshRepo[fn]).not.toHaveBeenCalled();
  });

  test("la route /existing n'est pas prise pour un identifiant de fiche", async () => {
    promeshRepo.findAll.mockResolvedValue([]);
    await request(buildApp()).get("/por-promesh/existing?machine=1&poste=matin").set(as(ADMIN));
    expect(promeshRepo.findById).not.toHaveBeenCalled();
  });
});

describe("PROMESH — brouillon réellement vide", () => {
  const empty = (overrides) => promeshSvc.isEmptyDraft(promeshFiche(overrides));

  test("fiche telle que créée par « Nouvelle fiche » : vide", () => expect(empty()).toBe(true));

  test("lignes pré-remplies sans saisie (heures de contrôle, paramètres générés) : toujours vide", () => {
    expect(
      empty({
        controlesQualite: [{ heure: "06:00", numeroPlaque: "", maille: "", longueur: null, largeur: null, statutCOQ: null }],
        processControl: [{ bloc: "controle_08h20", parametre: "Fuite d'eau", valeurP1: null, corP1: false, valeurP2: null, corP2: false }],
      })
    ).toBe(true);
  });

  test.each([
    ["une quantité", { productionM2: "450.00" }],
    ["une quantité à zéro", { productionM2: 0 }],
    ["une conformité", { conformite: "conforme" }],
    ["une observation", { observationsGenerales: "RAS" }],
    ["un responsable", { responsable1: "najeh" }],
    ["une maille", { diametreMaille1: "10*10" }],
    ["un contrôle machine", { air: "< 6 bars" }],
    ["une heure de fin modifiée", { heureFin: "12:00:00" }],
    ["un contrôle qualité renseigné", { controlesQualite: [{ heure: "06:00", statutCOQ: "C" }] }],
    ["un arrêt machine", { arretsMachine: [{ tArret: "10 min", observationMachine: "" }] }],
    ["une consommation", { consommations: [{ designationArticle: "fil", metrage: null }] }],
    ["une pièce jointe", { attachments: [{ id: "f1", fileUrl: "/uploads/porpromesh/x.png" }] }],
  ])("avec %s : pas vide", (_label, overrides) => expect(empty(overrides)).toBe(false));

  test("une fiche validée ou verrouillée n'est jamais un brouillon vide", () => {
    expect(empty({ status: "VALIDE", isLocked: true })).toBe(false);
    expect(empty({ isLocked: true })).toBe(false);
  });
});

describe("PROMESH — POST /por-promesh/new (création)", () => {
  beforeEach(() => {
    jest.spyOn(User, "findByPk").mockResolvedValue({ profile: { name: "Najeh" } });
    promeshRepo.create.mockImplementation(async (data) => ({ id: "p-new", ...data }));
    promeshRepo.findById.mockImplementation(async (id) => ({ id, machine: "1", poste: "nuit", status: "BROUILLON" }));
  });

  const createAt = async (instant, body = { machine: 1, poste: "nuit" }) => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval"] }).setSystemTime(new Date(instant));
    const res = await request(buildApp()).post("/por-promesh/new").set(as(LOGISTIQUE)).send(body);
    return { res, created: promeshRepo.create.mock.calls[0] && promeshRepo.create.mock.calls[0][0] };
  };

  test("en journée : date et heure locales du même instant", async () => {
    const { res, created } = await createAt("2026-07-17T12:30:27Z", { machine: 2, poste: "matin" });
    expect(res.status).toBe(201);
    expect(created).toMatchObject({ machine: "2", poste: "matin", dateProduction: "2026-07-17", heureDebut: "13:30:27", heureFin: "13:30:27", operateur: "Najeh", createdBy: "l1" });
  });

  test("à 00 h 04 : la fiche est datée du jour qui commence (correctif du décalage d'un jour)", async () => {
    const { created } = await createAt("2026-07-17T23:04:31Z");
    expect(created.dateProduction).toBe("2026-07-18");
    expect(created.heureDebut).toBe("00:04:31");
  });

  test("à 00 h 59 min 59 s puis à 01 h 00 : même jour", async () => {
    expect((await createAt("2026-07-17T23:59:59Z")).created.dateProduction).toBe("2026-07-18");
    promeshRepo.create.mockClear();
    expect((await createAt("2026-07-18T00:00:00Z")).created.dateProduction).toBe("2026-07-18");
  });

  test("à 23 h 59 min 59 s : encore la veille", async () => {
    const { created } = await createAt("2026-07-17T22:59:59Z");
    expect(created).toMatchObject({ dateProduction: "2026-07-17", heureDebut: "23:59:59" });
  });

  test("fin d'année : 31/12 à 23 h 30 universelle → 01/01", async () => {
    expect((await createAt("2026-12-31T23:30:00Z")).created.dateProduction).toBe("2027-01-01");
  });

  test("le brouillon naît avec heure de fin = heure de début, sans erreur", async () => {
    const { res, created } = await createAt("2026-07-17T09:00:00Z", { machine: 1, poste: "matin" });
    expect(res.status).toBe(201);
    expect(created.heureFin).toBe(created.heureDebut);
  });

  test("la création n'est jamais bloquée par une fiche existante, et ne lit ni ne touche aucune autre fiche", async () => {
    promeshRepo.findAll.mockResolvedValue([promeshFiche(), promeshFiche({ id: "p-2" })]);
    const { res } = await createAt("2026-07-17T09:00:00Z", { machine: 1, poste: "matin" });
    expect(res.status).toBe(201);
    expect(promeshRepo.create).toHaveBeenCalledTimes(1);
    for (const fn of ["findAll", "update", "destroy"]) expect(promeshRepo[fn]).not.toHaveBeenCalled();
  });

  test("la réponse garde sa forme (compatibilité Flutter et Copilot)", async () => {
    const { res } = await createAt("2026-07-17T09:00:00Z", { machine: 1, poste: "nuit" });
    expect(res.body).toEqual({ success: true, data: { id: "p-new", machine: "1", poste: "nuit", status: "BROUILLON" } });
  });
});

describe("PROMESH — POST /por-promesh/:id/validate (heures et date)", () => {
  const validate = async (overrides, now = "2026-07-17T12:00:00Z") => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval"] }).setSystemTime(new Date(now));
    const fiche = promeshFiche({ heureFin: "14:00:00", ...overrides });
    promeshRepo.findBareById.mockResolvedValue(fiche);
    promeshRepo.findById.mockResolvedValue({ ...fiche, status: "VALIDE", isLocked: true });
    return request(buildApp()).post("/por-promesh/p-1/validate").set(as(ADMIN));
  };

  test("cas normal : validée et verrouillée", async () => {
    const res = await validate({ heureDebut: "06:00:00", heureFin: "14:00:00" });
    expect(res.status).toBe(200);
    expect(promeshRepo.update.mock.calls[0][1]).toMatchObject({ status: "VALIDE", isLocked: true });
  });

  test("brouillon jamais complété (fin = début) : refusé, rien n'est écrit", async () => {
    const res = await validate({ heureDebut: "10:22:10", heureFin: "10:22:10" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Impossible de terminer la saisie/);
    expect(res.body.message).toMatch(/différente de l'heure de début/);
    expect(promeshRepo.update).not.toHaveBeenCalled();
  });

  test("poste du matin, fin avant le début : refusé", async () => {
    const res = await validate({ heureDebut: "10:26:08", heureFin: "00:26:00", poste: "matin" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/seul un poste de nuit/);
    expect(promeshRepo.update).not.toHaveBeenCalled();
  });

  test("poste de nuit qui passe minuit : accepté", async () => {
    const res = await validate({ dateProduction: "2026-07-16", heureDebut: "22:00:00", heureFin: "06:00:00", poste: "nuit" });
    expect(res.status).toBe(200);
    expect(promeshRepo.update).toHaveBeenCalledTimes(1);
  });

  test("poste de nuit créé après minuit, terminé avant l'aube : accepté", async () => {
    const res = await validate({ dateProduction: "2026-07-17", heureDebut: "00:04:31", heureFin: "05:30:00", poste: "nuit" });
    expect(res.status).toBe(200);
  });

  test("date de production dans le futur : refusée", async () => {
    const res = await validate({ dateProduction: "2026-07-18", heureDebut: "06:00:00", heureFin: "14:00:00" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/dans le futur/);
  });

  test("date limite : fiche du jour validée à 00 h 30 locale → acceptée", async () => {
    const res = await validate({ dateProduction: "2026-07-18", heureDebut: "00:05:00", heureFin: "00:25:00", poste: "nuit" }, "2026-07-17T23:30:00Z");
    expect(res.status).toBe(200);
  });

  test("champ manquant : message d'origine conservé", async () => {
    const res = await validate({ heureFin: null });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/champ\(s\) manquant\(s\) — Heure fin/);
  });

  test("fiche déjà verrouillée : toujours 403, les heures ne sont pas réexaminées", async () => {
    const res = await validate({ isLocked: true, status: "VALIDE", heureDebut: "10:00:00", heureFin: "10:00:00" });
    expect(res.status).toBe(403);
    expect(promeshRepo.update).not.toHaveBeenCalled();
  });

  test("l'enregistrement d'un brouillon (PUT) n'est pas soumis au contrôle des heures", async () => {
    const fiche = promeshFiche({ heureDebut: "10:00:00", heureFin: "10:00:00" });
    promeshRepo.findBareById.mockResolvedValue(fiche);
    promeshRepo.findProcessControl.mockResolvedValue([]);
    promeshRepo.findById.mockResolvedValue(fiche);
    const res = await request(buildApp()).put("/por-promesh/p-1").set(as(ADMIN)).send({ heureDebut: "10:00:00", heureFin: "09:00:00", productionM2: 120 });
    expect(res.status).toBe(200);
    expect(promeshRepo.update).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("PROBAR — GET /industrial-records/existing (avertissement avant création)", () => {
  test("401 sans jeton, 403 pour un rôle sans accès, 400 si un paramètre manque", async () => {
    const app = buildApp();
    expect((await request(app).get("/industrial-records/existing?machine=1&poste=matin")).status).toBe(401);
    expect((await request(app).get("/industrial-records/existing?machine=1&poste=matin").set(as(COMMERCIAL))).status).toBe(403);
    expect((await request(app).get("/industrial-records/existing?poste=matin").set(as(ADMIN))).status).toBe(400);
    expect((await request(app).get("/industrial-records/existing?module=melange&machine=1&poste=matin").set(as(ADMIN))).status).toBe(400);
    expect(probarRepo.findAll).not.toHaveBeenCalled();
  });

  test("recherche limitée au module probar, à la machine, à la date et au poste ; périmètre du rôle respecté", async () => {
    probarRepo.findAll.mockResolvedValue([]);
    await request(buildApp()).get("/industrial-records/existing?machine=1&poste=matin&date=2026-07-19").set(as(LOGISTIQUE));
    expect(probarRepo.findAll.mock.calls[0][0]).toEqual({ createdBy: "l1", module: "probar", machine: "1", poste: "matin", dateFiche: "2026-07-19" });
  });

  test("deux fiches validées le même poste : signalées, rien à reprendre", async () => {
    probarRepo.findAll.mockResolvedValue([
      probarFiche({ id: "b-2", statut: "validee", quantiteProduite: "1450.00", statutQualite: "ok", createdAt: new Date("2026-07-19T22:29:00Z") }),
      probarFiche({ id: "b-1", statut: "validee", quantiteProduite: "1250.00", statutQualite: "ok", createdAt: new Date("2026-07-19T20:01:00Z") }),
    ]);
    const res = await request(buildApp()).get("/industrial-records/existing?machine=1&poste=matin&date=2026-07-19").set(as(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.emptyDraftId).toBeNull();
    expect(res.body.data.fiches.map((f) => f.id)).toEqual(["b-1", "b-2"]); // de la plus ancienne à la plus récente
  });

  test("brouillon vide repéré ; heures lues dans le contenu de la fiche", async () => {
    probarRepo.findAll.mockResolvedValue([
      probarFiche({ id: "b-3", description: JSON.stringify({ hd: "09:22", hf: "11:22", p: { r1: "x" } }), quantiteProduite: "20.00" }),
      probarFiche({ id: "b-4", createdAt: new Date("2026-07-17T08:00:00Z") }),
    ]);
    const res = await request(buildApp()).get("/industrial-records/existing?machine=1&poste=matin&date=2026-07-17").set(as(ADMIN));
    expect(res.body.data.emptyDraftId).toBe("b-4");
    expect(res.body.data.fiches[0]).toMatchObject({ id: "b-3", heureDebut: "09:22", heureFin: "11:22", isEmptyDraft: false });
  });

  test("cette lecture ne crée, ne modifie et ne supprime rien", async () => {
    probarRepo.findAll.mockResolvedValue([probarFiche()]);
    await request(buildApp()).get("/industrial-records/existing?machine=1&poste=matin").set(as(ADMIN));
    for (const fn of ["create", "update", "destroy"]) expect(probarRepo[fn]).not.toHaveBeenCalled();
  });
});

describe("PROBAR — brouillon réellement vide", () => {
  const empty = (overrides) => probarSvc.isEmptyProbarDraft(probarFiche(overrides));

  test("fiche sans aucune saisie : vide, que le contenu soit « {} », nul, ou un formulaire aux champs vides", () => {
    expect(empty()).toBe(true);
    expect(empty({ description: null })).toBe(true);
    expect(empty({ description: JSON.stringify({ p: { r1: "" }, cq: [{ statutCOQ: null }], hd: "" }) })).toBe(true);
  });

  test.each([
    ["une quantité", { quantiteProduite: "1450.00" }],
    ["une qualité", { statutQualite: "ok" }],
    ["une observation", { observations: "RAS" }],
    ["une heure saisie", { description: JSON.stringify({ hd: "09:22" }) }],
    ["un champ de formulaire", { description: JSON.stringify({ p: { r1: "najeh" } }) }],
    ["un texte libre", { description: "production normale" }],
  ])("avec %s : pas vide", (_label, overrides) => expect(empty(overrides)).toBe(false));

  test("une fiche validée, ou d'un autre module, n'est jamais un brouillon vide", () => {
    expect(empty({ statut: "validee" })).toBe(false);
    expect(empty({ module: "melange" })).toBe(false);
  });
});

describe("PROBAR — passage à « validee » (heures et date)", () => {
  const complete = { quantiteProduite: "1450.00", machine: "1", poste: "matin", dateFiche: "2026-07-17" };
  const put = async (stored, body, now = "2026-07-17T12:00:00Z") => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval"] }).setSystemTime(new Date(now));
    const fiche = probarFiche({ ...complete, ...stored });
    probarRepo.findBareById.mockResolvedValue(fiche);
    probarRepo.findById.mockResolvedValue(fiche);
    return request(buildApp()).put("/industrial-records/b-1").set(as(ADMIN)).send(body);
  };
  const withHours = (hd, hf) => JSON.stringify({ hd, hf, p: { r1: "najeh" } });

  test("cas normal : validée", async () => {
    const res = await put({ description: withHours("09:22", "11:22") }, { statut: "validee" });
    expect(res.status).toBe(200);
    expect(probarRepo.update).toHaveBeenCalledTimes(1);
  });

  test("sans heures : toujours validable (règle existante inchangée)", async () => {
    const res = await put({ description: JSON.stringify({ p: { r1: "najeh" } }) }, { statut: "validee" });
    expect(res.status).toBe(200);
  });

  test("poste du matin, fin avant le début : refusé, rien n'est écrit", async () => {
    // Cas réel : 11 h 39 → 01 h 39 au poste du matin.
    const res = await put({ description: withHours("11:39", "01:39") }, { statut: "validee" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Impossible de valider la fiche/);
    expect(res.body.message).toMatch(/seul un poste de nuit/);
    expect(probarRepo.update).not.toHaveBeenCalled();
  });

  test("poste de nuit qui passe minuit : accepté", async () => {
    const res = await put({ poste: "nuit", dateFiche: "2026-07-16", description: withHours("22:00", "06:00") }, { statut: "validee" });
    expect(res.status).toBe(200);
  });

  test("fin = début : refusé", async () => {
    const res = await put({ description: withHours("14:00", "14:00") }, { statut: "validee" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/différente de l'heure de début/);
  });

  test("les heures envoyées dans la même requête que la validation sont celles qui sont contrôlées", async () => {
    const res = await put({ description: withHours("09:00", "11:00") }, { statut: "validee", description: withHours("11:00", "09:00") });
    expect(res.status).toBe(400);
  });

  test("date de fiche dans le futur : refusée", async () => {
    const res = await put({ dateFiche: "2026-07-18", description: withHours("09:00", "11:00") }, { statut: "validee" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/dans le futur/);
  });

  test("champ obligatoire manquant : message d'origine conservé", async () => {
    const res = await put({ quantiteProduite: null, description: withHours("09:00", "11:00") }, { statut: "validee" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/champ\(s\) manquant\(s\)/);
  });

  test("l'enregistrement d'un brouillon n'est pas soumis au contrôle des heures", async () => {
    const res = await put({ description: withHours("11:00", "09:00") }, { statut: "enregistree", observations: "en cours" });
    expect(res.status).toBe(200);
    expect(probarRepo.update).toHaveBeenCalledTimes(1);
  });

  test("les fiches de mélange ne sont pas concernées", async () => {
    const res = await put({ module: "melange", machine: null, description: withHours("11:00", "09:00") }, { statut: "validee" });
    expect(res.status).toBe(200);
  });
});
