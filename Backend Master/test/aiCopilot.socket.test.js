"use strict";

// Verifies aiCopilotSocket.js's own event sequencing in isolation — FAKE
// io/emitToUser/bridge (jest.mock), never a real Socket.IO server, LLM
// call, or MCP server. Mirrors the no-real-dependency discipline used
// throughout this kernel's test suite.

const mockEmitToUser = jest.fn();
jest.mock("../src/socket", () => ({ emitToUser: (...args) => mockEmitToUser(...args) }));

const mockBridge = {
  isEnabled: jest.fn(() => true),
  isRoleAllowed: jest.fn(() => true),
  // Same delegation pattern as aiCopilot.routes.test.js — canUseAiCopilot
  // is the ONE function aiCopilotSocket.js actually calls.
  canUseAiCopilot: jest.fn((user) => {
    if (!mockBridge.isEnabled()) return { allowed: false, reason: "copilot_disabled" };
    if (!mockBridge.isRoleAllowed(user && user.role)) return { allowed: false, reason: "role_not_allowed" };
    return { allowed: true, reason: null };
  }),
  sendMessageAsActingUser: jest.fn(),
};
jest.mock("../src/modules/ai-copilot/services/aiCopilotBridge.service", () => mockBridge);

const { attach } = require("../src/modules/ai-copilot/socket/aiCopilotSocket");
const { NotConfiguredError } = require("../src/ai/utils/errors");

const USER = { id: "u1", role: "admin", email: "u1@x.com" };

function buildFakeIo() {
  let connectionHandler;
  return {
    io: {
      on: jest.fn((event, handler) => {
        if (event === "connection") connectionHandler = handler;
      }),
    },
    getConnectionHandler: () => connectionHandler,
  };
}

function buildFakeSocket(user = USER) {
  let sendHandler;
  return {
    socket: {
      user,
      on: jest.fn((event, handler) => {
        if (event === "ai-copilot:send") sendHandler = handler;
      }),
    },
    getSendHandler: () => sendHandler,
  };
}

const noDelay = { wait: jest.fn(async () => {}) };

function connect(ioWrapper) {
  const { socket, getSendHandler } = buildFakeSocket();
  ioWrapper.getConnectionHandler()(socket);
  return getSendHandler();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBridge.isEnabled.mockReturnValue(true);
  mockBridge.isRoleAllowed.mockReturnValue(true);
});

describe("aiCopilotSocket.attach — registration", () => {
  test("registers a 'connection' listener without ever replacing socket.js's own one (io.on can be called more than once)", () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    expect(io.on).toHaveBeenCalledWith("connection", expect.any(Function));
  });

  test("each connected socket gets its own 'ai-copilot:send' listener", () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const { socket } = buildFakeSocket();
    ioWrapper.getConnectionHandler()(socket);
    expect(socket.on).toHaveBeenCalledWith("ai-copilot:send", expect.any(Function));
  });
});

describe("aiCopilotSocket — 'ai-copilot:send' happy path", () => {
  test("emits typing, then N chunks (re-joining to the original answer), then complete with the full envelope", async () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);

    const envelope = { conversationId: "c1", intent: "projects", mode: "agent", answer: "Trois projets sont en retard.", suggestions: [] };
    mockBridge.sendMessageAsActingUser.mockResolvedValue(envelope);

    await sendHandler({ message: "Quels projets sont en retard ?", conversationId: "c1" });

    const calls = mockEmitToUser.mock.calls;
    expect(calls[0]).toEqual(["u1", "ai-copilot:typing", { conversationId: "c1" }]);
    expect(calls[calls.length - 1]).toEqual(["u1", "ai-copilot:complete", envelope]);

    const chunkCalls = calls.filter(([, event]) => event === "ai-copilot:chunk");
    expect(chunkCalls.length).toBeGreaterThan(0);
    expect(chunkCalls.every(([, , data]) => data.conversationId === "c1")).toBe(true);
    expect(chunkCalls.map(([, , data]) => data.text).join("")).toBe(envelope.answer);
  });

  test("forwards the mapped socket.user ({id,role,email}) and payload straight to sendMessageAsActingUser", async () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);
    mockBridge.sendMessageAsActingUser.mockResolvedValue({ conversationId: "c1", answer: "ok" });

    await sendHandler({ message: "Bonjour", conversationId: "c1" });

    expect(mockBridge.sendMessageAsActingUser).toHaveBeenCalledWith(USER, { message: "Bonjour", conversationId: "c1", pageContext: null });
  });

  test("Context Awareness: a provided pageContext is forwarded to sendMessageAsActingUser unchanged", async () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);
    mockBridge.sendMessageAsActingUser.mockResolvedValue({ conversationId: "c1", answer: "ok" });
    const pageContext = { screen: "dashboard", data: { totalProjects: 42 } };

    await sendHandler({ message: "Résume la situation", conversationId: "c1", pageContext });

    expect(mockBridge.sendMessageAsActingUser).toHaveBeenCalledWith(USER, { message: "Résume la situation", conversationId: "c1", pageContext });
  });

  test("waits chunkDelayMs between chunks when a real interval is configured", async () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    const wait = jest.fn(async () => {});
    attach(io, { chunkDelayMs: 35, wait });
    const sendHandler = connect(ioWrapper);
    mockBridge.sendMessageAsActingUser.mockResolvedValue({ conversationId: "c1", answer: "un deux trois quatre cinq six" });

    await sendHandler({ message: "hi", conversationId: "c1" });

    expect(wait).toHaveBeenCalledWith(35);
  });
});

