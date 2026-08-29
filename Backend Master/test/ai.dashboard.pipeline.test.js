"use strict";

const { createDashboardPipeline } = require("../src/ai/dashboard/pipeline");
const { NotConfiguredError } = require("../src/ai/dashboard/errors");

function fakeMcpServer(toolNames) {
  return {
    toolRegistry: { list: () => toolNames.map((name) => ({ name, description: `${name} desc`, inputSchema: null })) },
    handleMessage: jest.fn(async ({ params }) => ({ result: { content: [{ type: "text", text: JSON.stringify([]) }] } })),
  };
}

const ACTING_USER = { id: "a1", role: "admin" };

describe("createDashboardPipeline — required collaborators", () => {
  test("throws NotConfiguredError without a mcpServer", () => {
    expect(() => createDashboardPipeline({ actingUser: ACTING_USER })).toThrow(NotConfiguredError);
  });

  test("throws NotConfiguredError without an actingUser", () => {
    expect(() => createDashboardPipeline({ mcpServer: fakeMcpServer([]) })).toThrow(NotConfiguredError);
  });
});

describe("createDashboardPipeline — wiring", () => {
  test("wires one LangChain Tool per registered MCP tool", () => {
    const pipeline = createDashboardPipeline({ mcpServer: fakeMcpServer(["list_projects", "get_dashboard_kpis"]), actingUser: ACTING_USER });
    expect(pipeline.tools.map((t) => t.name).sort()).toEqual(["get_dashboard_kpis", "list_projects"]);
  });

  test("wires all 7 domain analyzers and a DashboardService over them", () => {
    const pipeline = createDashboardPipeline({ mcpServer: fakeMcpServer([]), actingUser: ACTING_USER });
    expect(pipeline.analyzers.size).toBe(7);
    expect(pipeline.dashboardService.listDomains().sort()).toEqual(pipeline.dashboardService.listDomains().sort());
  });

  test("end-to-end: a Tool call from an analyzer is routed through the real McpServer.handleMessage(), fixed to the pipeline's actingUser", async () => {
    const mcpServer = fakeMcpServer(["list_projects"]);
    const pipeline = createDashboardPipeline({ mcpServer, actingUser: ACTING_USER });

    await pipeline.dashboardService.getDomainSnapshot("projects", { actingUser: ACTING_USER });

    expect(mcpServer.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: "tools/call", params: expect.objectContaining({ name: "list_projects", actingUser: ACTING_USER }) })
    );
  });
});
