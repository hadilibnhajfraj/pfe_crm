"use strict";

// GET /dashboard/me (et son alias GET /users/me/dashboard) — tableau de bord
// personnalisé. Vérifie que :
//   - le profil vient de la base (users.role), pas du rôle porté par le jeton ;
//   - chaque rôle ne reçoit que ses modules et ses indicateurs ;
//   - aucun paramètre client ne permet de viser un autre utilisateur ;
//   - les indicateurs sont exactement ceux des services existants (cohérence) ;
//   - un service en erreur n'empêche pas la réponse.
// Aucune base de données : modèles et services sont remplacés.

require("dotenv").config();

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ message: "Missing token" });
    req.user = JSON.parse(req.headers["x-test-user"]);
    return next();
  },
}));

const mockUser = { findByPk: jest.fn(), findAll: jest.fn(), findOne: jest.fn() };
const mockProfile = { findOne: jest.fn(), findAll: jest.fn() };
jest.mock("../src/models/associations", () => ({ User: mockUser, UserProfile: mockProfile }));
jest.mock("../src/models/User", () => mockUser);
jest.mock("../src/models/UserProfile", () => mockProfile);

const mockDashboard = { getKPIByRole: jest.fn(), getKPIs: jest.fn(), getProfessionalKPIs: jest.fn(), getUserDashboard: jest.fn() };
jest.mock("../src/modules/dashboard/services/dashboard.service", () => mockDashboard);
const mockContacts = { getCommercialContactKPI: jest.fn(), getMyKPI: jest.fn(), ADMIN_ROLES: ["admin", "superadmin", "superadmin2"] };
jest.mock("../src/modules/commercial-contacts/services/commercialContactKpi.service", () => mockContacts);
const mockProduction = { getDashboard: jest.fn() };
jest.mock("../src/modules/production/services/production.service", () => mockProduction);

const request = require("supertest");
const express = require("express");
const dashboardRoutes = require("../src/modules/dashboard/routes/dashboard.routes");
const usersRoutes = require("../src/routes/users.routes");
const { ALLOWED_PREFIXES_BY_ROLE } = require("../src/middleware/moduleAccessGuard");

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ADMINS = ["admin", "superadmin", "superadmin2"];
const ALL_ROLES = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat", ...ADMINS];

const ADMIN_STATS = { totalProjects: 80, totalUsers: 10, totalValidated: 30, totalNonValidated: 45, totalArchived: 5, validationRate: 37.5 };
const USER_STATS = { myProjects: 12, myValidated: 4, myNonValidated: 8, myArchived: 1, successRate: 33.33, myRelances: 7, myRelancesToday: 1, myRelancesWeek: 3, myRelancesLate: 2 };
const CONTACTS_GLOBAL = { totalContacts: 150, totalCalls: 420, totalCompanies: 40, contactsActifs: 75 };
const MY_CONTACTS = { totalContacts: 20, totalCalls: 55, totalCompanies: 9, validatedContacts: 11, invalidContacts: 9 };
const PRODUCTION = {
  period: { key: "month", from: "2026-10-01", to: "2026-10-31", label: "Ce mois", granularity: "day" },
  generatedAt: "2026-10-10T20:00:00.000Z",
  promesh: { fiches: 9, quantity: 12400.5 },
  probar: { fiches: 7, quantity: 9800 },
  machines: { active: 8, total: 9 },
  waste: { kg: 312.4 },
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/dashboard", dashboardRoutes);
  app.use("/users", usersRoutes);
  return app;
}
const tokenUser = (role, sub = ME) => JSON.stringify({ sub, role, email: "jeton@test.local" });
const call = (path, tokenRole) => request(buildApp()).get(path).set("x-test-user", tokenUser(tokenRole));
const dbUser = (role, extra = {}) => ({ id: ME, email: "moi@test.local", role, isActive: true, ...extra });
const byKey = (kpis) => Object.fromEntries(kpis.map((k) => [k.key, k.value]));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockProfile.findOne.mockResolvedValue({ name: "Moi Test", nom: null, prenom: null });
  mockDashboard.getKPIByRole.mockImplementation(async (_id, role) =>
    ADMINS.includes(role) ? { role: "admin", stats: ADMIN_STATS } : { role: "user", stats: USER_STATS }
  );
  mockContacts.getCommercialContactKPI.mockResolvedValue({ global: CONTACTS_GLOBAL });
  mockContacts.getMyKPI.mockResolvedValue(MY_CONTACTS);
  mockProduction.getDashboard.mockResolvedValue(PRODUCTION);
});

