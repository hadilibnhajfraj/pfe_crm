"use strict";
// Audit non fonctionnel — SÉCURITÉ / authentification JWT.
const jwt = require("jsonwebtoken");
const { request, app, sequelize, login, emailOf, QA_PASSWORD, assertTestDatabase } = require("./nfr.helpers");
const { ROLE_VOCABULARY_VERSION } = require("../src/constants/roles");

const SIGN_OPTS = { issuer: "my-api", audience: "my-client" };

beforeAll(() => assertTestDatabase());
afterAll(async () => {
  await sequelize.close();
});

describe("POST /auth/signin", () => {
  test("identifiants valides → 200 avec accessToken, refreshToken et rôle", async () => {
    const res = await request(app).post("/auth/signin").send({ email: emailOf("commercial"), password: QA_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
    expect(res.body.user).toMatchObject({ email: emailOf("commercial"), role: "commercial", isActive: true });
  });

  test("la réponse ne contient jamais le hash du mot de passe", async () => {
    const res = await request(app).post("/auth/signin").send({ email: emailOf("commercial"), password: QA_PASSWORD });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshTokenHash/);
  });

  test("le refresh token est posé en cookie httpOnly", async () => {
    const res = await request(app).post("/auth/signin").send({ email: emailOf("commercial"), password: QA_PASSWORD });
    const cookie = (res.headers["set-cookie"] || []).find((c) => c.startsWith("refreshToken="));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
  });

  test("mot de passe incorrect → 401", async () => {
    const res = await request(app).post("/auth/signin").send({ email: emailOf("commercial"), password: "MauvaisMotDePasse1" });
    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });

  test("e-mail inconnu → 401, même message que mot de passe incorrect (pas d'énumération de comptes)", async () => {
    const unknown = await request(app).post("/auth/signin").send({ email: "inconnu@qa-probar.com", password: QA_PASSWORD });
    const wrong = await request(app).post("/auth/signin").send({ email: emailOf("commercial"), password: "MauvaisMotDePasse1" });
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  test("e-mail mal formé → 400", async () => {
    const res = await request(app).post("/auth/signin").send({ email: "pas-un-email", password: QA_PASSWORD });
    expect(res.status).toBe(400);
  });

  test("mot de passe trop court → 400", async () => {
    const res = await request(app).post("/auth/signin").send({ email: emailOf("commercial"), password: "abc" });
    expect(res.status).toBe(400);
  });

  test("corps vide → 400", async () => {
    const res = await request(app).post("/auth/signin").send({});
    expect(res.status).toBe(400);
  });

  test("compte désactivé → 403, aucun jeton émis", async () => {
    const res = await request(app).post("/auth/signin").send({ email: "qa.inactive@qa-probar.com", password: QA_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.accessToken).toBeUndefined();
  });

  test("tentative d'injection SQL dans l'e-mail → rejetée (400 ou 401), jamais 200 ni 500", async () => {
    const res = await request(app).post("/auth/signin").send({ email: "x' OR '1'='1' --@x.tn", password: QA_PASSWORD });
    expect([400, 401]).toContain(res.status);
  });
});

describe("Contrôle du JWT sur une route protégée (GET /me)", () => {
  test("JWT valide → 200 et identité correcte", async () => {
    const { token, id } = await login("commercial");
    const res = await request(app).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ sub: id, role: "commercial" });
  });

  test("JWT absent → 401", async () => {
    const res = await request(app).get("/me");
    expect(res.status).toBe(401);
  });

  test("schéma d'autorisation autre que Bearer → 401", async () => {
    const { token } = await login("commercial");
    const res = await request(app).get("/me").set("Authorization", `Basic ${token}`);
    expect(res.status).toBe(401);
  });

  test("JWT mal formé → 401", async () => {
    const res = await request(app).get("/me").set("Authorization", "Bearer ceci.nest.pasunjwt");
    expect(res.status).toBe(401);
  });

  test("JWT signé avec un autre secret → 401", async () => {
    const forged = jwt.sign(
      { sub: "x", email: "x@x.tn", role: "superadmin", rv: ROLE_VOCABULARY_VERSION },
      "secret-attaquant",
      { ...SIGN_OPTS, expiresIn: "15m" }
    );
    const res = await request(app).get("/me").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  test("JWT expiré → 401", async () => {
    const { id } = await login("commercial");
    const expired = jwt.sign(
      { sub: id, email: emailOf("commercial"), role: "commercial", rv: ROLE_VOCABULARY_VERSION },
      process.env.JWT_ACCESS_SECRET,
      { ...SIGN_OPTS, expiresIn: -60 }
    );
    const res = await request(app).get("/me").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  test("JWT avec algorithme 'none' → 401", async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const payload = { sub: "x", role: "superadmin", rv: ROLE_VOCABULARY_VERSION, iss: "my-api", aud: "my-client" };
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`;
    const res = await request(app).get("/me").set("Authorization", `Bearer ${none}`);
    expect(res.status).toBe(401);
  });

  test("JWT sans émetteur/audience attendus → 401", async () => {
    const t = jwt.sign({ sub: "x", role: "commercial", rv: ROLE_VOCABULARY_VERSION }, process.env.JWT_ACCESS_SECRET, {
      expiresIn: "15m",
    });
    const res = await request(app).get("/me").set("Authorization", `Bearer ${t}`);
    expect(res.status).toBe(401);
  });

  test("JWT émis avec une ancienne version du vocabulaire de rôles → 401 ROLE_VERSION_OUTDATED", async () => {
    const t = jwt.sign({ sub: "x", role: "user", rv: -1 }, process.env.JWT_ACCESS_SECRET, { ...SIGN_OPTS, expiresIn: "15m" });
    const res = await request(app).get("/me").set("Authorization", `Bearer ${t}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ROLE_VERSION_OUTDATED");
  });

  test("un refresh token ne peut pas servir d'access token → 401", async () => {
    const { refreshToken } = await login("commercial");
    const res = await request(app).get("/me").set("Authorization", `Bearer ${refreshToken}`);
    expect(res.status).toBe(401);
  });
});

describe("Cycle de session (refresh / logout)", () => {
  test("POST /auth/refresh sans jeton → 401", async () => {
    const res = await request(app).post("/auth/refresh").send({});
    expect(res.status).toBe(401);
  });

  test("POST /auth/refresh avec un jeton invalide → 401", async () => {
    const res = await request(app).post("/auth/refresh").send({ refreshToken: "invalide" });
    expect(res.status).toBe(401);
  });

  test("POST /auth/refresh avec un refresh token valide → 200 et nouvel access token utilisable", async () => {
    const signin = await request(app).post("/auth/signin").send({ email: emailOf("accueil"), password: QA_PASSWORD });
    const res = await request(app).post("/auth/refresh").send({ refreshToken: signin.body.refreshToken });
    expect(res.status).toBe(200);
    const me = await request(app).get("/me").set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  test("après logout, l'ancien refresh token est refusé → 401", async () => {
    const signin = await request(app).post("/auth/signin").send({ email: emailOf("accueil"), password: QA_PASSWORD });
    const cookie = signin.headers["set-cookie"].find((c) => c.startsWith("refreshToken=")).split(";")[0];
    const out = await request(app).post("/auth/logout").set("Cookie", cookie).send({});
    expect(out.status).toBe(200);
    const res = await request(app).post("/auth/refresh").send({ refreshToken: signin.body.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe("Sondes techniques et en-têtes de sécurité", () => {
  test("GET /health → 200, base de données joignable", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "up" });
  });

  test("GET /metrics avec un mauvais jeton → 401", async () => {
    process.env.METRICS_TOKEN = "jeton-test";
    const res = await request(app).get("/metrics").set("Authorization", "Bearer mauvais");
    delete process.env.METRICS_TOKEN;
    expect(res.status).toBe(401);
  });

  test("GET /metrics avec le bon jeton → 200 au format Prometheus", async () => {
    process.env.METRICS_TOKEN = "jeton-test";
    const res = await request(app).get("/metrics").set("Authorization", "Bearer jeton-test");
    delete process.env.METRICS_TOKEN;
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/http_requests_total/);
  });

  test("les en-têtes de sécurité helmet sont présents", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  test("une origine CORS non autorisée ne reçoit pas Access-Control-Allow-Origin", async () => {
    const res = await request(app).get("/").set("Origin", "https://site-malveillant.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
