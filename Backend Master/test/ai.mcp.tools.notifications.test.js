"use strict";

jest.mock("../src/services/notification.service", () => ({
  listMyNotifications: jest.fn(),
  markAllRead: jest.fn(),
  markOneRead: jest.fn(),
  deleteNotification: jest.fn(),
  sendEmailNotification: jest.fn(),
}));

const notificationService = require("../src/services/notification.service");
const {
  createListMyNotificationsTool,
  createMarkAllNotificationsReadTool,
  createMarkNotificationReadTool,
  createDeleteNotificationTool,
  createSendNotificationEmailTool,
} = require("../src/ai/mcp/tools/notifications");

const USER = { id: "u1", role: "user" };
const NOTIF_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => jest.clearAllMocks());

describe("list_my_notifications tool", () => {
  test("open to any authenticated actor, forwards pagination options", async () => {
    notificationService.listMyNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
    const tool = createListMyNotificationsTool();
    expect(tool.requiredRoles).toEqual([]);
    await tool.execute({ page: 2, limit: 5 }, { actingUser: USER });
    expect(notificationService.listMyNotifications).toHaveBeenCalledWith("u1", { page: 2, limit: 5 });
  });
});

describe("mark_all_notifications_read tool", () => {
  test("delegates to notification.service.markAllRead(actingUser.id)", async () => {
    notificationService.markAllRead.mockResolvedValue({ success: true });
    await createMarkAllNotificationsReadTool().execute({}, { actingUser: USER });
    expect(notificationService.markAllRead).toHaveBeenCalledWith("u1");
  });
});

describe("mark_notification_read tool", () => {
  test("delegates to notification.service.markOneRead(userId, id)", async () => {
    notificationService.markOneRead.mockResolvedValue({ success: true });
    await createMarkNotificationReadTool().execute({ id: NOTIF_ID }, { actingUser: USER });
    expect(notificationService.markOneRead).toHaveBeenCalledWith("u1", NOTIF_ID);
  });

  test("propagates the service's 404 unchanged when the notification isn't the caller's", async () => {
    notificationService.markOneRead.mockRejectedValue({ status: 404, message: "Notification not found" });
    await expect(createMarkNotificationReadTool().execute({ id: NOTIF_ID }, { actingUser: USER })).rejects.toEqual({
      status: 404,
      message: "Notification not found",
    });
  });
});

describe("delete_notification tool", () => {
  test("delegates to notification.service.deleteNotification(userId, id)", async () => {
    notificationService.deleteNotification.mockResolvedValue({ success: true });
    await createDeleteNotificationTool().execute({ id: NOTIF_ID }, { actingUser: USER });
    expect(notificationService.deleteNotification).toHaveBeenCalledWith("u1", NOTIF_ID);
  });
});

describe("send_notification_email tool", () => {
  test("is admin-tier only — more restrictive than the unauthenticated legacy route", () => {
    expect(createSendNotificationEmailTool().requiredRoles).toEqual(["admin", "superadmin", "superadmin2"]);
  });

  test("delegates the full payload to notification.service.sendEmailNotification", async () => {
    notificationService.sendEmailNotification.mockResolvedValue({ success: true });
    const payload = {
      toUserId: "22222222-2222-4222-8222-222222222222",
      emailTo: "target@x.com",
      subject: "Hello",
      message: "World",
    };
    await createSendNotificationEmailTool().execute(payload, { actingUser: { id: "a1", role: "admin" } });
    expect(notificationService.sendEmailNotification).toHaveBeenCalledWith(payload);
  });

  test("rejects a non-email emailTo at the schema level", () => {
    const { error } = createSendNotificationEmailTool().inputSchema.validate({
      toUserId: "22222222-2222-4222-8222-222222222222",
      emailTo: "not-an-email",
      subject: "Hello",
      message: "World",
    });
    expect(error).toBeTruthy();
  });
});