describe("Accès", () => {
  test("sans jeton → 401, aucune lecture", async () => {
    const res = await request(buildApp()).get("/dashboard/me");
    expect(res.status).toBe(401);
    expect(mockUser.findByPk).not.toHaveBeenCalled();
  });

  test("compte supprimé → 401", async () => {
    mockUser.findByPk.mockResolvedValue(null);
    expect((await call("/dashboard/me", "admin")).status).toBe(401);
    expect(mockDashboard.getKPIByRole).not.toHaveBeenCalled();
  });

  test("compte désactivé → 403, même avec un jeton encore valide", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("admin", { isActive: false }));
    expect((await call("/dashboard/me", "admin")).status).toBe(403);
    expect(mockDashboard.getKPIByRole).not.toHaveBeenCalled();
  });

  test.each(ALL_ROLES)("%s : réponse 200 avec la structure attendue, non mise en cache", async (role) => {
    mockUser.findByPk.mockResolvedValue(dbUser(role));
    const res = await call("/dashboard/me", role);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body.data).sort()).toEqual(["filters", "freshness", "kpis", "limitations", "modules", "profile"]);
    expect(res.body.data.profile).toMatchObject({ id: ME, role, source: "database", displayName: "Moi Test" });
    expect(res.body.data.freshness.mode).toBe("live");
  });
});

describe("Le profil vient de la base, pas du jeton ni de la requête", () => {
  test("jeton « admin » mais rôle « commercial » en base → vue commercial, aucun indicateur global", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("commercial"));
    const res = await call("/dashboard/me", "admin");
    expect(res.body.data.profile.role).toBe("commercial");
    expect(mockDashboard.getKPIByRole).toHaveBeenCalledWith(ME, "commercial");
    expect(mockContacts.getCommercialContactKPI).not.toHaveBeenCalled();
    expect(mockProduction.getDashboard).not.toHaveBeenCalled();
    expect(res.body.data.modules.map((m) => m.key)).not.toContain("users_admin");
    expect(res.body.data.limitations.join(" ")).toMatch(/rôle a changé/);
  });

  test("?userId=, ?role= et ?ownerId= sont sans effet : l'identité est celle du jeton", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("commercial"));
    const res = await call(`/dashboard/me?userId=${OTHER}&ownerId=${OTHER}&role=admin`, "commercial");
    expect(mockUser.findByPk.mock.calls[0][0]).toBe(ME);
    expect(mockDashboard.getKPIByRole).toHaveBeenCalledWith(ME, "commercial");
    expect(res.body.data.profile.id).toBe(ME);
  });

  test("aucune donnée d'authentification dans la réponse", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("admin", { passwordHash: "x", refreshTokenHash: "y" }));
    const text = JSON.stringify((await call("/dashboard/me", "admin")).body);
    expect(text).not.toMatch(/passwordHash|refreshToken|TokenHash|lastLoginIp|mfa/i);
    expect(mockUser.findByPk.mock.calls[0][1].attributes).toEqual(["id", "email", "role", "isActive"]);
  });
});

