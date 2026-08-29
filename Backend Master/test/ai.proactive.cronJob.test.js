"use strict";

// Le cron lui-même (src/cron/proactiveAiMonitor.job.js) est un point
// d'ENTRÉE fin, comme les 4 autres crons de ce dépôt (aucun n'a de test
// dédié — voir test/) : résout l'actingUser, délègue tout le reste à
// createProactivePipeline() (déjà testé, voir ai.proactive.pipeline.test.js).
// Ce fichier teste UNIQUEMENT cette orchestration (résolution d'actingUser,
// enchaînement detect -> dispatch, dégradation gracieuse), avec le modèle
// Sequelize et le McpServer entièrement mockés — jamais une vraie DB.

jest.mock("../src/models/User", () => ({ findOne: jest.fn() }));
jest.mock("../src/ai/mcp/server/start", () => ({ createServer: jest.fn(() => ({ mocked: "mcpServer" })) }));
jest.mock("../src/socket", () => ({ emitToUser: jest.fn() }));
jest.mock("../src/ai/proactive/pipeline", () => ({ createProactivePipeline: jest.fn() }));
jest.mock("node-cron", () => ({ schedule: jest.fn() }));

const User = require("../src/models/User");
const { createProactivePipeline } = require("../src/ai/proactive/pipeline");
const { runProactiveMonitoring, resolveActingUser } = require("../src/cron/proactiveAiMonitor.job");

beforeEach(() => jest.clearAllMocks());

describe("proactiveAiMonitor.job — résolution de l'actingUser", () => {
  test("résout le premier compte admin-tier actif trouvé (id/role/email)", async () => {
    User.findOne.mockResolvedValue({ id: "u1", role: "superadmin", email: "admin@cbi.tn" });
    const actingUser = await resolveActingUser();
    expect(actingUser).toEqual({ id: "u1", role: "superadmin", email: "admin@cbi.tn" });
  });

  test("aucun compte admin-tier actif : retourne null, jamais une identité fabriquée", async () => {
    User.findOne.mockResolvedValue(null);
    expect(await resolveActingUser()).toBeNull();
  });
});

describe("proactiveAiMonitor.job — runProactiveMonitoring()", () => {
  test("sans admin-tier actif : n'appelle jamais createProactivePipeline, dégrade gracieusement", async () => {
    User.findOne.mockResolvedValue(null);

    const result = await runProactiveMonitoring();

    expect(result).toEqual({ alertsCount: 0, dispatched: null });
    expect(createProactivePipeline).not.toHaveBeenCalled();
  });

  test("aucune alerte détectée : ne tente jamais de résoudre des destinataires ni de dispatcher", async () => {
    User.findOne.mockResolvedValue({ id: "u1", role: "admin", email: "a@b.com" });
    const monitor = { detectAlerts: jest.fn(async () => []) };
    const dispatcher = { dispatch: jest.fn() };
    const listUsersByRoleTool = { invoke: jest.fn() };
    createProactivePipeline.mockReturnValue({ monitor, dispatcher, listUsersByRoleTool });

    const result = await runProactiveMonitoring();

    expect(result).toEqual({ alertsCount: 0, dispatched: null });
    expect(listUsersByRoleTool.invoke).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  test("des alertes détectées : résout les destinataires admin-tier via list_users_by_role, puis dispatche", async () => {
    User.findOne.mockResolvedValue({ id: "u1", role: "admin", email: "a@b.com" });
    const alerts = [{ domain: "projects", subject: "x" }];
    const monitor = { detectAlerts: jest.fn(async () => alerts) };
    const dispatched = { sent: [{ recipientId: "r1" }], errors: [], alertsCount: 1, recipientsCount: 1 };
    const dispatcher = { dispatch: jest.fn(async () => dispatched) };
    const recipients = [{ id: "r1", email: "r1@cbi.tn", role: "admin" }];
    const listUsersByRoleTool = { invoke: jest.fn(async () => JSON.stringify(recipients)) };
    createProactivePipeline.mockReturnValue({ monitor, dispatcher, listUsersByRoleTool });

    const result = await runProactiveMonitoring();

    expect(listUsersByRoleTool.invoke).toHaveBeenCalledWith({ role: "admin" });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(alerts, recipients);
    expect(result).toEqual({ alertsCount: 1, dispatched });
  });

  test("construit le pipeline avec l'actingUser résolu et un mcpServer réel (singleton)", async () => {
    User.findOne.mockResolvedValue({ id: "u1", role: "admin", email: "a@b.com" });
    const monitor = { detectAlerts: jest.fn(async () => []) };
    createProactivePipeline.mockReturnValue({ monitor, dispatcher: {}, listUsersByRoleTool: {} });

    await runProactiveMonitoring();

    expect(createProactivePipeline).toHaveBeenCalledWith(expect.objectContaining({ actingUser: { id: "u1", role: "admin", email: "a@b.com" } }));
  });
});
