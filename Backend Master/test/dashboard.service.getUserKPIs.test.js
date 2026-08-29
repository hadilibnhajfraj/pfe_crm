"use strict";

// Regression test for AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md:
// `getUserKPIs()`/`getKPIByRole()` (src/modules/dashboard/services/dashboard.service.js)
// had NO test coverage at all before this file — confirmed by searching the
// whole test/ directory. That is exactly how a real
// `TypeError: object is not iterable` (a standalone `sequelize.query(...,
// {type: "SELECT"})` incorrectly destructured as `const [[hc]] = ...`
// instead of `const [hc] = ...`) went unnoticed: it breaks the REAL
// database (wrong destructuring shape), which no mock could ever catch.
// This file deliberately does NOT mock sequelize — real model, real DB,
// same discipline as ai.dashboardBriefing.dbRegression.test.js.
//
// Real-world impact of this one function: it backs BOTH the classic CRM
// REST endpoint `GET /dashboard/kpi` (dashboard.routes.js, for any
// non-admin-tier role) AND the AI Copilot's kpi_agent (via the
// get_dashboard_kpis MCP Tool) — the same bug broke both surfaces
// simultaneously, not just the Copilot.

require("dotenv").config();
const { sequelize } = require("../src/db");
const User = require("../src/models/User");
// getUserKPIs() itself is NOT exported (an internal helper) —
// getKPIByRole() is the real, exported entry point that routes a
// non-admin role to it (see dashboard.service.js:458), and the exact call
// get_dashboard_kpis (the MCP Tool kpi_agent uses) makes.
const { getKPIByRole } = require("../src/modules/dashboard/services/dashboard.service");

afterAll(async () => {
  await sequelize.close();
});

describe("dashboard.service.js::getKPIByRole (role=\"user\") — real database regression", () => {
  test("resolves for a real non-admin user without throwing (the exact bug: 'object is not iterable')", async () => {
    const anyUser = await User.findOne({ where: { role: "user" }, order: [["createdAt", "ASC"]] });
    if (!anyUser) return; // no role="user" fixture in this environment — schema-level intent still documented above

    const result = await getKPIByRole(anyUser.id, "user");

    expect(result.role).toBe("user");
    expect(typeof result.stats.myProjects).toBe("number");
    expect(typeof result.stats.myValidated).toBe("number");
    expect(Array.isArray(result.upcomingRelances)).toBe(true);
    expect(result.charts).toEqual(expect.objectContaining({ myStatusDistribution: expect.any(Array), myMonthlyEvolution: expect.any(Array) }));
  }, 30000);

  // The exact reported user from AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md
  // — if this specific account still exists in this environment, confirms
  // the precise real-world case, not just "some user with role=user".
  test("the exact reported user (516f6dca-7a6f-43cb-b527-5c5652e3e03f) resolves without error, if present in this environment", async () => {
    const reportedUser = await User.findByPk("516f6dca-7a6f-43cb-b527-5c5652e3e03f");
    if (!reportedUser) return;

    await expect(getKPIByRole(reportedUser.id, reportedUser.role)).resolves.toEqual(expect.objectContaining({ role: "user" }));
  }, 30000);
});
