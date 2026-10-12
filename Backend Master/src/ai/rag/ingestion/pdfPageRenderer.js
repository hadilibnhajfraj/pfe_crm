"use strict";

/**
 * # pdfPageRenderer — pages d'un PDF converties en images (pour l'OCR)
 *
 * `pdfjs-dist` (moteur PDF de Mozilla, version 3 : module CommonJS) dessine
 * chaque page sur un canevas `@napi-rs/canvas` (binaire précompilé fourni par
 * npm pour Windows, Linux et macOS — aucun logiciel système à installer, pas
 * de Ghostscript ni de Poppler). Tout se fait en mémoire : aucun fichier
 * temporaire n'est écrit, il n'y a donc rien à nettoyer.
 *
 * Sécurité : le PDF est une donnée non fiable — aucun script du document n'est
 * exécuté (`isEvalSupported: false`, pas de JavaScript PDF), aucune ressource
 * externe n'est chargée, et le nombre de pages comme la taille des images sont
 * bornés.
 */

const DEFAULT_SCALE = 2; // ≈ 144 dpi : lisible par l'OCR sans images énormes
const MAX_PIXELS = 12_000_000; // par page

let cached = null;
function loadEngine() {
  if (cached !== null) return cached || null;
  try {
    // eslint-disable-next-line global-require
    const canvas = require("@napi-rs/canvas");
    // pdfjs attend ces classes dans l'environnement (fournies par le canevas).
    for (const name of ["DOMMatrix", "Path2D", "ImageData"]) {
      if (typeof globalThis[name] === "undefined" && canvas[name]) globalThis[name] = canvas[name];
    }
    // eslint-disable-next-line global-require
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    cached = { canvas, pdfjs };
  } catch (_err) {
    cached = false;
  }
  return cached || null;
}

function isRendererAvailable() {
  return Boolean(loadEngine());
}

function canvasFactoryFor(canvas) {
  return {
    create(width, height) {
      const c = canvas.createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
      return { canvas: c, context: c.getContext("2d") };
    },
    reset(target, width, height) {
      target.canvas.width = Math.max(1, Math.ceil(width));
      target.canvas.height = Math.max(1, Math.ceil(height));
    },
    destroy(target) {
      target.canvas.width = 0;
      target.canvas.height = 0;
      target.canvas = null;
      target.context = null;
    },
  };
}

/**
 * Ouvre le PDF et renvoie de quoi rendre ses pages UNE PAR UNE (la mémoire
 * d'une page est libérée avant la suivante).
 * @returns {Promise<{ pageCount: number, renderPage: (n: number) => Promise<Buffer>, close: () => Promise<void> }>}
 */
async function openPdfForRendering(buffer, { scale = DEFAULT_SCALE } = {}) {
  const engine = loadEngine();
  if (!engine) throw Object.assign(new Error("rendu PDF indisponible"), { code: "RENDERER_UNAVAILABLE" });
  const { pdfjs, canvas } = engine;
  const canvasFactory = canvasFactoryFor(canvas);
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length)),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    stopAtErrors: false,
    verbosity: 0,
    canvasFactory,
  });
  const document = await task.promise;
  return {
    pageCount: document.numPages,
    async renderPage(pageNumber) {
      const page = await document.getPage(pageNumber);
      try {
        let viewport = page.getViewport({ scale });
        const pixels = viewport.width * viewport.height;
        if (pixels > MAX_PIXELS) viewport = page.getViewport({ scale: scale * Math.sqrt(MAX_PIXELS / pixels) });
        const target = canvasFactory.create(viewport.width, viewport.height);
        // Fond blanc : une page scannée transparente serait noire pour l'OCR.
        target.context.fillStyle = "#ffffff";
        target.context.fillRect(0, 0, target.canvas.width, target.canvas.height);
        await page.render({ canvasContext: target.context, viewport, canvasFactory, intent: "print" }).promise;
        const png = target.canvas.toBuffer("image/png");
        canvasFactory.destroy(target);
        return png;
      } finally {
        page.cleanup();
      }
    },
    async close() {
      await document.cleanup().catch(() => {});
      await task.destroy().catch(() => {});
    },
  };
}

module.exports = { isRendererAvailable, openPdfForRendering, DEFAULT_SCALE };
