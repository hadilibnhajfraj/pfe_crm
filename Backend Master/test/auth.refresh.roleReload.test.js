"use strict";

require("dotenv").config();
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

// POST /auth/refresh doit relire le rôle EN BASE (jamais le recopier depuis
// un token) : après la migration des rôles, le refresh token d'un sédentaire
// (émis quand son rôle s'appelait "commercial") produit un access token
// portant son rôle v2 "commercial_sedentaire" et rv:2.

jest.mock("../src/models/User", () => ({ findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() }));
jest.mock("../src/models/UserProfile", () => ({ create: jest.fn() }));

const bcrypt = require("bcrypt");
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const authRoutes = require("../src/routes/auth.routes");
const User = require("../src/models/User");
const { signRefreshToken, verifyAccessToken } = require("../src/utils/tokens");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", authRoutes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

test("le rôle du nouvel access token vient de la base, pas du refresh token", async () => {
  // Refresh token émis AVANT la migration — il ne porte aucun rôle fiable.
  const refreshToken = signRefreshToken({ sub: "sed-1", role: "commercial" });
  User.findByPk.mockResolvedValue({
    id: "sed-1",
    email: "sedentaire@example.com",
    isActive: true,
    role: "commercial_sedentaire", // valeur en base APRÈS la migration
    refreshTokenHash: await bcrypt.hash(refreshToken, 4),
  });

  const res = await request(buildApp()).post("/auth/refresh").send({ refreshToken });

  expect(res.status).toBe(200);
  expect(User.findByPk).toHaveBeenCalledWith("sed-1");
  const decoded = verifyAccessToken(res.body.accessToken);
  expect(decoded.role).toBe("commercial_sedentaire");
  expect(decoded.rv).toBe(2);
});

test("compte désactivé (ex. comptes de test reset-test-…) → 401, aucun nouvel access token", async () => {
  const refreshToken = signRefreshToken({ sub: "t1" });
  User.findByPk.mockResolvedValue({
    id: "t1",
    email: "reset-test-x-1@example.com",
    role: "commercial",
    isActive: false,
    refreshTokenHash: await bcrypt.hash(refreshToken, 4),
  });
  const res = await request(buildApp()).post("/auth/refresh").send({ refreshToken });
  expect(res.status).toBe(401);
  expect(res.body.accessToken).toBeUndefined();
});

test("refresh token révoqué (refreshTokenHash NULL) → 401", async () => {
  const refreshToken = signRefreshToken({ sub: "u1" });
  User.findByPk.mockResolvedValue({ id: "u1", email: "a@b.c", role: "commercial", refreshTokenHash: null });
  const res = await request(buildApp()).post("/auth/refresh").send({ refreshToken });
  expect(res.status).toBe(401);
});
