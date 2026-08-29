"use strict";

const { createGoogleCalendarAutomation } = require("../src/ai/automations/googleCalendarAutomation");

const USER = { id: "u1", role: "user" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

const EVENT = { summary: "Relance client", startDateTime: "2026-08-01T09:00:00.000Z", endDateTime: "2026-08-01T09:30:00.000Z" };

describe("GoogleCalendarAutomation", () => {
  test("is open to any authenticated user (acts on the caller's own calendar)", async () => {
    const automation = createGoogleCalendarAutomation({
      tools: [tool("get_calendar_status", async () => ({ connected: false })), tool("create_calendar_event", async () => ({ success: true }))],
    });
    await expect(automation.run({ actingUser: USER, events: [] })).resolves.toMatchObject({ success: true });
  });

  test("checks connection status first and skips (without attempting any event) when not connected", async () => {
    const statusTool = tool("get_calendar_status", async () => ({ connected: false }));
    const createTool = tool("create_calendar_event", async () => ({ success: true }));
    const automation = createGoogleCalendarAutomation({ tools: [statusTool, createTool] });

    const result = await automation.run({ actingUser: USER, events: [EVENT] });

    expect(createTool.invoke).not.toHaveBeenCalled();
    expect(result.actions).toEqual([{ action: "skipped", reason: "not_connected" }]);
    expect(result.errors).toEqual([]);
  });

  test("creates one event per item when connected", async () => {
    const statusTool = tool("get_calendar_status", async () => ({ connected: true, googleEmail: "x@gmail.com" }));
    const createTool = tool("create_calendar_event", async (input) => ({ success: true, eventId: "evt-1", ...input }));
    const automation = createGoogleCalendarAutomation({ tools: [statusTool, createTool] });

    const result = await automation.run({ actingUser: USER, events: [EVENT] });

    expect(createTool.invoke).toHaveBeenCalledWith(EVENT);
    expect(result.success).toBe(true);
    expect(result.actions).toHaveLength(1);
  });

  test("a Tool-level {success:false} result is classified as an error, not a silent success", async () => {
    const statusTool = tool("get_calendar_status", async () => ({ connected: true }));
    const createTool = tool("create_calendar_event", async () => ({ success: false, error: "Google API quota exceeded" }));
    const automation = createGoogleCalendarAutomation({ tools: [statusTool, createTool] });

    const result = await automation.run({ actingUser: USER, events: [EVENT] });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ event: EVENT, message: "Google API quota exceeded" }]);
    expect(result.actions).toEqual([]);
  });

  test("one event's exception does not block the others", async () => {
    const statusTool = tool("get_calendar_status", async () => ({ connected: true }));
    let call = 0;
    const createTool = {
      name: "create_calendar_event",
      invoke: jest.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("network error");
        return JSON.stringify({ success: true, eventId: "evt-2" });
      }),
    };
    const automation = createGoogleCalendarAutomation({ tools: [statusTool, createTool] });

    const result = await automation.run({ actingUser: USER, events: [EVENT, { ...EVENT, summary: "Autre" }] });
    expect(result.errors).toHaveLength(1);
    expect(result.actions).toHaveLength(1);
  });
});
