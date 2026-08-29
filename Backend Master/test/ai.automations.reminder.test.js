"use strict";

const { createReminderAutomation } = require("../src/ai/automations/reminderAutomation");
const { AutomationPermissionError } = require("../src/ai/automations/errors");

const ADMIN = { id: "a1", role: "admin" };
const USER = { id: "u1", role: "user" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("ReminderAutomation", () => {
  test("is restricted to admin-tier roles by default (it can notify OTHER users)", async () => {
    const automation = createReminderAutomation({ sources: [] });
    await expect(automation.run({ actingUser: USER })).rejects.toThrow(AutomationPermissionError);
  });

  test("lists each source, filters by isDue, and sends one reminder per due item", async () => {
    const listTool = tool("list_all_maintenance_requests", async () => [
      { id: "MR-1", userId: "u1", email: "u1@x.com", title: "Panne A", overdue: true },
      { id: "MR-2", userId: "u2", email: "u2@x.com", title: "Panne B", overdue: false },
    ]);
    const notifyTool = tool("send_notification_email", async (input) => ({ delivered: true, to: input.emailTo }));

    const automation = createReminderAutomation({
      tools: [listTool, notifyTool],
      sources: [
        {
          listToolName: "list_all_maintenance_requests",
          listInput: { statut: "en_attente" },
          isDue: (item) => item.overdue,
          buildNotification: (item) => ({ toUserId: item.userId, emailTo: item.email, subject: "Rappel", message: item.title }),
        },
      ],
    });

    const result = await automation.run({ actingUser: ADMIN });

    expect(listTool.invoke).toHaveBeenCalledWith({ statut: "en_attente" });
    expect(notifyTool.invoke).toHaveBeenCalledTimes(1);
    expect(notifyTool.invoke).toHaveBeenCalledWith({ toUserId: "u1", emailTo: "u1@x.com", subject: "Rappel", message: "Panne A" });
    expect(result.success).toBe(true);
    expect(result.actions).toHaveLength(1);
  });

  test("a failing source's list Tool is reported as an error without blocking other sources", async () => {
    const failingList = tool("list_all_maintenance_requests", async () => {
      throw new Error("db unavailable");
    });
    const okList = tool("list_hr_requests", async () => [{ id: "HR-1", userId: "u1", email: "u1@x.com" }]);
    const notifyTool = tool("send_notification_email", async () => ({ delivered: true }));

    const automation = createReminderAutomation({
      tools: [failingList, okList, notifyTool],
      sources: [
        { listToolName: "list_all_maintenance_requests", isDue: () => true, buildNotification: () => ({}) },
        { listToolName: "list_hr_requests", isDue: () => true, buildNotification: (item) => ({ toUserId: item.userId, emailTo: item.email, subject: "s", message: "m" }) },
      ],
    });

    const result = await automation.run({ actingUser: ADMIN });
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ source: "list_all_maintenance_requests", message: "db unavailable" }]);
    expect(result.actions).toHaveLength(1);
  });

  test("a failing notification for one item does not block reminders for the others", async () => {
    const listTool = tool("list_all_maintenance_requests", async () => [
      { id: "MR-1", userId: "u1", email: "bad" },
      { id: "MR-2", userId: "u2", email: "u2@x.com" },
    ]);
    let call = 0;
    const notifyTool = {
      name: "send_notification_email",
      invoke: jest.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("invalid email");
        return JSON.stringify({ delivered: true });
      }),
    };

    const automation = createReminderAutomation({
      tools: [listTool, notifyTool],
      sources: [{ listToolName: "list_all_maintenance_requests", isDue: () => true, buildNotification: (item) => ({ toUserId: item.userId, emailTo: item.email, subject: "s", message: "m" }) }],
    });

    const result = await automation.run({ actingUser: ADMIN });
    expect(result.errors).toHaveLength(1);
    expect(result.actions).toHaveLength(1);
  });
});
