"use strict";

const { createNotificationHousekeepingAutomation, defaultShouldDelete } = require("../src/ai/automations/notificationHousekeepingAutomation");

const USER = { id: "u1", role: "user" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("defaultShouldDelete", () => {
  test("keeps an unread notification regardless of age", () => {
    expect(defaultShouldDelete({ read: false, createdAt: new Date(0).toISOString() })).toBe(false);
  });

  test("deletes a read notification older than 30 days", () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(defaultShouldDelete({ read: true, createdAt: old })).toBe(true);
  });

  test("keeps a read notification younger than 30 days", () => {
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(defaultShouldDelete({ read: true, createdAt: recent })).toBe(false);
  });
});

describe("NotificationHousekeepingAutomation", () => {
  test("is open to any authenticated user by default (acts on the caller's own notifications)", async () => {
    const automation = createNotificationHousekeepingAutomation({
      tools: [tool("list_my_notifications", async () => []), tool("mark_all_notifications_read", async () => ({})), tool("delete_notification", async () => ({}))],
    });
    await expect(automation.run({ actingUser: USER })).resolves.toMatchObject({ success: true });
  });

  test("marks all read first when markAllRead is set, before listing", async () => {
    const calls = [];
    const markAllTool = { name: "mark_all_notifications_read", invoke: jest.fn(async () => { calls.push("mark_all"); return JSON.stringify({}); }) };
    const listTool = { name: "list_my_notifications", invoke: jest.fn(async () => { calls.push("list"); return JSON.stringify([]); }) };
    const deleteTool = tool("delete_notification", async () => ({}));

    const automation = createNotificationHousekeepingAutomation({ tools: [markAllTool, listTool, deleteTool], markAllRead: true });
    await automation.run({ actingUser: USER });

    expect(calls).toEqual(["mark_all", "list"]);
  });

  test("deletes only the notifications for which shouldDelete returns true", async () => {
    const listTool = tool("list_my_notifications", async () => [
      { id: "n1", read: true, createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() },
      { id: "n2", read: false, createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() },
    ]);
    const deleteTool = tool("delete_notification", async (input) => ({ deleted: input.id }));
    const automation = createNotificationHousekeepingAutomation({ tools: [listTool, deleteTool] });

    const result = await automation.run({ actingUser: USER });

    expect(deleteTool.invoke).toHaveBeenCalledTimes(1);
    expect(deleteTool.invoke).toHaveBeenCalledWith({ id: "n1" });
    expect(result.actions).toEqual([{ action: "delete_notification", id: "n1", output: { deleted: "n1" } }]);
  });

  test("a custom shouldDelete predicate overrides the default", async () => {
    const listTool = tool("list_my_notifications", async () => [{ id: "n1", type: "spam" }]);
    const deleteTool = tool("delete_notification", async (input) => ({ deleted: input.id }));
    const automation = createNotificationHousekeepingAutomation({
      tools: [listTool, deleteTool],
      shouldDelete: (n) => n.type === "spam",
    });

    const result = await automation.run({ actingUser: USER });
    expect(result.actions).toHaveLength(1);
  });

  test("list failure is reported and no delete is attempted", async () => {
    const listTool = tool("list_my_notifications", async () => {
      throw new Error("timeout");
    });
    const deleteTool = tool("delete_notification", async () => ({}));
    const automation = createNotificationHousekeepingAutomation({ tools: [listTool, deleteTool] });

    const result = await automation.run({ actingUser: USER });
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([{ action: "list_my_notifications", message: "timeout" }]);
    expect(deleteTool.invoke).not.toHaveBeenCalled();
  });
});
