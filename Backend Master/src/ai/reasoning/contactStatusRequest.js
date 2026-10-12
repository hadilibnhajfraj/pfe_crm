"use strict";

// Demandes portant sur les contacts commerciaux D'UN STATUT (« contacts
// refusés », « combien d'injoignables », « projets dont le client est
// refusé ») — reconnaissance déterministe et mise en mots, sans modèle de
// langage.
//
// Statut : colonne `commercial_contacts.statut` (ENUM à 4 valeurs), la même
// que celle du tableau de bord « Commercial Contacts KPI ». Les mots de
// l'utilisateur sont ramenés à l'une de ces 4 valeurs — jamais à une autre.
//
// Contacts et projets : la base ne relie PAS un contact commercial à un
// projet (aucune clé, aucune colonne commune). Une question sur « les projets
// dont le client est refusé » reçoit donc les contacts refusés et cette
// précision — jamais une liste de projets déduite.

const { detectLanguage, foldLatin } = require("../language/languageDetector");

const STATUS_PATTERNS = [
  ["client_refuse", /\bclient_refuse\b|\brefus\w*\b|\brefused?\b|\breject\w*\b|\bdeclin\w*\b|отказ\S*|отклон\S*/],
  ["user_injoignable", /\buser_injoignable\b|\binjoignables?\b|\bunreachable\b|\bnot reachable\b|\bno answer\b|недоступ\S*|не отвеча\S*/],
  ["rappeler_plus_tard", /\brappeler_plus_tard\b|\brappeler plus tard\b|\bcall(?:ed)? back later\b|\bto call back\b|перезвонить позже/],
  ["ok", /\bstatut\s+(?:est\s+)?ok\b|\bstatus\s+(?:is\s+)?ok\b|\bcontacts?\s+ok\b|\bok\s+contacts?\b|\bcontacts? etablis?\b/],
];
const CONTACT_WORD = /\bcontacts?\b|\bclients?\b|\bprospects?\b|\bcustomers?\b|контакт\S*|клиент\S*/;
const PROJECT_WORD = /\bprojets?\b|\bprojects?\b|\bchantiers?\b|проект\S*/;
const PROJECTS_PLURAL = /\bprojets\b|\bprojects\b|\bchantiers\b|проекты|проектов/;
const COUNT_WORD =/\bcombien\b|\bnombre\b|\bhow many\b|\bnumber of\b|\bcount\b|сколько|количеств\S*/;
const ANALYSIS_WORD = /\banalyse[rsz]?\b|\banaly[sz]e\b|\banalysis\b|\bstatistiques?\b|\bstats?\b|\bsynthese\b|\bbilan\b|\bresume[rz]?\b|\bsummary\b|\boverview\b|\S*анализ\S*|статистик\S*/;
const DISTRIBUTION_WORD = /\brepartition\b|\bdistribution\b|\bventilation\b|\bbreakdown\b|\bpar statuts?\b|\bby status\b|\bper status\b|\bselon (?:le|leur) statut\b|по статус\S*/;
// Une demande d'ACTION (« relance les contacts refusés ») n'est pas une lecture.
const ACTION_WORD = /\brelance[rz]?\b|\bprogramme[rz]?\b|\bplanifie[rz]?\b|\bschedule\b|\bcree[rz]?\b|\bsupprime[rz]?\b|\bmodifie[rz]?\b/;

