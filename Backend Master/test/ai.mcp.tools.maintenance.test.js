"use strict";

jest.mock("../src/modules/maintenance-requests/services/maintenanceRequest.service", () => ({
  createRequest: jest.fn(),
  acceptRequest: jest.fn(),
  rejectRequest: jest.fn(),
  assignTechnician: jest.fn(),
  startRequest: jest.fn(),
  completeRequest: jest.fn(),
  deleteRequest: jest.fn(),
  getStats: jest.fn(),
  getMyRequests: jest.fn(),
  getAllRequests: jest.fn(),
  getById: jest.fn(),
  getTechnicians: jest.fn(),
  addComment: jest.fn(),
  getComments: jest.fn(),
  getHistory: jest.fn(),
}));

const maintenanceService = require("../src/modules/maintenance-requests/services/maintenanceRequest.service");
const {
  createCreateMaintenanceRequestTool,
  createAcceptMaintenanceRequestTool,
  createRejectMaintenanceRequestTool,
  createAssignMaintenanceTechnicianTool,
  createStartMaintenanceRequestTool,
  createCompleteMaintenanceRequestTool,
  createDeleteMaintenanceRequestTool,
  createGetMaintenanceStatsTool,
  createListMyMaintenanceRequestsTool,
  createListAllMaintenanceRequestsTool,
  createGetMaintenanceRequestTool,
  createListMaintenanceTechniciansTool,
  createAddMaintenanceCommentTool,
  createListMaintenanceCommentsTool,
  createGetMaintenanceHistoryTool,
} = require("../src/ai/mcp/tools/maintenance");

const MANAGER_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];
const MANAGER_EMAIL = "accueilcbif@gmail.com";
const USER = { id: "u1", role: "user", email: "u1@x.com" };
const MANAGER = { id: "m1", role: "admin" };
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const TECH_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => jest.clearAllMocks());

test("create_maintenance_request: open, splits photoPaths, calls createRequest(userId, body, photoPaths)", async () => {
  maintenanceService.createRequest.mockResolvedValue({ id: REQUEST_ID });
  const tool = createCreateMaintenanceRequestTool();
  expect(tool.requiredRoles).toEqual([]);
  await tool.execute({ equipement: "Pompe A", photoPaths: ["/x.png"] }, { actingUser: USER });
  expect(maintenanceService.createRequest).toHaveBeenCalledWith("u1", { equipement: "Pompe A" }, ["/x.png"]);
});

describe.each([
  ["accept_maintenance_request", createAcceptMaintenanceRequestTool, "acceptRequest", { id: REQUEST_ID }, ["m1", REQUEST_ID]],
  ["assign_maintenance_technician", createAssignMaintenanceTechnicianTool, "assignTechnician", { id: REQUEST_ID, technicianId: TECH_ID }, ["m1", REQUEST_ID, TECH_ID]],
  ["start_maintenance_request", createStartMaintenanceRequestTool, "startRequest", { id: REQUEST_ID }, ["m1", REQUEST_ID]],
  ["complete_maintenance_request", createCompleteMaintenanceRequestTool, "completeRequest", { id: REQUEST_ID }, ["m1", REQUEST_ID]],
])("%s tool", (_name, factory, serviceMethod, input, expectedArgs) => {
  test("requires a maintenance-manager role or the hardcoded manager e-mail", () => {
    const tool = factory();
    expect(tool.requiredRoles).toEqual(MANAGER_ROLES);
    expect(tool.allowedEmails).toEqual([MANAGER_EMAIL]);
  });

  test(`delegates to maintenanceRequest.service.${serviceMethod}`, async () => {
    maintenanceService[serviceMethod].mockResolvedValue({ id: REQUEST_ID });
    await factory().execute(input, { actingUser: MANAGER });
    expect(maintenanceService[serviceMethod]).toHaveBeenCalledWith(...expectedArgs);
  });
});

test("reject_maintenance_request: requires a reason, delegates to rejectRequest(managerId, id, reason)", async () => {
  maintenanceService.rejectRequest.mockResolvedValue({ id: REQUEST_ID });
  const tool = createRejectMaintenanceRequestTool();
  expect(tool.inputSchema.validate({ id: REQUEST_ID }).error).toBeTruthy();
  await tool.execute({ id: REQUEST_ID, reason: "Pièce indisponible" }, { actingUser: MANAGER });
  expect(maintenanceService.rejectRequest).toHaveBeenCalledWith("m1", REQUEST_ID, "Pièce indisponible");
});

