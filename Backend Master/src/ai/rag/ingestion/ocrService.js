"use strict";

/**
 * # ocrService — reconnaissance de texte (OCR) pour les documents du Copilot
 *
 * Moteur : `tesseract.js` (Tesseract compilé en WebAssembly) — aucun logiciel
 * à installer sur le serveur, aucun exécutable lancé, aucun fichier joint
 * écrit sur disque (l'image est passée en mémoire).
 *
 * ## Configuration (.env)
 *   COPILOT_OCR_ENABLED     = true | false   (défaut : true si tesseract.js est installé)
 *   COPILOT_OCR_LANGS       = fra+eng        (langues, séparées par « + »)
 *   COPILOT_OCR_LANG_PATH   = dossier ou URL des fichiers *.traineddata
 *                             (défaut : téléchargés une fois depuis le dépôt
 *                             public de tesseract.js, puis mis en cache)
 *   COPILOT_OCR_CACHE_DIR   = dossier de cache des données de langue
 *                             (défaut : <tmp>/copilot_ocr_cache)
 *   COPILOT_OCR_TIMEOUT_MS  = durée maximale pour un document (défaut 180000)
 *   COPILOT_OCR_MAX_IMAGES  = nombre maximal d'images lues par document (défaut 20)
 *
 * Serveur SANS accès Internet : déposer `fra.traineddata` et `eng.traineddata`
 * dans un dossier et le désigner par COPILOT_OCR_LANG_PATH.
 *
 * ## PDF scannés
 * Un PDF scanné contient une image par page. Les images JPEG (filtre
 * `DCTDecode`, le cas des scanners et des applications de numérisation) sont
 * extraites telles quelles du fichier puis reconnues. Les autres encodages
 * d'image (JBIG2, CCITT, JPEG 2000, pixels compressés Flate) ne sont PAS pris
 * en charge : le document est alors refusé avec un code explicite.
 */

const os = require("os");
const path = require("path");
const fs = require("fs");

const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_MAX_IMAGES = 20;
const MIN_IMAGE_BYTES = 4096; // en dessous : logo, pictogramme, filet — pas une page
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

class OcrUnavailableError extends Error {
  constructor(message = "OCR indisponible") {
    super(message);
    this.code = "OCR_UNAVAILABLE";
  }
}
class OcrFailedError extends Error {
  constructor(message = "OCR en échec") {
    super(message);
    this.code = "OCR_FAILED";
  }
}

function loadEngine() {
  try {
    // eslint-disable-next-line global-require
    return require("tesseract.js");
  } catch (_err) {
    return null;
  }
}

function isOcrAvailable(env = process.env) {
  if (String(env.COPILOT_OCR_ENABLED || "").trim().toLowerCase() === "false") return false;
  return Boolean(loadEngine());
}

function settings(env = process.env) {
  const number = (value, fallback, min, max) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    langs: String(env.COPILOT_OCR_LANGS || "fra+eng").split("+").map((l) => l.trim()).filter((l) => /^[a-z_]{3,10}$/i.test(l)).slice(0, 4),
    langPath: String(env.COPILOT_OCR_LANG_PATH || "").trim() || null,
    cacheDir: String(env.COPILOT_OCR_CACHE_DIR || "").trim() || path.join(os.tmpdir(), "copilot_ocr_cache"),
    timeoutMs: number(env.COPILOT_OCR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 5000, 600000),
    maxImages: number(env.COPILOT_OCR_MAX_IMAGES, DEFAULT_MAX_IMAGES, 1, 50),
  };
}

/**
 * Images JPEG incorporées dans un PDF (flux `DCTDecode`), dans l'ordre du fichier.
 * Lecture d'octets uniquement : rien n'est interprété ni exécuté.
 * @returns {{ images: Buffer[], imageObjects: number, unsupported: number }}
 */
function extractPdfImages(buffer, { maxImages = DEFAULT_MAX_IMAGES } = {}) {
  const text = buffer.toString("latin1");
  const imageObjects = (text.match(/\/Subtype\s*\/Image\b/g) || []).length;
  const images = [];
  let unsupported = 0;
  const streamRe = /stream\r?\n/g;
  let m;
  while ((m = streamRe.exec(text)) !== null) {
    const dict = text.slice(Math.max(0, m.index - 700), m.index);
    const lastDict = dict.slice(dict.lastIndexOf("<<"));
    if (!/\/Subtype\s*\/Image\b/.test(lastDict)) continue;
    const start = m.index + m[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    if (!/\/DCTDecode\b/.test(lastDict)) {
      unsupported += 1;
      continue;
    }
    let data = buffer.subarray(start, end);
    // Fin de flux : le saut de ligne qui précède « endstream » n'appartient pas à l'image.
    while (data.length && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) data = data.subarray(0, data.length - 1);
    const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    if (!isJpeg || data.length < MIN_IMAGE_BYTES || data.length > MAX_IMAGE_BYTES) continue;
    images.push(Buffer.from(data));
    if (images.length >= maxImages) break;
    streamRe.lastIndex = end;
  }
  return { images, imageObjects, unsupported };
}

/**
 * Reconnaît le texte de chaque image. Le moteur est toujours arrêté à la fin.
 * @param {Buffer[]} images
 * @returns {Promise<{ texts: string[], confidence: number|null }>}
 * @throws {OcrUnavailableError|OcrFailedError}
 */
async function recognizeImages(images, { env = process.env, engine = null } = {}) {
  const tesseract = engine || loadEngine();
  if (!tesseract || String(env.COPILOT_OCR_ENABLED || "").trim().toLowerCase() === "false") throw new OcrUnavailableError();
  const cfg = settings(env);
  if (!cfg.langs.length) throw new OcrUnavailableError("aucune langue OCR valide");
  let worker = null;
  let timer = null;
  const work = (async () => {
    try {
      fs.mkdirSync(cfg.cacheDir, { recursive: true });
    } catch (_err) {
      /* cache indisponible : le moteur s'en passe */
    }
    worker = await tesseract.createWorker(cfg.langs, 1, { cachePath: cfg.cacheDir, ...(cfg.langPath ? { langPath: cfg.langPath } : {}), logger: () => {}, errorHandler: () => {} });
    const texts = [];
    const confidences = [];
    for (const image of images.slice(0, cfg.maxImages)) {
      const { data } = await worker.recognize(image);
      texts.push(String((data && data.text) || "").trim());
      if (data && typeof data.confidence === "number") confidences.push(data.confidence);
    }
    return { texts, confidence: confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null };
  })();
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new OcrFailedError("délai OCR dépassé")), cfg.timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch (err) {
    if (err instanceof OcrFailedError || err instanceof OcrUnavailableError) throw err;
    throw new OcrFailedError(String((err && err.message) || err).slice(0, 200));
  } finally {
    clearTimeout(timer);
    work.catch(() => {});
    if (worker) await worker.terminate().catch(() => {});
  }
}

module.exports = { isOcrAvailable, extractPdfImages, recognizeImages, OcrUnavailableError, OcrFailedError, settings };
