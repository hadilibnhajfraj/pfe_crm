"use strict";

const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");

function fakeMemory() {
  return { append: jest.fn(), getHistory: jest.fn(async () => []), clear: jest.fn() };
}

describe("ConversationManager", () => {
  test("recordUserMessage appends a {role: 'user', content} message", async () => {
    const memory = fakeMemory();
    const manager = new ConversationManager({ memory });
    await manager.recordUserMessage("conv-1", "bonjour");
    expect(memory.append).toHaveBeenCalledWith("conv-1", { role: "user", content: "bonjour" });
  });

  test("recordAssistantMessage appends a {role: 'assistant', content, ...meta} message", async () => {
    const memory = fakeMemory();
    const manager = new ConversationManager({ memory });
    await manager.recordAssistantMessage("conv-1", "voici la réponse", { intent: "hr", mode: "qa" });
    expect(memory.append).toHaveBeenCalledWith("conv-1", { role: "assistant", content: "voici la réponse", intent: "hr", mode: "qa" });
  });

  test("is a no-op without a conversationId (never calls memory)", async () => {
    const memory = fakeMemory();
    const manager = new ConversationManager({ memory });
    await manager.recordUserMessage(null, "x");
    await manager.recordAssistantMessage(undefined, "y");
    await manager.reset("");
    expect(memory.append).not.toHaveBeenCalled();
    expect(memory.clear).not.toHaveBeenCalled();
  });

  test("getHistory without a conversationId returns [] without touching memory", async () => {
    const memory = fakeMemory();
    const manager = new ConversationManager({ memory });
    await expect(manager.getHistory(null)).resolves.toEqual([]);
    expect(memory.getHistory).not.toHaveBeenCalled();
  });

  test("getHistory defaults the limit to maxHistoryMessages", async () => {
    const memory = fakeMemory();
    const manager = new ConversationManager({ memory, maxHistoryMessages: 7 });
    await manager.getHistory("conv-1");
    expect(memory.getHistory).toHaveBeenCalledWith("conv-1", { limit: 7 });
  });

  test("getHistory honors an explicit limit override", async () => {
    const memory = fakeMemory();
    const manager = new ConversationManager({ memory, maxHistoryMessages: 7 });
    await manager.getHistory("conv-1", { limit: 2 });
    expect(memory.getHistory).toHaveBeenCalledWith("conv-1", { limit: 2 });
  });

  test("reset delegates to memory.clear", async () => {
    const memory = fakeMemory();
    const manager = new ConversationManager({ memory });
    await manager.reset("conv-1");
    expect(memory.clear).toHaveBeenCalledWith("conv-1");
  });
});