test("delete_maintenance_request: manager-only, delegates to deleteRequest(id) — no actor forwarded", async () => {
  maintenanceService.deleteRequest.mockResolvedValue({ deleted: true });
  const tool = createDeleteMaintenanceRequestTool();
  expect(tool.requiredRoles).toEqual(MANAGER_ROLES);
  await tool.execute({ id: REQUEST_ID }, { actingUser: MANAGER });
  expect(maintenanceService.deleteRequest).toHaveBeenCalledWith(REQUEST_ID);
});

test("get_maintenance_stats / list_all_maintenance_requests / list_maintenance_technicians: manager-only", async () => {
  maintenanceService.getStats.mockResolvedValue({});
  maintenanceService.getAllRequests.mockResolvedValue([]);
  maintenanceService.getTechnicians.mockResolvedValue([]);

  expect(createGetMaintenanceStatsTool().requiredRoles).toEqual(MANAGER_ROLES);
  expect(createListAllMaintenanceRequestsTool().requiredRoles).toEqual(MANAGER_ROLES);
  expect(createListMaintenanceTechniciansTool().requiredRoles).toEqual(MANAGER_ROLES);

  await createGetMaintenanceStatsTool().execute({}, { actingUser: MANAGER });
  expect(maintenanceService.getStats).toHaveBeenCalledWith();

  await createListAllMaintenanceRequestsTool().execute({ statut: "en_attente" }, { actingUser: MANAGER });
  expect(maintenanceService.getAllRequests).toHaveBeenCalledWith({ statut: "en_attente" });

  await createListMaintenanceTechniciansTool().execute({}, { actingUser: MANAGER });
  expect(maintenanceService.getTechnicians).toHaveBeenCalledWith();
});

test("list_my_maintenance_requests: open, calls getMyRequests(actingUser.id)", async () => {
  maintenanceService.getMyRequests.mockResolvedValue([]);
  const tool = createListMyMaintenanceRequestsTool();
  expect(tool.requiredRoles).toEqual([]);
  await tool.execute({}, { actingUser: USER });
  expect(maintenanceService.getMyRequests).toHaveBeenCalledWith("u1");
});

test("get_maintenance_request: open, forwards (id, role, requestId, email) positionally", async () => {
  maintenanceService.getById.mockResolvedValue({ id: REQUEST_ID });
  const tool = createGetMaintenanceRequestTool();
  expect(tool.requiredRoles).toEqual([]);
  await tool.execute({ id: REQUEST_ID }, { actingUser: USER });
  expect(maintenanceService.getById).toHaveBeenCalledWith("u1", "user", REQUEST_ID, "u1@x.com");
});

test("get_maintenance_request: propagates the service's 403 when neither manager nor owner", async () => {
  maintenanceService.getById.mockRejectedValue({ status: 403, message: "Accès refusé" });
  await expect(createGetMaintenanceRequestTool().execute({ id: REQUEST_ID }, { actingUser: USER })).rejects.toMatchObject({ status: 403 });
});

test("add_maintenance_comment: forwards (senderId, senderRole, id, message, senderEmail) — service now enforces the same access check as getById/getComments", async () => {
  maintenanceService.addComment.mockResolvedValue({ id: REQUEST_ID });
  const tool = createAddMaintenanceCommentTool();
  expect(tool.requiredRoles).toEqual([]);
  await tool.execute({ id: REQUEST_ID, message: "En cours" }, { actingUser: USER });
  expect(maintenanceService.addComment).toHaveBeenCalledWith("u1", "user", REQUEST_ID, "En cours", "u1@x.com");
});

test("list_maintenance_comments / get_maintenance_history: open, forward (id, role, requestId, email)", async () => {
  maintenanceService.getComments.mockResolvedValue([]);
  maintenanceService.getHistory.mockResolvedValue([]);

  await createListMaintenanceCommentsTool().execute({ id: REQUEST_ID }, { actingUser: USER });
  expect(maintenanceService.getComments).toHaveBeenCalledWith("u1", "user", REQUEST_ID, "u1@x.com");

  await createGetMaintenanceHistoryTool().execute({ id: REQUEST_ID }, { actingUser: USER });
  expect(maintenanceService.getHistory).toHaveBeenCalledWith("u1", "user", REQUEST_ID, "u1@x.com");
});
