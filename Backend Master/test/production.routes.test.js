"use strict";

// Routes /production : rôles, périmètre, agrégats du dashboard, liste, fiche
// et export (repository simulé — aucune base).

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: jest.fn((req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    next();
  }),
}));

jest.mock("../src/modules/production/repositories/production.repository", () => ({
  findPromesh: jest.fn(),
  findProbar: jest.fn(),
  findRecuperables: jest.fn(),
  findMachines: jest.fn(),
  findPromeshById: jest.fn(),
  findProbarById: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const ExcelJS = require("exceljs");
const repo = require("../src/modules/production/repositories/production.repository");
const svc = require("../src/modules/production/services/production.service");
const { resolvePeriod, bucketKeys, ymd } = require("../src/modules/production/services/productionPeriod");
const productionRoutes = require("../src/modules/production/routes/production.routes");

function buildApp() {
  const app = express();
  app.use("/production", productionRoutes);
  return app;
}

const ADMIN = { sub: "a1", role: "admin" };
const LOGISTIQUE = { sub: "l1", role: "responsable_logistique_achat" };
const COMMERCIAL = { sub: "c1", role: "commercial" };
const as = (user) => ({ "x-test-user": JSON.stringify(user) });

const M_PROMESH_1 = "11111111-1111-4111-8111-111111111111";
const M_PROBAR_1 = "22222222-2222-4222-8222-222222222222";
const M_PROBAR_2 = "33333333-3333-4333-8333-333333333333";
const FICHE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const MACHINES = [
  { id: M_PROBAR_1, code: "PROBAR-01", nom: "Machine PROBAR 1", typeMachine: "PROBAR", numero: 1, statut: "ACTIVE" },
  { id: M_PROBAR_2, code: "PROBAR-02", nom: "Machine PROBAR 2", typeMachine: "PROBAR", numero: 2, statut: "INACTIVE" },
  { id: M_PROMESH_1, code: "PROMESH-01", nom: "Machine PROMESH 1", typeMachine: "PROMESH", numero: 1, statut: "ACTIVE" },
];

const PROMESH_ROWS = [
  {
    id: FICHE_ID,
    sequenceNumber: 886,
    dateProduction: "2026-09-28",
    machine: "1",
    machineId: M_PROMESH_1,
    poste: "matin",
    operateur: "production_1",
    productionM2: "1250.00",
    status: "VALIDE",
    createdBy: "l1",
    createdAt: "2026-09-28T07:00:00.000Z",
    updatedAt: "2026-09-28T15:00:00.000Z",
    creator: { id: "l1", email: "l1@cbi.tn" },
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    sequenceNumber: 887,
    dateProduction: "2026-09-29",
    machine: "1",
    machineId: M_PROMESH_1,
    poste: "nuit",
    operateur: "",
    productionM2: "750.00",
    status: "BROUILLON",
    createdBy: "a1",
    createdAt: "2026-09-29T20:00:00.000Z",
    updatedAt: "2026-09-29T20:00:00.000Z",
    creator: { id: "a1", email: "admin@cbi.tn" },
  },
];

const PROBAR_ROWS = [
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    dateFiche: "2026-09-28",
    // Fiche historique sans machineId : rattachée par son libellé « 1 ».
    machine: "1",
    machineId: null,
    poste: "matin",
    operateur: "production_2",
    quantiteProduite: "500.00",
    statut: "validee",
    createdBy: "a1",
    createdAt: "2026-09-28T08:00:00.000Z",
    updatedAt: "2026-09-28T08:00:00.000Z",
    creator: { id: "a1", email: "admin@cbi.tn" },
  },
];

const RECUPERABLES = [
  {
    module: "PROMESH",
    machine: "1",
    machineId: M_PROMESH_1,
    poste: "matin",
    date: "2026-09-28",
    lignes: [
      { dechetKg: "10.00", dechetProduitFiniKg: "4.00" },
      { dechetKg: "2.50", dechetProduitFiniKg: "0.00" },
    ],
  },
  // « soir » côté Récupérables = poste « nuit » des fiches de production.
  { module: "PROMESH", machine: "1", machineId: M_PROMESH_1, poste: "soir", date: "2026-09-29", lignes: [{ dechetKg: "7.50", dechetProduitFiniKg: "1.00" }] },
  { module: "PROBAR", machine: "1", machineId: M_PROBAR_1, poste: "matin", date: "2026-09-28", lignes: [{ dechetKg: "5.00", dechetProduitFiniKg: "0.00" }] },
];

const PERIOD = "period=custom&from=2026-09-28&to=2026-09-30";

beforeEach(() => {
  jest.clearAllMocks();
  svc._clearCache();
  repo.findMachines.mockResolvedValue(MACHINES);
  repo.findPromesh.mockResolvedValue(PROMESH_ROWS);
  repo.findProbar.mockResolvedValue(PROBAR_ROWS);
  repo.findRecuperables.mockResolvedValue(RECUPERABLES);
});

// Lectures de la période demandée (le service relit aussi le jour courant
// quand il est hors période, pour « Productions aujourd'hui »).
const periodReads = () => repo.findPromesh.mock.calls.filter(([q]) => q.from === "2026-09-28").length;

describe("accès par rôle", () => {
  test("401 sans authentification", async () => {
    expect((await request(buildApp()).get("/production/dashboard")).status).toBe(401);
  });

  test("403 hors espace industriel (commercial)", async () => {
    const app = buildApp();
    for (const path of ["/production/dashboard", "/production/fiches?line=promesh", "/production/export?format=xlsx"]) {
      expect((await request(app).get(path).set(as(COMMERCIAL))).status).toBe(403);
    }
    expect(repo.findPromesh).not.toHaveBeenCalled();
  });

  test("responsable_logistique_achat : requêtes restreintes à ses propres fiches", async () => {
    const res = await request(buildApp()).get(`/production/dashboard?${PERIOD}`).set(as(LOGISTIQUE));
    expect(res.status).toBe(200);
    for (const fn of [repo.findPromesh, repo.findProbar, repo.findRecuperables]) {
      expect(fn).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "l1" }));
    }
  });

  test("admin : aucune restriction de périmètre", async () => {
    await request(buildApp()).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN));
    expect(repo.findPromesh).toHaveBeenCalledWith(expect.objectContaining({ createdBy: null, from: "2026-09-28", to: "2026-09-30" }));
  });
});

