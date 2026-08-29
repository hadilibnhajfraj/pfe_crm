"use strict";

// Mocked with an explicit factory so the real services/user.service.js —
// which touches Sequelize models — is never loaded.
jest.mock("../src/services/user.service", () => ({
  listUsers: jest.fn(),
  listUsersByRole: jest.fn(),
  listCommercialCandidates: jest.fn(),
  setUserActive: jest.fn(),
  setUserRole: jest.fn(),
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
  getUserProfile: jest.fn(),
  updateUserProfile: jest.fn(),
}));

const userService = require("../src/services/user.service");
const {
  createListUsersTool,
  createListUsersByRoleTool,
  createListCommercialCandidatesTool,
  createSetUserActiveTool,
  createSetUserRoleTool,
  createGetMyProfileTool,
  createUpdateMyProfileTool,
  createGetUserProfileTool,
  createUpdateUserProfileTool,
} = require("../src/ai/mcp/tools/users");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];
const USER = { id: "u1", role: "user" };
const ADMIN = { id: "a1", role: "admin" };

beforeEach(() => jest.clearAllMocks());

describe("list_users tool", () => {
  test("delegates to user.service.listUsers() with no args, admin-tier only", async () => {
    userService.listUsers.mockResolvedValue([{ id: "x" }]);
    const tool = createListUsersTool();
    expect(tool.requiredRoles).toEqual(ADMIN_TIER_ROLES);
    await expect(tool.execute({}, { actingUser: ADMIN })).resolves.toEqual([{ id: "x" }]);
    expect(userService.listUsers).toHaveBeenCalledWith();
  });
});

describe("list_users_by_role tool", () => {
  test("forwards the role filter unchanged", async () => {
    userService.listUsersByRole.mockResolvedValue([]);
    const tool = createListUsersByRoleTool();
    await tool.execute({ role: "commercial" }, { actingUser: ADMIN });
    expect(userService.listUsersByRole).toHaveBeenCalledWith({ role: "commercial" });
  });
});

describe("list_commercial_candidates tool", () => {
  test("is open to any authenticated actor", () => {
    expect(createListCommercialCandidatesTool().requiredRoles).toEqual([]);
  });

  test("delegates to user.service.listCommercialCandidates()", async () => {
    userService.listCommercialCandidates.mockResolvedValue([{ id: "c1" }]);
    await expect(createListCommercialCandidatesTool().execute({}, { actingUser: USER })).resolves.toEqual([
      { id: "c1" },
    ]);
  });
});

describe("set_user_active tool", () => {
  test("forwards actingUser.role, userId, active to user.service.setUserActive", async () => {
    userService.setUserActive.mockResolvedValue({ id: "u2", isActive: false });
    const tool = createSetUserActiveTool();
    await tool.execute({ userId: "u2", active: false }, { actingUser: ADMIN });
    expect(userService.setUserActive).toHaveBeenCalledWith("admin", "u2", false);
  });

  test("rejects a non-boolean active at the schema level", () => {
    const { error } = createSetUserActiveTool().inputSchema.validate({ userId: "11111111-1111-4111-8111-111111111111", active: "yes" });
    expect(error).toBeTruthy();
  });
});

describe("set_user_role tool", () => {
  test("restricted to superadmin tiers only, matching routes/admin.js", () => {
    expect(createSetUserRoleTool().requiredRoles).toEqual(["superadmin", "superadmin2"]);
  });

  test("delegates to user.service.setUserRole(userId, role)", async () => {
    userService.setUserRole.mockResolvedValue({ id: "u2", role: "admin" });
    await createSetUserRoleTool().execute({ userId: "u2", role: "admin" }, { actingUser: { id: "s1", role: "superadmin" } });
    expect(userService.setUserRole).toHaveBeenCalledWith("u2", "admin");
  });
});

describe("get_my_profile / update_my_profile tools", () => {
  test("get_my_profile calls user.service.getMyProfile(actingUser.id)", async () => {
    userService.getMyProfile.mockResolvedValue({ email: "u@x.com" });
    await createGetMyProfileTool().execute({}, { actingUser: USER });
    expect(userService.getMyProfile).toHaveBeenCalledWith("u1");
  });

  test("update_my_profile forwards the body to user.service.updateMyProfile(userId, body)", async () => {
    userService.updateMyProfile.mockResolvedValue({ name: "New" });
    await createUpdateMyProfileTool().execute({ name: "New" }, { actingUser: USER });
    expect(userService.updateMyProfile).toHaveBeenCalledWith("u1", { name: "New" });
  });

  test("update_my_profile requires at least one field", () => {
    const { error } = createUpdateMyProfileTool().inputSchema.validate({});
    expect(error).toBeTruthy();
  });
});

describe("get_user_profile / update_user_profile tools (admin view)", () => {
  test("both are admin-tier only", () => {
    expect(createGetUserProfileTool().requiredRoles).toEqual(ADMIN_TIER_ROLES);
    expect(createUpdateUserProfileTool().requiredRoles).toEqual(ADMIN_TIER_ROLES);
  });

  test("get_user_profile calls user.service.getUserProfile(userId)", async () => {
    userService.getUserProfile.mockResolvedValue({ email: "target@x.com" });
    await createGetUserProfileTool().execute({ userId: "u2" }, { actingUser: ADMIN });
    expect(userService.getUserProfile).toHaveBeenCalledWith("u2");
  });

  test("update_user_profile splits userId out of the payload before calling the service", async () => {
    userService.updateUserProfile.mockResolvedValue({ matricule: "123" });
    await createUpdateUserProfileTool().execute({ userId: "u2", matricule: "123" }, { actingUser: ADMIN });
    expect(userService.updateUserProfile).toHaveBeenCalledWith("u2", { matricule: "123" });
  });
});
