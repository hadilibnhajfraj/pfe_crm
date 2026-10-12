"use strict";

const JSZip = require("jszip");
const ExcelJS = require("exceljs");
const { PdfLoader } = require("./pdfLoader");
const { DocumentError } = require("../errors");
const ocr = require("./ocrService");
const renderer = require("./pdfPageRenderer");
const { withNamespace } = require("../../utils/logger");

const logger = withNamespace("rag:documents");

/**
 * # bufferLoaders — extraction de texte d'un document téléversé (Phase 2)
 *
 * Complète les loaders EXISTANTS (chemin disque, corpus de documentation) par
 * une extraction depuis un Buffer EN MÉMOIRE : aucun fichier temporaire, donc
 * rien à nettoyer et aucun chemin contrôlé par l'utilisateur.
 *
 * Sortie : `{ text, pages: string[] | null, pageLabels: string[] | null, sourceType }`
 * — `pages` (PDF : pages ; XLSX : feuilles) permet de conserver la page/feuille
 * d'origine de chaque chunk dans ses métadonnées (citations).
 *
 * ## Protections
 * - DOCX/XLSX sont des archives ZIP : taille décompressée totale et nombre
 *   d'entrées bornés AVANT toute lecture (anti « zip bomb »).
 * - XLSX lu avec `exceljs` (déjà dépendance du projet), jamais `xlsx`
 *   (SheetJS 0.18.x : CVE-2023-30533 / ReDoS à la LECTURE de fichiers forgés).
 * - Nombre de lignes XLSX/CSV et taille de texte extraite bornés.
 */

const LIMITS = Object.freeze({
  maxUncompressedBytes: 40 * 1024 * 1024,
  maxZipEntries: 3000,
  maxSheetRows: 5000,
  maxSheets: 20,
  maxTextChars: 2_000_000,
});

const pdfLoader = new PdfLoader();

function truncateText(text) {
  return text.length > LIMITS.maxTextChars ? text.slice(0, LIMITS.maxTextChars) : text;
}

async function openZipSafely(buffer, requiredEntry) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: false });
  } catch (_err) {
    throw new DocumentError("DOCUMENT_UNREADABLE", "Le fichier est corrompu ou n'est pas une archive Office valide.", 422);
  }
  const entries = Object.values(zip.files);
  if (entries.length > LIMITS.maxZipEntries) {
    throw new DocumentError("DOCUMENT_TOO_COMPLEX", "Le document contient trop d'éléments internes.", 422);
  }
  // `_data.uncompressedSize` : taille DÉCLARÉE dans l'en-tête ZIP, lue sans
  // rien décompresser — suffisant pour refuser une archive disproportionnée.
  const total = entries.reduce((sum, e) => sum + ((e._data && e._data.uncompressedSize) || 0), 0);
  if (total > LIMITS.maxUncompressedBytes) {
    throw new DocumentError("DOCUMENT_TOO_LARGE", "Le contenu décompressé du document dépasse la taille autorisée.", 413);
  }
  if (requiredEntry && !zip.file(requiredEntry)) {
    throw new DocumentError("DOCUMENT_TYPE_MISMATCH", "Le contenu du fichier ne correspond pas à son extension.", 400);
  }
  return zip;
}

const XML_ENTITIES = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'" };
function decodeXml(text) {
  return text
    .replace(/&(lt|gt|amp|quot|apos);/g, (m) => XML_ENTITIES[m])
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}

async function extractDocx(buffer) {
  const zip = await openZipSafely(buffer, "word/document.xml");
  const xml = await zip.file("word/document.xml").async("string");
  // Un paragraphe <w:p> = une ligne ; texte des runs <w:t>, tabulations et sauts conservés.
  const paragraphs = xml.split(/<\/w:p>/).map((p) =>
    decodeXml(
      p
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br\/>/g, "\n")
        .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, "\u0000$1\u0000")
        .split("\u0000")
        .filter((_part, i) => i % 2 === 1)
        .join("")
    ).trim()
  );
  return { text: truncateText(paragraphs.filter(Boolean).join("\n")), pages: null, pageLabels: null, sourceType: "docx" };
}