describe("aiCopilotSocket — 'ai-copilot:send' guard rails", () => {
  test("empty/blank message: emits ai-copilot:error, never calls the bridge", async () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);

    await sendHandler({ message: "   " });

    expect(mockBridge.sendMessageAsActingUser).not.toHaveBeenCalled();
    expect(mockEmitToUser).toHaveBeenCalledWith("u1", "ai-copilot:error", expect.objectContaining({ message: expect.any(String) }));
  });

  test("Copilot disabled: emits ai-copilot:error, never calls the bridge", async () => {
    mockBridge.isEnabled.mockReturnValue(false);
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);

    await sendHandler({ message: "Bonjour" });

    expect(mockBridge.sendMessageAsActingUser).not.toHaveBeenCalled();
    expect(mockEmitToUser).toHaveBeenCalledWith("u1", "ai-copilot:error", expect.any(Object));
  });

  test("role not allowed: emits ai-copilot:error, never calls the bridge", async () => {
    mockBridge.isRoleAllowed.mockReturnValue(false);
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);

    await sendHandler({ message: "Bonjour" });

    expect(mockBridge.sendMessageAsActingUser).not.toHaveBeenCalled();
    expect(mockEmitToUser).toHaveBeenCalledWith("u1", "ai-copilot:error", expect.any(Object));
  });
});

describe("aiCopilotSocket — 'ai-copilot:send' failure handling", () => {
  test("a NotConfiguredError from the bridge becomes a safe, specific error message (never the raw error)", async () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);
    mockBridge.sendMessageAsActingUser.mockRejectedValue(new NotConfiguredError("ILlmProvider adapter"));

    await sendHandler({ message: "Bonjour" });

    const errorCall = mockEmitToUser.mock.calls.find(([, event]) => event === "ai-copilot:error");
    expect(errorCall[2].message).not.toContain("ILlmProvider");
    expect(mockEmitToUser).not.toHaveBeenCalledWith("u1", "ai-copilot:complete", expect.anything());
  });

  test("an unexpected error becomes a generic safe message, never leaking internal detail", async () => {
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);
    mockBridge.sendMessageAsActingUser.mockRejectedValue(new TypeError("Cannot read property 'x' of undefined"));

    await sendHandler({ message: "Bonjour" });

    const errorCall = mockEmitToUser.mock.calls.find(([, event]) => event === "ai-copilot:error");
    expect(errorCall[2].message).not.toContain("Cannot read property");
    expect(errorCall[2].reason).toBe("AI_INTERNAL_ERROR");
  });

  // Regression for the "SequelizeDatabaseError shows as 'Copilot non
  // configuré'" incident, mirrored on the WebSocket transport — see
  // test/aiCopilot.routes.test.js for the HTTP-side equivalent.
  test("a real Sequelize error becomes reason: AI_DATABASE_ERROR, never AI_PROVIDER_NOT_CONFIGURED", async () => {
    const { DatabaseError } = require("sequelize");
    const ioWrapper = buildFakeIo();
    const { io } = ioWrapper;
    attach(io, noDelay);
    const sendHandler = connect(ioWrapper);
    mockBridge.sendMessageAsActingUser.mockRejectedValue(new DatabaseError(new Error('column "dateExpiration" does not exist')));

    await sendHandler({ message: "Quels projets sont critiques ?" });

    const errorCall = mockEmitToUser.mock.calls.find(([, event]) => event === "ai-copilot:error");
    expect(errorCall[2].reason).toBe("AI_DATABASE_ERROR");
    expect(errorCall[2].message).not.toMatch(/configuré/i);
    expect(errorCall[2].message).not.toContain("dateExpiration");
  });
});
