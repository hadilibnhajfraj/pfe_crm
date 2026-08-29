"use strict";

jest.mock("../src/modules/projects/services/project.service", () => ({
  listProjects: jest.fn(),
  moveStage: jest.fn(),
  assignOwner: jest.fn(),
}));

const projectService = require("../src/modules/projects/services/project.service");
const { createListProjectsTool, createMoveProjectStageTool, createAssignProjectOwnerTool } = require("../src/ai/mcp/tools/projects");
const { scopeInputForActingUser } = require("../src/ai/mcp/tools/projects/listProjectsTool");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];
const ADMIN = { id: "a1", role: "admin" };
const USER = { id: "u1", role: "user" };
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const STAGE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_UUID = "99999999-9999-4999-8999-999999999999";

beforeEach(() => jest.clearAllMocks());

describe("list_projects tool", () => {
  test("open to any authenticated actor, forwards query + actingUser.id (role=user, input already scoped, so scoping is a no-op here)", async () => {
    projectService.listProjects.mockResolvedValue({ items: [], total: 0 });
    const tool = createListProjectsTool();
    expect(tool.requiredRoles).toEqual([]);
    await tool.execute({ mine: true }, { actingUser: USER });
    expect(projectService.listProjects).toHaveBeenCalledWith({ mine: true }, "u1");
  });
});

// AI-Business-Copilot/25_LIST_PROJECTS_RBAC_ENFORCEMENT.md — reproduit en
// direct : pour "donne-moi les projets associés à Hadil" (elle-même
// l'utilisatrice authentifiée), qwen3:8b a produit un Tool input
// `{"filter_owner":"Hadil"}` — ignoré par le schéma Joi permissif,
// retombant sur `mine=false` (aucun scope) : 5 des 20 projets renvoyés
// appartenaient à d'autres utilisateurs. Le texte du LLM n'est jamais la
// source de vérité sur le périmètre — seul `actingUser.role` (résolu
// côté serveur depuis le JWT, jamais depuis l'input du Tool) décide.
describe("list_projects tool — le LLM ne peut jamais élargir son propre périmètre (rôle non admin-tier)", () => {
  test.each(["user", "commercial", "accueil", "responsable_logistique_achat"])(
    "rôle %s : mine est TOUJOURS forcé à true, quoi que le LLM ait fourni",
    async (role) => {
      projectService.listProjects.mockResolvedValue({ items: [], total: 0 });
      const tool = createListProjectsTool();
      await tool.execute({ mine: false }, { actingUser: { id: "u1", role } });
      expect(projectService.listProjects).toHaveBeenCalledWith(expect.objectContaining({ mine: true }), "u1");
    }
  );

  test("un ownerId FOURNI PAR LE LLM (même un vrai UUID d'un autre utilisateur) est totalement ignoré pour un rôle non admin-tier", async () => {
    projectService.listProjects.mockResolvedValue({ items: [], total: 0 });
    const tool = createListProjectsTool();
    await tool.execute({ ownerId: OTHER_USER_UUID }, { actingUser: USER });
    const [calledQuery] = projectService.listProjects.mock.calls[0];
    expect(calledQuery.ownerId).toBeUndefined();
    expect(calledQuery.mine).toBe(true);
  });

  test("un userId FOURNI PAR LE LLM (l'alias que listProjects() reconnaît aussi pour ownerId) est également ignoré", async () => {
    projectService.listProjects.mockResolvedValue({ items: [], total: 0 });
    const tool = createListProjectsTool();
    await tool.execute({ userId: OTHER_USER_UUID }, { actingUser: USER });
    const [calledQuery] = projectService.listProjects.mock.calls[0];
    expect(calledQuery.userId).toBeUndefined();
    expect(calledQuery.mine).toBe(true);
  });

  test("un champ inventé par le LLM (ex. filter_owner, le cas réellement observé) ne contourne rien — mine reste forcé à true", async () => {
    projectService.listProjects.mockResolvedValue({ items: [], total: 0 });
    const tool = createListProjectsTool();
    await tool.execute({ filter_owner: "Hadil" }, { actingUser: USER });
    const [calledQuery] = projectService.listProjects.mock.calls[0];
    expect(calledQuery.mine).toBe(true);
  });

  test("les autres filtres légitimes (search, projectModele, pagination) restent transmis — seul le périmètre est verrouillé", async () => {
    projectService.listProjects.mockResolvedValue({ items: [], total: 0 });
    const tool = createListProjectsTool();
    await tool.execute({ ownerId: OTHER_USER_UUID, search: "chantier", page: 2 }, { actingUser: USER });
    const [calledQuery] = projectService.listProjects.mock.calls[0];
    expect(calledQuery).toEqual({ search: "chantier", page: 2, mine: true });
  });
});

