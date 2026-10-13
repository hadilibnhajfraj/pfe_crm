"use strict";

// Intégration Power BI « App owns data » — préparation, désactivée par défaut.
//
// L'identité effective transmise à Power BI vient EXCLUSIVEMENT du compte relu
// en base à partir du `sub` du JWT déjà vérifié. Rien de ce que le navigateur
// envoie (corps, paramètres, en-têtes autres que le jeton) n'y participe.
// Les dépendances (modèle User, client HTTP, environnement) sont injectées pour
// que les tests n'ouvrent ni base de données ni connexion réseau.

const { ROLES } = require("../../constants/roles");

const RLS_ROLE_COMMERCIAL = "Commercial";
const RLS_ROLE_GLOBAL = "Vue globale";

// Pages du rapport laissées aux commerciaux. Clients, Production, Machines &
// Déchets ne sont reliés à aucun commercial : le rôle RLS « Commercial » les
// vide (FALSE()) et l'écran ne les propose pas.
const COMMERCIAL_PAGES = Object.freeze([
  "01 — Executive Overview",
  "02 — Commercial Performance",
  "03 — Project Pipeline",
  "04 — Relance Center",
]);

// Politique par rôle CRM. Tout rôle absent de cette table est refusé.
const POLICY_BY_ROLE = Object.freeze({
  [ROLES.COMMERCIAL]: { scope: "commercial", rlsRole: RLS_ROLE_COMMERCIAL, pages: COMMERCIAL_PAGES },
  [ROLES.COMMERCIAL_SEDENTAIRE]: { scope: "commercial", rlsRole: RLS_ROLE_COMMERCIAL, pages: COMMERCIAL_PAGES },
  [ROLES.ADMIN]: { scope: "global", rlsRole: RLS_ROLE_GLOBAL, pages: null },
  [ROLES.SUPERADMIN]: { scope: "global", rlsRole: RLS_ROLE_GLOBAL, pages: null },
});

const REQUIRED_ENV = Object.freeze([
  "POWERBI_TENANT_ID",
  "POWERBI_CLIENT_ID",
  "POWERBI_CLIENT_SECRET",
  "POWERBI_WORKSPACE_ID",
  "POWERBI_REPORT_ID",
  "POWERBI_DATASET_ID",
]);

const TOKEN_LIFETIME_MINUTES = 15;

class PowerBiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PowerBiError";
    this.status = status;
    this.code = code;
  }
}

function readConfig(env) {
  const missing = REQUIRED_ENV.filter((k) => !String(env[k] || "").trim());
  return {
    enabled: env.POWERBI_EMBED_ENABLED === "true",
    demoMode: env.DEMO_MODE === "true",
    missing,
  };
}

function resolvePolicy(role) {
  return Object.prototype.hasOwnProperty.call(POLICY_BY_ROLE, role) ? POLICY_BY_ROLE[role] : null;
}

function viewerLabel(user, policy) {
  return policy.scope === "global" ? "Vue globale — Administrateur" : `Utilisateur connecté : ${user.email}`;
}

function createPowerBiService({ User, http, env = process.env, now = () => Date.now() }) {
  async function loadVerifiedUser(userId) {
    if (!userId) throw new PowerBiError(401, "POWERBI_NO_IDENTITY", "Session invalide.");
    const user = await User.findByPk(userId, { attributes: ["id", "email", "role", "isActive"] });
    if (!user || user.isActive !== true) {
      throw new PowerBiError(403, "POWERBI_USER_INACTIVE", "Ce compte n'existe plus ou est désactivé.");
    }
    return user;
  }

  async function getEmbedConfig(userId) {
    const config = readConfig(env);
    // Tant que l'intégration n'est pas explicitement activée et entièrement
    // configurée, la route ne contacte ni la base ni Microsoft.
    if (!config.enabled || config.missing.length > 0) {
      throw new PowerBiError(503, "POWERBI_NOT_CONFIGURED", "L'intégration Power BI n'est pas configurée.");
    }
    // Périmètre de démonstration uniquement : DEMO_MODE est positionné par
    // scripts/demo/demo-guard.js (npm run demo:start), jamais par npm start.
    if (!config.demoMode) {
      throw new PowerBiError(503, "POWERBI_DEMO_ONLY", "L'intégration Power BI n'est disponible qu'en mode démonstration.");
    }

    const user = await loadVerifiedUser(userId);
    // Le rôle retenu est celui lu en base, pas celui porté par le jeton.
    const policy = resolvePolicy(user.role);
    if (!policy) {
      throw new PowerBiError(403, "POWERBI_ROLE_NOT_ALLOWED", "Ce rôle n'a pas accès au rapport commercial.");
    }

    let embedUrl, embedToken, expiresAt;
    try {
      const aad = await http.post(
        `https://login.microsoftonline.com/${encodeURIComponent(env.POWERBI_TENANT_ID)}/oauth2/v2.0/token`,
        new URLSearchParams({
          grant_type: "client_credentials",
          client_id: env.POWERBI_CLIENT_ID,
          client_secret: env.POWERBI_CLIENT_SECRET,
          scope: "https://analysis.windows.net/powerbi/api/.default",
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
      );
      const headers = { Authorization: `Bearer ${aad.data.access_token}` };
      const api = "https://api.powerbi.com/v1.0/myorg";
      const report = await http.get(`${api}/groups/${env.POWERBI_WORKSPACE_ID}/reports/${env.POWERBI_REPORT_ID}`, { headers, timeout: 10000 });
      embedUrl = report.data.embedUrl;
      const token = await http.post(
        `${api}/GenerateToken`,
        {
          datasets: [{ id: env.POWERBI_DATASET_ID }],
          reports: [{ id: env.POWERBI_REPORT_ID, allowEdit: false }],
          targetWorkspaces: [{ id: env.POWERBI_WORKSPACE_ID }],
          // Identité RLS : l'UUID du compte (identique dans le modèle Power BI),
          // et le rôle décidé par le serveur.
          identities: [{ username: String(user.id), roles: [policy.rlsRole], datasets: [env.POWERBI_DATASET_ID] }],
          lifetimeInMinutes: TOKEN_LIFETIME_MINUTES,
        },
        { headers, timeout: 10000 }
      );
      embedToken = token.data.token;
      expiresAt = token.data.expiration || new Date(now() + TOKEN_LIFETIME_MINUTES * 60000).toISOString();
    } catch (err) {
      // Ni le secret, ni les jetons, ni le corps de la réponse Microsoft ne sont journalisés.
      const status = err && err.response ? err.response.status : "réseau";
      console.error(`[powerbi] échec de l'appel Microsoft (statut ${status})`);
      throw new PowerBiError(502, "POWERBI_UPSTREAM_ERROR", "Power BI est momentanément indisponible.");
    }
    if (!embedUrl || !embedToken) {
      throw new PowerBiError(502, "POWERBI_UPSTREAM_ERROR", "Power BI est momentanément indisponible.");
    }

    return {
      reportId: env.POWERBI_REPORT_ID,
      embedUrl,
      embedToken,
      expiresAt,
      viewer: {
        email: user.email,
        scope: policy.scope,
        label: viewerLabel(user, policy),
        allowedPages: policy.pages,
      },
    };
  }

  return { getEmbedConfig };
}

module.exports = {
  createPowerBiService,
  PowerBiError,
  resolvePolicy,
  readConfig,
  REQUIRED_ENV,
  RLS_ROLE_COMMERCIAL,
  RLS_ROLE_GLOBAL,
  COMMERCIAL_PAGES,
};
