"use strict";

jest.mock("../src/modules/hr-requests/services/hrRequest.service", () => ({
  listRequests: jest.fn(),
  getRequestById: jest.fn(),
  createRequest: jest.fn(),
  acceptRequest: jest.fn(),
  rejectRequest: jest.fn(),
  markProcessed: jest.fn(),
  addComment: jest.fn(),
  getHistory: jest.fn(),
  deleteRequest: jest.fn(),
}));

const hrRequestService = require("../src/modules/hr-requests/services/hrRequest.service");
const {
  createListHrRequestsTool,
  createGetHrRequestTool,
  createCreateHrRequestTool,
  createAcceptHrRequestTool,
  createRejectHrRequestTool,
  createMarkHrRequestProcessedTool,
  createAddHrRequestCommentTool,
  createGetHrRequestHistoryTool,
  createDeleteHrRequestTool,
} = require("../src/ai/mcp/tools/hr");

const HR_REVIEWER_ROLES = ["admin", "superadmin", "superadmin2"];
const USER = { id: "u1", role: "user" };
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => jest.clearAllMocks());

test("list_hr_requests / get_hr_request: unchanged from earlier infrastructure pass", async () => {
  hrRequestService.listRequests.mockResolvedValue([]);
  await createListHrRequestsTool().execute({}, { actingUser: USER });
  expect(hrRequestService.listRequests).toHaveBeenCalledWith({}, USER);

  hrRequestService.getRequestById.mockResolvedValue({ id: REQUEST_ID });
  await createGetHrRequestTool().execute({ id: REQUEST_ID }, { actingUser: USER });
  expect(hrRequestService.getRequestById).toHaveBeenCalledWith(REQUEST_ID, USER);
});

describe("create_hr_request tool", () => {
  test("open to any employee, splits photoPaths out, forwards body+actor+paths", async () => {
    hrRequestService.createRequest.mockResolvedValue({ id: REQUEST_ID });
    const tool = createCreateHrRequestTool();
    expect(tool.requiredRoles).toEqual([]);

    const input = {
      type: "conge",
      typeConge: "ordinaire",
      dateDebut: "2026-08-01",
      dateFin: "2026-08-05",
      adresse: "12 rue de la Paix",
      telephone: "+21612345678",
      photoPaths: ["/uploads/hr-requests/a.png"],
    };
    await tool.execute(input, { actingUser: USER });
    const { photoPaths, ...body } = input;
    expect(hrRequestService.createRequest).toHaveBeenCalledWith(body, USER, photoPaths);
  });

  test("rejects a 'sortie' payload carrying conge-only fields (dateDebut forbidden)", () => {
    const { error } = createCreateHrRequestTool().inputSchema.validate({
      type: "sortie",
      motif: "Rendez-vous médical",
      dateSortie: "2026-08-01",
      heureSortie: "09:00",
      heureRetour: "10:00",
      dateDebut: "2026-08-01",
    });
    expect(error).toBeTruthy();
  });

  test("rejects a 'conge' payload missing required fields", () => {
    const { error } = createCreateHrRequestTool().inputSchema.validate({ type: "conge" });
    expect(error).toBeTruthy();
  });
});

describe("accept_hr_request / reject_hr_request / mark_hr_request_processed tools", () => {
  test("all three require HR reviewer role or the hardcoded HR manager email", () => {
    for (const factory of [createAcceptHrRequestTool, createRejectHrRequestTool, createMarkHrRequestProcessedTool]) {
      const tool = factory();
      expect(tool.requiredRoles).toEqual(HR_REVIEWER_ROLES);
      expect(tool.allowedEmails).toEqual(["manegerofficecbi@gmail.com"]);
    }
  });

  test("accept_hr_request delegates to acceptRequest(id, actor, comment)", async () => {
    hrRequestService.acceptRequest.mockResolvedValue({ id: REQUEST_ID, statut: "acceptee" });
    const reviewer = { id: "r1", role: "admin" };
    await createAcceptHrRequestTool().execute({ id: REQUEST_ID, comment: "OK" }, { actingUser: reviewer });
    expect(hrRequestService.acceptRequest).toHaveBeenCalledWith(REQUEST_ID, reviewer, "OK");
  });

  test("reject_hr_request delegates to rejectRequest(id, actor, comment)", async () => {
    hrRequestService.rejectRequest.mockResolvedValue({ id: REQUEST_ID, statut: "refusee" });
    const reviewer = { id: "r1", role: "admin" };
    await createRejectHrRequestTool().execute({ id: REQUEST_ID }, { actingUser: reviewer });
    expect(hrRequestService.rejectRequest).toHaveBeenCalledWith(REQUEST_ID, reviewer, undefined);
  });

  test("mark_hr_request_processed delegates to markProcessed(id, actor)", async () => {
    hrRequestService.markProcessed.mockResolvedValue({ id: REQUEST_ID, statut: "traitee" });
    const reviewer = { id: "r1", role: "admin" };
    await createMarkHrRequestProcessedTool().execute({ id: REQUEST_ID }, { actingUser: reviewer });
    expect(hrRequestService.markProcessed).toHaveBeenCalledWith(REQUEST_ID, reviewer);
  });
});

describe("add_hr_request_comment / get_hr_request_history / delete_hr_request tools", () => {
  test("all three are open — the service enforces ownership/reviewer status internally", () => {
    expect(createAddHrRequestCommentTool().requiredRoles).toEqual([]);
    expect(createGetHrRequestHistoryTool().requiredRoles).toEqual([]);
    expect(createDeleteHrRequestTool().requiredRoles).toEqual([]);
  });

  test("add_hr_request_comment propagates the service's 403 when actor isn't a reviewer", async () => {
    hrRequestService.addComment.mockRejectedValue({ status: 403, message: "Seul le Responsable RH peut ajouter un commentaire" });
    await expect(
      createAddHrRequestCommentTool().execute({ id: REQUEST_ID, comment: "hi" }, { actingUser: USER })
    ).rejects.toMatchObject({ status: 403 });
  });

  test("get_hr_request_history delegates to getHistory(id, actor)", async () => {
    hrRequestService.getHistory.mockResolvedValue([]);
    await createGetHrRequestHistoryTool().execute({ id: REQUEST_ID }, { actingUser: USER });
    expect(hrRequestService.getHistory).toHaveBeenCalledWith(REQUEST_ID, USER);
  });

  test("delete_hr_request delegates to deleteRequest(id, actor)", async () => {
    hrRequestService.deleteRequest.mockResolvedValue({ id: REQUEST_ID });
    await createDeleteHrRequestTool().execute({ id: REQUEST_ID }, { actingUser: USER });
    expect(hrRequestService.deleteRequest).toHaveBeenCalledWith(REQUEST_ID, USER);
  });
});
