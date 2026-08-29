"use strict";

const { createAutomationsPipeline } = require("../src/ai/automations/pipeline");
const { NotConfiguredError } = require("../src/ai/automations/errors");

function fakeMcpServer(toolNames) {
  return {
    toolRegistry: { list: () => toolNames.map((name) => ({ name, description: `${name} desc`, inputSchema: null })) },
    handleMessage: jest.fn(async ({ params }) => ({ result: { content: [{ type: "text", text: JSON.stringify({ tool: params.name, echoedInput: params.arguments }) }] } })),
  };
}

const ACTING_USER = { id: "a1", role: "admin" };

describe("createAutomationsPipeline — required collaborators", () => {
  test("throws NotConfiguredError without a mcpServer", () => {
    expect(() => createAutomationsPipeline({ actingUser: ACTING_USER })).toThrow(NotConfiguredError);
  });

  test("throws NotConfiguredError without an actingUser", () => {
    expect(() => createAutomationsPipeline({ mcpServer: fakeMcpServer([]) })).toThrow(NotConfiguredError);
  });
});

describe("createAutomationsPipeline — wiring", () => {
  test("wires one LangChain Tool per registered MCP tool", () => {
    const pipeline = createAutomationsPipeline({ mcpServer: fakeMcpServer(["create_maintenance_request", "send_notification_email"]), actingUser: ACTING_USER });
    expect(pipeline.tools.map((t) => t.name).sort()).toEqual(["create_maintenance_request", "send_notification_email"]);
  });

  test("wires all 8 automations, keyed by name", () => {
    const pipeline = createAutomationsPipeline({ mcpServer: fakeMcpServer([]), actingUser: ACTING_USER });
    expect(pipeline.automations.size).toBe(8);
  });

  test("end-to-end: an automation's Tool call is routed through the real McpServer.handleMessage(), fixed to the pipeline's actingUser", async () => {
    const mcpServer = fakeMcpServer(["create_maintenance_request"]);
    const pipeline = createAutomationsPipeline({ mcpServer, actingUser: ACTING_USER });

    const autoCreation = pipeline.automations.get("auto_creation");
    const result = await autoCreation.run({
      actingUser: ACTING_USER,
      items: [{ recordType: "maintenance_request", input: { title: "Panne" } }],
    });

    expect(mcpServer.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ method: "tools/call", params: expect.objectContaining({ name: "create_maintenance_request", arguments: { title: "Panne" }, actingUser: ACTING_USER }) })
    );
    expect(result.success).toBe(true);
  });
});
