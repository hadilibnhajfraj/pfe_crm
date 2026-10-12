"use strict";

const path = require("path");

/**
 * # Validation d'un document téléversé dans le Copilot (Phase 2)
 *
 * Trois contrôles indépendants, TOUS requis :
 * 1. extension autorisée (liste blanche) ;
 * 2. type MIME déclaré compatible (le navigateur peut envoyer
 *    `application/octet-stream`, accepté puisque le contrôle 3 fait foi) ;
 * 3. SIGNATURE du contenu cohérente avec l'extension (un « .pdf » qui n'est pas
 *    un PDF, un exécutable renommé en « .txt »… sont refusés).
 *
 * Le nom de fichier n'est QU'UN LIBELLÉ : il n'est jamais utilisé comme chemin
 * (stockage en mémoire, aucun fichier écrit), et il est assaini (pas de
 * séparateur de chemin, pas de caractère de contrôle, longueur bornée).
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const OFFICE_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const ALLOWED_TYPES = {
  ".pdf": { kind: "pdf", mimes: ["application/pdf"] },
  ".docx": { kind: "docx", mimes: [OFFICE_MIME.docx] },
  ".xlsx": { kind: "xlsx", mimes: [OFFICE_MIME.xlsx] },
  ".csv": { kind: "csv", mimes: ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "text/comma-separated-values"] },
  ".txt": { kind: "txt", mimes: ["text/plain"] },
  // Images : leur texte est obtenu par OCR (voir ai/rag/ingestion/ocrService.js).
  ".png": { kind: "image", mimes: ["image/png"] },
  ".jpg": { kind: "image", mimes: ["image/jpeg", "image/jpg", "image/pjpeg"] },
  ".jpeg": { kind: "image", mimes: ["image/jpeg", "image/jpg", "image/pjpeg"] },
};
const GENERIC_MIMES = new Set(["application/octet-stream", ""]);

class DocumentValidationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function sanitizeFilename(originalName) {
  const base = path.basename(String(originalName || "").replace(/\\/g, "/"));
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  const safe = cleaned || "document";
  if (safe.length <= 120) return safe;
  const ext = path.extname(safe);
  return safe.slice(0, 120 - ext.length) + ext;
}

function signatureMatches(kind, buffer) {
  const head = buffer.subarray(0, 1024);
  const isZip = head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  const isPdf = head.includes(Buffer.from("%PDF-"));
  const isPng = head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpeg = head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  switch (kind) {
    case "image":
      return isPng || isJpeg;
    case "pdf":
      return isPdf;
    case "docx":
    case "xlsx":
      return isZip;
    case "csv":
    case "txt":
      // Texte : ni archive ni PDF (le décodage UTF-8 strict est vérifié à l'extraction).
      return !isZip && !isPdf && !isPng && !isJpeg;
    default:
      return false;
  }
}

/**
 * @param {{ originalname: string, mimetype: string, buffer: Buffer, size: number }} file
 * @returns {{ kind: string, filename: string }}
 */
function validateCopilotDocument(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new DocumentValidationError("DOCUMENT_MISSING", "Aucun fichier reçu (champ « file »).");
  }
  if (file.buffer.length === 0) {
    throw new DocumentValidationError("DOCUMENT_EMPTY", "Le fichier est vide.");
  }
  if (file.buffer.length > MAX_FILE_BYTES) {
    throw new DocumentValidationError("DOCUMENT_TOO_LARGE", `Le fichier dépasse la taille maximale (${MAX_FILE_BYTES / 1024 / 1024} Mo).`, 413);
  }
  const filename = sanitizeFilename(file.originalname);
  const ext = path.extname(filename).toLowerCase();
  const type = ALLOWED_TYPES[ext];
  if (!type) {
    throw new DocumentValidationError("DOCUMENT_TYPE_NOT_ALLOWED", "Type de fichier non autorisé. Formats acceptés : PDF, DOCX, XLSX, CSV, TXT, PNG, JPG.");
  }
  const mime = String(file.mimetype || "").toLowerCase();
  if (!GENERIC_MIMES.has(mime) && !type.mimes.includes(mime)) {
    throw new DocumentValidationError("DOCUMENT_TYPE_MISMATCH", "Le type du fichier ne correspond pas à son extension.");
  }
  if (!signatureMatches(type.kind, file.buffer)) {
    throw new DocumentValidationError("DOCUMENT_TYPE_MISMATCH", "Le contenu du fichier ne correspond pas à son extension.");
  }
  return { kind: type.kind, filename };
}

module.exports = { validateCopilotDocument, sanitizeFilename, DocumentValidationError, MAX_FILE_BYTES, ALLOWED_EXTENSIONS: Object.keys(ALLOWED_TYPES) };
