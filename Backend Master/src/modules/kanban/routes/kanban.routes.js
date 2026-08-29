const router = require("express").Router();
const ctrl = require("../controllers/kanban.controller");
const { authRequired } = require("../../../middleware/auth.middleware");
const { requireOwnerOrAdmin } = require("../../projects/policies/project.policy");

router.use(authRequired);

// GET /pipeline/kanban?projectModele=project&mine=true
router.get("/kanban", ctrl.getKanban);

// GET /pipeline/stages — all stages with projectsCount (60 s cache)
router.get("/stages", ctrl.getStages);

// GET /pipeline/projects — paginated project list (same filters as GET /projects)
router.get("/projects", ctrl.getPipelineProjects);

// PUT /pipeline/projects/:id/stage — fast D&D move (no activity log). Same
// ownership policy as the full move endpoint (PUT /projects/:id/move-stage)
// — moveStageFast()'s raw SQL UPDATE has no ownership check of its own
// (see kanban.service.js), so this middleware is the only gate (audit
// sécurité : absente auparavant, tout utilisateur authentifié pouvait
// déplacer le projet de n'importe qui).
router.put("/projects/:id/stage", requireOwnerOrAdmin, ctrl.moveStageFast);

module.exports = router;