describe("Vue par profil", () => {
  test.each(ADMINS)("%s : projets, contacts et production de toute l'entreprise, un seul appel par service", async (role) => {
    mockUser.findByPk.mockResolvedValue(dbUser(role));
    const { data } = (await call("/dashboard/me", role)).body;
    expect(data.profile.key).toBe("administration");
    expect(mockDashboard.getKPIByRole).toHaveBeenCalledTimes(1);
    expect(mockContacts.getCommercialContactKPI).toHaveBeenCalledTimes(1);
    expect(mockContacts.getCommercialContactKPI).toHaveBeenCalledWith(null);
    expect(mockProduction.getDashboard).toHaveBeenCalledTimes(1);
    expect(data.modules.map((m) => m.key)).toEqual(expect.arrayContaining(["projects", "clients", "users_admin", "production"]));
    expect(data.filters.map((f) => f.key)).toEqual(["period"]);
  });

  test("commercial : ses projets et ses relances uniquement", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("commercial"));
    const { data } = (await call("/dashboard/me", "commercial")).body;
    expect(data.modules.map((m) => m.key)).toEqual(["projects", "pipeline", "commercial_contacts"]);
    expect(data.kpis.map((k) => k.group)).toEqual(expect.arrayContaining(["Mes projets", "Mes relances"]));
    expect(mockContacts.getMyKPI).not.toHaveBeenCalled();
    expect(data.filters).toEqual([]);
  });

  test("commercial sédentaire : les contacts qu'il a saisis", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("commercial_sedentaire"));
    const { data } = (await call("/dashboard/me", "commercial_sedentaire")).body;
    expect(mockContacts.getMyKPI).toHaveBeenCalledWith(ME);
    expect(mockDashboard.getKPIByRole).not.toHaveBeenCalled();
    expect(data.modules.map((m) => m.key)).toEqual(["commercial_contacts", "contacts_kpi"]);
  });

  test("responsable logistique : production seulement, modules bornés par moduleAccessGuard", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("responsable_logistique_achat"));
    const { data } = (await call("/dashboard/me", "responsable_logistique_achat")).body;
    expect(mockProduction.getDashboard).toHaveBeenCalledWith({ id: ME, role: "responsable_logistique_achat", email: "moi@test.local" }, { period: "month" });
    expect(mockDashboard.getKPIByRole).not.toHaveBeenCalled();
    const allowed = ALLOWED_PREFIXES_BY_ROLE.responsable_logistique_achat;
    expect(data.modules.length).toBeGreaterThan(0);
    for (const m of data.modules) expect(allowed.some((p) => m.api === p || m.api.startsWith(`${p}/`))).toBe(true);
    expect(data.modules.map((m) => m.key)).not.toContain("projects");
  });

  test("responsable logistique : l'alias GET /users/me/dashboard renvoie la même vue", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("responsable_logistique_achat"));
    const res = await call("/users/me/dashboard", "responsable_logistique_achat");
    expect(res.status).toBe(200);
    expect(res.body.data.profile.key).toBe("logistique");
    expect(ALLOWED_PREFIXES_BY_ROLE.responsable_logistique_achat.some((p) => "/users/me/dashboard".startsWith(p))).toBe(true);
  });

  test("accueil : vue minimale, aucun indicateur, aucun service de KPI appelé", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("accueil"));
    const { data } = (await call("/dashboard/me", "accueil")).body;
    expect(data.kpis).toEqual([]);
    expect(data.modules.map((m) => m.key)).toEqual(["commercial_contacts", "project_user_stats"]);
    expect(data.limitations.join(" ")).toMatch(/Aucun indicateur/);
    expect(mockDashboard.getKPIByRole).not.toHaveBeenCalled();
    expect(mockContacts.getMyKPI).not.toHaveBeenCalled();
    expect(mockProduction.getDashboard).not.toHaveBeenCalled();
  });

  test("rôle inconnu en base : rien n'est exposé", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("role_inexistant"));
    const { data } = (await call("/dashboard/me", "admin")).body;
    expect(data.modules).toEqual([]);
    expect(data.kpis).toEqual([]);
    expect(data.profile.key).toBe("inconnu");
  });
});