describe("ConversationManager — le sujet courant (conversations longues, survit à la fenêtre d'historique)", () => {
  test("getCurrentTopic est null avant tout tour assistant à intention connue", () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    expect(manager.getCurrentTopic("conv-1")).toBeNull();
  });

  test("recordAssistantMessage avec un intent met à jour le sujet courant", async () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    await manager.recordAssistantMessage("conv-1", "Voici les projets.", { intent: "projects", mode: "agent" });
    expect(manager.getCurrentTopic("conv-1")).toBe("projects");
  });

  test("un tour 'general_chat' (repli sans intention métier précise) ne change JAMAIS le sujet courant", async () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    await manager.recordAssistantMessage("conv-1", "Voici les projets.", { intent: "projects" });
    await manager.recordAssistantMessage("conv-1", "Je vous en prie.", { intent: "general_chat" });
    expect(manager.getCurrentTopic("conv-1")).toBe("projects");
  });

  test("un tour assistant SANS intent (ex. mode 'error'/'clarification') ne change pas le sujet courant", async () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    await manager.recordAssistantMessage("conv-1", "Voici les projets.", { intent: "projects", mode: "agent" });
    await manager.recordAssistantMessage("conv-1", "Je n'ai pas compris.", { mode: "error" });
    expect(manager.getCurrentTopic("conv-1")).toBe("projects");
  });

  test("le sujet le plus RÉCENT l'emporte — un nouveau tour à intention connue remplace l'ancien", async () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    await manager.recordAssistantMessage("conv-1", "Voici les projets.", { intent: "projects" });
    await manager.recordAssistantMessage("conv-1", "Voici la maintenance.", { intent: "maintenance" });
    expect(manager.getCurrentTopic("conv-1")).toBe("maintenance");
  });

  test("le sujet SURVIT au-delà de la fenêtre d'historique (getHistory est fenêtrée, getCurrentTopic ne l'est jamais)", async () => {
    // Fenêtre d'historique volontairement minuscule (2 messages) pour
    // simuler une conversation longue où le tour qui a établi le sujet
    // ("projects") est depuis longtemps sorti de la fenêtre.
    const memory = { append: jest.fn(), getHistory: jest.fn(async () => []), clear: jest.fn() };
    const manager = new ConversationManager({ memory, maxHistoryMessages: 2 });

    await manager.recordAssistantMessage("conv-1", "Voici les projets.", { intent: "projects" });
    for (let i = 0; i < 30; i++) {
      await manager.recordUserMessage("conv-1", `question de suivi n°${i}`);
      await manager.recordAssistantMessage("conv-1", `réponse n°${i}`, { mode: "qa" }); // sans intent connue
    }

    expect(manager.getCurrentTopic("conv-1")).toBe("projects");
  });

  test("des sujets courants distincts par conversation — jamais de fuite entre conversations", async () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    await manager.recordAssistantMessage("conv-A", "...", { intent: "projects" });
    await manager.recordAssistantMessage("conv-B", "...", { intent: "maintenance" });
    expect(manager.getCurrentTopic("conv-A")).toBe("projects");
    expect(manager.getCurrentTopic("conv-B")).toBe("maintenance");
  });

  test("getCurrentTopic sans conversationId retourne null sans planter", () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    expect(manager.getCurrentTopic(null)).toBeNull();
    expect(manager.getCurrentTopic(undefined)).toBeNull();
  });

  test("reset() oublie aussi le sujet courant", async () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    await manager.recordAssistantMessage("conv-1", "...", { intent: "projects" });
    await manager.reset("conv-1");
    expect(manager.getCurrentTopic("conv-1")).toBeNull();
  });
});

describe("ConversationManager — clearCurrentTopic() (AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md, appelé par AIManager après une écriture calendrier réelle)", () => {
  test("efface le sujet courant sans toucher à l'historique de la conversation (memory.clear() jamais appelé)", async () => {
    const memory = fakeMemory();
    const manager = new ConversationManager({ memory });
    await manager.recordAssistantMessage("conv-1", "Il me faut le sujet.", { intent: "meetings" });
    manager.clearCurrentTopic("conv-1");
    expect(manager.getCurrentTopic("conv-1")).toBeNull();
    expect(memory.clear).not.toHaveBeenCalled();
  });

  test("n'affecte jamais le sujet courant d'une AUTRE conversationId", async () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    await manager.recordAssistantMessage("conv-A", "...", { intent: "meetings" });
    await manager.recordAssistantMessage("conv-B", "...", { intent: "meetings" });
    manager.clearCurrentTopic("conv-A");
    expect(manager.getCurrentTopic("conv-A")).toBeNull();
    expect(manager.getCurrentTopic("conv-B")).toBe("meetings");
  });

  test("sans conversationId, no-op silencieux (comme les autres méthodes de cette classe)", () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    expect(() => manager.clearCurrentTopic(null)).not.toThrow();
    expect(() => manager.clearCurrentTopic(undefined)).not.toThrow();
  });

  test("un sujet déjà absent : no-op, aucune erreur", () => {
    const manager = new ConversationManager({ memory: fakeMemory() });
    expect(() => manager.clearCurrentTopic("conv-jamais-vue")).not.toThrow();
    expect(manager.getCurrentTopic("conv-jamais-vue")).toBeNull();
  });
});
