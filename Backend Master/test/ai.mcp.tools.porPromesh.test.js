"use strict";

jest.mock("../src/modules/por-promesh/services/porPromesh.service", () => ({
  createPorPromesh: jest.fn(),
  createOrOpenDraft: jest.fn(),
  listOperators: jest.fn(),
  listPorPromesh: jest.fn(),
  getDashboard: jest.fn(),
  getStats: jest.fn(),
  getPorPromeshById: jest.fn(),
  updatePorPromesh: jest.fn(),
  deletePorPromesh: jest.fn(),
  validatePorPromesh: jest.fn(),
}));

const porPromeshService = require("../src/modules/por-promesh/services/porPromesh.service");
const {
  createCreatePorPromeshTool,
  createCreateOrOpenPorPromeshDraftTool,
  createListPorPromeshOperatorsTool,
  createListPorPromeshTool,
  createGetPorPromeshDashboardTool,
  createGetPorPromeshStatsTool,
  createGetPorPromeshTool,
  createUpdatePorPromeshTool,
  createDeletePorPromeshTool,
  createValidatePorPromeshTool,
} = require("../src/ai/mcp/tools/porPromesh");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];
const DELETE_ROLES = ["admin", "superadmin", "superadmin2"];
const LOGISTICS = { id: "l1", role: "responsable_logistique_achat" };
const REPORT_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => jest.clearAllMocks());

test("create_por_promesh: READ_WRITE_ROLES, delegates to createPorPromesh(body, actor)", async () => {
  porPromeshService.createPorPromesh.mockResolvedValue({ id: REPORT_ID });
  const tool = createCreatePorPromeshTool();
  expect(tool.requiredRoles).toEqual(READ_WRITE_ROLES);
  await tool.execute({ machine: "L1" }, { actingUser: LOGISTICS });
  expect(porPromeshService.createPorPromesh).toHaveBeenCalledWith({ machine: "L1" }, LOGISTICS);
});

test("create_or_open_por_promesh_draft: requires machine+poste, delegates to createOrOpenDraft(actor, input)", async () => {
  porPromeshService.createOrOpenDraft.mockResolvedValue({ id: REPORT_ID });
  const tool = createCreateOrOpenPorPromeshDraftTool();
  expect(tool.inputSchema.validate({}).error).toBeTruthy();
  const input = { machine: "L1", poste: "matin" };
  await tool.execute(input, { actingUser: LOGISTICS });
  expect(porPromeshService.createOrOpenDraft).toHaveBeenCalledWith(LOGISTICS, input);
});

test("list_por_promesh_operators: delegates to listOperators()", async () => {
  porPromeshService.listOperators.mockResolvedValue([]);
  await createListPorPromeshOperatorsTool().execute({}, { actingUser: LOGISTICS });
  expect(porPromeshService.listOperators).toHaveBeenCalledWith();
});

test("list_por_promesh: delegates to listPorPromesh(actor, filters)", async () => {
  porPromeshService.listPorPromesh.mockResolvedValue([]);
  await createListPorPromeshTool().execute({ poste: "nuit" }, { actingUser: LOGISTICS });
  expect(porPromeshService.listPorPromesh).toHaveBeenCalledWith(LOGISTICS, { poste: "nuit" });
});

test("get_por_promesh_dashboard / get_por_promesh_stats: delegate with (actor, filters)", async () => {
  porPromeshService.getDashboard.mockResolvedValue({});
  porPromeshService.getStats.mockResolvedValue({});

  await createGetPorPromeshDashboardTool().execute({ machine: "L1" }, { actingUser: LOGISTICS });
  expect(porPromeshService.getDashboard).toHaveBeenCalledWith(LOGISTICS, { machine: "L1" });

  await createGetPorPromeshStatsTool().execute({ machine: "L1" }, { actingUser: LOGISTICS });
  expect(porPromeshService.getStats).toHaveBeenCalledWith(LOGISTICS, { machine: "L1" });
});

