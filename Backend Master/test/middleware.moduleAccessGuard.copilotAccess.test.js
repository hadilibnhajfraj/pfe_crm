"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES 3 PROBLÈMES IDENTIFIÉS PAR L'AUDIT COPILOT", problème 1 : preuve
// bout-en-bout, avec le VRAI middleware et un VRAI JWT signé pour le VRAI
// compte responsable_logistique@cbi-tunisia.com, que /ai-copilot est
// désormais autorisé — et que RIEN d'autre n'a été élargi.
require("dotenv").config();
const request = require("supertest");
const express = require("express");
const { moduleAccessGuard } = require("../src/middleware/moduleAccessGuard");
const { signAccessToken } = require("../src/utils/tokens");

const REAL_RESPONSABLE_LOGISTIQUE_ID = "b4a9bf6f-65f1-4dd7-9a38-bb7a07210641";

function buildApp() {
  const app = express();
  app.use(moduleAccessGuard);
  app.get("/ai-copilot/anything", (req, res) => res.json({ ok: true }));
  app.get("/por-promesh/anything", (req, res) => res.json({ ok: true }));
  app.get("/projects/anything", (req, res) => res.json({ ok: true }));
  app.get("/hr-requests/anything", (req, res) => res.json({ ok: true }));
  return app;
}

function bearerFor(role, id = REAL_RESPONSABLE_LOGISTIQUE_ID) {
  return `Bearer ${signAccessToken({ id, role })}`;
}

describe("moduleAccessGuard — responsable_logistique_achat obtient désormais /ai-copilot", () => {
  test("un VRAI JWT pour responsable_logistique@cbi-tunisia.com autorise /ai-copilot", async () => {
    const app = buildApp();
    const res = await request(app).get("/ai-copilot/anything").set("Authorization", bearerFor("responsable_logistique_achat"));
    expect(res.status).toBe(200);
  });

  test("les permissions déjà existantes restent inchangées : /por-promesh toujours autorisé", async () => {
    const app = buildApp();
    const res = await request(app).get("/por-promesh/anything").set("Authorization", bearerFor("responsable_logistique_achat"));
    expect(res.status).toBe(200);
  });

  test("aucune AUTRE route n'a été élargie : /projects reste refusé (403) pour ce rôle", async () => {
    const app = buildApp();
    const res = await request(app).get("/projects/anything").set("Authorization", bearerFor("responsable_logistique_achat"));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Accès refusé/);
  });

  test("un rôle SANS entrée dans ALLOWED_PREFIXES_BY_ROLE (ex. commercial) reste totalement non concerné par ce middleware", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/ai-copilot/anything")
      .set("Authorization", bearerFor("commercial", "b7c50110-31de-4d2c-96b4-5a117c9e262a"));
    expect(res.status).toBe(200);
  });
});
