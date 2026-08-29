"use strict";

const { BaseChatModel } = require("@langchain/core/language_models/chat_models");
const { AIMessage } = require("@langchain/core/messages");
const { NotConfiguredError } = require("../errors");

function roleFor(message) {
  const type = typeof message._getType === "function" ? message._getType() : "human";
  if (type === "human") return "user";
  if (type === "ai") return "assistant";
  if (type === "system") return "system";
  return type;
}

function contentFor(message) {
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

/**
 * The ONLY file in this kernel that bridges @langchain/core's model
 * contract (BaseChatModel) to our own ILlmProvider port
 * (src/ai/services/llmProvider.interface.js). Every Chain/Planner/Router in
 * this module is built on top of BaseChatModel, so all of them work with
 * WHATEVER ILlmProvider adapter gets wired later (Sprint 0 decision, see
 * AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md §13.2) without a single line
 * of LangChain-specific code changing when that adapter lands — swap the
 * ILlmProvider passed in here, nothing else.
 *
 * Contract this class expects from ILlmProvider.complete(): given
 * `messages: {role: "system"|"user"|"assistant", content: string}[]`,
 * resolve a plain string with the model's reply.
 */
class LlmProviderChatModel extends BaseChatModel {
  constructor({ llmProvider, ...fields } = {}) {
    super(fields);
    if (!llmProvider) {
      throw new NotConfiguredError("LlmProviderChatModel requires an ILlmProvider instance");
    }
    this.llmProvider = llmProvider;
  }

  _llmType() {
    return "ai-kernel-llm-provider";
  }

  async _generate(messages, options) {
    const plainMessages = messages.map((m) => ({ role: roleFor(m), content: contentFor(m) }));
    const text = await this.llmProvider.complete(plainMessages, { stop: options && options.stop });
    return {
      generations: [
        {
          text,
          message: new AIMessage(text),
        },
      ],
    };
  }
}

module.exports = { LlmProviderChatModel, roleFor, contentFor };
