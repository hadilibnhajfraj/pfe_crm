"use strict";

// GET /powerbi/embed-config — tests sans base de données ni réseau :
// le modèle User et le client HTTP sont simulés.

const express = require("express");
const request = require("supertest");
const { createPowerBiService, resolvePolicy, readConfig } = require("../src/modules/powerbi/powerbi.service");
const { createPowerBiRouter } = require("../src/modules/powerbi/powerbi.routes");

const C1 = "ee815d2c-3a83-57fa-9570-76693b29bf69";
const C2 = "68d9ded1-f1e5-566e-8a8e-e9e202e0066e";
const ADMIN = "0c5d1905-ab93-5cdf-ad1b-117f2c57851e";

const USERS = {
  [C1]: { id: C1, email: "demo.commercial01@cbi_tunisia.com", role: "commercial", isActive: true },
  [C2]: { id: C2, email: "demo.commercial02@cbi_tunisia.com", role: "commercial", isActive: true },
  [ADMIN]: { id: ADMIN, email: "demo.admin01@cbi_tunisia.com", role: "admin", isActive: true },
  sed: { id: "sed", email: "demo.commercial_sedentaire01@cbi_tunisia.com", role: "commercial_sedentaire", isActive: true },
  log: { id: "log", email: "demo.responsable_logistique_achat01@cbi_tunisia.com", role: "responsable_logistique_achat", isActive: true },
  sa2: { id: "sa2", email: "x@example.test", role: "superadmin2", isActive: true },
  off: { id: "off", email: "off@example.test", role: "commercial", isActive: false },
};

const ENV = {
  POWERBI_EMBED_ENABLED: "true",
  DEMO_MODE: "true",
  POWERBI_TENANT_ID: "tenant",
  POWERBI_CLIENT_ID: "client",
  POWERBI_CLIENT_SECRET: "s3cret-value",
  POWERBI_WORKSPACE_ID: "ws",
  POWERBI_REPORT_ID: "rep",
  POWERBI_DATASET_ID: "ds",
};

function fakeHttp() {
  const calls = [];
  return {
    calls,
    post: jest.fn(async (url, body) => {
      calls.push({ method: "POST", url, body });
      if (url.includes("login.microsoftonline.com")) return { data: { access_token: "aad-token" } };
      return { data: { token: "embed-token", expiration: "2026-10-16T09:30:00Z" } };
    }),
    get: jest.fn(async (url) => {
      calls.push({ method: "GET", url });
      return { data: { embedUrl: "https://app.powerbi.com/reportEmbed?reportId=rep" } };
    }),
  };
}

function build({ env = ENV, http = fakeHttp(), sub = C1, tokenRole } = {}) {
  const User = { findByPk: jest.fn(async (id) => USERS[id] || null) };
  const service = createPowerBiService({ User, http, env });
  const app = express();
  app.use(express.json());
  // Remplace authRequired : pose req.user comme le ferait un JWT vérifié.
  const auth = (req, _res, next) => { req.user = { sub, role: tokenRole || "commercial", email: "jwt@example.test" }; next(); };
  app.use("/powerbi", createPowerBiRouter({ service, auth }));
  return { app, http, User };
}

const identityOf = (http) => http.calls.find((c) => c.url.endsWith("/GenerateToken")).body.identities[0];

