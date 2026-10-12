"use strict";

// Module Rapports (src/modules/reports) — exports PDF / Excel communs.
// Vérifie : permissions par rôle, périmètre des données (impossible de viser
// un autre utilisateur), validation des filtres, structure des fichiers
// générés, limites de volume, absence de données sensibles, gestion des
// erreurs et cohérence avec les indicateurs du tableau de bord.
// Aucune base de données : modèles et services sont remplacés ; les fichiers
// Excel produits sont réellement relus avec exceljs.

require("dotenv").config();

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    return next();
  },
}));

const model = () => ({ findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), count: jest.fn() });
const mockModels = { User: model(), UserProfile: model(), Project: model(), ProjectAction: model(), CommercialContact: model(), CommercialContactRelance: model() };
jest.mock("../src/models/associations", () => mockModels);
const mockClient = model();
jest.mock("../src/models/client.model", () => mockClient);

const mockScope = jest.fn();
jest.mock("../src/modules/commercial-contacts/policies/contactAccess.policy", () => ({ contactListScope: (...a) => mockScope(...a) }));

const mockProduction = { getExportData: jest.fn() };
jest.mock("../src/modules/production/services/production.service", () => mockProduction);
const mockExporter = { fileBaseName: jest.fn(), buildExcelBuffer: jest.fn(), buildPdf: jest.fn() };
jest.mock("../src/modules/production/services/productionExport.service", () => mockExporter);
const mockMe = { getMyDashboard: jest.fn() };
jest.mock("../src/modules/dashboard/services/meDashboard.service", () => mockMe);

const request = require("supertest");
const express = require("express");
const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const reportRoutes = require("../src/modules/reports/routes/report.routes");
const { MAX_ROWS, REPORTS } = require("../src/modules/reports/services/reportData.service");
const { safeText, PDF_MAX_ROWS } = require("../src/modules/reports/services/reportRenderer.service");

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ADMINS = ["admin", "superadmin", "superadmin2"];
const ROLES = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat", ...ADMINS];
const TYPES = Object.keys(REPORTS);

function buildApp() {
  const app = express();
  app.use("/reports", reportRoutes);
  app.use("/production/reports", reportRoutes);
  return app;
}
const as = (role) => JSON.stringify({ sub: ME, role });
const binary = (res, cb) => { const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks))); };
const get = (path, role) => request(buildApp()).get(path).set("x-test-user", as(role)).buffer(true).parse(binary);
const json = (path, role) => request(buildApp()).get(path).set("x-test-user", as(role));
const setRole = (role, extra = {}) => mockModels.User.findByPk.mockResolvedValue({ id: ME, email: "moi@test.local", role, isActive: true, ...extra });

async function workbook(res) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  return wb;
}
function sheetText(ws) {
  const out = [];
  ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value))));
  return out.join(" | ");
}
function headerRowIndex(ws, firstHeader) {
  let index = null;
  ws.eachRow((row, n) => { if (index === null && row.getCell(1).value === firstHeader) index = n; });
  return index;
}

const project = (i, extra = {}) => ({
  id: `p${i}`, nomProjet: `Projet ${i}`, entreprise: "Société A", statut: "Prospect", projectModele: "project", typeProjet: "Dallage", productFamily: "PROBAR",
  validationStatut: "Non validé", createdAt: new Date("2026-05-10T09:30:00Z"), dateDemarrage: "2026-06-01", montantMarche: 15500.5, surfaceProspectee: 120,
  isArchived: false, ownerId: ME, ...extra,
});
const ME_KPIS = [
  { key: "my_projects", label: "Projets actifs", value: 12, unit: null, group: "Mes projets", source: "dashboard.service.getKPIByRole" },
  { key: "my_validation_rate", label: "Taux de validation", value: 33.33, unit: "%", group: "Mes projets", source: "dashboard.service.getKPIByRole" },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  for (const m of [...Object.values(mockModels), mockClient]) { m.findAll.mockResolvedValue([]); m.count.mockResolvedValue(0); m.findOne.mockResolvedValue(null); }
  mockModels.UserProfile.findOne.mockResolvedValue({ name: "Moi Test" });
  mockScope.mockImplementation(async (user) => {
    if ([...ADMINS, "commercial_sedentaire", "accueil"].includes(user.role)) return { all: true };
    if (user.role === "commercial") return { all: false, where: { [Op.or]: [{ createdBy: user.sub }, { commercialId: user.sub }] } };
    return null;
  });
  mockProduction.getExportData.mockResolvedValue({ rows: [] });
  mockExporter.fileBaseName.mockReturnValue("production-test");
  mockExporter.buildExcelBuffer.mockResolvedValue(Buffer.from("PK-production"));
  mockMe.getMyDashboard.mockResolvedValue({
    profile: { roleLabel: "Commercial" }, kpis: ME_KPIS, modules: [{ label: "Projets" }], limitations: ["Périmètre : vos projets."], freshness: { production: null },
  });
});

