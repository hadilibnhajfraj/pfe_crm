// NOTE (audit sécurité) : ce fichier n'est actuellement require() nulle part
// (dead code — ni app.js ni aucun autre module ne le monte), et n'avait
// aucune authentification du tout. Corrigé ici en attendant une décision (le
// supprimer, ou le monter réellement) pour qu'il ne devienne pas, une fois
// réactivé sans revue, une route non authentifiée exposant la timeline de
// n'importe quel projet.
const express = require("express");
const router = express.Router();
const timelineController = require("../controllers/projectTimeline.controller");
const { authRequired } = require("../middleware/auth.middleware");

router.get("/timeline/:projectId", authRequired, timelineController.getTimeline);

module.exports = router;