"use strict";

jest.mock("../src/modules/pipeline/services/pipelineStage.service", () => ({
  getAllStages: jest.fn(),
  getStageById: jest.fn(),
  createStage: jest.fn(),
  updateStage: jest.fn(),
  deleteStage: jest.fn(),
  reorderStages: jest.fn(),
}));

const pipelineStageService = require("../src/modules/pipeline/services/pipelineStage.service");
const {
  createListPipelineStagesTool,
  createGetPipelineStageTool,
  createCreatePipelineStageTool,
  createUpdatePipelineStageTool,
  createDeletePipelineStageTool,
  createReorderPipelineStagesTool,
} = require("../src/ai/mcp/tools/pipeline");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];
const ADMIN = { id: "a1", role: "admin" };
const STAGE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => jest.clearAllMocks());

test("list_pipeline_stages: open to any role, calls getAllStages()", async () => {
  pipelineStageService.getAllStages.mockResolvedValue([{ id: STAGE_ID }]);
  const tool = createListPipelineStagesTool();
  expect(tool.requiredRoles).toEqual([]);
  await tool.execute({}, { actingUser: { id: "u1", role: "user" } });
  expect(pipelineStageService.getAllStages).toHaveBeenCalledWith();
});

test("get_pipeline_stage: calls getStageById(id)", async () => {
  pipelineStageService.getStageById.mockResolvedValue({ id: STAGE_ID });
  await createGetPipelineStageTool().execute({ id: STAGE_ID }, { actingUser: { id: "u1", role: "user" } });
  expect(pipelineStageService.getStageById).toHaveBeenCalledWith(STAGE_ID);
});

test("create_pipeline_stage: admin-tier only, calls createStage(data, actingUser.id)", async () => {
  pipelineStageService.createStage.mockResolvedValue({ id: STAGE_ID, name: "Devis" });
  const tool = createCreatePipelineStageTool();
  expect(tool.requiredRoles).toEqual(ADMIN_TIER_ROLES);
  await tool.execute({ name: "Devis" }, { actingUser: ADMIN });
  expect(pipelineStageService.createStage).toHaveBeenCalledWith({ name: "Devis" }, "a1");
});

test("create_pipeline_stage: rejects an invalid hex color", () => {
  const { error } = createCreatePipelineStageTool().inputSchema.validate({ name: "Devis", color: "not-a-color" });
  expect(error).toBeTruthy();
});

test("update_pipeline_stage: splits id out, calls updateStage(id, data, actingUser.id)", async () => {
  pipelineStageService.updateStage.mockResolvedValue({ id: STAGE_ID, name: "Renamed" });
  await createUpdatePipelineStageTool().execute({ id: STAGE_ID, name: "Renamed" }, { actingUser: ADMIN });
  expect(pipelineStageService.updateStage).toHaveBeenCalledWith(STAGE_ID, { name: "Renamed" }, "a1");
});

test("delete_pipeline_stage: admin-tier only, calls deleteStage(id)", async () => {
  pipelineStageService.deleteStage.mockResolvedValue({ deleted: true });
  const tool = createDeletePipelineStageTool();
  expect(tool.requiredRoles).toEqual(ADMIN_TIER_ROLES);
  await tool.execute({ id: STAGE_ID }, { actingUser: ADMIN });
  expect(pipelineStageService.deleteStage).toHaveBeenCalledWith(STAGE_ID);
});

test("delete_pipeline_stage: propagates the service's 409 (stage still in use) unchanged", async () => {
  pipelineStageService.deleteStage.mockRejectedValue({ status: 409, message: "Cannot delete: 3 project(s) are assigned to this stage" });
  await expect(createDeletePipelineStageTool().execute({ id: STAGE_ID }, { actingUser: ADMIN })).rejects.toMatchObject({ status: 409 });
});

test("reorder_pipeline_stages: calls reorderStages(stages)", async () => {
  pipelineStageService.reorderStages.mockResolvedValue([{ id: STAGE_ID, position: 0 }]);
  const stages = [{ id: STAGE_ID, position: 0 }];
  await createReorderPipelineStagesTool().execute({ stages }, { actingUser: ADMIN });
  expect(pipelineStageService.reorderStages).toHaveBeenCalledWith(stages);
});

test("reorder_pipeline_stages: rejects an empty stages array", () => {
  const { error } = createReorderPipelineStagesTool().inputSchema.validate({ stages: [] });
  expect(error).toBeTruthy();
});