describe("Accès et catalogue", () => {
  test("sans jeton → 401 sur le catalogue et sur un export", async () => {
    expect((await request(buildApp()).get("/reports")).status).toBe(401);
    expect((await request(buildApp()).get("/reports/projects?format=xlsx")).status).toBe(401);
    expect(mockModels.Project.findAll).not.toHaveBeenCalled();
  });

  test("compte désactivé → 403, même avec un jeton valide", async () => {
    setRole("admin", { isActive: false });
    expect((await json("/reports/projects?format=xlsx", "admin")).status).toBe(403);
  });

  test.each([
    ["commercial", ["projects", "contacts", "followups", "dashboard"]],
    ["commercial_sedentaire", ["contacts", "followups", "dashboard"]],
    ["accueil", ["dashboard"]],
    ["responsable_logistique_achat", ["production", "dashboard"]],
    ["admin", TYPES],
  ])("%s : le catalogue ne propose que ses rapports", async (role, expected) => {
    setRole(role);
    const res = await json("/reports", role);
    expect(res.status).toBe(200);
    expect(res.body.data.reports.map((r) => r.type).sort()).toEqual([...expected].sort());
    for (const r of res.body.data.reports) expect(r.formats).toEqual(["xlsx", "pdf"]);
  });

  test("le rôle vient de la base : jeton « admin », rôle « accueil » en base → rapport des projets refusé", async () => {
    setRole("accueil");
    expect((await json("/reports/projects?format=xlsx", "admin")).status).toBe(403);
    expect(mockModels.Project.findAll).not.toHaveBeenCalled();
  });

  const matrix = ROLES.flatMap((role) => TYPES.map((type) => [role, type, REPORTS[type].roles.includes(role) ? 200 : 403]));
  test.each(matrix)("%s → rapport « %s » → %i", async (role, type, expected) => {
    setRole(role);
    const res = await get(`/reports/${type}?format=xlsx`, role);
    expect(res.status).toBe(expected);
    if (expected === 403) {
      for (const m of Object.values(mockModels)) if (m !== mockModels.User && m !== mockModels.UserProfile) expect(m.findAll).not.toHaveBeenCalled();
      expect(mockProduction.getExportData).not.toHaveBeenCalled();
    }
  });
});

describe("Validation des paramètres", () => {
  beforeEach(() => setRole("admin"));

  test.each([
    ["format absent", "/reports/projects"],
    ["format inconnu", "/reports/projects?format=csv"],
    ["date mal formée", "/reports/projects?format=xlsx&from=10/05/2026"],
    ["date impossible", "/reports/projects?format=xlsx&from=2026-02-31"],
    ["début après la fin", "/reports/projects?format=xlsx&from=2026-06-01&to=2026-05-01"],
    ["ownerId non UUID", "/reports/projects?format=xlsx&ownerId=1%20OR%201=1"],
    ["paramètre inconnu", `/reports/projects?format=xlsx&userId=${OTHER}`],
    ["statut trop long", `/reports/projects?format=xlsx&status=${"x".repeat(101)}`],
    ["filtre étranger au rapport", "/reports/projects?format=xlsx&line=promesh"],
  ])("%s → 400, aucune lecture", async (_label, path) => {
    expect((await json(path, "admin")).status).toBe(400);
    expect(mockModels.Project.findAll).not.toHaveBeenCalled();
  });

  test("rapport inconnu → 404", async () => {
    expect((await json("/reports/salaires?format=xlsx", "admin")).status).toBe(404);
  });
});

