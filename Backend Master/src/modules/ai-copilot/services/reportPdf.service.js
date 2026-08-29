"use strict";

const PDFDocument = require("pdfkit");

/**
 * # reportPdf.service — transforme un rapport texte du Copilot en PDF réel
 *
 * ## Pourquoi ce fichier existe
 * `ReportingAgent` (`src/ai/agents/reportingAgent.js`) produit un rapport
 * sous forme de TEXTE (une synthèse LangChain, `state.result.summary`) —
 * jamais un fichier. C'était honnêtement documenté comme une limite (voir
 * `AI_COPILOT_HTTP.md`) : "générer un rapport" se limitait à une réponse de
 * chat plus longue. Ce fichier ferme cet écart en réutilisant `pdfkit`
 * (déjà une dépendance réelle du projet, déjà utilisée pour les PDF RH —
 * voir `modules/hr-requests/services/hrRequest.service.js` — jamais un
 * nouveau moteur de rendu ajouté) pour transformer CE texte, déjà généré et
 * déjà montré à l'utilisateur dans le chat, en un vrai document
 * téléchargeable/imprimable.
 *
 * ## Volontairement SANS ÉTAT — jamais un fichier stocké côté serveur
 * `buildReportPdf({title, content})` prend le texte du rapport TEL QUE
 * fourni par l'appelant (le client Flutter renvoie exactement le texte
 * qu'il a déjà reçu et affiché — voir `POST /ai-copilot/reports/pdf`) et
 * génère le PDF à la volée, jamais écrit sur disque, jamais associé à un
 * id/une durée de vie à gérer — le même choix "aucune persistance
 * superflue" déjà fait pour `ConversationIndexService`/`ProactiveActionStore`.
 * Chaque appel est indépendant : régénérer deux fois le même rapport
 * produit deux PDF identiques, jamais une re-consultation d'un état
 * antérieur qui pourrait diverger du texte affiché.
 */
function buildReportPdf({ title, content, generatedAt = new Date() }) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  doc.fontSize(18).font("Helvetica-Bold").fillColor("#111827").text(title && title.trim() ? title.trim() : "Rapport Copilot IA", { align: "center" });
  doc.moveDown(0.3);
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#6b7280")
    .text(`Généré le ${new Date(generatedAt).toLocaleString("fr-FR")} par le Copilot IA — CBI Tunisia`, { align: "center" });
  doc.moveDown(1);

  doc
    .strokeColor("#e5e7eb")
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(1);

  doc.fontSize(11).font("Helvetica").fillColor("#111827").text(content, { align: "left", lineGap: 4 });

  return doc;
}

module.exports = { buildReportPdf };
