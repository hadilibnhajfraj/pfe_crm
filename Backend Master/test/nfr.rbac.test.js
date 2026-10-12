"use strict";
// Audit non fonctionnel — SÉCURITÉ / contrôle d'accès par rôle (RBAC).
// La matrice attendue traduit les règles métier du CRM (7 rôles réels) :
//   - le Commercial, le Commercial sédentaire et l'Accueil n'accèdent pas à
//     la gestion industrielle ;
//   - le Responsable Logistique & Achat (RLA) est limité à l'industriel et
//     aux services internes ;
//   - l'administration est réservée à admin / superadmin / superadmin2.
const { request, app, sequelize, login, as, ROLES, assertTestDatabase } = require("./nfr.helpers");

const BUSINESS = ["commercial", "commercial_sedentaire", "accueil"];
const RLA = "responsable_logistique_achat";
const ADMINS = ["admin", "superadmin", "superadmin2"];
const NIL = "00000000-0000-0000-0000-000000000000";

// [endpoint GET, rôles autorisés (200) — tous les autres doivent recevoir 403]
const MATRIX = [
  ["/me", ROLES],
  ["/projects", [...BUSINESS, ...ADMINS]],
  ["/commercial-contacts", [...BUSINESS, ...ADMINS]],
  ["/dashboard/user", [...BUSINESS, ...ADMINS]],
  ["/dashboard/kpis", ADMINS],
  ["/admin-dashboard/stats", ADMINS],
  ["/machines", ROLES],
  ["/por-promesh", [RLA, ...ADMINS]],
  ["/industrial-records", [RLA, ...ADMINS]],
  ["/recuperables", [RLA, ...ADMINS]],
  ["/maintenance-requests/my", ROLES],
  ["/maintenance-requests", [RLA, ...ADMINS]],
  ["/hr-requests", ROLES],
  ["/admin/users", ADMINS],
  ["/users", ADMINS],
];

const PROTECTED = [
  "/me",
  "/projects",
  "/commercial-contacts",
  "/notifications",
  "/dashboard/user",
  "/dashboard/kpis",
  "/admin-dashboard/stats",
  "/machines",
  "/por-promesh",
  "/industrial-records",
  "/recuperables",
  "/maintenance-requests",
  "/hr-requests",
  "/archive-requests/my",
  "/admin/users",
  "/users",
  "/tasks",
  "/pipeline-stages",
  "/ai-copilot/conversations",
  "/projects/applicateur",
  "/projects/revendeur",
];

beforeAll(async () => {
  assertTestDatabase();
  for (const role of ROLES) await login(role);
}, 120000);
afterAll(async () => {
  await sequelize.close();
});

describe("Accès anonyme : toute route métier exige un JWT", () => {
  test.each(PROTECTED)("GET %s sans jeton → 401", async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });
});

describe("Matrice RBAC en lecture (rôle × module)", () => {
  const cases = [];
  for (const [path, allowed] of MATRIX) {
    for (const role of ROLES) cases.push([role, path, allowed.includes(role) ? 200 : 403]);
  }
  test.each(cases)("%s → GET %s → %i", async (role, path, expected) => {
    const res = await as(role, "get", path);
    expect(res.status).toBe(expected);
  });
});

describe("RBAC en écriture : actions sensibles", () => {
  test.each(BUSINESS)("%s ne peut pas créer une fiche POR/PROMESH → 403", async (role) => {
    const res = await as(role, "post", "/por-promesh/new", { machine: "1", poste: "matin" });
    expect(res.status).toBe(403);
  });

  test.each(BUSINESS)("%s ne peut pas créer une machine → 403", async (role) => {
    const res = await as(role, "post", "/machines", { typeMachine: "PROBAR", numero: 777 });
    expect(res.status).toBe(403);
  });

  test.each(BUSINESS)("%s ne peut pas saisir une fiche de production → 403", async (role) => {
    const res = await as(role, "post", "/industrial-records", { module: "melange", dateFiche: "2026-10-03" });
    expect(res.status).toBe(403);
  });

  test("le RLA ne peut pas créer de contact commercial → 403", async () => {
    const res = await as(RLA, "post", "/commercial-contacts", { nom: "X", prenom: "Y", telephone: "20000000" });
    expect(res.status).toBe(403);
  });

  test("le RLA ne peut pas créer de projet → 403", async () => {
    const res = await as(RLA, "post", "/projects", { nomProjet: "X" });
    expect(res.status).toBe(403);
  });

  test("un Commercial ne peut pas affecter un contact → 403", async () => {
    const res = await as("commercial", "post", "/commercial-contacts/assign", { contactIds: ["x"], commercialId: "y" });
    expect(res.status).toBe(403);
  });

  test("l'Accueil ne peut pas affecter un contact → 403", async () => {
    const res = await as("accueil", "post", "/commercial-contacts/assign", { contactIds: ["x"], commercialId: "y" });
    expect(res.status).toBe(403);
  });

  test("le Commercial sédentaire franchit le contrôle de rôle de l'affectation (400 sur données invalides, pas 403)", async () => {
    const res = await as("commercial_sedentaire", "post", "/commercial-contacts/assign", { contactIds: [], commercialId: "y" });
    expect(res.status).toBe(400);
  });

  test.each([...BUSINESS, RLA])("%s ne peut pas modifier le rôle d'un utilisateur → 403", async (role) => {
    const { id } = await login("accueil");
    const res = await as(role, "put", `/admin/users/${id}/role`, { role: "superadmin" });
    expect(res.status).toBe(403);
  });

  test("un admin simple ne peut pas modifier un rôle (réservé aux superadministrateurs) → 403", async () => {
    const { id } = await login("accueil");
    const res = await as("admin", "put", `/admin/users/${id}/role`, { role: "commercial" });
    expect(res.status).toBe(403);
  });

  test("un superadmin ne peut pas attribuer un rôle inexistant → 400", async () => {
    const { id } = await login("accueil");
    const res = await as("superadmin", "put", `/admin/users/${id}/role`, { role: "pirate" });
    expect(res.status).toBe(400);
  });

  test.each([...BUSINESS, RLA])("%s ne peut pas désactiver un compte → 403", async (role) => {
    const { id } = await login("accueil");
    const res = await as(role, "put", `/admin/users/${id}/active`, { isActive: false });
    expect(res.status).toBe(403);
  });

  test.each(BUSINESS)("%s ne peut pas traiter une demande de maintenance → 403", async (role) => {
    const res = await as(role, "put", `/maintenance-requests/${NIL}/accept`);
    expect(res.status).toBe(403);
  });

  test("le RLA ne peut pas supprimer une fiche POR/PROMESH (réservé aux administrateurs) → 403", async () => {
    const res = await as(RLA, "delete", `/por-promesh/${NIL}`);
    expect(res.status).toBe(403);
  });

  test("élévation de privilège : un jeton Commercial ne donne pas accès à la liste des utilisateurs", async () => {
    const res = await as("commercial", "get", "/admin/users");
    expect(res.status).toBe(403);
    expect(Array.isArray(res.body)).toBe(false);
  });
});