describe("Périmètre des données", () => {
  test("commercial : seuls ses projets, liste ET indicateurs", async () => {
    setRole("commercial");
    await get("/reports/projects?format=xlsx", "commercial");
    expect(mockModels.Project.findAll.mock.calls[0][0].where.ownerId).toBe(ME);
    expect(mockModels.Project.count).toHaveBeenCalledTimes(4);
    for (const [args] of mockModels.Project.count.mock.calls) expect(args.where.ownerId).toBe(ME);
  });

  test("commercial : ?ownerId=<autre> → 403, rien n'est lu", async () => {
    setRole("commercial");
    expect((await json(`/reports/projects?format=xlsx&ownerId=${OTHER}`, "commercial")).status).toBe(403);
    expect(mockModels.Project.findAll).not.toHaveBeenCalled();
  });

  test("administrateur : tous les projets, ou ceux du commercial demandé", async () => {
    setRole("admin");
    await get("/reports/projects?format=xlsx", "admin");
    expect(mockModels.Project.findAll.mock.calls[0][0].where.ownerId).toBeUndefined();
    await get(`/reports/projects?format=xlsx&ownerId=${OTHER}`, "admin");
    expect(mockModels.Project.findAll.mock.calls[1][0].where.ownerId).toBe(OTHER);
  });

  test("période et statut deviennent des conditions SQL, sur la date de création", async () => {
    setRole("admin");
    await get("/reports/projects?format=xlsx&from=2026-04-01&to=2026-04-30&status=Prospect", "admin");
    const { where } = mockModels.Project.findAll.mock.calls[0][0];
    expect(where.statut).toBe("Prospect");
    expect(where.createdAt[Op.gte].toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(where.createdAt[Op.lt].toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  test("contacts : le périmètre de la politique existante est appliqué ; clients réservés aux administrateurs", async () => {
    setRole("commercial");
    const res = await get("/reports/contacts?format=xlsx", "commercial");
    const { where } = mockModels.CommercialContact.findAll.mock.calls[0][0];
    expect(where[Op.and][0][Op.or]).toEqual([{ createdBy: ME }, { commercialId: ME }]);
    expect(mockClient.findAll).not.toHaveBeenCalled();
    expect((await workbook(res)).worksheets.map((w) => w.name)).toEqual(["Synthèse", "Contacts"]);

    setRole("admin");
    const admin = await get("/reports/contacts?format=xlsx", "admin");
    expect(mockClient.findAll).toHaveBeenCalledTimes(1);
    expect((await workbook(admin)).worksheets.map((w) => w.name)).toEqual(["Synthèse", "Contacts", "Clients"]);
  });

  test("actions : un commercial n'obtient que celles de ses projets", async () => {
    setRole("commercial");
    mockModels.Project.findAll.mockResolvedValue([{ id: "p1", nomProjet: "Mon projet" }]);
    await get("/reports/followups?format=xlsx", "commercial");
    expect(mockModels.Project.findAll.mock.calls[0][0].where).toEqual({ ownerId: ME });
    expect(mockModels.ProjectAction.findAll.mock.calls[0][0].where.projectId[Op.in]).toEqual(["p1"]);
  });

  test("actions : le commercial sédentaire n'a pas la feuille des actions de projet", async () => {
    setRole("commercial_sedentaire");
    const res = await get("/reports/followups?format=xlsx", "commercial_sedentaire");
    expect(mockModels.ProjectAction.findAll).not.toHaveBeenCalled();
    expect((await workbook(res)).worksheets.map((w) => w.name)).toEqual(["Synthèse", "Relances contacts"]);
  });

  test("production : délégué au service existant avec l'identité relue en base", async () => {
    setRole("responsable_logistique_achat");
    const res = await get("/production/reports/production?format=xlsx&period=week&line=promesh", "responsable_logistique_achat");
    expect(res.status).toBe(200);
    expect(mockProduction.getExportData).toHaveBeenCalledWith({ id: ME, role: "responsable_logistique_achat", email: "moi@test.local" }, { period: "week", line: "promesh" });
    expect(res.headers["content-disposition"]).toContain("production-test.xlsx");
  });
});

describe("Fichier Excel", () => {
  test("structure : feuilles, en-tête de rapport, colonnes, filtre automatique, volets figés, formats", async () => {
    setRole("commercial");
    mockModels.Project.findAll.mockResolvedValue([project(1), project(2, { validationStatut: "Validé", isArchived: true })]);
    mockModels.Project.count.mockResolvedValueOnce(7).mockResolvedValueOnce(3).mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    const res = await get("/reports/projects?format=xlsx&from=2026-04-01&to=2026-09-30", "commercial");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="rapport-projects-\d{8}-\d{4}\.xlsx"/);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-report-rows"]).toBe("2");
    expect(res.headers["x-report-truncated"]).toBe("false");

    const wb = await workbook(res);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Synthèse", "Projets"]);
    const ws = wb.getWorksheet("Projets");
    expect(ws.getCell(1, 1).value).toBe("Rapport des projets — Projets");
    const meta = sheetText(ws);
    expect(meta).toContain("Période : du 01/04/2026 au 30/09/2026");
    expect(meta).toContain("Périmètre : Projets dont vous êtes propriétaire");
    expect(meta).toMatch(/Généré le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} par Moi Test \(moi@test\.local\)/);

    const h = headerRowIndex(ws, "Projet");
    expect(ws.getRow(h).values.slice(1)).toEqual(["Projet", "Client (société)", "Statut du projet", "Modèle de projet", "Type de projet", "Famille de produit",
      "Validation", "Date de création", "Date de démarrage", "Montant du marché", "Surface prospectée", "Archivé"]);
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: h });
    const created = ws.getCell(h + 1, 8);
    expect(created.value).toBeInstanceOf(Date);
    expect(created.numFmt).toBe("dd/mm/yyyy");
    expect(ws.getCell(h + 1, 10).value).toBe(15500.5);
    expect(ws.getCell(h + 1, 10).numFmt).toBe("#,##0.00");
    expect(ws.getCell(h + 2, 12).value).toBe("Oui");
  });

  test("la colonne « Commercial » n'existe que pour un administrateur", async () => {
    setRole("admin");
    mockModels.Project.findAll.mockResolvedValue([project(1, { ownerId: OTHER })]);
    mockModels.User.findAll.mockResolvedValue([{ id: OTHER, email: "autre@test.local" }]);
    const ws = (await workbook(await get("/reports/projects?format=xlsx", "admin"))).getWorksheet("Projets");
    const h = headerRowIndex(ws, "Projet");
    expect(ws.getRow(h).getCell(13).value).toBe("Commercial");
    expect(ws.getCell(h + 1, 13).value).toBe("autre@test.local");
  });

  test("aucune donnée : fichier valide avec la mention « Aucune donnée »", async () => {
    setRole("commercial");
    const ws = (await workbook(await get("/reports/projects?format=xlsx", "commercial"))).getWorksheet("Projets");
    expect(sheetText(ws)).toContain("Aucune donnée pour ces critères.");
  });

  test("données sensibles : colonnes lues en liste blanche, et un champ en trop n'est jamais écrit", async () => {
    setRole("admin");
    mockModels.Project.findAll.mockResolvedValue([project(1, { passwordHash: "HASH-SECRET", refreshTokenHash: "JETON-SECRET" })]);
    const res = await get("/reports/projects?format=xlsx", "admin");
    const text = (await workbook(res)).worksheets.map(sheetText).join(" ");
    expect(text).not.toMatch(/HASH-SECRET|JETON-SECRET|passwordHash|refreshToken/);
    const read = [mockModels.Project, mockModels.User, mockModels.CommercialContact, mockModels.ProjectAction, mockModels.CommercialContactRelance, mockClient]
      .flatMap((m) => [...m.findAll.mock.calls, ...m.findByPk.mock.calls.map((c) => [c[1]])])
      .map(([options]) => options && options.attributes);
    for (const attributes of read) {
      expect(Array.isArray(attributes)).toBe(true);
      expect(attributes.join(",")).not.toMatch(/password|token|hash|lastLogin|mfa|secret/i);
    }
  });

  test("une valeur commençant par = + - @ est neutralisée (pas de formule injectée)", async () => {
    expect(safeText("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(safeText("+33 1 23")).toBe("'+33 1 23");
    expect(safeText("Projet normal")).toBe("Projet normal");
    setRole("commercial");
    mockModels.Project.findAll.mockResolvedValue([project(1, { nomProjet: "=1+1" })]);
    const ws = (await workbook(await get("/reports/projects?format=xlsx", "commercial"))).getWorksheet("Projets");
    const cell = ws.getCell(headerRowIndex(ws, "Projet") + 1, 1);
    expect(cell.value).toBe("'=1+1");
    expect(cell.formula).toBeUndefined();
  });
});

describe("Volumes et erreurs", () => {
  test(`la lecture est bornée à ${MAX_ROWS} lignes et le dépassement est signalé`, async () => {
    setRole("admin");
    mockModels.Project.findAll.mockImplementation(async (options) =>
      options.attributes.includes("nomProjet") ? Array.from({ length: MAX_ROWS + 1 }, (_, i) => project(i)) : []
    );
    const res = await get("/reports/projects?format=xlsx", "admin");
    expect(mockModels.Project.findAll.mock.calls[0][0].limit).toBe(MAX_ROWS + 1);
    expect(res.headers["x-report-rows"]).toBe(String(MAX_ROWS));
    expect(res.headers["x-report-truncated"]).toBe("true");
    const ws = (await workbook(res)).getWorksheet("Projets");
    expect(sheetText(ws)).toContain(`Export limité aux ${MAX_ROWS} premières lignes`);
    expect(ws.rowCount).toBeLessThanOrEqual(MAX_ROWS + 12);
  }, 60000);

  test("erreur de lecture : 500 avec un message neutre, sans détail technique", async () => {
    setRole("admin");
    mockModels.Project.findAll.mockRejectedValue(new Error('relation "projects" does not exist'));
    const res = await json("/reports/projects?format=xlsx", "admin");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: "Le rapport n'a pas pu être généré." });
  });
});

