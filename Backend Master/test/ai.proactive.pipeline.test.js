"use strict";

const { createProactivePipeline } = require("../src/ai/proactive/pipeline");
const { NotConfiguredError } = require("../src/ai/proactive/errors");
const { ProactiveMonitor } = require("../src/ai/proactive/proactiveMonitor");
const { AlertDispatcher } = require("../src/ai/proactive/alertDispatcher");

function fakeMcpServer(toolNames) {
  return {
    toolRegistry: { list: () => toolNames.map((name) => ({ name, description: `${name} desc`, inputSchema: null })) },
    handleMessage: jest.fn(async ({ params }) => ({ result: { content: [{ type: "text", text: JSON.stringify({ tool: params.name, echoedInput: params.arguments }) }] } })),
  };
}

const ACTING_USER = { id: "a1", role: "admin" };

describe("createProactivePipeline — required collaborators", () => {
  test("throws NotConfiguredError without a mcpServer", () => {
    expect(() => createProactivePipeline({ actingUser: ACTING_USER })).toThrow(NotConfiguredError);
  });

  test("throws NotConfiguredError without an actingUser", () => {
    expect(() => createProactivePipeline({ mcpServer: fakeMcpServer([]) })).toThrow(NotConfiguredError);
  });
});

describe("createProactivePipeline — wiring", () => {
  test("wires a real ProactiveMonitor and a real AlertDispatcher", () => {
    const pipeline = createProactivePipeline({ mcpServer: fakeMcpServer(["list_projects", "send_notification_email"]), actingUser: ACTING_USER });
    expect(pipeline.monitor).toBeInstanceOf(ProactiveMonitor);
    expect(pipeline.dispatcher).toBeInstanceOf(AlertDispatcher);
  });

  test("reuses createDashboardPipeline (jamais une deuxième construction de mcpServer/Tools) — dashboardService est un vrai DashboardService", () => {
    const pipeline = createProactivePipeline({ mcpServer: fakeMcpServer([]), actingUser: ACTING_USER });
    expect(typeof pipeline.dashboardService.getSnapshot).toBe("function");
    expect(typeof pipeline.dashboardService.getDomainSnapshot).toBe("function");
  });

  test("resolves list_projects/send_notification_email/list_users_by_role by name quand ils sont enregistrés", () => {
    const pipeline = createProactivePipeline({ mcpServer: fakeMcpServer(["list_projects", "send_notification_email", "list_users_by_role"]), actingUser: ACTING_USER });
    expect(pipeline.tools.map((t) => t.name).sort()).toEqual(["list_projects", "list_users_by_role", "send_notification_email"]);
    expect(pipeline.listUsersByRoleTool).toBeDefined();
    expect(pipeline.listUsersByRoleTool.name).toBe("list_users_by_role");
  });

  test("un Tool absent du manifeste (rôle sans accès) laisse simplement le monitor/dispatcher dégrader gracieusement — jamais une exception à la construction", () => {
    expect(() => createProactivePipeline({ mcpServer: fakeMcpServer([]), actingUser: ACTING_USER })).not.toThrow();
  });

  test("emitToUser optionnel est transmis tel quel au dispatcher", async () => {
    const emitToUser = jest.fn();
    const pipeline = createProactivePipeline({ mcpServer: fakeMcpServer(["send_notification_email"]), actingUser: ACTING_USER, emitToUser });

    await pipeline.dispatcher.dispatch(
      [{ domain: "projects", subject: "x", severity: "critique", explanation: "p", suggestion: "s", suggestedActions: [], workflowTemplate: null }],
      [{ id: "u1", email: "a@b.com" }]
    );

    expect(emitToUser).toHaveBeenCalled();
  });
});

describe("createProactivePipeline — bout-en-bout via un VRAI McpServer.handleMessage()", () => {
  test("le Tool list_projects du monitor route bien à travers mcpServer.handleMessage(), fixé à l'actingUser du pipeline", async () => {
    const mcpServer = fakeMcpServer(["list_projects"]);
    const pipeline = createProactivePipeline({ mcpServer, actingUser: ACTING_USER });

    await pipeline.monitor.detectAlerts();

    expect(mcpServer.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: "tools/call", params: expect.objectContaining({ name: "list_projects", actingUser: ACTING_USER }) })
    );
  });

  test("le Tool send_notification_email du dispatcher route bien à travers mcpServer.handleMessage()", async () => {
    const mcpServer = fakeMcpServer(["send_notification_email"]);
    const pipeline = createProactivePipeline({ mcpServer, actingUser: ACTING_USER });

    await pipeline.dispatcher.dispatch(
      [{ domain: "projects", subject: "x", severity: "critique", explanation: "p", suggestion: "s", suggestedActions: [], workflowTemplate: null }],
      [{ id: "u1", email: "a@b.com" }]
    );

    expect(mcpServer.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: "tools/call", params: expect.objectContaining({ name: "send_notification_email", actingUser: ACTING_USER }) })
    );
  });
});
