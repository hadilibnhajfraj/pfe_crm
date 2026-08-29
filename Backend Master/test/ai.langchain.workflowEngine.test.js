"use strict";

const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { WorkflowError } = require("../src/ai/langchain/errors");

function fakeChain(name, impl) {
  return { name, invoke: jest.fn(impl || (async (input) => ({ ranWith: input }))) };
}

function fakeTool(name, impl) {
  return { name, invoke: jest.fn(impl || (async (input) => ({ ranWith: input }))) };
}

function fakeRouter(routeKey) {
  return { route: jest.fn(async () => routeKey) };
}

describe("LangChainWorkflowEngine — chain steps", () => {
  test("runs a chain step and stores its output under outputKey", async () => {
    const engine = new LangChainWorkflowEngine();
    const chain = fakeChain("greet", async () => ({ greeting: "hi" }));
    const result = await engine.run([{ type: "chain", chain, outputKey: "greetResult" }], { user: "Hadil" });
    expect(result).toEqual({ user: "Hadil", greetResult: { greeting: "hi" } });
  });

  test("defaults the output key to the chain's own name when outputKey is omitted", async () => {
    const engine = new LangChainWorkflowEngine();
    const chain = fakeChain("greet", async () => "hi");
    const result = await engine.run([{ type: "chain", chain }], {});
    expect(result).toEqual({ greet: "hi" });
  });

  test("buildInput controls what the chain receives, independent of the full state", async () => {
    const engine = new LangChainWorkflowEngine();
    const chain = fakeChain("greet");
    await engine.run([{ type: "chain", chain, buildInput: (state) => ({ only: state.user }) }], { user: "X", noise: "ignored" });
    expect(chain.invoke).toHaveBeenCalledWith({ only: "X" }, expect.objectContaining({ user: "X" }));
  });

  test("threads state through multiple sequential chain steps", async () => {
    const engine = new LangChainWorkflowEngine();
    const stepA = fakeChain("a", async () => "A-done");
    const stepB = fakeChain("b", async (input) => `B-saw-${input}`);
    const result = await engine.run(
      [
        { type: "chain", chain: stepA, outputKey: "a" },
        { type: "chain", chain: stepB, outputKey: "b", buildInput: (state) => state.a },
      ],
      {}
    );
    expect(result).toEqual({ a: "A-done", b: "B-saw-A-done" });
  });
});

describe("LangChainWorkflowEngine — tool steps", () => {
  test("runs a tool step and stores its output", async () => {
    const engine = new LangChainWorkflowEngine();
    const tool = fakeTool("lookup", async () => "42");
    const result = await engine.run([{ type: "tool", tool, outputKey: "lookupResult", buildInput: () => ({ id: 1 }) }], {});
    expect(result).toEqual({ lookupResult: "42" });
    expect(tool.invoke).toHaveBeenCalledWith({ id: 1 });
  });

  test("buildInput omitted defaults to an empty object", async () => {
    const engine = new LangChainWorkflowEngine();
    const tool = fakeTool("noop");
    await engine.run([{ type: "tool", tool }], {});
    expect(tool.invoke).toHaveBeenCalledWith({});
  });
});

describe("LangChainWorkflowEngine — router steps", () => {
  test("runs the matching branch and records the chosen route", async () => {
    const engine = new LangChainWorkflowEngine();
    const router = fakeRouter("hr");
    const hrChain = fakeChain("hr_chain", async () => "handled by HR");
    const result = await engine.run(
      [
        {
          type: "router",
          router,
          buildInput: (state) => state.message,
          branches: { hr: [{ type: "chain", chain: hrChain, outputKey: "handlerResult" }] },
        },
      ],
      { message: "conge" }
    );
    expect(result).toEqual({ message: "conge", route: "hr", handlerResult: "handled by HR" });
  });

  test("falls back to defaultBranch when the chosen route has no matching branch", async () => {
    const engine = new LangChainWorkflowEngine();
    const router = fakeRouter("unmapped_route");
    const fallbackChain = fakeChain("fallback", async () => "default handling");
    const result = await engine.run(
      [{ type: "router", router, defaultBranch: [{ type: "chain", chain: fallbackChain, outputKey: "handlerResult" }] }],
      {}
    );
    expect(result.handlerResult).toBe("default handling");
  });

  test("returns state with just the route recorded when there is no branch and no defaultBranch", async () => {
    const engine = new LangChainWorkflowEngine();
    const router = fakeRouter("nowhere");
    const result = await engine.run([{ type: "router", router }], { a: 1 });
    expect(result).toEqual({ a: 1, route: "nowhere" });
  });

  test("supports nested routers (a branch that itself routes again)", async () => {
    const engine = new LangChainWorkflowEngine();
    const outerRouter = fakeRouter("level1");
    const innerRouter = fakeRouter("level2");
    const leafChain = fakeChain("leaf", async () => "reached the leaf");
    const steps = [
      {
        type: "router",
        router: outerRouter,
        outputKey: "outerRoute",
        branches: {
          level1: [
            {
              type: "router",
              router: innerRouter,
              outputKey: "innerRoute",
              branches: { level2: [{ type: "chain", chain: leafChain, outputKey: "final" }] },
            },
          ],
        },
      },
    ];
    const result = await engine.run(steps, {});
    expect(result).toEqual({ outerRoute: "level1", innerRoute: "level2", final: "reached the leaf" });
  });
});

describe("LangChainWorkflowEngine — error handling", () => {
  test("wraps a step failure in WorkflowError, naming the step", async () => {
    const engine = new LangChainWorkflowEngine();
    const failing = fakeChain("boom", async () => {
      throw new Error("kaboom");
    });
    await expect(engine.run([{ type: "chain", chain: failing }], {})).rejects.toThrow(WorkflowError);
  });

  test("an unknown step type fails with WorkflowError rather than silently doing nothing", async () => {
    const engine = new LangChainWorkflowEngine();
    await expect(engine.run([{ type: "not_a_real_type" }], {})).rejects.toThrow(WorkflowError);
  });

  test("a WorkflowError raised inside a nested router branch is not double-wrapped", async () => {
    const engine = new LangChainWorkflowEngine();
    const router = fakeRouter("x");
    const failing = fakeChain("inner_boom", async () => {
      throw new Error("nested failure");
    });
    try {
      await engine.run([{ type: "router", router, branches: { x: [{ type: "chain", chain: failing }] } }], {});
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowError);
      expect(err.message).toMatch(/inner_boom/);
      expect(err.cause.message).not.toMatch(/Workflow step/); // not wrapped twice
    }
  });
});
