const { verifyAccessToken } = require("../utils/tokens");

// Role-scoped module access — restricts a role to a fixed set of path
// prefixes regardless of which routers get mounted in app.js later.
// Decodes the JWT itself (rather than relying on req.user) because this
// guard runs before each route's own authRequired middleware.
const ALLOWED_PREFIXES_BY_ROLE = {
  responsable_logistique_achat: [
    "/por-promesh",
    "/industrial-records",
    "/hr-requests",
    "/recuperables",
    // Référentiel machines PROBAR/PROMESH — consultation et gestion
    // (machine.routes.js).
    "/machines",
    // Vue consolidée PROMESH + PROBAR en lecture seule (production.routes.js)
    // — mêmes fiches que /por-promesh et /industrial-records, même périmètre.
    "/production",
    "/maintenance-requests",
    "/auth",
    "/users/me",
    "/uploads",
    "/me",
    // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md, mission
    // "CORRIGER LES 3 PROBLÈMES IDENTIFIÉS PAR L'AUDIT COPILOT" — ce rôle a
    // un accès Copilot réel (industrial/maintenance/por_promesh/hr, voir
    // capabilityMatrixService.js), mais cette liste n'avait jamais été mise
    // à jour quand /ai-copilot a été monté dans app.js : ce rôle recevait un
    // 403 sur CHAQUE message Copilot, avant même que l'IntentDetector ne
    // s'exécute. Le RBAC réel (Tool/Agent) reste inchangé — seul l'accès
    // HTTP à la route elle-même est ajouté ici, aucune autre permission.
    "/ai-copilot",
  ],
};

function moduleAccessGuard(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return next();

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (_) {
    return next(); // invalid/expired token — let the route's own authRequired return 401
  }

  const allowedPrefixes = ALLOWED_PREFIXES_BY_ROLE[decoded.role];
  if (!allowedPrefixes) return next(); // role has no restriction defined here

  const isAllowed = allowedPrefixes.some((prefix) => req.path.startsWith(prefix));
  if (!isAllowed) {
    return res.status(403).json({
      success: false,
      message: "Accès refusé : ce rôle n'a accès qu'au module POR PROMESH",
    });
  }
  return next();
}

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — exporté (en plus
// de `moduleAccessGuard` lui-même) pour que RoleCapabilityAuditAgent
// (src/ai/reasoning/capabilityMatrixService.js, injecté depuis
// aiCopilotBridge.service.js — jamais require() directement sous src/ai/,
// même discipline que createCopilotMeeting) puisse répondre à "quels
// modules sont accessibles avec mon rôle ?" en LISANT cette même table,
// jamais en la recopiant : une seule source de vérité pour cette
// restriction, que ce soit le middleware HTTP ou le Copilot qui la consulte.
module.exports = { moduleAccessGuard, ALLOWED_PREFIXES_BY_ROLE };
