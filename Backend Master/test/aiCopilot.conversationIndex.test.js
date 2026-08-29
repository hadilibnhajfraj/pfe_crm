"use strict";

const { ConversationIndexService } = require("../src/modules/ai-copilot/services/conversationIndex.service");

describe("ConversationIndexService", () => {
  test("touch()+list() is scoped per owner — one owner never sees another's conversations", () => {
    const index = new ConversationIndexService();
    index.touch("u1", "c1", { preview: "a", intent: "projects" });
    index.touch("u2", "c2", { preview: "b", intent: "hr" });

    expect(index.list("u1")).toEqual([expect.objectContaining({ conversationId: "c1" })]);
    expect(index.list("u2")).toEqual([expect.objectContaining({ conversationId: "c2" })]);
  });

  test("list() with no conversations for that owner returns []", () => {
    const index = new ConversationIndexService();
    expect(index.list("nobody")).toEqual([]);
  });

  test("list() returns newest-first, even when touch() calls land in the same millisecond", () => {
    const index = new ConversationIndexService();
    // No fake timers needed: ordering is driven by an internal monotonic
    // sequence counter, not by comparing `updatedAt` strings — see
    // conversationIndex.service.js's own comment on why.
    index.touch("u1", "c1");
    index.touch("u1", "c2");
    index.touch("u1", "c3");
    expect(index.list("u1").map((e) => e.conversationId)).toEqual(["c3", "c2", "c1"]);
  });

  test("list() respects the limit option", () => {
    const index = new ConversationIndexService();
    for (let i = 0; i < 5; i++) index.touch("u1", `c${i}`);
    expect(index.list("u1", { limit: 2 })).toHaveLength(2);
  });

  test("touch() is a no-op without both ownerId and conversationId", () => {
    const index = new ConversationIndexService();
    index.touch(null, "c1");
    index.touch("u1", null);
    expect(index.list("u1")).toEqual([]);
  });

  test("isOwner() is true only after touch(), and only for that exact owner", () => {
    const index = new ConversationIndexService();
    expect(index.isOwner("u1", "c1")).toBe(false);
    index.touch("u1", "c1");
    expect(index.isOwner("u1", "c1")).toBe(true);
    expect(index.isOwner("u2", "c1")).toBe(false);
  });

  test("touch() updates an existing entry's metadata rather than duplicating it", () => {
    const index = new ConversationIndexService();
    index.touch("u1", "c1", { preview: "first", intent: "projects" });
    index.touch("u1", "c1", { preview: "second", intent: "hr" });
    const list = index.list("u1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ preview: "second", intent: "hr" });
  });
});