describe("Cohérence des indicateurs avec les services existants", () => {
  test("administrateur : valeurs identiques à dashboard, contacts et production", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("admin"));
    const k = byKey((await call("/dashboard/me", "admin")).body.data.kpis);
    expect(k).toMatchObject({
      projects_total: ADMIN_STATS.totalProjects,
      projects_validated: ADMIN_STATS.totalValidated,
      projects_not_validated: ADMIN_STATS.totalNonValidated,
      projects_archived: ADMIN_STATS.totalArchived,
      projects_validation_rate: ADMIN_STATS.validationRate,
      users_total: ADMIN_STATS.totalUsers,
      contacts_total: CONTACTS_GLOBAL.totalContacts,
      contacts_active: CONTACTS_GLOBAL.contactsActifs,
      contacts_calls: CONTACTS_GLOBAL.totalCalls,
      contacts_companies: CONTACTS_GLOBAL.totalCompanies,
      promesh_fiches: PRODUCTION.promesh.fiches,
      promesh_quantity: PRODUCTION.promesh.quantity,
      probar_fiches: PRODUCTION.probar.fiches,
      probar_quantity: PRODUCTION.probar.quantity,
      waste_kg: PRODUCTION.waste.kg,
      machines_active: PRODUCTION.machines.active,
      machines_total: PRODUCTION.machines.total,
    });
  });

  test("commercial : valeurs identiques à dashboard.service (vue utilisateur)", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("commercial"));
    const k = byKey((await call("/dashboard/me", "commercial")).body.data.kpis);
    expect(k).toEqual({
      my_projects: 12, my_projects_validated: 4, my_projects_not_validated: 8, my_projects_archived: 1, my_validation_rate: 33.33,
      my_followups: 7, my_followups_today: 1, my_followups_week: 3, my_followups_late: 2,
    });
  });

  test("commercial sédentaire : valeurs identiques à getMyKPI", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("commercial_sedentaire"));
    const k = byKey((await call("/dashboard/me", "commercial_sedentaire")).body.data.kpis);
    expect(k).toEqual({ my_contacts: 20, my_contacts_ok: 11, my_contacts_other: 9, my_calls: 55, my_companies: 9 });
  });

  test("unités : m² pour PROMESH, kg pour les déchets, aucune pour PROBAR ; chaque indicateur cite sa source", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("admin"));
    const { kpis, limitations } = (await call("/dashboard/me", "admin")).body.data;
    const unit = Object.fromEntries(kpis.map((x) => [x.key, x.unit]));
    expect(unit.promesh_quantity).toBe("m²");
    expect(unit.waste_kg).toBe("kg");
    expect(unit.probar_quantity).toBeNull();
    expect(limitations.join(" ")).toMatch(/PROBAR/);
    for (const x of kpis) expect(x.source).toMatch(/service/);
  });

  test("une valeur absente d'un service reste vide, jamais remplacée par zéro", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("commercial"));
    mockDashboard.getKPIByRole.mockResolvedValue({ stats: { myProjects: 3 } });
    const k = byKey((await call("/dashboard/me", "commercial")).body.data.kpis);
    expect(k.my_projects).toBe(3);
    expect(k.my_followups_late).toBeNull();
  });
});

describe("Filtres et pannes", () => {
  test("la période demandée est transmise au service de production", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("admin"));
    const { data } = (await call("/dashboard/me?period=week", "admin")).body;
    expect(mockProduction.getDashboard.mock.calls[0][1]).toEqual({ period: "week" });
    expect(data.filters[0].value).toBe("week");
    expect(data.freshness.production).toEqual({ period: PRODUCTION.period, generatedAt: PRODUCTION.generatedAt });
  });

  test("période inconnue : « month » appliquée et signalée", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("admin"));
    const { data } = (await call("/dashboard/me?period=siecle", "admin")).body;
    expect(mockProduction.getDashboard.mock.calls[0][1]).toEqual({ period: "month" });
    expect(data.limitations.join(" ")).toMatch(/siecle/);
  });

  test("un service en erreur : réponse 200, bloc omis et signalé, les autres blocs restent", async () => {
    mockUser.findByPk.mockResolvedValue(dbUser("admin"));
    mockProduction.getDashboard.mockRejectedValue(new Error("boom"));
    const res = await call("/dashboard/me", "admin");
    expect(res.status).toBe(200);
    const keys = res.body.data.kpis.map((k) => k.key);
    expect(keys).toContain("projects_total");
    expect(keys).not.toContain("promesh_fiches");
    expect(res.body.data.limitations.join(" ")).toMatch(/Production.*indisponibles/);
    expect(JSON.stringify(res.body)).not.toMatch(/boom/);
  });
});
