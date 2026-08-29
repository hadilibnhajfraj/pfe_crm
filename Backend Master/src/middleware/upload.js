const multer = require("multer");
const path = require("path");
const fs = require("fs");

const dir = path.join(__dirname, "..", "uploads", "avatars");
fs.mkdirSync(dir, { recursive: true });

// Aucune restriction de type de fichier auparavant — un avatar pouvait être
// n'importe quelle extension (ex. .svg/.html), servi ensuite tel quel par
// express.static("uploads") avec le Content-Type déduit de l'extension :
// XSS stockée sur l'origine de l'API (audit sécurité).
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${req.user.sub}-${Date.now()}${ext || ".png"}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_EXT.has(ext)) return cb(null, true);
    cb(new Error(`Type de fichier non autorisé. Acceptés : ${[...ALLOWED_EXT].join(", ")}`));
  },
});

// Sans ce handler, un rejet (type de fichier ou taille) tombe sur le
// gestionnaire d'erreurs par défaut d'Express (page HTML générique, pas la
// réponse JSON attendue par le client) — même pattern que
// projectAction.validation.js::handleUploadError.
function handleUploadError(err, _req, res, next) {
  if (!err) return next();
  return res.status(400).json({ message: err.message || "Échec de l'upload" });
}

module.exports = { upload, handleUploadError };
