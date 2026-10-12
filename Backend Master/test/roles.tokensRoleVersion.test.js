"use strict";

// Vocabulaire des rôles v2 — claim `rv` des access tokens (utils/tokens.js).
// Un token émis avant la migration (sans rv:2) porte peut-être l'ANCIEN sens
// de son rôle ("commercial" = sédentaire) : il doit être rejeté (401) pour
// forcer une reconnexion unique.

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

const jwt = require("jsonwebtoken");
const express = require("express");
const request = require("supertest");
const { signAccessToken, verifyAccessToken, OutdatedRoleVersionError } = require("../src/utils/tokens");
const { authRequired } = require("../src/middleware/auth.middleware");
const { ROLE_VOCABULARY_VERSION, ALL_ROLES, ROLES } = require("../src/constants/roles");

// Token "d'avant la migration" : même secret/issuer/audience, sans rv.
function legacyToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: "7d", issuer: "my-api", audience: "my-client" });
}

function app() {
  const a = express();
  a.get("/protected", authRequired, (req, res) => res.json({ role: req.user.role, rv: req.user.rv }));
  return a;
}

describe("constants/roles.js", () => {
  test("7 rôles réels, dans l'ordre de l'ENUM après migration — plus de \"user\"", () => {
    expect(ALL_ROLES).toEqual([
      "commercial",
      "commercial_sedentaire",
      "accueil",
      "admin",
      "superadmin",
      "responsable_logistique_achat",
      "superadmin2",
    ]);
    expect(ALL_ROLES).not.toContain("user");
    expect(ROLE_VOCABULARY_VERSION).toBe(2);
  });
});

describe("signAccessToken / verifyAccessToken", () => {
  test("tout nouveau token porte rv:2 et est accepté", () => {
    const token = signAccessToken({ sub: "u1", email: "a@b.c", role: ROLES.COMMERCIAL_SEDENTAIRE });
    const decoded = verifyAccessToken(token);
    expect(decoded.rv).toBe(2);
    expect(decoded.role).toBe("commercial_sedentaire");
  });

  test("un token sans rv (émis avant la migration) est rejeté", () => {
    const token = legacyToken({ sub: "u1", role: "commercial" });
    expect(() => verifyAccessToken(token)).toThrow(OutdatedRoleVersionError);
  });

  test("un token avec un rv différent de 2 est rejeté", () => {
    const token = legacyToken({ sub: "u1", role: "commercial", rv: 1 });
    expect(() => verifyAccessToken(token)).toThrow(OutdatedRoleVersionError);
  });
});

describe("authRequired", () => {
  test("ancien token \"commercial\" (sens v1 = sédentaire) → 401 ROLE_VERSION_OUTDATED, jamais interprété comme commercial terrain", async () => {
    const res = await request(app()).get("/protected").set("Authorization", `Bearer ${legacyToken({ sub: "u1", role: "commercial" })}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ROLE_VERSION_OUTDATED");
  });

  test("ancien token \"user\" → 401 ROLE_VERSION_OUTDATED", async () => {
    const res = await request(app()).get("/protected").set("Authorization", `Bearer ${legacyToken({ sub: "u1", role: "user" })}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ROLE_VERSION_OUTDATED");
  });

  test("token v2 → accès, rôle v2 exposé dans req.user", async () => {
    const token = signAccessToken({ sub: "u1", email: "a@b.c", role: "commercial" });
    const res = await request(app()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: "commercial", rv: 2 });
  });

  test("token invalide (signature) → 401 générique inchangé", async () => {
    const res = await request(app()).get("/protected").set("Authorization", "Bearer abc.def.ghi");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token");
  });
});
