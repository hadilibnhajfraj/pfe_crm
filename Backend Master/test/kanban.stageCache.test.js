"use strict";

// Regression test for a cache-invalidation bug found during a performance
// audit: kanban.service.js's 60s in-memory `_stageCache` (project counts
// per pipeline stage) was only invalidated by moveStageFast() — the "full"
// stage-change path (project.service.js::moveStage(), with activity
// logging) and every stage CRUD operation (pipelineStage.service.js)
// changed the underlying data without ever busting the cache, so stage
// counts could silently lag up to 60s after those operations.

jest.mock("../src/models/PipelineStage", () => ({ findAll: jest.fn() }));
jest.mock("../src/modules/projects/repositories/project.repository", () => ({}));
jest.mock("../src/modules/pipeline/repositories/pipelineStage.repository", () => ({
  findAllWithProjectCount: jest.fn(),
}));
jest.mock("../src/db", () => ({ sequelize: {} }));
jest.mock("../src/modules/projects/utils/project.completion", () => ({ computeCompletion: jest.fn() }));

const kanbanService = require("../src/modules/kanban/services/kanban.service");
const stageRepo = require("../src/modules/pipeline/repositories/pipelineStage.repository");

beforeEach(() => jest.clearAllMocks());

describe("kanban.service.js — invalidateStageCache is exported and clears the cache", () => {
  test("getStagesWithCount() serves from cache within the 60s TTL, and invalidateStageCache() busts it", async () => {
    stageRepo.findAllWithProjectCount.mockResolvedValue([
      { toJSON: () => ({ id: "s1", name: "Nouveau", projectsCount: 3 }) },
    ]);

    const first = await kanbanService.getStagesWithCount();
    expect(stageRepo.findAllWithProjectCount).toHaveBeenCalledTimes(1);

    // Second call within TTL — served from cache, no new DB call.
    const second = await kanbanService.getStagesWithCount();
    expect(stageRepo.findAllWithProjectCount).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    // After invalidation, the next call must hit the DB again.
    kanbanService.invalidateStageCache();
    await kanbanService.getStagesWithCount();
    expect(stageRepo.findAllWithProjectCount).toHaveBeenCalledTimes(2);
  });
});

describe("project.service.js::moveStage — invalidates the stage cache (audit performance)", () => {
  test("calls kanban.service.js's invalidateStageCache after a successful commit", async () => {
    jest.resetModules();
    const mockInvalidate = jest.fn();
    jest.doMock("../src/modules/kanban/services/kanban.service", () => ({
      toProjectCard: jest.fn((p) => p),
      invalidateStageCache: mockInvalidate,
    }));
    jest.doMock("../src/db", () => ({ sequelize: { transaction: jest.fn(async () => ({ commit: jest.fn(), rollback: jest.fn() })) } }));
    jest.doMock("../src/modules/projects/repositories/project.repository", () => ({
      findById: jest.fn().mockResolvedValue({ id: "p1", pipelineStageId: "s1", stage: { name: "Ancien" } }),
      update: jest.fn().mockResolvedValue(true),
    }));
    jest.doMock("../src/modules/pipeline/repositories/pipelineStage.repository", () => ({
      findById: jest.fn().mockResolvedValue({ id: "s2", name: "Nouveau", autoCreateAction: false }),
    }));
    jest.doMock("../src/modules/project-actions/repositories/projectActionType.repository", () => ({}));
    jest.doMock("../src/modules/project-actions/repositories/projectAction.repository", () => ({}));
    jest.doMock("../src/modules/project-activities/services/projectActivity.service", () => ({ logActivity: jest.fn() }));
    jest.doMock("../src/models/User", () => ({}));
    jest.doMock("../src/services/projectActionCalendarSync.service", () => ({}));

    const { moveStage } = require("../src/modules/projects/services/project.service");
    await moveStage("p1", "s2", "u1");

    expect(mockInvalidate).toHaveBeenCalled();

    jest.dontMock("../src/modules/kanban/services/kanban.service");
    jest.dontMock("../src/db");
    jest.dontMock("../src/modules/projects/repositories/project.repository");
    jest.dontMock("../src/modules/pipeline/repositories/pipelineStage.repository");
    jest.dontMock("../src/modules/project-actions/repositories/projectActionType.repository");
    jest.dontMock("../src/modules/project-actions/repositories/projectAction.repository");
    jest.dontMock("../src/modules/project-activities/services/projectActivity.service");
    jest.dontMock("../src/models/User");
    jest.dontMock("../src/services/projectActionCalendarSync.service");
    jest.resetModules();
  });
});