describe("GET /powerbi/embed-config", () => {
  let errSpy;
  beforeEach(() => { errSpy = jest.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => errSpy.mockRestore());

  test("désactivée par défaut : 503, aucun appel à la base ni à Microsoft", async () => {
    const { app, http, User } = build({ env: { ...ENV, POWERBI_EMBED_ENABLED: undefined } });
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("POWERBI_NOT_CONFIGURED");
    expect(User.findByPk).not.toHaveBeenCalled();
    expect(http.calls).toHaveLength(0);
  });

  test("paramètre Microsoft manquant : 503", async () => {
    const { app, http } = build({ env: { ...ENV, POWERBI_CLIENT_SECRET: "" } });
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.body.code).toBe("POWERBI_NOT_CONFIGURED");
    expect(http.calls).toHaveLength(0);
  });

  test("hors mode démonstration : 503, aucun appel", async () => {
    const { app, http, User } = build({ env: { ...ENV, DEMO_MODE: undefined } });
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("POWERBI_DEMO_ONLY");
    expect(User.findByPk).not.toHaveBeenCalled();
    expect(http.calls).toHaveLength(0);
  });

  test("commercial01 : rôle RLS Commercial, identité = son UUID", async () => {
    const { app, http } = build({ sub: C1 });
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(identityOf(http)).toEqual({ username: C1, roles: ["Commercial"], datasets: ["ds"] });
    expect(res.body.viewer.label).toBe("Utilisateur connecté : demo.commercial01@cbi_tunisia.com");
    expect(res.body.viewer.scope).toBe("commercial");
    expect(res.body.viewer.allowedPages).toHaveLength(4);
    expect(res.body.viewer.allowedPages.join(" ")).not.toMatch(/Clients|Production|Machines/);
    expect(res.body.embedToken).toBe("embed-token");
  });

  test("commercial02 : identité distincte de commercial01", async () => {
    const { app, http } = build({ sub: C2 });
    const res = await request(app).get("/powerbi/embed-config");
    expect(identityOf(http).username).toBe(C2);
    expect(res.body.viewer.email).toBe("demo.commercial02@cbi_tunisia.com");
  });

  test("administrateur : Vue globale", async () => {
    const { app, http } = build({ sub: ADMIN });
    const res = await request(app).get("/powerbi/embed-config");
    expect(identityOf(http).roles).toEqual(["Vue globale"]);
    expect(res.body.viewer.label).toBe("Vue globale — Administrateur");
    expect(res.body.viewer.allowedPages).toBeNull();
  });

  test("l'identité envoyée par le navigateur est ignorée (query, corps, en-têtes)", async () => {
    const { app, http } = build({ sub: C1 });
    const res = await request(app)
      .get(`/powerbi/embed-config?userId=${ADMIN}&email=demo.admin01@cbi_tunisia.com&role=admin&username=${C2}`)
      .set("X-User-Id", ADMIN)
      .set("X-User-Role", "admin")
      .send({ userId: ADMIN, role: "admin", identities: [{ username: ADMIN, roles: ["Vue globale"] }] });
    expect(res.status).toBe(200);
    expect(identityOf(http)).toEqual({ username: C1, roles: ["Commercial"], datasets: ["ds"] });
    expect(res.body.viewer.scope).toBe("commercial");
  });

  test("le rôle vient de la base, pas du jeton : un jeton « admin » sur un compte commercial reste Commercial", async () => {
    const { app, http } = build({ sub: C1, tokenRole: "admin" });
    await request(app).get("/powerbi/embed-config");
    expect(identityOf(http).roles).toEqual(["Commercial"]);
  });

  test("commercial sédentaire : rôle RLS Commercial (uniquement ses rattachements)", async () => {
    const { app, http } = build({ sub: "sed" });
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.status).toBe(200);
    expect(identityOf(http)).toMatchObject({ username: "sed", roles: ["Commercial"] });
  });

  test.each([["log", "responsable_logistique_achat"], ["sa2", "superadmin2"]])("rôle sans politique (%s) : 403, aucun appel Microsoft", async (sub) => {
    const { app, http } = build({ sub });
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("POWERBI_ROLE_NOT_ALLOWED");
    expect(http.calls).toHaveLength(0);
  });

  test.each([["off"], ["inconnu"]])("compte désactivé ou supprimé (%s) : 403, aucun appel Microsoft", async (sub) => {
    const { app, http } = build({ sub });
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("POWERBI_USER_INACTIVE");
    expect(http.calls).toHaveLength(0);
  });

  test("échec Microsoft : 502 générique, sans secret ni jeton dans la réponse ou les journaux", async () => {
    const http = fakeHttp();
    http.post.mockImplementationOnce(async () => { const e = new Error("invalid_client s3cret-value"); e.response = { status: 401, data: { error: "s3cret-value" } }; throw e; });
    const { app } = build({ http });
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("POWERBI_UPSTREAM_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/s3cret|aad-token/);
    expect(errSpy.mock.calls.flat().join(" ")).not.toMatch(/s3cret|aad-token/);
  });

  test("le secret Microsoft n'apparaît jamais dans la réponse", async () => {
    const { app } = build({ sub: C1 });
    const res = await request(app).get("/powerbi/embed-config");
    expect(JSON.stringify(res.body)).not.toMatch(/s3cret-value|aad-token|client_secret/);
  });
});

describe("politique et configuration", () => {
  test("rôles autorisés", () => {
    expect(resolvePolicy("commercial").rlsRole).toBe("Commercial");
    expect(resolvePolicy("commercial_sedentaire").rlsRole).toBe("Commercial");
    expect(resolvePolicy("admin").rlsRole).toBe("Vue globale");
    expect(resolvePolicy("superadmin").rlsRole).toBe("Vue globale");
    for (const r of ["responsable_logistique_achat", "superadmin2", "accueil", "", undefined, "__proto__"]) expect(resolvePolicy(r)).toBeNull();
  });

  test("readConfig liste les variables manquantes", () => {
    expect(readConfig({}).enabled).toBe(false);
    expect(readConfig({}).missing).toHaveLength(6);
    expect(readConfig(ENV).missing).toHaveLength(0);
  });
});

describe("routeur monté par défaut", () => {
  test("sans configuration : 503 sans charger le modèle User ni la base", async () => {
    jest.resetModules();
    const saved = process.env.POWERBI_EMBED_ENABLED;
    delete process.env.POWERBI_EMBED_ENABLED;
    jest.doMock("../src/middleware/auth.middleware", () => ({ authRequired: (req, _res, next) => { req.user = { sub: C1 }; next(); } }));
    jest.doMock("../src/models/User", () => { throw new Error("le modèle User ne doit pas être chargé"); });
    const router = require("../src/modules/powerbi/powerbi.routes");
    const app = express();
    app.use("/powerbi", router);
    const res = await request(app).get("/powerbi/embed-config");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("POWERBI_NOT_CONFIGURED");
    if (saved !== undefined) process.env.POWERBI_EMBED_ENABLED = saved;
  });
});