function cellToText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.richText) return value.richText.map((r) => r.text).join("");
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return cellToText(value.result);
    if (value.error) return "";
    return "";
  }
  return String(value);
}

async function extractXlsx(buffer) {
  await openZipSafely(buffer, "xl/workbook.xml");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (_err) {
    throw new DocumentError("DOCUMENT_UNREADABLE", "Le classeur Excel est illisible ou corrompu.", 422);
  }
  const pages = [];
  const pageLabels = [];
  workbook.worksheets.slice(0, LIMITS.maxSheets).forEach((sheet) => {
    const rows = [];
    let header = null;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rows.length >= LIMITS.maxSheetRows) return;
      const values = (row.values || []).slice(1).map(cellToText);
      if (!header) {
        header = values;
        rows.push(values.join(" | "));
        return;
      }
      // « En-tête : valeur » : chaque ligne reste compréhensible seule dans un chunk.
      rows.push(values.map((v, i) => (header[i] ? `${header[i]} : ${v}` : v)).filter((v) => String(v).trim()).join(" | ") || `ligne ${rowNumber}`);
    });
    pages.push(rows.join("\n"));
    pageLabels.push(sheet.name);
  });
  return { text: truncateText(pages.join("\n\n")), pages, pageLabels, sourceType: "xlsx" };
}

function decodeUtf8Text(buffer) {
  if (buffer.includes(0)) {
    throw new DocumentError("DOCUMENT_TYPE_MISMATCH", "Le fichier n'est pas un fichier texte valide.", 400);
  }
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const replacements = (text.match(/�/g) || []).length;
  if (replacements > Math.max(5, text.length * 0.01)) {
    throw new DocumentError("DOCUMENT_ENCODING", "Le fichier texte doit être encodé en UTF-8.", 400);
  }
  return text;
}

function extractCsv(buffer) {
  const lines = decodeUtf8Text(buffer).split(/\r?\n/).slice(0, LIMITS.maxSheetRows + 1);
  const separator = (lines[0] || "").split(";").length > (lines[0] || "").split(",").length ? ";" : ",";
  const header = (lines[0] || "").split(separator).map((h) => h.trim());
  const rows = [header.join(" | ")];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const values = line.split(separator);
    rows.push(values.map((v, i) => (header[i] ? `${header[i]} : ${v.trim()}` : v.trim())).join(" | "));
  }
  return { text: truncateText(rows.join("\n")), pages: null, pageLabels: null, sourceType: "csv" };
}

function extractTxt(buffer) {
  return { text: truncateText(decodeUtf8Text(buffer)), pages: null, pageLabels: null, sourceType: "text" };
}

// Reconnaissance de texte sur des images (PDF scanné, photo, capture).
// Chaque issue a son code : moteur absent, échec du moteur, rien de reconnu.
async function recognize(images, { what }) {
  if (!ocr.isOcrAvailable()) {
    throw new DocumentError("DOCUMENT_OCR_UNAVAILABLE", `${what} ne contient pas de texte sélectionnable et la reconnaissance de texte (OCR) n'est pas activée sur ce serveur. Envoyez une version contenant du texte (PDF exporté depuis Word, DOCX, TXT).`, 422);
  }
  let result;
  try {
    result = await ocr.recognizeImages(images);
  } catch (err) {
    if (err && err.code === "OCR_UNAVAILABLE") {
      throw new DocumentError("DOCUMENT_OCR_UNAVAILABLE", `${what} ne contient pas de texte sélectionnable et la reconnaissance de texte (OCR) n'est pas disponible sur ce serveur.`, 422);
    }
    logger.error(`[DOCUMENT_OCR_FAILED] ${(err && err.message) || err}`);
    throw new DocumentError("DOCUMENT_OCR_FAILED", "La reconnaissance de texte (OCR) a échoué ou a pris trop de temps. Réessayez avec un document plus court ou plus net.", 503);
  }
  const pages = result.texts.map((t) => t.slice(0, LIMITS.maxTextChars));
  if (!pages.join("").replace(/\s+/g, "")) {
    throw new DocumentError("DOCUMENT_OCR_NO_TEXT", `La reconnaissance de texte (OCR) n'a trouvé aucun texte lisible dans ${what.toLowerCase()} (image trop floue, manuscrite ou sans texte).`, 422);
  }
  return { pages, confidence: result.confidence };
}

