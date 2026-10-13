"use strict";

// GET /powerbi/embed-config — voir powerbi.service.js.
// La route ne lit AUCUN paramètre : ni query, ni corps. L'identité est
// `req.user.sub`, posé par authRequired après vérification du JWT.

const express = require("express");
const { authRequired } = require("../../middleware/auth.middleware");
const { createPowerBiService, PowerBiError, readConfig } = require("./powerbi.service");

function createPowerBiRouter({ service, auth = authRequired }) {
  const router = express.Router();

  router.get("/embed-config", auth, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const config = await service.getEmbedConfig(req.user && req.user.sub);
      return res.json(config);
    } catch (err) {
      if (err instanceof PowerBiError) {
        return res.status(err.status).json({ code: err.code, message: err.message });
      }
      console.error("[powerbi] erreur inattendue :", err && err.name);
      return res.status(500).json({ code: "POWERBI_INTERNAL_ERROR", message: "Erreur interne." });
    }
  });

  return router;
}

// Routeur par défaut : le modèle User et axios ne sont chargés qu'au premier
// appel, pour que le simple montage de la route n'ouvre aucune connexion.
function defaultRouter() {
  let service;
  const lazy = {
    getEmbedConfig: (userId) => {
      // Désactivée ou incomplète : refus immédiat, sans charger le modèle ni la base.
      const cfg = readConfig(process.env);
      if (!cfg.enabled || cfg.missing.length > 0) {
        return Promise.reject(new PowerBiError(503, "POWERBI_NOT_CONFIGURED", "L'intégration Power BI n'est pas configurée."));
      }
      if (!service) service = createPowerBiService({ User: require("../../models/User"), http: require("axios") });
      return service.getEmbedConfig(userId);
    },
  };
  return createPowerBiRouter({ service: lazy });
}

module.exports = defaultRouter();
module.exports.createPowerBiRouter = createPowerBiRouter;
