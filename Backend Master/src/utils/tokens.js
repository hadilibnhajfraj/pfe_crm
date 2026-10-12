const jwt = require("jsonwebtoken");
const { ROLE_VOCABULARY_VERSION } = require("../constants/roles");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Access token émis avant le vocabulaire de rôles v2 (voir
// constants/roles.js) — traité comme un token invalide par tous les
// consommateurs de verifyAccessToken (authRequired → 401, socket.io →
// refus, moduleAccessGuard → laisse authRequired répondre 401).
class OutdatedRoleVersionError extends jwt.JsonWebTokenError {
  constructor() {
    super("Token issued before the current role vocabulary — re-authentication required");
    this.name = "OutdatedRoleVersionError";
  }
}

function signAccessToken(payload) {
  const secret = mustEnv("JWT_ACCESS_SECRET");
  return jwt.sign({ ...payload, rv: ROLE_VOCABULARY_VERSION }, secret, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
    issuer: "my-api",
    audience: "my-client",
  });
}

function signRefreshToken(payload) {
  const secret = mustEnv("JWT_REFRESH_SECRET");
  return jwt.sign(payload, secret, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
    issuer: "my-api",
    audience: "my-client",
  });
}

function verifyAccessToken(token) {
  const secret = mustEnv("JWT_ACCESS_SECRET");
  const decoded = jwt.verify(token, secret, {
    issuer: "my-api",
    audience: "my-client",
  });
  if (decoded.rv !== ROLE_VOCABULARY_VERSION) throw new OutdatedRoleVersionError();
  return decoded;
}

function verifyRefreshToken(token) {
  const secret = mustEnv("JWT_REFRESH_SECRET");
  return jwt.verify(token, secret, {
    issuer: "my-api",
    audience: "my-client",
  });
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  OutdatedRoleVersionError,
};
