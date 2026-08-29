// NOTE (audit sécurité) : ce fichier n'est actuellement require() nulle part
// (dead code — ni app.js ni aucun autre module ne le monte). Il référençait
// en plus un middleware inexistant (../middleware/auth, sans .middleware —
// aurait crashé au démarrage si jamais mounté). Corrigé ici en attendant une
// décision (le supprimer, ou le monter réellement) pour qu'il ne devienne
// pas, une fois réactivé sans revue, une route non authentifiée.
const router = require("express").Router();
const { ProjectComment } = require("../models");
const { notifyProjectComment } = require("../services/notification.service");
const { authRequired } = require("../middleware/auth.middleware");

router.post("/:projectId/comments", authRequired, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { body, parentId = null } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ message: "body is required" });
    }

    const comment = await ProjectComment.create({
      projectId,
      authorId: req.user.sub, // depuis JWT
      parentId,
      body: body.trim(),
    });

    // ✅ créer notifications pour les autres
    await notifyProjectComment({
      projectId,
      commentId: comment.id,
      authorId: req.user.sub,
      body: comment.body,
    });

    return res.status(201).json(comment);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
