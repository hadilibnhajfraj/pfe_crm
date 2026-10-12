// middleware/auth.middleware.js
const { verifyAccessToken } = require("../utils/tokens");

function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      return res.status(401).json({ message: "Missing token" });
    }

    const decoded = verifyAccessToken(token);
    req.user = decoded; // { sub, email, role, rv }
    return next();
  } catch (e) {
    // Token antérieur au vocabulaire de rôles v2 (constants/roles.js) : même
    // 401 que tout token invalide (le client Flutter vide alors sa session),
    // avec un code explicite pour le diagnostic.
    if (e.name === "OutdatedRoleVersionError") {
      return res.status(401).json({
        message: "Session expirée : veuillez vous reconnecter",
        code: "ROLE_VERSION_OUTDATED",
      });
    }
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { authRequired };