describe("PDF", () => {
  const pages = (buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

  test("fichier PDF valide, sur plusieurs pages quand le tableau est long", async () => {
    setRole("admin");
    mockModels.Project.findAll.mockImplementation(async (options) => (options.attributes.includes("nomProjet") ? Array.from({ length: 120 }, (_, i) => project(i)) : []));
    const res = await get("/reports/projects?format=pdf", "admin");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(/rapport-projects-\d{8}-\d{4}\.pdf/);
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
    expect(res.body.slice(-6).toString()).toContain("%%EOF");
    expect(pages(res.body)).toBeGreaterThan(1);
  });

  // Régression constatée à la relecture d'un PDF réel : le pied de page écrit
  // sous la marge basse ajoutait une page blanche par page du rapport.
  test("un petit rapport tient sur exactement une page (le pied de page n'en crée pas)", async () => {
    setRole("admin");
    mockModels.Project.findAll.mockImplementation(async (options) => (options.attributes.includes("nomProjet") ? [project(1), project(2)] : []));
    const res = await get("/reports/projects?format=pdf", "admin");
    expect(pages(res.body)).toBe(1);
  });

  test(`le tableau d'un PDF est borné à ${PDF_MAX_ROWS} lignes`, async () => {
    setRole("admin");
    mockModels.Project.findAll.mockImplementation(async (options) => (options.attributes.includes("nomProjet") ? Array.from({ length: 900 }, (_, i) => project(i)) : []));
    const big = await get("/reports/projects?format=pdf", "admin");
    mockModels.Project.findAll.mockImplementation(async (options) => (options.attributes.includes("nomProjet") ? Array.from({ length: PDF_MAX_ROWS }, (_, i) => project(i)) : []));
    const capped = await get("/reports/projects?format=pdf", "admin");
    expect(pages(big.body)).toBe(pages(capped.body));
  }, 60000);

  test.each(["dashboard", "contacts", "followups"])("rapport « %s » en PDF : fichier valide, même sans donnée", async (type) => {
    setRole("admin");
    const res = await get(`/reports/${type}?format=pdf`, "admin");
    expect(res.status).toBe(200);
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });
});

describe("Cohérence avec le tableau de bord", () => {
  test("synthèse : les indicateurs exportés sont exactement ceux de GET /dashboard/me", async () => {
    setRole("commercial");
    const res = await get("/reports/dashboard?format=xlsx&period=month", "commercial");
    expect(mockMe.getMyDashboard).toHaveBeenCalledWith({ sub: ME, role: "commercial" }, { period: "month" });
    const wb = await workbook(res);
    const ws = wb.getWorksheet("Synthèse");
    const h = headerRowIndex(ws, "Indicateur");
    expect([ws.getCell(h + 1, 1).value, ws.getCell(h + 1, 2).value]).toEqual(["Projets actifs", 12]);
    expect([ws.getCell(h + 2, 1).value, ws.getCell(h + 2, 2).value, ws.getCell(h + 2, 3).value]).toEqual(["Taux de validation", 33.33, "%"]);
    expect(sheetText(ws)).toContain("Périmètre : vos projets.");
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Synthèse", "Indicateurs", "Modules"]);
  });

  test("projets : « Projets actifs » suit la définition du tableau de bord (propriétaire, non archivé)", async () => {
    setRole("commercial");
    mockModels.Project.count.mockResolvedValueOnce(12).mockResolvedValueOnce(4).mockResolvedValueOnce(8).mockResolvedValueOnce(1);
    const ws = (await workbook(await get("/reports/projects?format=xlsx", "commercial"))).getWorksheet("Synthèse");
    const h = headerRowIndex(ws, "Indicateur");
    expect([1, 2, 3, 4].map((i) => [ws.getCell(h + i, 1).value, ws.getCell(h + i, 2).value])).toEqual([
      ["Projets actifs", 12], ["Projets validés", 4], ["Projets non validés", 8], ["Projets archivés", 1],
    ]);
    const [active, validated, notValidated, archived] = mockModels.Project.count.mock.calls.map(([a]) => a.where);
    expect(active).toEqual({ ownerId: ME, isArchived: false });
    expect(validated).toEqual({ ownerId: ME, isArchived: false, validationStatut: "Validé" });
    expect(notValidated).toEqual({ ownerId: ME, isArchived: false, validationStatut: "Non validé" });
    expect(archived).toEqual({ ownerId: ME, isArchived: true });
  });
});