describe("GET /production/dashboard", () => {
  test("KPI calculés à partir des fiches : sommes, déchets et taux", async () => {
    const res = await request(buildApp()).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN));
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.promesh).toMatchObject({ fiches: 2, quantity: 2000, wasteKg: 20, recuperableKg: 5, wasteRate: 1, brouillons: 1, validees: 1 });
    expect(d.probar).toMatchObject({ fiches: 1, quantity: 500, wasteKg: 5, wasteRate: 1, validees: 1 });
    expect(d.production).toEqual({ fiches: 3, quantity: 2500, unit: "m²" });
    expect(d.waste).toMatchObject({ kg: 25, rate: 1 });
  });

  test("production par machine : toutes les machines du référentiel, statut compris", async () => {
    const d = (await request(buildApp()).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN))).body.data;
    expect(d.promesh.machines).toEqual([
      expect.objectContaining({ code: "PROMESH-01", fiches: 2, quantity: 2000, wasteKg: 20, lastProduction: "2026-09-29", state: "ACTIVE" }),
    ]);
    // PROBAR-01 reçoit la fiche sans machineId ; PROBAR-02 n'a rien produit.
    expect(d.probar.machines).toEqual([
      expect.objectContaining({ code: "PROBAR-01", fiches: 1, quantity: 500, wasteKg: 5 }),
      expect.objectContaining({ code: "PROBAR-02", fiches: 0, quantity: 0, lastProduction: null, state: "INACTIVE", wasteRate: null }),
    ]);
    expect(d.machines).toMatchObject({ active: 2, total: 3, withProduction: 2 });
  });

  test("séries des graphiques : un point par jour de la période, jours vides à 0", async () => {
    const { charts } = (await request(buildApp()).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN))).body.data;
    expect(charts.production).toEqual([
      { date: "2026-09-28", promesh: 1250, probar: 500, total: 1750 },
      { date: "2026-09-29", promesh: 750, probar: 0, total: 750 },
      { date: "2026-09-30", promesh: 0, probar: 0, total: 0 },
    ]);
    expect(charts.waste.map((p) => p.total)).toEqual([17.5, 7.5, 0]);
    expect(charts.byMachine.map((m) => m.code)).toEqual(["PROMESH-01", "PROBAR-01", "PROBAR-02"]);
  });

  test("dernières productions : plus récentes d'abord, référence, déchets du poste et statut", async () => {
    const { recent } = (await request(buildApp()).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN))).body.data;
    expect(recent.map((r) => r.date)).toEqual(["2026-09-29", "2026-09-28", "2026-09-28"]);
    const validated = recent.find((r) => r.id === FICHE_ID);
    expect(validated).toMatchObject({
      reference: "PROMESH-2026-000886",
      lineLabel: "PROMESH",
      poste: "matin",
      user: "production_1",
      quantity: 1250,
      wasteKg: 12.5,
      status: "VALIDEE",
    });
    expect(validated.machine.code).toBe("PROMESH-01");
    // Opérateur vide → email du créateur ; poste « soir » rattaché à « nuit ».
    expect(recent[0]).toMatchObject({ user: "admin@cbi.tn", wasteKg: 7.5, status: "BROUILLON" });
    expect(recent[0]).not.toHaveProperty("createdBy");
  });

  test("aucune fiche : zéros et taux null (pas de valeur fictive)", async () => {
    repo.findPromesh.mockResolvedValue([]);
    repo.findProbar.mockResolvedValue([]);
    repo.findRecuperables.mockResolvedValue([]);
    const d = (await request(buildApp()).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN))).body.data;
    expect(d.production).toMatchObject({ fiches: 0, quantity: 0 });
    expect(d.waste).toMatchObject({ kg: 0, rate: null });
    expect(d.recent).toEqual([]);
  });

  test("« productions aujourd'hui » et « En production » portent sur le jour courant", async () => {
    const today = ymd(new Date());
    repo.findPromesh.mockResolvedValue([{ ...PROMESH_ROWS[0], dateProduction: today }]);
    repo.findProbar.mockResolvedValue([]);
    repo.findRecuperables.mockResolvedValue([]);
    const d = (await request(buildApp()).get("/production/dashboard?period=today").set(as(ADMIN))).body.data;
    expect(d.machines).toMatchObject({ productionsToday: 1, producingToday: 1 });
    expect(d.promesh.machines[0].state).toBe("EN_PRODUCTION");
  });

  test("cache : un second appel identique ne relit pas la base, refresh=1 la relit", async () => {
    const app = buildApp();
    await request(app).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN));
    await request(app).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN));
    expect(periodReads()).toBe(1);
    await request(app).get(`/production/dashboard?${PERIOD}&refresh=1`).set(as(ADMIN));
    expect(periodReads()).toBe(2);
  });

  test("cache cloisonné par périmètre : le résultat global n'est jamais servi à un utilisateur restreint", async () => {
    const app = buildApp();
    await request(app).get(`/production/dashboard?${PERIOD}`).set(as(ADMIN));
    await request(app).get(`/production/dashboard?${PERIOD}`).set(as(LOGISTIQUE));
    expect(repo.findPromesh).toHaveBeenLastCalledWith(expect.objectContaining({ createdBy: "l1" }));
  });

  test("400 : période inconnue ou personnalisée incohérente", async () => {
    const app = buildApp();
    expect((await request(app).get("/production/dashboard?period=decade").set(as(ADMIN))).status).toBe(400);
    expect((await request(app).get("/production/dashboard?period=custom&from=2026-09-30").set(as(ADMIN))).status).toBe(400);
    expect((await request(app).get("/production/dashboard?period=custom&from=2026-09-30&to=2026-09-01").set(as(ADMIN))).status).toBe(400);
    expect((await request(app).get("/production/dashboard?period=custom&from=2026-02-31&to=2026-03-01").set(as(ADMIN))).status).toBe(400);
  });
});

