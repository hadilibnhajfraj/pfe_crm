const multer = require("multer");
const path = require("path");

// Aucune restriction de type de fichier auparavant — voir middleware/upload.js
// pour le même correctif (audit sécurité : XSS stockée possible via un
// avatar .svg/.html servi tel quel par express.static("uploads")).
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

// stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/avatars");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_EXT.has(ext)) return cb(null, true);
    cb(new Error(`Type de fichier non autorisé. Acceptés : ${[...ALLOWED_EXT].join(", ")}`));
  },
});

// Sans ce handler, un rejet (type de fichier ou taille) tombe sur le
// gestionnaire d'erreurs par défaut d'Express (page HTML générique, pas la
// réponse JSON attendue par le client).
upload.handleUploadError = function handleUploadError(err, _req, res, next) {
  if (!err) return next();
  return res.status(400).json({ message: err.message || "Échec de l'upload" });
};

module.exports = upload;