"use strict";

// Mocked with an explicit factory so the real services/googleCalendar.service.js
// — which touches axios/Sequelize models — is never loaded.
jest.mock("../src/services/googleCalendar.service", () => ({
  getStatus: jest.fn(),
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
}));

const googleCalendarService = require("../src/services/googleCalendar.service");
const {
  createGetCalendarStatusTool,
  createCreateCalendarEventTool,
  createUpdateCalendarEventTool,
  createDeleteCalendarEventTool,
} = require("../src/ai/mcp/tools/googleCalendar");

const USER = { id: "u1", role: "user", email: "commercial@cbi-tunisia.com" };

beforeEach(() => jest.clearAllMocks());

describe("get_calendar_status tool", () => {
  test("is open to any authenticated user (self-scoped)", () => {
    const tool = createGetCalendarStatusTool();
    expect(tool.requiredRoles).toEqual([]);
  });

  test("delegates to googleCalendarService.getStatus(actingUser.id)", async () => {
    googleCalendarService.getStatus.mockResolvedValue({ connected: true, googleEmail: "commercial@gmail.com" });
    const tool = createGetCalendarStatusTool();
    const result = await tool.execute({}, { actingUser: USER });
    expect(googleCalendarService.getStatus).toHaveBeenCalledWith("u1");
    expect(result).toEqual({ connected: true, googleEmail: "commercial@gmail.com" });
  });
});

describe("create_calendar_event tool", () => {
  const INPUT = {
    summary: "Relance client X",
    startDateTime: "2026-08-01T09:00:00.000Z",
    endDateTime: "2026-08-01T09:30:00.000Z",
  };

  test("is open to any authenticated user (self-scoped)", () => {
    expect(createCreateCalendarEventTool().requiredRoles).toEqual([]);
  });

  test("rejects input missing a required field (summary/startDateTime/endDateTime)", () => {
    const Joi = require("joi");
    const tool = createCreateCalendarEventTool();
    expect(tool.inputSchema.validate({}).error).toBeInstanceOf(Joi.ValidationError);
  });

  test("scopes userId to actingUser.id, never to something from the input", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true, eventId: "evt1", eventLink: "https://cal/evt1", calendarId: "primary", httpStatus: 200 });
    const tool = createCreateCalendarEventTool();
    const result = await tool.execute(INPUT, { actingUser: USER });

    expect(googleCalendarService.createCalendarEvent).toHaveBeenCalledWith({
      userId: "u1",
      commercialLabel: "commercial@cbi-tunisia.com",
      ...INPUT,
    });
    expect(result).toEqual({ success: true, eventId: "evt1", eventLink: "https://cal/evt1", calendarId: "primary", httpStatus: 200 });
  });

  test("passes through a {success:false, skipped:true} result as-is (the service never throws for 'not connected')", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: false, skipped: true, reason: "not_connected" });
    const tool = createCreateCalendarEventTool();
    await expect(tool.execute(INPUT, { actingUser: USER })).resolves.toEqual({ success: false, skipped: true, reason: "not_connected" });
  });

  test("falls back to actingUser.id as commercialLabel when no email is present", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true });
    const tool = createCreateCalendarEventTool();
    await tool.execute(INPUT, { actingUser: { id: "u2", role: "user" } });
    expect(googleCalendarService.createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({ commercialLabel: "u2" }));
  });
});

describe("update_calendar_event tool", () => {
  const INPUT = {
    eventId: "evt1",
    summary: "Relance client X (reportée)",
    startDateTime: "2026-08-02T09:00:00.000Z",
    endDateTime: "2026-08-02T09:30:00.000Z",
  };

  test("is open to any authenticated user (self-scoped)", () => {
    expect(createUpdateCalendarEventTool().requiredRoles).toEqual([]);
  });

  test("requires eventId", () => {
    const Joi = require("joi");
    const { eventId, ...withoutEventId } = INPUT;
    expect(createUpdateCalendarEventTool().inputSchema.validate(withoutEventId).error).toBeInstanceOf(Joi.ValidationError);
  });

  test("scopes userId to actingUser.id and forwards eventId", async () => {
    googleCalendarService.updateCalendarEvent.mockResolvedValue({ success: true, eventId: "evt1" });
    const tool = createUpdateCalendarEventTool();
    await tool.execute(INPUT, { actingUser: USER });
    expect(googleCalendarService.updateCalendarEvent).toHaveBeenCalledWith({
      userId: "u1",
      commercialLabel: "commercial@cbi-tunisia.com",
      ...INPUT,
    });
  });
});

describe("delete_calendar_event tool", () => {
  test("is open to any authenticated user (self-scoped)", () => {
    expect(createDeleteCalendarEventTool().requiredRoles).toEqual([]);
  });

  test("requires eventId", () => {
    const Joi = require("joi");
    expect(createDeleteCalendarEventTool().inputSchema.validate({}).error).toBeInstanceOf(Joi.ValidationError);
  });

  test("scopes userId to actingUser.id and forwards eventId", async () => {
    googleCalendarService.deleteCalendarEvent.mockResolvedValue({ success: true });
    const tool = createDeleteCalendarEventTool();
    await tool.execute({ eventId: "evt1" }, { actingUser: USER });
    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledWith({
      userId: "u1",
      eventId: "evt1",
      commercialLabel: "commercial@cbi-tunisia.com",
    });
  });
});