describe("list_projects tool — les rôles admin-tier gardent le filtre tel que fourni (comportement inchangé)", () => {
  test.each(ADMIN_TIER_ROLES)("rôle %s : ownerId fourni est transmis tel quel, jamais écrasé", async (role) => {
    projectService.listProjects.mockResolvedValue({ items: [], total: 0 });
    const tool = createListProjectsTool();
    await tool.execute({ ownerId: OTHER_USER_UUID }, { actingUser: { id: "a1", role } });
    expect(projectService.listProjects).toHaveBeenCalledWith({ ownerId: OTHER_USER_UUID }, "a1");
  });

  test("rôle admin : mine=false (tous les projets) reste honoré tel quel", async () => {
    projectService.listProjects.mockResolvedValue({ items: [], total: 0 });
    const tool = createListProjectsTool();
    await tool.execute({ mine: false }, { actingUser: ADMIN });
    expect(projectService.listProjects).toHaveBeenCalledWith({ mine: false }, "a1");
  });
});

describe("scopeInputForActingUser() — unité, la fonction de décision elle-même", () => {
  test("admin-tier : retourne l'input EXACTEMENT tel quel (même référence de valeurs), jamais copié/altéré", () => {
    const input = { ownerId: OTHER_USER_UUID, mine: false, search: "x" };
    expect(scopeInputForActingUser(input, ADMIN)).toEqual(input);
  });

  test("non admin-tier : mine/ownerId/userId/myProjects sont toujours retirés puis mine:true est imposé, quel que soit l'input de départ", () => {
    expect(scopeInputForActingUser({ mine: false, ownerId: OTHER_USER_UUID, userId: OTHER_USER_UUID, myProjects: false }, USER)).toEqual({ mine: true });
    expect(scopeInputForActingUser({}, USER)).toEqual({ mine: true });
    expect(scopeInputForActingUser(undefined, USER)).toEqual({ mine: true });
  });
});

describe("move_project_stage tool", () => {
  test("restricted to admin-tier — moveStage() itself does not check ownership", () => {
    expect(createMoveProjectStageTool().requiredRoles).toEqual(ADMIN_TIER_ROLES);
  });

  test("delegates to project.service.moveStage(projectId, pipelineStageId, actingUser.id)", async () => {
    projectService.moveStage.mockResolvedValue({ id: PROJECT_ID, pipelineStageId: STAGE_ID });
    await createMoveProjectStageTool().execute({ projectId: PROJECT_ID, pipelineStageId: STAGE_ID }, { actingUser: ADMIN });
    expect(projectService.moveStage).toHaveBeenCalledWith(PROJECT_ID, STAGE_ID, "a1");
  });
});

describe("assign_project_owner tool", () => {
  test("restricted to admin-tier — assignOwner() itself does not check ownership", () => {
    expect(createAssignProjectOwnerTool().requiredRoles).toEqual(ADMIN_TIER_ROLES);
  });

  test("delegates to project.service.assignOwner(projectId, ownerId, actingUser.id)", async () => {
    projectService.assignOwner.mockResolvedValue({ id: PROJECT_ID, ownerId: "u2" });
    await createAssignProjectOwnerTool().execute({ projectId: PROJECT_ID, ownerId: "u2" }, { actingUser: ADMIN });
    expect(projectService.assignOwner).toHaveBeenCalledWith(PROJECT_ID, "u2", "a1");
  });

  test("allows explicit null ownerId (unassign) but requires the key to be present", () => {
    const schema = createAssignProjectOwnerTool().inputSchema;
    expect(schema.validate({ projectId: PROJECT_ID, ownerId: null }).error).toBeUndefined();
    expect(schema.validate({ projectId: PROJECT_ID }).error).toBeTruthy();
  });
});
