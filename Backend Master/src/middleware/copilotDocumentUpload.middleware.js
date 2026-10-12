"use strict";

const multer = require("multer");
const path = require("path");
const { MAX_FILE_BYTES, ALLOWED_EXTENSIONS } = require("../modules/ai-copilot/services/copilotDocumentValidation");

// Documents du Copilot IA (Phase 2) — stockage EN MÉMOIRE uniquement
// (memoryStorage) : aucun fichier temporaire n'est écrit sur disque, donc rien
// à nettoyer et aucun chemin contrôlable par l'utilisateur. Le fichier n'est
// conservé que le temps de l'extraction de texte (voir UserDocumentService).
// Contrôle complet (MIME + signature) dans copilotDocumentValidation.js ; ce
// filtre n'est qu'un rejet précoce par extension, avant lecture du flux.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5, parts: 7, fieldNameSize: 50, headerPairs: 50 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || "")).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) return cb(null, true);
    const err = new Error("Type de fichier non autorisé. Formats acceptés : PDF, DOCX, XLSX, CSV, TXT, PNG, JPG.");
    err.code = "DOCUMENT_TYPE_NOT_ALLOWED";
    return cb(err);
  },
});

// Traduit les erreurs multer en réponse JSON stable (jamais une pile d'erreur).
function isIncompleteUpload(err) {
  const message = String((err && err.message) || "");
  return (err && (err.code === "ECONNRESET" || err.code === "ECONNABORTED")) || message.includes("Unexpected end of form") || message.includes("Unexpected end of multipart") || message.includes("request aborted") || message.includes("Request aborted");
}

function copilotDocumentUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === "LIMIT_FILE_SIZE";
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        reason: tooLarge ? "DOCUMENT_TOO_LARGE" : "DOCUMENT_UPLOAD_INVALID",
        message: tooLarge ? `Le fichier dépasse la taille maximale (${MAX_FILE_BYTES / 1024 / 1024} Mo).` : "Envoi de fichier invalide (un seul fichier, champ « file »).",
      });
    }
    // Envoi interrompu (connexion coupée, corps multipart tronqué) : le
    // fichier n'est pas arrivé en entier — jamais traité comme un document vide.
    if (isIncompleteUpload(err)) {
      return res.status(400).json({ success: false, reason: "DOCUMENT_UPLOAD_INCOMPLETE", message: "L'envoi du fichier a été interrompu : il n'est pas arrivé en entier. Vérifiez votre connexion et renvoyez-le." });
    }
    if (err.code === "DOCUMENT_TYPE_NOT_ALLOWED") {
      return res.status(400).json({ success: false, reason: err.code, message: err.message });
    }
    // Toute autre erreur de réception : message fixe, jamais le détail interne.
    return res.status(400).json({ success: false, reason: "DOCUMENT_UPLOAD_INVALID", message: "Envoi de fichier invalide (un seul fichier, champ « file »)." });
  });
}

module.exports = { copilotDocumentUpload };
