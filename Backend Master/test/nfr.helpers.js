"use strict";
// Outils partagés des tests d'audit non fonctionnel (fichiers test/nfr.*.test.js).
// S'appuie sur la base de TEST (voir test/setupTestEnv.js) et sur les comptes
// QA créés par `npm run nfr:seed` (un compte actif par rôle).
const request = require("supertest");
const app = require("../src/app");
const { sequelize } = require("../src/db");

const QA_PASSWORD = process.env.QA_PASSWORD || "QaAudit#2026";
const ROLES = [
  "commercial",
  "commercial_sedentaire",
  "accueil",
  "responsable_logistique_achat",
  "admin",
  "superadmin",
  "superadmin2",
];
const emailOf = (role) => `qa.${role}@qa-probar.com`;
const sessions = {};

async function login(role) {
  if (sessions[role]) return sessions[role];
  const res = await request(app).post("/auth/signin").send({ email: emailOf(role), password: QA_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Connexion QA impossible pour ${role} (HTTP ${res.status}) — exécuter "npm run nfr:seed"`);
  }
  sessions[role] = { token: res.body.accessToken, refreshToken: res.body.refreshToken, id: res.body.user.id };
  return sessions[role];
}

async function as(role, method, path, body) {
  const { token } = await login(role);
  const req = request(app)[method](path).set("Authorization", `Bearer ${token}`);
  return body === undefined ? req : req.send(body);
}

function assertTestDatabase() {
  const name = sequelize.config.database;
  if (!name.endsWith("_test")) throw new Error(`Refus d'exécuter les tests d'audit sur la base ${name}`);
}

module.exports = { request, app, sequelize, login, as, ROLES, emailOf, QA_PASSWORD, assertTestDatabase };
