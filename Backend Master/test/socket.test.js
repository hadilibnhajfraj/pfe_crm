"use strict";

// Regression tests for the Socket.IO handshake authentication fix (audit
// sécurité) — previously ANY client could connect and call
// socket.emit("join", "<any-user-id>") to join another user's private
// notification room with zero verification. Mocks socket.io's Server class
// entirely (no real network/HTTP server involved — socket.io-client isn't a
// project dependency) so io.use()/io.on("connection", ...) callbacks can be
// captured and invoked directly against fake socket objects.

const mockVerifyAccessToken = jest.fn();
jest.mock("../src/utils/tokens", () => ({ verifyAccessToken: (...args) => mockVerifyAccessToken(...args) }));

let capturedAuthMiddleware;
let capturedConnectionHandler;
const mockIoInstance = {
  use: jest.fn((mw) => {
    capturedAuthMiddleware = mw;
  }),
  on: jest.fn((event, handler) => {
    if (event === "connection") capturedConnectionHandler = handler;
  }),
  to: jest.fn(() => ({ emit: jest.fn() })),
};
jest.mock("socket.io", () => ({ Server: jest.fn(() => mockIoInstance) }));

const socketModule = require("../src/socket");
const { _authenticate } = socketModule;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("socket.js — _authenticate (handshake JWT verification)", () => {
  test("rejects a connection with no token at all", () => {
    const socket = { handshake: { auth: {} } };
    const next = jest.fn();
    _authenticate(socket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.user).toBeUndefined();
  });

  test("rejects a connection with an invalid/expired token", () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const socket = { handshake: { auth: { token: "bad-token" } } };
    const next = jest.fn();
    _authenticate(socket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.user).toBeUndefined();
  });

  test("accepts a valid token and attaches the verified identity to socket.user", () => {
    mockVerifyAccessToken.mockReturnValue({ sub: "u1", role: "admin", email: "u1@x.com" });
    const socket = { handshake: { auth: { token: "good-token" } } };
    const next = jest.fn();
    _authenticate(socket, next);
    expect(next).toHaveBeenCalledWith(); // no error
    expect(socket.user).toEqual({ id: "u1", role: "admin", email: "u1@x.com" });
  });
});

describe("socket.js — init() wiring", () => {
  test("registers _authenticate as handshake middleware via io.use()", () => {
    socketModule.init({});
    expect(mockIoInstance.use).toHaveBeenCalledWith(_authenticate);
  });

  test("on connection, the socket only ever joins its OWN verified room, never a client-supplied one", () => {
    socketModule.init({});
    const joinedRooms = [];
    const socket = {
      user: { id: "u1" },
      join: (room) => joinedRooms.push(room),
      on: jest.fn(),
    };
    capturedConnectionHandler(socket);
    expect(joinedRooms).toEqual(["user:u1"]);

    // Backward-compatible "join" handler: extract and invoke it directly.
    const joinCall = socket.on.mock.calls.find(([event]) => event === "join");
    const joinHandler = joinCall[1];

    joinHandler("u1"); // own id -> harmless re-join
    expect(joinedRooms).toEqual(["user:u1", "user:u1"]);

    joinHandler("victim-id"); // someone else's id -> ignored, never joined
    expect(joinedRooms).toEqual(["user:u1", "user:u1"]);
  });
});