function normalize(text) {
  return foldLatin(String(text || "")).replace(/[’`']/g, " ").replace(/[?.!,;:«»"()]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * @returns {null | { status: string|null, operation: "list"|"count"|"analysis"|"projects"|"distribution", language: "fr"|"en"|"ru" }}
 */
function detectContactStatusRequest(message) {
  const raw = String(message || "").trim();
  if (!raw || raw.length > 200) return null;
  const t = normalize(raw);
  const found = STATUS_PATTERNS.find(([, re]) => re.test(t));
  const aboutContacts = CONTACT_WORD.test(t);
  // Répartition de tous les statuts : aucun statut précis n'est nommé.
  if (!found) {
    if (aboutContacts && !PROJECT_WORD.test(t) && !ACTION_WORD.test(t) && DISTRIBUTION_WORD.test(t)) {
      return { status: null, operation: "distribution", language: detectLanguage(raw).language };
    }
    return null;
  }
  const aboutProjects = PROJECT_WORD.test(t);
  // « projets refusés » sans client ni contact : une question sur les projets.
  if (!aboutContacts) return null;
  if (ACTION_WORD.test(t)) return null;
  // « Le client a refusé le devis du projet Holya » parle d'UN projet précis :
  // seule une question sur DES projets (pluriel) est une recherche par statut.
  if (aboutProjects && !PROJECTS_PLURAL.test(t)) return null;
  const operation = aboutProjects ? "projects" : COUNT_WORD.test(t) ? "count" : ANALYSIS_WORD.test(t) ? "analysis" : "list";
  return { status: found[0], operation, language: detectLanguage(raw).language };
}

const STATUS_ORDER = ["ok", "user_injoignable", "rappeler_plus_tard", "client_refuse"];

const T = {
  fr: {
    labels: { client_refuse: "refusés (statut « client_refuse »)", user_injoignable: "injoignables (statut « user_injoignable »)", rappeler_plus_tard: "à rappeler plus tard (statut « rappeler_plus_tard »)", ok: "au statut « ok »" },
    scope: { all: "tous les contacts du CRM", created: "les contacts que vous avez créés", assigned: "les contacts que vous avez créés, qui vous sont affectés ou que vous suivez par une relance" },
    inScope: { all: "Dans le CRM", created: "Dans votre périmètre", assigned: "Dans votre périmètre" },
    countLine: (where, x, status, y) => `${where}, ${x} contact${x > 1 ? "s ont" : " a"} le statut « ${status} », sur ${y} contact${y > 1 ? "s" : ""} consultable${y > 1 ? "s" : ""}.`,
    share: (pct) => `Soit ${pct} % de ces contacts.`,
    nothingVisible: (scope) => `Aucun contact n'est consultable dans votre périmètre (${scope}) : il n'y a donc rien à compter ni à analyser pour votre compte.`,
    scopeLine: (scope) => `Périmètre : ${scope}.`,
    distributionTitle: (y) => `Répartition des ${y} contact${y > 1 ? "s" : ""} consultable${y > 1 ? "s" : ""} par statut :`,
    otherScope: "Le tableau de bord d'un administrateur porte sur tous les contacts du CRM : il peut afficher des contacts que votre rôle ne vous permet pas de consulter.",
    sameAsDashboard: "Même source et même calcul que le tableau de bord « Commercial Contacts KPI » (colonne statut des contacts commerciaux).",
    listTitle: (label) => `📋 CONTACTS ${label.toUpperCase()}`,
    nothingToList: "Il n'y a donc aucun contact à afficher pour ce statut.",
    shown: (shown, n) => `${shown} affiché${shown > 1 ? "s" : ""} sur ${n}.`,
    more: (n) => `... et ${n} autre${n > 1 ? "s" : ""} contact${n > 1 ? "s" : ""} non affiché${n > 1 ? "s" : ""} ici.`,
    incomplete: (got, n) => `⚠️ Lecture incomplète : ${got} contacts lus sur ${n}. Cette analyse n'est pas exhaustive.`,
    analysisTitle: (label) => `📊 ANALYSE DES CONTACTS ${label.toUpperCase()}`,
    distributionHeading: "📊 RÉPARTITION DES CONTACTS PAR STATUT",
    calls: (n) => `• Appels enregistrés : ${n}`,
    neverCalled: (n) => `• Sans appel enregistré : ${n}`,
    noPhone: (n) => `• Sans téléphone : ${n}`,
    noCompany: (n) => `• Sans société renseignée : ${n}`,
    companies: "Sociétés les plus représentées :",
    activity: "Activité de ces contacts :",
    noLink:
      "ℹ️ Le CRM ne relie pas les contacts commerciaux aux projets : aucun lien n'est enregistré entre les deux. Un contact refusé n'est donc rattaché à aucun projet, et je ne peux pas en déduire une liste de projets.",
    noLinkHint: "Voici les contacts concernés. Pour vérifier un projet, demandez par exemple « les projets de la société <nom> ».",
    failed: "Je n'ai pas pu lire les contacts : la récupération des données a échoué. Ce n'est pas un résultat égal à zéro — aucun nombre n'est affiché. Réessayez dans un instant ; si le problème persiste, prévenez l'administrateur.",
    unnamed: "Nom non renseigné",
    phone: "tél.",
  },
  en: {
    labels: { client_refuse: 'refused (status "client_refuse")', user_injoignable: 'unreachable (status "user_injoignable")', rappeler_plus_tard: 'to call back later (status "rappeler_plus_tard")', ok: 'with status "ok"' },
    scope: { all: "all CRM contacts", created: "the contacts you created", assigned: "the contacts you created, that are assigned to you or that you follow through a follow-up" },
    inScope: { all: "In the CRM", created: "Within your scope", assigned: "Within your scope" },
    countLine: (where, x, status, y) => `${where}, ${x} contact${x > 1 ? "s have" : " has"} the status "${status}", out of ${y} viewable contact${y > 1 ? "s" : ""}.`,
    share: (pct) => `That is ${pct}% of these contacts.`,
    nothingVisible: (scope) => `No contact is viewable within your scope (${scope}): there is nothing to count or analyse for your account.`,
    scopeLine: (scope) => `Scope: ${scope}.`,
    distributionTitle: (y) => `Breakdown of the ${y} viewable contact${y > 1 ? "s" : ""} by status:`,
    otherScope: "An administrator's dashboard covers every CRM contact: it may show contacts your role cannot view.",
    sameAsDashboard: 'Same source and same computation as the "Commercial Contacts KPI" dashboard (status column of commercial contacts).',
    listTitle: (label) => `📋 CONTACTS ${label.toUpperCase()}`,
    nothingToList: "So there is no contact to show for this status.",
    shown: (shown, n) => `${shown} shown out of ${n}.`,
    more: (n) => `... and ${n} more contact${n > 1 ? "s" : ""} not shown here.`,
    incomplete: (got, n) => `⚠️ Incomplete read: ${got} contacts read out of ${n}. This analysis is not exhaustive.`,
    analysisTitle: (label) => `📊 ANALYSIS OF CONTACTS ${label.toUpperCase()}`,
    distributionHeading: "📊 CONTACTS BY STATUS",
    calls: (n) => `• Recorded calls: ${n}`,
    neverCalled: (n) => `• Without any recorded call: ${n}`,
    noPhone: (n) => `• Without a phone number: ${n}`,
    noCompany: (n) => `• Without a company: ${n}`,
    companies: "Most represented companies:",
    activity: "Activity of these contacts:",
    noLink: "ℹ️ The CRM does not link commercial contacts to projects: no relation is stored between them. A refused contact is therefore attached to no project, and I cannot derive a list of projects.",
    noLinkHint: 'Here are the contacts concerned. To check a project, ask for example "projects of the company <name>".',
    failed: "I could not read the contacts: data retrieval failed. This is not a result equal to zero — no number is shown. Please try again shortly; if the problem persists, contact the administrator.",
    unnamed: "Name not provided",
    phone: "tel.",
  },
};
T.ru = { ...T.en };

const strings = (language) => T[language] || T.fr;

function contactLine(t, c, i) {
  const name = [c.prenom, c.nom].filter(Boolean).join(" ").trim() || t.unnamed;
  const company = c.nomSociete && String(c.nomSociete).trim() ? ` — ${String(c.nomSociete).trim()}` : "";
  const phone = c.telephone && String(c.telephone).trim() ? ` — ${t.phone} ${c.telephone}` : "";
  return `${i + 1}. ${name}${company}${phone}`;
}

function percent(x, y) {
  return y ? Math.round((x / y) * 1000) / 10 : 0;
}

function distributionLines(t, counts, totalAll) {
  return [t.distributionTitle(totalAll), ...STATUS_ORDER.map((s) => `• ${s} : ${counts[s] || 0}${totalAll ? ` (${percent(counts[s] || 0, totalAll)} %)` : ""}`)];
}

/**
 * Toutes les valeurs viennent de l'outil CRM (comptages SQL) — rien n'est estimé ici.
 * @param {object} o
 * @param {{status: string|null, operation: "list"|"count"|"analysis"|"projects"|"distribution", language}} o.request
 * @param {"all"|"created"|"assigned"} o.scope   périmètre réellement appliqué par l'outil
 * @param {Record<string, number>} o.counts       nombre de contacts par statut, dans ce périmètre
 * @param {number} o.totalAll                     Y : contacts consultables dans ce périmètre
 * @param {object[]} o.contacts                   contacts du statut demandé réellement lus
 */
function buildContactStatusAnswer({ request, scope, counts, totalAll, contacts = [], shownLimit = 20 }) {
  const t = strings(request.language);
  const scopeText = t.scope[scope];
  const restricted = scope !== "all";
  const closing = restricted ? t.otherScope : t.sameAsDashboard;
  const lines = [];

  if (request.operation === "projects") lines.push(t.noLink, "");
  // Rien de consultable : dit comme tel — ce n'est pas « aucun contact refusé ».
  if (!totalAll) {
    lines.push(t.nothingVisible(scopeText));
    if (restricted) lines.push(t.otherScope);
    return lines.join("\n");
  }

  if (request.operation === "distribution") {
    lines.push(t.distributionHeading, "", ...distributionLines(t, counts, totalAll), "", t.scopeLine(scopeText), closing);
    return lines.join("\n");
  }

  const x = counts[request.status] || 0;
  const label = t.labels[request.status];
  const countLine = t.countLine(t.inScope[scope], x, request.status, totalAll);

  if (request.operation === "count") {
    lines.push(countLine, t.scopeLine(scopeText), "", ...distributionLines(t, counts, totalAll), "", closing);
    return lines.join("\n");
  }

  if (request.operation === "analysis") {
    lines.push(t.analysisTitle(label), "", countLine, t.share(percent(x, totalAll)), t.scopeLine(scopeText), "", ...distributionLines(t, counts, totalAll));
    if (x > 0) {
      if (contacts.length < x) lines.push("", t.incomplete(contacts.length, x));
      const calls = contacts.reduce((sum, c) => sum + (Number.isInteger(c.nbAppels) ? c.nbAppels : 0), 0);
      lines.push("", t.activity, t.calls(calls), t.neverCalled(contacts.filter((c) => !c.dateAppel).length), t.noPhone(contacts.filter((c) => !c.telephone || !String(c.telephone).trim()).length), t.noCompany(contacts.filter((c) => !c.nomSociete || !String(c.nomSociete).trim()).length));
      const byCompany = new Map();
      for (const c of contacts) {
        const name = c.nomSociete && String(c.nomSociete).trim();
        if (name) byCompany.set(name, (byCompany.get(name) || 0) + 1);
      }
      const top = [...byCompany.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
      if (top.length) lines.push("", t.companies, ...top.map(([name, n]) => `• ${name} : ${n}`));
    }
    lines.push("", closing);
    return lines.join("\n");
  }

  // Liste (et « projets dont le client est refusé » : les contacts, après la précision).
  if (request.operation !== "projects") lines.push(t.listTitle(label), "");
  lines.push(countLine, t.scopeLine(scopeText));
  if (!x) {
    lines.push(t.nothingToList, "", ...distributionLines(t, counts, totalAll));
  } else {
    if (request.operation === "projects") lines.push("", t.noLinkHint);
    const shown = contacts.slice(0, shownLimit);
    if (shown.length < x) lines.push(t.shown(shown.length, x));
    lines.push("", ...shown.map((c, i) => contactLine(t, c, i)));
    if (x > shown.length) lines.push("", t.more(x - shown.length));
  }
  if (restricted) lines.push("", t.otherScope);
  return lines.join("\n");
}

const buildContactStatusError = (language) => strings(language).failed;

module.exports = { detectContactStatusRequest, buildContactStatusAnswer, buildContactStatusError, STATUS_ORDER };
