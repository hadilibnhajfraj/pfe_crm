"use strict";

const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const { NotConfiguredError } = require("../src/ai/utils/errors");

describe("LlmProviderChatModel", () => {
  test("throws NotConfiguredError when constructed without an llmProvider", () => {
    expect(() => new LlmProviderChatModel({})).toThrow(NotConfiguredError);
  });

  test("_llmType() identifies this as the kernel's own model type", () => {
    const model = new LlmProviderChatModel({ llmProvider: { complete: async () => "x" } });
    expect(model._llmType()).toBe("ai-kernel-llm-provider");
  });

  test("delegates invoke() to ILlmProvider.complete() and wraps the reply as an AIMessage", async () => {
    const llmProvider = { complete: jest.fn(async () => "the answer") };
    const model = new LlmProviderChatModel({ llmProvider });
    const result = await model.invoke([new HumanMessage("hello")]);
    expect(result).toBeInstanceOf(AIMessage);
    expect(result.content).toBe("the answer");
    expect(llmProvider.complete).toHaveBeenCalledTimes(1);
  });

  test("maps LangChain message types to the {role, content} shape ILlmProvider expects", async () => {
    const llmProvider = { complete: jest.fn(async () => "ok") };
    const model = new LlmProviderChatModel({ llmProvider });
    await model.invoke([new SystemMessage("be nice"), new HumanMessage("hi"), new AIMessage("hello there")]);

    const [messages] = llmProvider.complete.mock.calls[0];
    expect(messages).toEqual([
      { role: "system", content: "be nice" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello there" },
    ]);
  });

  test("forwards a stop sequence from invocation options", async () => {
    const llmProvider = { complete: jest.fn(async () => "ok") };
    const model = new LlmProviderChatModel({ llmProvider });
    await model.invoke([new HumanMessage("hi")], { stop: ["\n"] });
    const [, options] = llmProvider.complete.mock.calls[0];
    expect(options.stop).toEqual(["\n"]);
  });

  test("works inside a RunnableSequence (prompt -> model -> parser), proving real @langchain/core compatibility", async () => {
    const { RunnableSequence } = require("@langchain/core/runnables");
    const { ChatPromptTemplate } = require("@langchain/core/prompts");
    const { StringOutputParser } = require("@langchain/core/output_parsers");

    const model = new LlmProviderChatModel({ llmProvider: { complete: async () => "chained reply" } });
    const prompt = ChatPromptTemplate.fromMessages([["human", "{question}"]]);
    const chain = RunnableSequence.from([prompt, model, new StringOutputParser()]);
    await expect(chain.invoke({ question: "anything" })).resolves.toBe("chained reply");
  });
});
