"use strict";

const { createEmailAutomation } = require("../src/ai/automations/emailAutomation");
const { AutomationPermissionError } = require("../src/ai/automations/errors");

const ADMIN = { id: "a1", role: "admin" };
const USER = { id: "u1", role: "user" };

function tool(name, impl) {
  return { name, invoke: jest.fn(async (input) => JSON.stringify(await impl(input))) };
}

describe("EmailAutomation", () => {
  test("is restricted to admin-tier roles by default", async () => {
    const automation = createEmailAutomation({ tools: [tool("send_notification_email", async () => ({}))] });
    await expect(automation.run({ actingUser: USER, emails: [] })).rejects.toThrow(AutomationPermissionError);
  });

  test("sends each email in the batch via send_notification_email", async () => {
    const sendTool = tool("send_notification_email", async (i) => ({ delivered: true, to: i.emailTo }));
    const automation = createEmailAutomation({ tools: [sendTool] });

    const emails = [
      { toUserId: "u1", emailTo: "u1@x.com", subject: "Digest", message: "..." },
      { toUserId: "u2", emailTo: "u2@x.com", subject: "Alerte", message: "..." },
    ];
    const result = await automation.run({ actingUser: ADMIN, emails });

    expect(sendTool.invoke).toHaveBeenCalledTimes(2);
    expect(sendTool.invoke).toHaveBeenNthCalledWith(1, emails[0]);
    expect(sendTool.invoke).toHaveBeenNthCalledWith(2, emails[1]);
    expect(result.success).toBe(true);
    expect(result.actions).toHaveLength(2);
  });

  test("one email's failure is reported without blocking the others", async () => {
    let call = 0;
    const sendTool = {
      name: "send_notification_email",
      invoke: jest.fn(async () => {
        call += 1;
        if (call === 1) throw new Error("invalid recipient");
        return JSON.stringify({ delivered: true });
      }),
    };
    const automation = createEmailAutomation({ tools: [sendTool] });

    const result = await automation.run({
      actingUser: ADMIN,
      emails: [
        { toUserId: "u1", emailTo: "bad", subject: "s", message: "m" },
        { toUserId: "u2", emailTo: "u2@x.com", subject: "s", message: "m" },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.actions).toHaveLength(1);
  });

  test("an empty batch succeeds trivially", async () => {
    const automation = createEmailAutomation({ tools: [tool("send_notification_email", async () => ({}))] });
    const result = await automation.run({ actingUser: ADMIN, emails: [] });
    expect(result).toMatchObject({ success: true, actions: [], errors: [] });
  });
});