test("get_por_promesh: delegates to getPorPromeshById(id, actor)", async () => {
  porPromeshService.getPorPromeshById.mockResolvedValue({ id: REPORT_ID });
  await createGetPorPromeshTool().execute({ id: REPORT_ID }, { actingUser: LOGISTICS });
  expect(porPromeshService.getPorPromeshById).toHaveBeenCalledWith(REPORT_ID, LOGISTICS);
});

test("update_por_promesh: splits id out, requires at least one field beyond id, propagates the lock error", async () => {
  const tool = createUpdatePorPromeshTool();
  expect(tool.inputSchema.validate({ id: REPORT_ID }).error).toBeTruthy();

  porPromeshService.updatePorPromesh.mockRejectedValue({ status: 403, message: "Fiche verrouillée" });
  await expect(
    tool.execute({ id: REPORT_ID, poste: "nuit" }, { actingUser: LOGISTICS })
  ).rejects.toMatchObject({ status: 403 });
  expect(porPromeshService.updatePorPromesh).toHaveBeenCalledWith(REPORT_ID, { poste: "nuit" }, LOGISTICS);
});

test("delete_por_promesh: DELETE_ROLES only, delegates to deletePorPromesh(id, actor)", async () => {
  porPromeshService.deletePorPromesh.mockResolvedValue({ deleted: true });
  const tool = createDeletePorPromeshTool();
  expect(tool.requiredRoles).toEqual(DELETE_ROLES);
  const admin = { id: "a1", role: "admin" };
  await tool.execute({ id: REPORT_ID }, { actingUser: admin });
  expect(porPromeshService.deletePorPromesh).toHaveBeenCalledWith(REPORT_ID, admin);
});

test("validate_por_promesh: READ_WRITE_ROLES (a logistics actor may validate their own draft), delegates to validatePorPromesh(id, actor)", async () => {
  porPromeshService.validatePorPromesh.mockResolvedValue({ id: REPORT_ID, status: "VALIDE", isLocked: true });
  const tool = createValidatePorPromeshTool();
  expect(tool.requiredRoles).toEqual(READ_WRITE_ROLES);
  await tool.execute({ id: REPORT_ID }, { actingUser: LOGISTICS });
  expect(porPromeshService.validatePorPromesh).toHaveBeenCalledWith(REPORT_ID, LOGISTICS);
});

// Sécurité — mass assignment : ni createPorPromesh() ni updatePorPromesh()
// n'allowlistent les champs "plats" (mainFields) avant repo.create()/
// repo.update() (Sequelize instance.update()/create()) ; c'est le schéma
// Joi racine de CE Tool qui doit le faire, comme le fait le validateur HTTP
// équivalent (porPromesh.validator.js). Un champ réel-mais-non-déclaré
// (isLocked/status/validatedAt) contournerait sinon l'invariant "toute
// fiche démarre en BROUILLON/non verrouillée" et le workflow de validation.
describe("Sécurité — le schéma Joi racine n'autorise plus de champs non déclarés (mass assignment)", () => {
  test("update_por_promesh: des champs non déclarés (isLocked, status) sont retirés par la validation Joi, jamais transmis à updatePorPromesh()", () => {
    const { inputSchema } = createUpdatePorPromeshTool();
    const { error, value } = inputSchema.validate(
      { id: REPORT_ID, poste: "nuit", isLocked: true, status: "VALIDE", validatedAt: "2026-01-01" },
      { abortEarly: false, stripUnknown: true }
    );
    expect(error).toBeUndefined();
    expect(value).toEqual({ id: REPORT_ID, poste: "nuit" });
  });

  test("create_por_promesh: des champs non déclarés (isLocked, status) sont retirés par la validation Joi", () => {
    const { inputSchema } = createCreatePorPromeshTool();
    const { error, value } = inputSchema.validate(
      { machine: "L1", isLocked: true, status: "VALIDE" },
      { abortEarly: false, stripUnknown: true }
    );
    expect(error).toBeUndefined();
    expect(value).toEqual({ machine: "L1" });
  });
});