// Pages (numérotées à partir de 1) converties en images PNG, dans l'ordre.
// 1. rendu réel de la page (pdfjs + canvas) — tout encodage d'image ;
// 2. à défaut de moteur de rendu : images JPEG incorporées, telles quelles.
async function pageImages(buffer, pageNumbers) {
  if (renderer.isRendererAvailable()) {
    let opened = null;
    try {
      opened = await renderer.openPdfForRendering(buffer);
      const images = [];
      for (const n of pageNumbers) {
        if (n > opened.pageCount) break;
        images.push(await opened.renderPage(n));
      }
      return { images, method: "render" };
    } catch (err) {
      logger.error("[DOCUMENT_RENDER_FAILED] " + ((err && err.message) || err));
      throw new DocumentError("DOCUMENT_RENDER_FAILED", "Les pages de ce PDF scanné n'ont pas pu être converties en images pour la reconnaissance de texte (fichier endommagé ou protégé).", 422);
    } finally {
      if (opened) await opened.close();
    }
  }
  const embedded = ocr.extractPdfImages(buffer, { maxImages: pageNumbers.length });
  if (!embedded.images.length) {
    throw new DocumentError(
      "DOCUMENT_SCANNED_UNSUPPORTED",
      "Ce PDF est un document scanné, mais la conversion de ses pages en images n'est pas disponible sur ce serveur. Envoyez les pages en images JPEG ou PNG, ou un PDF contenant du texte.",
      422
    );
  }
  return { images: embedded.images, method: "embedded" };
}

