"use strict";

jest.mock("../src/modules/industrial-records/services/industrialRecord.service", () => ({
  createRecord: jest.fn(),
  listRecords: jest.fn(),
  getRecordById: jest.fn(),
  updateRecord: jest.fn(),
  deleteRecord: jest.fn(),
}));

const industrialRecordService = require("../src/modules/industrial-records/services/industrialRecord.service");
const {
  createCreateIndustrialRecordTool,
  createListIndustrialRecordsTool,
  createGetIndustrialRecordTool,
  createUpdateIndustrialRecordTool,
  createDeleteIndustrialRecordTool,
} = require("../src/ai/mcp/tools/industrial");

const READ_WRITE_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];
const DELETE_ROLES = ["admin", "superadmin", "superadmin2"];
const LOGISTICS = { id: "l1", role: "responsable_logistique_achat", email: "l1@x.com" };
const RECORD_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => jest.clearAllMocks());

test("create_industrial_record: READ_WRITE_ROLES, delegates to createRecord(body, actor)", async () => {
  industrialRecordService.createRecord.mockResolvedValue({ id: RECORD_ID });
  const tool = createCreateIndustrialRecordTool();
  expect(tool.requiredRoles).toEqual(READ_WRITE_ROLES);
  await tool.execute({ module: "probar" }, { actingUser: LOGISTICS });
  expect(industrialRecordService.createRecord).toHaveBeenCalledWith({ module: "probar" }, LOGISTICS);
});

test("create_industrial_record: propagates the service's 403 for an unauthorized module=maintenance attempt", async () => {
  industrialRecordService.createRecord.mockRejectedValue({ status: 403, message: "forbidden" });
  await expect(
    createCreateIndustrialRecordTool().execute({ module: "maintenance" }, { actingUser: LOGISTICS })
  ).rejects.toMatchObject({ status: 403 });
});

test("list_industrial_records: delegates to listRecords(filters, actor)", async () => {
  industrialRecordService.listRecords.mockResolvedValue([]);
  await createListIndustrialRecordsTool().execute({ module: "probar", page: 1 }, { actingUser: LOGISTICS });
  expect(industrialRecordService.listRecords).toHaveBeenCalledWith({ module: "probar", page: 1 }, LOGISTICS);
});

test("get_industrial_record: delegates to getRecordById(id, actor)", async () => {
  industrialRecordService.getRecordById.mockResolvedValue({ id: RECORD_ID });
  await createGetIndustrialRecordTool().execute({ id: RECORD_ID }, { actingUser: LOGISTICS });
  expect(industrialRecordService.getRecordById).toHaveBeenCalledWith(RECORD_ID, LOGISTICS);
});

test("update_industrial_record: splits id out, delegates to updateRecord(id, data, actor)", async () => {
  industrialRecordService.updateRecord.mockResolvedValue({ id: RECORD_ID });
  await createUpdateIndustrialRecordTool().execute({ id: RECORD_ID, statutQualite: "ok" }, { actingUser: LOGISTICS });
  expect(industrialRecordService.updateRecord).toHaveBeenCalledWith(RECORD_ID, { statutQualite: "ok" }, LOGISTICS);
});

test("delete_industrial_record: DELETE_ROLES only (excludes responsable_logistique_achat), delegates to deleteRecord(id, actor)", async () => {
  industrialRecordService.deleteRecord.mockResolvedValue({ deleted: true });
  const tool = createDeleteIndustrialRecordTool();
  expect(tool.requiredRoles).toEqual(DELETE_ROLES);
  expect(tool.requiredRoles).not.toContain("responsable_logistique_achat");
  await tool.execute({ id: RECORD_ID }, { actingUser: { id: "a1", role: "admin" } });
  expect(industrialRecordService.deleteRecord).toHaveBeenCalledWith(RECORD_ID, { id: "a1", role: "admin" });
});

// Sécurité — mass assignment : ni createRecord() ni updateRecord() (donc ni
// repo.update()/Sequelize instance.update()) n'allowlistent les champs
// eux-mêmes ; c'est le schéma Joi de CE Tool qui doit le faire (comme le
// validateur HTTP équivalent, industrialRecord.validator.js, qui n'a jamais
// `.unknown(true)`). ValidationManager.validateToolInput() applique
// `stripUnknown: true` — un champ non déclaré dans le schéma doit donc
// disparaître AVANT execute(), jamais atteindre le service.
describe("Sécurité — le schéma Joi n'autorise plus de champs non déclarés (mass assignment)", () => {
  test("update_industrial_record: un champ non déclaré (createdBy) est retiré par la validation Joi, jamais transmis à updateRecord()", () => {
    const { inputSchema } = createUpdateIndustrialRecordTool();
    const { error, value } = inputSchema.validate(
      { id: RECORD_ID, statutQualite: "ok", createdBy: "11111111-1111-4111-8111-999999999999" },
      { abortEarly: false, stripUnknown: true }
    );
    expect(error).toBeUndefined();
    expect(value).not.toHaveProperty("createdBy");
    expect(value).toEqual({ id: RECORD_ID, statutQualite: "ok" });
  });

  test("create_industrial_record: un champ non déclaré (statut) est retiré par la validation Joi", () => {
    const { inputSchema } = createCreateIndustrialRecordTool();
    const { error, value } = inputSchema.validate({ module: "probar", statut: "validee" }, { abortEarly: false, stripUnknown: true });
    expect(error).toBeUndefined();
    expect(value).not.toHaveProperty("statut");
  });
});
