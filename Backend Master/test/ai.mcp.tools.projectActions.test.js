"use strict";

jest.mock("../src/modules/project-actions/services/projectAction.service", () => ({
  createAction: jest.fn(),
}));

const projectActionService = require("../src/modules/project-actions/services/projectAction.service");
const { createCreateProjectActionTool } = require("../src/ai/mcp/tools/projectActions");

const USER = { id: "u1", role: "user" };
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => jest.clearAllMocks());

describe("create_project_action tool", () => {
  test("open to any authenticated actor — matches the real route (authRequired only, no role check)", () => {
    expect(createCreateProjectActionTool().requiredRoles).toEqual([]);
  });

  test("delegates to projectActionService.createAction(projectId, body, actingUser.id), separating projectId out of the body", async () => {
    projectActionService.createAction.mockResolvedValue({ id: "a1", projectId: PROJECT_ID });
    const tool = createCreateProjectActionTool();

    await tool.execute({ projectId: PROJECT_ID, typeAction: "Visite", commentaire: "Point d'avancement" }, { actingUser: USER });

    expect(projectActionService.createAction).toHaveBeenCalledWith(PROJECT_ID, { typeAction: "Visite", commentaire: "Point d'avancement" }, "u1");
  });

  test("passes dateRelance/reminderMessage through unchanged — un rappel est un attribut de l'activité, jamais un second appel", async () => {
    projectActionService.createAction.mockResolvedValue({ id: "a1" });
    const tool = createCreateProjectActionTool();

    await tool.execute(
      { projectId: PROJECT_ID, typeAction: "Relance", dateRelance: "2026-09-01T09:00:00.000Z", reminderMessage: "Relancer le client" },
      { actingUser: USER }
    );

    expect(projectActionService.createAction).toHaveBeenCalledWith(
      PROJECT_ID,
      { typeAction: "Relance", dateRelance: "2026-09-01T09:00:00.000Z", reminderMessage: "Relancer le client" },
      "u1"
    );
  });

  describe("inputSchema", () => {
    const schema = createCreateProjectActionTool().inputSchema;

    test("requires projectId as a UUID", () => {
      expect(schema.validate({}).error).toBeTruthy();
      expect(schema.validate({ projectId: "not-a-uuid" }).error).toBeTruthy();
      expect(schema.validate({ projectId: PROJECT_ID }).error).toBeUndefined();
    });

    test("rejects an invalid priorite value", () => {
      expect(schema.validate({ projectId: PROJECT_ID, priorite: "extreme" }).error).toBeTruthy();
      expect(schema.validate({ projectId: PROJECT_ID, priorite: "urgente" }).error).toBeUndefined();
    });

    test("rejects a non-ISO dateRelance", () => {
      expect(schema.validate({ projectId: PROJECT_ID, dateRelance: "demain" }).error).toBeTruthy();
    });
  });
});