async function extractPdf(buffer) {
  let loaded;
  try {
    loaded = await pdfLoader.loadBuffer(buffer);
  } catch (_err) {
    throw new DocumentError("DOCUMENT_UNREADABLE", "Le PDF est illisible, corrompu ou protégé.", 422);
  }
  const pages = loaded.pages.map((p) => p.slice(0, LIMITS.maxTextChars));
  const hasText = (p) => Boolean(p && p.replace(/\s+/g, ""));
  const emptyPages = pages.map((p, i) => (hasText(p) ? null : i + 1)).filter(Boolean);
  const labels = pages.map((_p, i) => `page ${i + 1}`);
  // PDF avec texte sur toutes ses pages : l'OCR n'est jamais sollicité.
  if (!emptyPages.length && pages.length) {
    return { text: truncateText(loaded.text), pages, pageLabels: labels, sourceType: "pdf" };
  }
  const allEmpty = emptyPages.length === pages.length;
  const { imageObjects } = ocr.extractPdfImages(buffer, { maxImages: 1 });
  if (!imageObjects) {
    // Aucune image : rien à reconnaître. Document vide, ou pages blanches parmi d'autres.
    if (allEmpty) throw new DocumentError("DOCUMENT_NO_TEXT", "Ce PDF ne contient ni texte ni image : il n'y a rien à analyser.", 422);
    return { text: truncateText(loaded.text), pages, pageLabels: labels, sourceType: "pdf" };
  }

  // Pages scannées : lues par OCR, dans l'ordre, dans la limite configurée.
  const maxPages = ocr.settings().maxImages;
  const wanted = emptyPages.slice(0, maxPages);
  const skipped = emptyPages.length - wanted.length;
  try {
    if (!ocr.isOcrAvailable()) {
      throw new DocumentError("DOCUMENT_OCR_UNAVAILABLE", "Ce PDF scanné ne contient pas de texte sélectionnable et la reconnaissance de texte (OCR) n'est pas activée sur ce serveur. Envoyez une version contenant du texte (PDF exporté depuis Word, DOCX, TXT).", 422);
    }
    const { images, method } = await pageImages(buffer, wanted);
    const recognized = await recognize(images, { what: "Ce PDF scanné" });
    // Rendu page par page : chaque texte reconnu retrouve SA page. Images
    // incorporées (repli) : l'ordre du fichier, sans correspondance garantie.
    const merged = pages.slice();
    const mergedLabels = labels.slice();
    if (method === "render") {
      wanted.forEach((n, i) => {
        if (recognized.pages[i] !== undefined) {
          merged[n - 1] = recognized.pages[i];
          mergedLabels[n - 1] = `page ${n} (OCR)`;
        }
      });
    } else {
      recognized.pages.forEach((t, i) => {
        merged.push(t);
        mergedLabels.push(`image ${i + 1} (OCR)`);
      });
    }
    const kept = merged.map((p, i) => ({ p, label: mergedLabels[i] })).filter((x) => hasText(x.p));
    if (skipped > 0) logger.warn("[DOCUMENT_OCR] " + skipped + " page(s) scannée(s) non lue(s) : limite de " + maxPages + " pages par document");
    return {
      text: truncateText(kept.map((x) => x.p).join("\n\n")),
      pages: kept.map((x) => x.p),
      pageLabels: kept.map((x) => x.label),
      sourceType: "pdf",
      ocr: true,
      ocrConfidence: recognized.confidence,
      ocrPages: wanted.length,
      ocrSkippedPages: skipped,
    };
  } catch (err) {
    // PDF mixte : le texte déjà extrait reste utilisable même si l'OCR des
    // pages scannées échoue — on ne perd pas le document pour autant.
    if (!allEmpty && err instanceof DocumentError) {
      logger.warn("[DOCUMENT_OCR] pages scannées ignorées (" + err.code + ") : le texte des autres pages est conservé");
      const kept = pages.map((p, i) => ({ p, label: labels[i] })).filter((x) => hasText(x.p));
      return { text: truncateText(kept.map((x) => x.p).join("\n\n")), pages: kept.map((x) => x.p), pageLabels: kept.map((x) => x.label), sourceType: "pdf", ocrSkippedPages: emptyPages.length };
    }
    throw err;
  }
}

// Image (photo, capture, page scannée) : texte obtenu par OCR uniquement.
async function extractImage(buffer) {
  const recognized = await recognize([buffer], { what: "Cette image" });
  return { text: truncateText(recognized.pages.join("\n\n")), pages: null, pageLabels: null, sourceType: "image", ocr: true, ocrConfidence: recognized.confidence };
}

const EXTRACTORS = { pdf: extractPdf, docx: extractDocx, xlsx: extractXlsx, csv: extractCsv, txt: extractTxt, image: extractImage };

/**
 * @param {Buffer} buffer
 * @param {"pdf"|"docx"|"xlsx"|"csv"|"txt"|"image"} kind — type VALIDÉ en amont (extension + signature).
 */
async function extractDocumentText(buffer, kind) {
  const extractor = EXTRACTORS[kind];
  if (!extractor) {
    throw new DocumentError("DOCUMENT_TYPE_NOT_ALLOWED", "Type de fichier non pris en charge.", 400);
  }
  let extracted;
  try {
    extracted = await extractor(buffer);
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    // Erreur imprévue de l'extracteur : jamais présentée comme « document vide ».
    logger.error(`[DOCUMENT_EXTRACTION_FAILED] type=${kind} : ${(err && err.message) || err}`);
    throw new DocumentError("DOCUMENT_EXTRACTION_FAILED", "L'extraction du texte de ce document a échoué côté serveur. Réessayez ; si le problème persiste, prévenez l'administrateur.", 500);
  }
  if (!extracted.text || !extracted.text.replace(/\s+/g, "")) {
    // L'extraction a RÉUSSI et le document ne contient réellement aucun texte.
    throw new DocumentError("DOCUMENT_NO_TEXT", "Le document a été lu correctement mais ne contient aucun texte à analyser.", 422);
  }
  return extracted;
}

module.exports = { extractDocumentText, LIMITS };
