"use strict";

const { defaultAutomationFactories, createDefaultAutomations } = require("../src/ai/automations/manifest");

describe("automations/manifest", () => {
  test("declares exactly the 8 requested automations", () => {
    expect(defaultAutomationFactories).toHaveLength(8);
  });

  test("createDefaultAutomations builds all 8, keyed by their own .name, with no collisions", () => {
    const automations = createDefaultAutomations({ tools: [] });
    expect(automations.size).toBe(8);
    expect([...automations.keys()].sort()).toEqual(
      [
        "auto_creation",
        "reminders",
        "emails",
        "notification_housekeeping",
        "google_calendar",
        "automatic_analysis",
        "recommendations",
        "data_quality",
      ].sort()
    );
  });

  test("every automation instance is retrievable and runnable via the returned Map", async () => {
    const automations = createDefaultAutomations({ tools: [] });
    const autoCreation = automations.get("auto_creation");
    expect(autoCreation).toBeDefined();
    const result = await autoCreation.run({ actingUser: { id: "a1", role: "admin" }, items: [] });
    expect(result).toMatchObject({ success: true, automation: "auto_creation" });
  });
});
