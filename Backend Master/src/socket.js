"use strict";

const { Server } = require("socket.io");
const { verifyAccessToken } = require("./utils/tokens");

let _io = null;

// Handshake auth — same JWT access token as every REST call (see
// middleware/auth.middleware.js::authRequired). Without this, ANY client
// (even one that never logged in) could connect and call
// socket.emit("join", "<any-user-id>") to receive another user's private
// real-time events (HR/maintenance/project notifications) — audit
// sécurité. Client sends the token via `io(url, { auth: { token } })`
// (the standard Socket.IO v4 pattern) — a corresponding Flutter client
// update is required; until then the socket connection simply fails to
// authenticate (fails closed: no real-time push, but no data exposure and
// the REST API is unaffected).
function _authenticate(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    const decoded = verifyAccessToken(token);
    socket.user = { id: decoded.sub, role: decoded.role, email: decoded.email };
    next();
  } catch (_err) {
    next(new Error("Authentication required"));
  }
}

function init(httpServer) {
  _io = new Server(httpServer, {
    cors: {
      origin: [
        "https://www.crmprobar.com",
        "https://crmprobar.com",
        "https://api.crmprobar.com",
        "http://localhost:57745",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  _io.use(_authenticate);

  _io.on("connection", (socket) => {
    // Auto-join the socket's OWN verified room — no client-supplied userId
    // is ever trusted for this anymore.
    socket.join(`user:${socket.user.id}`);

    // Backward-compatible no-op for older clients still emitting "join":
    // only ever (re-)joins the socket's own room, silently ignores any
    // other id rather than trusting it.
    socket.on("join", (userId) => {
      if (userId && String(userId) === String(socket.user.id)) socket.join(`user:${socket.user.id}`);
    });

    socket.on("disconnect", () => {});
  });

  console.log("✅ Socket.IO initialized");
  return _io;
}

function getIo() {
  if (!_io) throw new Error("Socket.IO not initialized — call init() first");
  return _io;
}

// Emit to a specific user room (no-op if socket not yet initialized)
function emitToUser(userId, event, data) {
  if (!_io) return;
  _io.to(`user:${userId}`).emit(event, data);
}

// Emit to all connected clients in a role room
function emitToRoom(room, event, data) {
  if (!_io) return;
  _io.to(room).emit(event, data);
}

module.exports = { init, getIo, emitToUser, emitToRoom, _authenticate };
