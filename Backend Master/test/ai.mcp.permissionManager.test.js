"use strict";

const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { PermissionDeniedError } = require("../src/ai/mcp/errors");

describe("PermissionManager.assertCanCall", () => {
  const pm = new PermissionManager();

  test("denies an anonymous caller (no actingUser at all)", () => {
    const tool = { name: "any_tool", requiredRoles: [] };
    expect(() => pm.assertCanCall(tool, undefined)).toThrow(PermissionDeniedError);
  });

  test("denies a caller missing id or role", () => {
    const tool = { name: "any_tool", requiredRoles: [] };
    expect(() => pm.assertCanCall(tool, { id: "u1" })).toThrow(PermissionDeniedError);
    expect(() => pm.assertCanCall(tool, { role: "user" })).toThrow(PermissionDeniedError);
  });

  test("allows any authenticated actor when requiredRoles is empty", () => {
    const tool = { name: "open_tool", requiredRoles: [] };
    expect(() => pm.assertCanCall(tool, { id: "u1", role: "user" })).not.toThrow();
  });

  test("allows any authenticated actor when requiredRoles is not declared at all", () => {
    const tool = { name: "open_tool" };
    expect(() => pm.assertCanCall(tool, { id: "u1", role: "user" })).not.toThrow();
  });

  test("allows an actor whose role is in requiredRoles", () => {
    const tool = { name: "hr_only_tool", requiredRoles: ["admin", "manegerofficecbi"] };
    expect(() => pm.assertCanCall(tool, { id: "u1", role: "admin" })).not.toThrow();
  });

  test("denies an actor whose role is not in requiredRoles", () => {
    const tool = { name: "hr_only_tool", requiredRoles: ["admin"] };
    expect(() => pm.assertCanCall(tool, { id: "u1", role: "user" })).toThrow(PermissionDeniedError);
  });

  test("never grants access it wasn't explicitly given — no implicit admin override", () => {
    const tool = { name: "commercial_only_tool", requiredRoles: ["commercial"] };
    expect(() => pm.assertCanCall(tool, { id: "u1", role: "superadmin" })).toThrow(PermissionDeniedError);
  });
});

describe("PermissionManager.assertCanCall — allowedEmails (hardcoded-email CRM actors)", () => {
  const pm = new PermissionManager();
  const tool = {
    name: "hr_review_tool",
    requiredRoles: ["admin", "superadmin", "superadmin2"],
    allowedEmails: ["ManegerOfficeCbi@gmail.com"],
  };

  test("allows the hardcoded-email actor even with a role outside requiredRoles", () => {
    expect(() =>
      pm.assertCanCall(tool, { id: "u1", role: "user", email: "manegerofficecbi@gmail.com" })
    ).not.toThrow();
  });

  test("email comparison is case-insensitive", () => {
    expect(() =>
      pm.assertCanCall(tool, { id: "u1", role: "user", email: "MANEGEROFFICECBI@GMAIL.COM" })
    ).not.toThrow();
  });

  test("still allows a role-matching actor with an unrelated email", () => {
    expect(() =>
      pm.assertCanCall(tool, { id: "u1", role: "admin", email: "someone@else.com" })
    ).not.toThrow();
  });

  test("denies an actor matching neither the role list nor the email list", () => {
    expect(() =>
      pm.assertCanCall(tool, { id: "u1", role: "user", email: "someone@else.com" })
    ).toThrow(PermissionDeniedError);
  });

  test("denies an actor with no email at all when only email would have granted access", () => {
    const emailOnlyTool = { name: "email_only_tool", requiredRoles: [], allowedEmails: ["root@cbi-tunisia.com"] };
    expect(() => pm.assertCanCall(emailOnlyTool, { id: "u1", role: "user" })).toThrow(PermissionDeniedError);
  });
});
