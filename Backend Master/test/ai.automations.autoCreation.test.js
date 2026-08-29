"use strict";

const { createAutoCreationAutomation, DEFAULT_CREATION_MAP } = require("../src/ai/automations/autoCreationAutomation");

const ADMIN = { id: "a1", role: "admin" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("AutoCreationAutomation", () => {
  test("maps every default recordType to a real create_* Tool name", () => {
    expect(DEFAULT_CREATION_MAP).toEqual({
      maintenance_request: "create_maintenance_request",
      industrial_record: "create_industrial_record",
      por_promesh: "create_por_promesh",
      pipeline_stage: "create_pipeline_stage",
      hr_request: "create_hr_request",
    });
  });

  test("creates each item by delegating to the mapped Tool, in a batch", async () => {
    const maintenanceTool = tool("create_maintenance_request", async (i) => ({ id: "MR-1", ...i }));
    const hrTool = tool("create_hr_request", async (i) => ({ id: "HR-1", ...i }));
    const automation = createAutoCreationAutomation({ tools: [maintenanceTool, hrTool] });

    const result = await automation.run({
      actingUser: ADMIN,
      items: [
        { recordType: "maintenance_request", input: { title: "Panne climatiseur" } },
        { recordType: "hr_request", input: { type: "conge" } },
      ],
    });

    expect(maintenanceTool.invoke).toHaveBeenCalledWith({ title: "Panne climatiseur" });
    expect(hrTool.invoke).toHaveBeenCalledWith({ type: "conge" });
    expect(result.success).toBe(true);
    expect(result.actions).toEqual([
      { recordType: "maintenance_request", tool: "create_maintenance_request", input: { title: "Panne climatiseur" }, output: { id: "MR-1", title: "Panne climatiseur" } },
      { recordType: "hr_request", tool: "create_hr_request", input: { type: "conge" }, output: { id: "HR-1", type: "conge" } },
    ]);
  });

  test("an unknown recordType is reported as an error without aborting the rest of the batch", async () => {
    const maintenanceTool = tool("create_maintenance_request", async () => ({ id: "MR-1" }));
    const automation = createAutoCreationAutomation({ tools: [maintenanceTool] });

    const result = await automation.run({
      actingUser: ADMIN,
      items: [
        { recordType: "not_a_real_type", input: {} },
        { recordType: "maintenance_request", input: { title: "x" } },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ recordType: "not_a_real_type", input: {}, message: expect.stringContaining("No create Tool mapped") }]);
    expect(result.actions).toHaveLength(1);
  });

  test("one item's Tool failure does not prevent the next item from being attempted", async () => {
    const failingTool = tool("create_maintenance_request", async () => {
      throw new Error("validation failed");
    });
    const okTool = tool("create_hr_request", async () => ({ id: "HR-1" }));
    const automation = createAutoCreationAutomation({ tools: [failingTool, okTool] });

    const result = await automation.run({
      actingUser: ADMIN,
      items: [
        { recordType: "maintenance_request", input: {} },
        { recordType: "hr_request", input: {} },
      ],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].recordType).toBe("hr_request");
  });

  test("a custom creationMap can restrict/extend the default mapping", async () => {
    const customTool = tool("create_pipeline_stage", async () => ({ id: "PS-1" }));
    const automation = createAutoCreationAutomation({ tools: [customTool], creationMap: { stage: "create_pipeline_stage" } });
    const result = await automation.run({ actingUser: ADMIN, items: [{ recordType: "stage", input: { name: "Négociation" } }] });
    expect(result.success).toBe(true);
    expect(customTool.invoke).toHaveBeenCalledWith({ name: "Négociation" });
  });
});