describe("GET /production/fiches", () => {
  test("liste d'une ligne avec ses KPI et les valeurs de filtres réelles", async () => {
    const res = await request(buildApp()).get(`/production/fiches?line=promesh&${PERIOD}`).set(as(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.kpi).toMatchObject({ fiches: 2, quantity: 2000, wasteKg: 20, wasteRate: 1 });
    expect(res.body.filterOptions.users).toEqual(["admin@cbi.tn", "production_1"]);
    expect(res.body.filterOptions.machines).toEqual([{ numero: 1, code: "PROMESH-01", statut: "ACTIVE" }]);
    expect(res.body.data.every((r) => r.line === "promesh")).toBe(true);
  });

  test("filtres statut / poste / utilisateur : fiches ET déchets recalculés", async () => {
    const app = buildApp();
    const validees = (await request(app).get(`/production/fiches?line=promesh&status=VALIDEE&${PERIOD}`).set(as(ADMIN))).body;
    expect(validees.count).toBe(1);
    expect(validees.kpi).toMatchObject({ quantity: 1250, wasteKg: 12.5, wasteRate: 1 });

    const nuit = (await request(app).get(`/production/fiches?line=promesh&poste=nuit&${PERIOD}`).set(as(ADMIN))).body;
    expect(nuit.kpi).toMatchObject({ fiches: 1, quantity: 750, wasteKg: 7.5 });

    const user = (await request(app).get(`/production/fiches?line=promesh&user=production_1&${PERIOD}`).set(as(ADMIN))).body;
    expect(user.data.map((r) => r.reference)).toEqual(["PROMESH-2026-000886"]);
  });

  test("pagination", async () => {
    const res = await request(buildApp()).get(`/production/fiches?line=promesh&pageSize=1&page=2&${PERIOD}`).set(as(ADMIN));
    expect(res.body.count).toBe(2);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reference).toBe("PROMESH-2026-000886");
  });

  test("400 : ligne absente ou filtre invalide", async () => {
    const app = buildApp();
    expect((await request(app).get(`/production/fiches?${PERIOD}`).set(as(ADMIN))).status).toBe(400);
    expect((await request(app).get(`/production/fiches?line=melange&${PERIOD}`).set(as(ADMIN))).status).toBe(400);
    expect((await request(app).get(`/production/fiches?line=probar&status=SUPPRIMEE&${PERIOD}`).set(as(ADMIN))).status).toBe(400);
  });
});

