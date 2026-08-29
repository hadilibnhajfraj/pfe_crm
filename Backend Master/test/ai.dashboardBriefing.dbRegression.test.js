"use strict";

// Regression test for: "SequelizeDatabaseError: la colonne
// ProjectDevis.dateExpiration n'existe pas" (see
// AI-Business-Copilot/07_INCIDENT_COPILOT_DATEEXPIRATION.md) —
// aiCopilot.controller.js::dashboard() -> dashboardBriefing.service.js
// -> ProjectDevis.count()/findAll() with a `dateExpiration` WHERE clause.
//
// The EXISTING unit suite (test/aiCopilot.dashboardBriefing.service.test.js)
// fully mocks the ProjectDevis model (`jest.mock(".../models/ProjectDevis")`)
// — it verifies the SERVICE's own logic (window/scoping/RBAC) correctly,
// but a mock has no schema and therefore could never have caught a real
// missing column. This file is deliberately the OPPOSITE: the REAL
// Sequelize model against the REAL (now-migrated) database, nothing
// mocked. Before the fix (migration
// 20260807090000-add-date-expiration-to-project-devis.js sitting in the
// wrong folder, never applied — see the incident doc), this exact test
// failed with the reported SequelizeDatabaseError. After moving the
// migration into src/migrations/ and running `sequelize-cli db:migrate`,
// it passes.

require("dotenv").config();
const { sequelize } = require("../src/db");
const ProjectDevis = require("../src/models/ProjectDevis");

afterAll(async () => {
  await sequelize.close();
});

describe("ProjectDevis.dateExpiration — real database regression", () => {
  test("the column exists in the real project_devis table (describeTable, no query needed)", async () => {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable("project_devis");
    expect(table.dateExpiration).toBeDefined();
    expect(table.dateExpiration.allowNull).toBe(true); // facultatif — jamais un devis existant cassé par cette colonne
  });

  // The EXACT query shape used by dashboardBriefing.service.js::buildExpiringQuotes —
  // reproduced directly against the real model/table, not through a mock.
  test("ProjectDevis.count()/findAll() with a dateExpiration WHERE clause no longer throws SequelizeDatabaseError", async () => {
    const { Op } = require("sequelize");
    const todayIso = new Date().toISOString().slice(0, 10);
    const in90days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const where = { dateExpiration: { [Op.between]: [todayIso, in90days] } };

    await expect(ProjectDevis.count({ where })).resolves.toEqual(expect.any(Number));
    await expect(ProjectDevis.findAll({ where, order: [["dateExpiration", "ASC"]], limit: 5 })).resolves.toEqual(expect.any(Array));
  });

  // The full, real, unmocked service function that the original bug report's
  // stack trace (aiCopilot.controller.js::dashboard()) actually calls.
  test("dashboardBriefing.service.js::getDashboardBriefing() runs end-to-end against the real DB without a SequelizeDatabaseError", async () => {
    const dashboardBriefing = require("../src/modules/ai-copilot/services/dashboardBriefing.service");
    const User = require("../src/models/User");
    const anyUser = await User.findOne({ order: [["createdAt", "ASC"]] });
    if (!anyUser) {
      // No seeded user in this environment — the schema-level assertions
      // above already prove the fix; skip the full-briefing call rather
      // than fail on an unrelated fixture-data gap.
      return;
    }
    // toActingUser() (dashboardBriefing.service.js) reads `.sub`, the same
    // raw-JWT-payload shape authRequired sets on req.user — never `.id`.
    const actingUser = { sub: anyUser.id, role: anyUser.role, email: anyUser.email };

    await expect(dashboardBriefing.getDashboardBriefing(actingUser)).resolves.toEqual(
      expect.objectContaining({ today: expect.objectContaining({ expiringQuotes: expect.any(Number) }) })
    );
  }, 30000);
});
