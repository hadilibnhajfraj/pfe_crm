"use strict";
// Construit le rapport PDF final à partir du rapport Markdown généré depuis les preuves
// (nfr/generate-audit-report.js). Aucun test n'est exécuté.
//   node nfr/generate-audit-report.js && node nfr/build-pdf-report.js
// Sorties : reports/RAPPORT_AUDIT_TECHNIQUE_CRM_PROBAR.html puis .pdf (Chrome sans interface).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SRC = "reports/RAPPORT_AUDIT_TECHNIQUE_CRM_PROBAR.md";
const HTML = "reports/RAPPORT_AUDIT_TECHNIQUE_CRM_PROBAR.html";
const PDF = "reports/RAPPORT_AUDIT_TECHNIQUE_CRM_PROBAR.pdf";
const TITLE = "Rapport d'audit technique et validation des exigences non fonctionnelles – CRM PROBAR";

// ---------------------------------------------------------------- découpage du Markdown source
const md = fs.readFileSync(SRC, "utf8");
const parts = md.split(/\n(?=## )/);
const sections = {};
for (const p of parts.slice(1)) {
  const m = p.match(/^## (\d+)\. ([^\n]+)\n([\s\S]*)$/);
  if (m) sections[m[1]] = { title: m[2], body: m[3] };
  const a = p.match(/^## (Annexe [AB]) — ([^\n]+)\n([\s\S]*)$/);
  if (a) sections[a[1]] = { title: a[2], body: a[3] };
}
const vocab = (parts[0].match(/\*\*Vocabulaire[\s\S]*$/) || [""])[0];

// Ordre demandé pour le PDF : [nouveau numéro, ancien numéro, titre]
const ORDER = [
  [1, "2", "Périmètre de l'audit"], [2, "3", "Environnement de test"], [3, "4", "Méthodologie"], [4, "5", "Tests Jest"],
  [5, "6", "Authentification"], [6, "7", "RBAC"], [7, "8", "Newman / API"], [8, "9", "Rate limiting"],
  [9, "10", "Performance k6"], [10, "11", "Scalabilité"], [11, "12", "RTO"], [12, "15", "Prometheus / Grafana"],
  [13, "16", "Lighthouse"], [14, "17", "Copilot IA"], [15, "18", "RAG"], [16, "19", "Intégrité des données"],
  [17, "13", "Disponibilité"], [18, "14", "RPO"], [19, "22", "SonarQube"], [20, "23", "Les 14 anomalies"],
  [21, "24", "Recommandations"], [22, "25", "Limites de l'audit"], [23, "26", "Tableau de synthèse"], [24, "28", "Conclusion"],
];
const ANNEX = [["Annexe A", "Annexe A", "Détail des suites CRM, production, workflows et RBAC en écriture"], ["Annexe B", "Annexe B", "Index des preuves"], ["Annexe C", "20", "Maintenabilité"], ["Annexe D", "21", "Interopérabilité"]];
const map = {};
for (const [n, o] of ORDER) map[o] = String(n);
map["20"] = "Annexe C";
map["21"] = "Annexe D";
map["27"] = null; // « Questions du jury » : document de préparation, non repris dans le PDF

// Renumérote les renvois « § N », « § N.M », « § N et M », « § N.a à N.b »
const ref = (num) => {
  const [maj, min] = num.split(".");
  const t = map[maj];
  if (!t) return "§ " + num;
  return /^Annexe/.test(t) ? t : "§ " + t + (min ? "." + min : "");
};
// Une seule passe : un renvoi déjà renuméroté ne doit pas l'être une seconde fois.
const renumber = (body, oldN, newN) =>
  body
    .replace(/§ (\d+(?:\.\d+)?)(?:( et | à )(\d+(?:\.\d+)?))?/g, (_, x, sep, y) => ref(x) + (sep ? sep + ref(y).replace(/^§ /, "") : ""))
    .replace(new RegExp("^(#{3,4}) " + oldN + "\\.(\\d+)", "gm"), (_, h, k) => h + " " + newN + "." + k);

// ---------------------------------------------------------------- Markdown (sous-ensemble) → HTML
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(NON MESURÉE?S?)/g, '<span class="nm">$1</span>');
const badge = (cellHtml) => {
  const t = cellHtml.replace(/<[^>]+>/g, "").trim();
  if (/^RÉUSSI/.test(t) || t === "OK") return '<span class="ok">' + cellHtml + "</span>";
  if (/^ÉCHOUÉ/.test(t) || /^KO/.test(t)) return '<span class="ko">' + cellHtml + "</span>";
  if (/^PARTIEL/.test(t)) return '<span class="pa">' + cellHtml + "</span>";
  return cellHtml;
};
function toHtml(src) {
  const blocks = src.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push("</" + list + ">"); list = null; } };
  for (const b of blocks) {
    const ul = /^- /.test(b), ol = /^\d+\. /.test(b);
    if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (list !== tag) { close(); out.push("<" + tag + ">"); list = tag; }
      for (const l of b.split("\n")) out.push("<li>" + inline(l.replace(/^(- |\d+\. )/, "")) + "</li>");
      continue;
    }
    close();
    let m;
    if ((m = b.match(/^(#{3,4}) (.+)$/))) { out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); continue; }
    if (/^\|/.test(b)) {
      const rows = b.split("\n").map((r) => r.replace(/^\|\s?|\s?\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|")));
      const head = rows[0];
      const wide = head.length >= 7 ? " wide" : "";
      out.push('<table class="t' + wide + '"><thead><tr>' + head.map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>");
      for (const r of rows.slice(2)) out.push("<tr>" + r.map((c) => "<td>" + badge(inline(c)) + "</td>").join("") + "</tr>");
      out.push("</tbody></table>");
      continue;
    }
    out.push("<p>" + inline(b.replace(/\n/g, " ")) + "</p>");
  }
  close();
  return out.join("\n");
}

// ---------------------------------------------------------------- assemblage
const fig = (file, caption) => (fs.existsSync("reports/" + file) ? '<figure><img src="' + file + '" alt=""><figcaption>' + esc(caption) + "</figcaption></figure>" : "");
const body = [];
const toc = [];
for (const [n, o, title] of ORDER) {
  const s = sections[o];
  if (!s) throw new Error("section source absente : " + o);
  toc.push('<li><a href="#s' + n + '">' + n + ". " + esc(title) + "</a></li>");
  let html = toHtml(renumber(s.body, o, String(n)));
  if (n === 12) html += fig("grafana/dashboard-screenshot.png", "Figure — Tableau de bord Grafana « CRM PROBAR — Non-Functional Monitoring », capture du 5 octobre 2026 (reports/grafana/dashboard-screenshot.png).");
  if (n === 13) html += fig("lighthouse/login-desktop-final-screenshot.jpg", "Figure — Page mesurée par Lighthouse (reports/lighthouse/login-desktop-final-screenshot.jpg).");
  body.push('<section id="s' + n + '"><h2>' + n + ". " + esc(title) + "</h2>\n" + html + "</section>");
}
for (const [label, o, title] of ANNEX) {
  const s = sections[o];
  if (!s) continue;
  const id = label.replace(" ", "");
  toc.push('<li><a href="#' + id + '">' + label + " — " + esc(title) + "</a></li>");
  body.push('<section id="' + id + '"><h2>' + label + " — " + esc(title) + "</h2>\n" + toHtml(renumber(s.body, o, label.slice(-1))) + "</section>");
}

const css = `
@page { size: A4 landscape; margin: 14mm 12mm 15mm 12mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 9.6pt; line-height: 1.42; color: #1b2430; margin: 0; }
.cover { height: 175mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; border-left: 9px solid #1f3a5f; padding-left: 14mm; }
.cover h1 { font-size: 25pt; line-height: 1.2; color: #1f3a5f; margin: 0 0 8mm; max-width: 230mm; }
.cover p { font-size: 12pt; margin: 1.5mm 0; color: #374151; }
.cover .rule { margin-top: 10mm; font-size: 10.5pt; color: #1b2430; max-width: 220mm; }
.toc { page-break-after: always; }
.toc ol { columns: 2; list-style: none; padding: 0; margin: 0; }
.toc li { margin: 1.6mm 0; font-size: 10.5pt; }
.toc a { color: #1f3a5f; text-decoration: none; }
h2 { font-size: 15pt; color: #1f3a5f; border-bottom: 2px solid #1f3a5f; padding-bottom: 1.5mm; margin: 0 0 4mm; page-break-after: avoid; }
section { page-break-before: always; }
h3 { font-size: 11.6pt; color: #24517d; margin: 6mm 0 2.5mm; page-break-after: avoid; }
h4 { font-size: 10.4pt; color: #24517d; margin: 5mm 0 2mm; page-break-after: avoid; }
p { margin: 0 0 2.6mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.1mm; }
code { font-family: Consolas, "Courier New", monospace; font-size: 8.5pt; background: #eef2f7; padding: 0 2px; border-radius: 2px; word-break: break-word; }
table.t { border-collapse: collapse; width: 100%; margin: 1mm 0 4.5mm; font-size: 8.5pt; }
table.t.wide { font-size: 7.7pt; }
table.t th { background: #1f3a5f; color: #fff; text-align: left; padding: 1.6mm 1.8mm; border: 0.5pt solid #1f3a5f; font-weight: 600; }
table.t td { padding: 1.4mm 1.8mm; border: 0.5pt solid #c9d3df; vertical-align: top; }
table.t tbody tr:nth-child(even) td { background: #f5f8fb; }
table.t tr { page-break-inside: avoid; }
thead { display: table-header-group; }
.ok { color: #0b6b3a; font-weight: 600; }
.ko { color: #a11d1d; font-weight: 700; }
.pa { color: #8a5a00; font-weight: 600; }
.nm { color: #5b21b6; font-weight: 700; }
figure { margin: 4mm 0; text-align: center; page-break-inside: avoid; }
figure img { max-width: 100%; max-height: 150mm; border: 0.5pt solid #c9d3df; }
figcaption { font-size: 8.5pt; color: #4b5563; margin-top: 1.5mm; }
`;

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(TITLE)}</title><style>${css}</style></head><body>
<div class="cover">
  <h1>${esc(TITLE)}</h1>
  <p>Projet de fin d'études — CRM intelligent et décisionnel avec Dashboard BI et Copilot IA</p>
  <p>PROBAR / CBI Tunisia</p>
  <p>Mesures réalisées les 3 et 5 octobre 2026</p>
  <p class="rule"><strong>Règle du document.</strong> Une valeur n'est donnée comme résultat que si une preuve existe dans le dossier <code>reports/</code>. Les objectifs sont signalés comme tels, et ce qui n'a pas été mesuré est écrit <span class="nm">NON MESURÉ</span>. Aucun test en échec et aucune anomalie n'ont été retirés.</p>
</div>
<div class="toc"><h2>Sommaire</h2><ol>${toc.join("")}</ol>
<h3>Vocabulaire</h3>${toHtml(vocab.replace(/^\*\*Vocabulaire[^\n]*\n+/, ""))}</div>
${body.join("\n")}
</body></html>`;
fs.writeFileSync(HTML, html);

// ---------------------------------------------------------------- PDF
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const abs = (p) => path.resolve(p);
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--user-data-dir=" + path.join(require("os").tmpdir(), "claude-pdf-profile"), "--print-to-pdf=" + abs(PDF), "file:///" + abs(HTML).replace(/\\/g, "/")], { stdio: "ignore" });
console.log("PDF :", abs(PDF), "|", Math.round(fs.statSync(PDF).size / 1024), "Ko | sections :", ORDER.length, "+", ANNEX.length, "annexes");