describe("GET /production/fiches/:line/:id", () => {
  const record = {
    ...PROMESH_ROWS[0],
    heureDebut: "06:00:00",
    heureFin: "14:00:00",
    diametreMaille1: "8",
    validatedAt: "2026-09-28T15:00:00.000Z",
  };

  test("fiche structurée : identification, données, résumé, traçabilité", async () => {
    repo.findPromeshById.mockResolvedValue(record);
    repo.findRecuperables.mockResolvedValue([RECUPERABLES[0]]);
    const res = await request(buildApp()).get(`/production/fiches/promesh/${FICHE_ID}`).set(as(ADMIN));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.identification).toMatchObject({ reference: "PROMESH-2026-000886", date: "2026-09-28", poste: "matin", status: "VALIDEE" });
    expect(d.donnees).toEqual(expect.arrayContaining([{ label: "Quantité", value: "1250" }, { label: "Diamètre maille 1", value: "8" }]));
    // 1250 m² en 8 h → 156,25 m²/h ; déchets du poste = 12,5 kg.
    expect(d.resume).toMatchObject({ quantity: 1250, wasteKg: 12.5, recuperableKg: 4, rendement: 156.25, dureeHeures: 8 });
    expect(d.tracabilite.map((e) => e.event)).toEqual(["CREATION", "MODIFICATION", "VALIDATION"]);
  });

  test("403 : fiche d'un autre utilisateur pour un rôle restreint", async () => {
    repo.findPromeshById.mockResolvedValue({ ...record, createdBy: "someone-else" });
    const res = await request(buildApp()).get(`/production/fiches/promesh/${FICHE_ID}`).set(as(LOGISTIQUE));
    expect(res.status).toBe(403);
  });

  test("404 : fiche inconnue ou id non-UUID (pas d'erreur PostgreSQL 500)", async () => {
    const app = buildApp();
    repo.findProbarById.mockResolvedValue(null);
    expect((await request(app).get(`/production/fiches/probar/${FICHE_ID}`).set(as(ADMIN))).status).toBe(404);
    expect((await request(app).get("/production/fiches/probar/abc").set(as(ADMIN))).status).toBe(404);
    expect(repo.findProbarById).toHaveBeenCalledTimes(1);
  });
});

describe("GET /production/export", () => {
  const binary = (res, callback) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  };

  test("Excel : 6 feuilles, totaux identiques au dashboard", async () => {
    const res = await request(buildApp()).get(`/production/export?format=xlsx&${PERIOD}`).set(as(ADMIN)).buffer().parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Résumé", "Productions", "PROMESH", "PROBAR", "Déchets", "KPI"]);

    const cells = [];
    wb.getWorksheet("Résumé").eachRow((row) => cells.push(row.values.slice(1)));
    expect(cells).toContainEqual(["TOTAL", 3, 2500, 25, 5, 1, 1, 2]);
    expect(String(cells[1][0])).toMatch(/Période : Du 28\/09\/2026 au 30\/09\/2026/);
  });

  test("Excel d'une seule ligne : pas de feuille de l'autre ligne", async () => {
    const res = await request(buildApp()).get(`/production/export?format=xlsx&line=probar&${PERIOD}`).set(as(ADMIN)).buffer().parse(binary);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Résumé", "Productions", "PROBAR", "Déchets", "KPI"]);
  });

  test("PDF généré", async () => {
    const res = await request(buildApp()).get(`/production/export?format=pdf&${PERIOD}`).set(as(ADMIN)).buffer().parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  test("400 : format inconnu", async () => {
    const res = await request(buildApp()).get(`/production/export?format=csv&${PERIOD}`).set(as(ADMIN));
    expect(res.status).toBe(400);
  });
});

describe("résolution de la période", () => {
  const NOW = new Date(2026, 9, 5, 10, 0, 0); // lundi 5 octobre 2026

  test("périodes prédéfinies (semaine commençant le lundi)", () => {
    expect(resolvePeriod({ period: "today" }, NOW)).toMatchObject({ from: "2026-10-05", to: "2026-10-05" });
    expect(resolvePeriod({ period: "week" }, new Date(2026, 9, 8))).toMatchObject({ from: "2026-10-05", to: "2026-10-08" });
    expect(resolvePeriod({ period: "week" }, new Date(2026, 9, 11))).toMatchObject({ from: "2026-10-05", to: "2026-10-11" });
    expect(resolvePeriod({ period: "month" }, NOW)).toMatchObject({ from: "2026-10-01", to: "2026-10-05", granularity: "day" });
    expect(resolvePeriod({}, NOW).key).toBe("month");
  });

  test("année : regroupement mensuel", () => {
    const year = resolvePeriod({ period: "year" }, NOW);
    expect(year).toMatchObject({ from: "2026-01-01", to: "2026-10-05", granularity: "month" });
    expect(bucketKeys(year)).toHaveLength(10);
    expect(bucketKeys(year)[0]).toBe("2026-01");
  });
});
