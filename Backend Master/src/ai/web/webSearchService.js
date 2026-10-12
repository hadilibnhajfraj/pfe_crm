"use strict";

const { createWebSearchProvider, WebSearchNotConfiguredError } = require("./webSearchProviders");
const { tokensOf } = require("../../utils/nameMatch");
const { withNamespace } = require("../utils/logger");

/**
 * # WebSearchService — recherche Web contrôlée de PROBAR ASSISTANT
 *
 * Entre l'assistant et le fournisseur (webSearchProviders.js) :
 * 1. Construit 1 à 2 requêtes dans la langue de la question, à partir du NOM
 *    recherché et d'un contexte PUBLIC (société, pays, fonction) — le nom
 *    propre n'est jamais traduit.
 * 2. NETTOIE tout ce qui part vers le moteur : aucun e-mail, téléphone, jeton
 *    ni secret ; longueur bornée.
 * 3. Met en CACHE les résultats (clé `web_search:{requête normalisée}:{langue}`)
 *    pour ne pas relancer aussitôt la même recherche.
 * 4. FILTRE les résultats hors sujet et les sites exclus, évalue pour chaque
 *    résultat si l'IDENTITÉ concorde avec le contexte (une page portant le
 *    même nom n'est pas forcément la même personne), puis CLASSE par
 *    concordance et fiabilité de la source.
 * 5. Ne renvoie que les 3 à 5 meilleures sources, coordonnées privées masquées.
 *
 * Les URL viennent exclusivement du fournisseur : rien n'est fabriqué ici.
 * Journal `[WEB_SEARCH]` : requête, fournisseur, nombre de résultats — jamais
 * la clé d'API.
 */

const logger = withNamespace("web-search");

const MAX_QUERY_LENGTH = 160;
const DEFAULT_LIMIT = 5;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;

// Réseaux personnels, annuaires de coordonnées et agrégateurs de profils :
// jamais utilisés comme source (vie privée, fiabilité).
const EXCLUDED_HOSTS = /(^|\.)(facebook|instagram|tiktok|snapchat|pinterest|x|twitter|youtube|truecaller|pagesblanches|whitepages|spokeo|pipl|rocketreach|zoominfo|signalhire|contactout|lusha|apollo|peekyou|radaris|beenverified|mylife|idcrawl|webmii|yasni|namecheckr)\.(com|fr|net|io|org)$/;
const INSTITUTIONAL = /(\.gov(\.[a-z]{2})?|\.gouv\.[a-z]{2}|\.gov\.tn|\.nat\.tn|\.edu(\.[a-z]{2})?|\.ac\.[a-z]{2}|(^|\.)(rne|registre-entreprises|cepex|tunisieindustrie|apii|infogreffe|societe|pappers|opencorporates|europa|ordre-ingenieurs|oit)\.[a-z.]+)$/;
const LINKEDIN = /(^|\.)linkedin\.com$/;
const PRESS = /(^|\.)(reuters|bloomberg|lemonde|lefigaro|lesechos|bfmtv|jeuneafrique|leaders|businessnews|webmanagercenter|kapitalis|ilboursa|tap\.info|lapresse|leconomistemaghrebin|africanmanager|challenges|usinenouvelle|batiactu|lemoniteur|constructiontunisie|rbc|interfax|kommersant|vedomosti|tass|forbes|ft|bbc|theguardian|nytimes|wsj|cnbc)\.[a-z.]+$/;

const SOURCE_KIND_RANK = { official: 0, institutional: 1, linkedin: 2, press: 3, other: 4 };
const IDENTITY_RANK = { confirmed: 0, probable: 1, unconfirmed: 2 };

const ROLE_WORDS = { engineer: { fr: "ingénieur", en: "engineer", ru: "инженер" }, person: { fr: "", en: "", ru: "" } };
const COUNTRY_NAMES = { tunisia: { fr: "Tunisie", en: "Tunisia", ru: "Тунис" } };
const COUNTRY_TLDS = { tunisia: "tn" };
// Mots trop génériques pour établir qu'une page parle de la bonne société.
const GENERIC_COMPANY_WORDS = new Set(["entreprise", "societe", "ste", "sarl", "sa", "suarl", "group", "groupe", "company", "bureau", "etudes", "etude", "cabinet", "the", "les", "des"]);
const PROFESSIONAL_CONTEXT = /ingenieur|engineer|инженер|ingenierie|engineering|genie civil|bureau d.?etude|structure|btp|construction|architect|chantier/;

// Pages d'annuaire (« 60+ "Amin Mansour" profiles ») : une liste d'homonymes,
// jamais une source sur UNE personne.
const DIRECTORY_PAGE = /linkedin\.com\/pub\/dir\/|\/people\/search|\b\d+\+?\s+(?:"[^"]+"\s+)?(?:profiles|profils|results|résultats)\b/i;

const QUERY_TEMPLATES = {
  // Recherche Web explicite (« Recherche sur le Web : X ») : le nom, tel quel.
  topic: { fr: (n) => `"${n}"`, en: (n) => `"${n}"`, ru: (n) => `"${n}"` },
  company: {
    fr: (n) => `"${n}" entreprise activité site officiel`,
    en: (n) => `"${n}" company profile official website`,
    ru: (n) => `"${n}" компания деятельность официальный сайт`,
  },
  promoter: {
    fr: (n) => `"${n}" promoteur immobilier projet`,
    en: (n) => `"${n}" real estate developer project`,
    ru: (n) => `"${n}" застройщик проект`,
  },
};

// Coordonnées et secrets retirés de TOUT texte envoyé au moteur ou affiché.
const PRIVATE_PATTERNS = [
  // « clé = valeur » d'abord : la valeur disparaît avec son libellé.
  /\b(?:password|passwd|pwd|mot de passe|token|api[_-]?key|secret)\s*[:=]\s*\S+/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, // e-mail
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(?:\+|00)?\d[\d\s().-]{7,}\d/g, // téléphone
  /\b[A-Za-z0-9_-]{32,}\b/g, // clé / identifiant long
];

// Extrait affichable : balisage et bruit de page retirés, coupé à la phrase.
function cleanSnippet(text, max = 280) {
  const clean = stripPrivate(String(text || "").replace(/[#*_`>|]+/g, " ").replace(/\[\.\.\.\]|\[…\]/g, "…"));
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${cut.slice(0, stop > max * 0.6 ? stop : max).trim()}…`;
}

function stripPrivate(text) {
  let out = String(text || "");
  for (const re of PRIVATE_PATTERNS) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

function sanitizeTarget(name) {
  return stripPrivate(name).replace(/["«»“”]/g, "").slice(0, 100).trim();
}

function countryName(country, language) {
  const key = String(country || "").trim().toLowerCase();
  if (!key) return "";
  const known = COUNTRY_NAMES[key];
  return known ? known[language] || known.en : sanitizeTarget(country).slice(0, 40);
}

/**
 * Requêtes envoyées au moteur. Pour une personne : son nom + sa fonction +
 * le pays, puis son nom + sa société (contexte professionnel PUBLIC issu du
 * CRM). Jamais de coordonnées.
 */
function buildQueries({ target, entity = "company", language = "fr", company = null, country = null }) {
  const name = sanitizeTarget(target);
  if (name.length < 2) return [];
  const lang = ["fr", "en", "ru"].includes(language) ? language : "fr";

  if (entity === "engineer" || entity === "person") {
    const role = ROLE_WORDS[entity][lang];
    const place = countryName(country, lang);
    const queries = [[`"${name}"`, role, place].filter(Boolean).join(" ")];
    const org = company ? sanitizeTarget(company).slice(0, 60) : "";
    if (org) queries.push(`"${name}" "${org}"`);
    if (queries[0] === `"${name}"`) {
      queries[0] = { fr: `"${name}" parcours professionnel`, en: `"${name}" professional background`, ru: `"${name}" профессиональная деятельность` }[lang];
    }
    return queries.map((q) => q.slice(0, MAX_QUERY_LENGTH));
  }
  const template = QUERY_TEMPLATES[entity] || QUERY_TEMPLATES.company;
  return [template[lang](name).slice(0, MAX_QUERY_LENGTH)];
}

function buildQuery(request) {
  return buildQueries(request)[0] || null;
}

function classifySource(host, targetTokens) {
  if (LINKEDIN.test(host)) return "linkedin";
  if (INSTITUTIONAL.test(host)) return "institutional";
  if (PRESS.test(host)) return "press";
  // Site officiel : le nom de domaine reprend le nom recherché
  // (« CBI Tunisia » → cbi-tunisia.com).
  const domain = host.split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
  const significant = targetTokens.filter((t) => t.length >= 3);
  if (significant.length && significant.every((t) => domain.includes(t))) return "official";
  return "other";
}

function wordsOf(result) {
  const set = new Set(tokensOf(`${result.title} ${result.snippet} ${result.url}`));
  return { set, joined: [...set].join(" ") };
}

// Tous les mots significatifs présents dans le titre, l'extrait ou l'adresse
// (y compris collés : « cbi-tunisia.com »).
function mentionsAll(words, tokens) {
  const significant = tokens.filter((t) => t.length >= 3);
  if (!significant.length) return true;
  const squashed = words.joined.replace(/ /g, "");
  return significant.every((t) => words.set.has(t) || squashed.includes(t));
}

/**
 * Le résultat parle-t-il de LA cible ?
 * - Personne : chaque mot du nom doit figurer comme mot ENTIER (« Mansour »
 *   n'est pas « Mansouri » ni « Mansour Saatloo » sans le prénom).
 * - Société, promoteur, sujet : le nom doit apparaître d'un seul tenant
 *   (« CBI Tunisia », « cbi-tunisia.com ») — pas « CBI » d'un côté et
 *   « Tunisia » de l'autre, qui désigne souvent une autre organisation.
 */
function mentionsTarget(result, targetTokens, entity) {
  const words = wordsOf(result);
  if (entity === "engineer" || entity === "person") {
    return targetTokens.length > 0 && targetTokens.every((t) => words.set.has(t));
  }
  if (targetTokens.length < 2) return mentionsAll(words, targetTokens);
  const ordered = tokensOf(`${result.title} ${result.snippet}`).join(" ");
  const host = String(result.source || "").replace(/[^a-z0-9]/g, "");
  return ordered.includes(targetTokens.join(" ")) || host.includes(targetTokens.join(""));
}

/**
 * La page parle-t-elle de LA personne / société du CRM, ou seulement d'un
 * homonyme ?
 *   confirmed   : le contexte du CRM y figure (sa société), ou — pour une
 *                 société — c'est son site officiel / son nom exact en titre
 *   probable    : même nom dans un contexte professionnel ou un pays concordant
 *   unconfirmed : même nom, rien d'autre ne permet de rapprocher
 */
function identityMatch(result, { entity, targetTokens, companyTokens, country, sourceKind }) {
  const words = wordsOf(result);
  if (entity === "company" || entity === "promoter") {
    const title = tokensOf(result.title).join(" ");
    const exact = title.includes(targetTokens.join(" "));
    if (sourceKind === "official") return { level: "confirmed", confidence: 0.95 };
    if (exact) return { level: "confirmed", confidence: 0.85 };
    return { level: "probable", confidence: 0.6 };
  }
  // Indices concordants au-delà du nom (0,30 à lui seul) : société du CRM
  // (+0,45), contexte professionnel (+0,15), pays (+0,10).
  const sameCompany = companyTokens.length > 0 && mentionsAll(words, companyTokens);
  const place = tokensOf(countryName(country, "en")).concat(tokensOf(countryName(country, "fr")));
  // Le pays figure dans le texte, ou le site est sous le domaine du pays (.tn).
  const tld = COUNTRY_TLDS[String(country || "").trim().toLowerCase()];
  const inCountry =
    place.some((t) => t.length >= 4 && (words.set.has(t) || words.joined.includes(t.slice(0, 5)))) || Boolean(tld && String(result.source || "").endsWith(`.${tld}`));
  // Un étudiant en ingénierie n'est pas un ingénieur en exercice (constaté sur
  // de vrais résultats : un homonyme étudiant à l'étranger).
  const professional = PROFESSIONAL_CONTEXT.test(words.joined) && !/\b(?:student|etudiante?|stagiaire|intern)\b|студент/.test(words.joined);
  // Jamais 1 : un rapprochement par le Web reste une présomption.
  const confidence = Math.min(0.95, Math.round((0.3 + (sameCompany ? 0.45 : 0) + (professional ? 0.15 : 0) + (inCountry ? 0.1 : 0)) * 100) / 100);
  // « Probable » exige le métier ET le pays : un ingénieur du même nom dans
  // un autre pays, ou un homonyme du même pays dans un autre métier, reste
  // « non confirmé » (constaté sur de vrais résultats : plusieurs homonymes).
  return { level: sameCompany ? "confirmed" : professional && inCountry ? "probable" : "unconfirmed", confidence };
}

function identityOf(result, context) {
  return identityMatch(result, context).level;
}

/**
 * Une synthèse rédigée par le modèle de langage n'est acceptée que si chaque
 * NOM PROPRE et chaque NOMBRE qu'elle contient figure dans les extraits
 * renvoyés par le moteur (ou dans le nom recherché) : une société, une date
 * ou un titre absents des sources la font rejeter.
 */
function isGrounded(text, results, target = "") {
  const corpus = tokensOf(`${target} ${results.map((r) => `${r.title} ${r.snippet} ${r.source}`).join(" ")}`);
  const known = new Set(corpus);
  const squashed = corpus.join(" ");
  const body = String(text || "").replace(/\[\d+\]/g, " ");
  for (const number of body.match(/\d{2,}/g) || []) {
    if (!squashed.includes(number)) return false;
  }
  for (const sentence of body.split(/(?<=[.!?…])\s+|\n+/)) {
    const words = sentence.trim().split(/\s+/).slice(1); // le 1er mot porte la majuscule de début de phrase
    for (const word of words) {
      const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (clean.length < 3 || !/^\p{Lu}/u.test(clean)) continue;
      if (!tokensOf(clean).every((t) => known.has(t))) return false;
    }
  }
  return true;
}

class WebSearchService {
  constructor({ provider = null, env = process.env, clock = () => Date.now() } = {}) {
    this.provider = provider || createWebSearchProvider(env);
    this.clock = clock;
    this._cache = new Map();
    // Pays par défaut du contexte de recherche d'une personne (le CRM ne
    // porte pas de pays) : WEB_SEARCH_COUNTRY, « tunisia » si non défini,
    // chaîne vide pour n'en ajouter aucun.
    const configured = env.AI_WEB_SEARCH_COUNTRY ?? env.WEB_SEARCH_COUNTRY;
    this.defaultCountry = configured === undefined ? "tunisia" : String(configured).trim();
  }

  isConfigured() {
    return this.provider.isConfigured();
  }

  async _cachedSearch(query, language) {
    const key = `web_search:${tokensOf(query).join(" ")}:${language}`;
    const hit = this._cache.get(key);
    if (hit && hit.expires > this.clock()) {
      logger.info(`[WEB_SEARCH] query=${JSON.stringify(query)} provider="${this.provider.name}" results=${hit.results.length} cached=true`);
      return hit.results;
    }
    let raw;
    try {
      raw = await this.provider.search(query, { language, limit: 10 });
    } catch (err) {
      // L'erreur réelle (401 clé invalide, 429 quota, délai…) — jamais la clé.
      logger.warn(`[WEB_SEARCH] provider="${this.provider.name}" configured=true executed=true status=ERROR error=${JSON.stringify(String((err && err.message) || "erreur inconnue").slice(0, 160))}`);
      throw err;
    }
    const results = Array.isArray(raw) ? raw : [];
    logger.info(`[WEB_SEARCH] query=${JSON.stringify(query)} provider="${this.provider.name}" results=${results.length} cached=false`);
    if (this._cache.size >= CACHE_MAX_ENTRIES) this._cache.delete(this._cache.keys().next().value);
    this._cache.set(key, { results, expires: this.clock() + CACHE_TTL_MS });
    return results;
  }

  /**
   * @param {{ target: string, entity?: "company"|"engineer"|"person"|"promoter"|"topic", language?: "fr"|"en"|"ru",
   *           company?: string, country?: string, limit?: number }} request
   * @returns {Promise<{ query: string, queries: string[], provider: string, identity: string|null, results: object[] }>}
   */
  async search({ target, entity = "company", language = "fr", company = null, country = undefined, limit = DEFAULT_LIMIT } = {}) {
    if (!this.isConfigured()) throw new WebSearchNotConfiguredError();
    const place = country === undefined ? this.defaultCountry : country;
    const queries = buildQueries({ target, entity, language, company, country: place });
    if (!queries.length) throw { status: 400, message: "Cible de recherche Web vide après nettoyage." };

    const targetTokens = tokensOf(sanitizeTarget(target));
    // Mots distinctifs de la société : ni génériques, ni déjà dans le nom de
    // la personne (« Bureau d'études Hmidi » ne prouve rien pour « Zied Hmidi »).
    const companyTokens = company
      ? tokensOf(sanitizeTarget(company)).filter((t) => t.length >= 3 && !GENERIC_COMPANY_WORDS.has(t) && !targetTokens.includes(t))
      : [];
    const max = Math.max(1, Math.min(5, Number(limit) || DEFAULT_LIMIT));

    // Une requête en échec n'annule pas l'autre ; toutes en échec → erreur.
    const settled = await Promise.allSettled(queries.map((q) => this._cachedSearch(q, language)));
    const fulfilled = settled.filter((s) => s.status === "fulfilled");
    if (!fulfilled.length) throw settled[0].reason;

    const seen = new Set();
    const results = [];
    for (const r of fulfilled.flatMap((s) => s.value)) {
      if (!r || !r.url || !r.source) continue;
      if (EXCLUDED_HOSTS.test(r.source) || seen.has(r.url)) continue;
      if (DIRECTORY_PAGE.test(`${r.url} ${r.title}`)) continue;
      if (!mentionsTarget(r, targetTokens, entity)) continue;
      seen.add(r.url);
      const sourceKind = classifySource(r.source, targetTokens);
      const match = identityMatch(r, { entity, targetTokens, companyTokens, country: place, sourceKind });
      results.push({
        title: stripPrivate(r.title) || r.source,
        url: r.url,
        snippet: cleanSnippet(r.snippet),
        source: r.source,
        sourceKind,
        identity: match.level,
        confidence: match.confidence,
        publishedAt: r.publishedAt || null,
      });
    }
    // Tri stable : concordance d'identité, puis fiabilité de la source ; à
    // égalité l'ordre de pertinence du moteur est gardé.
    results.sort((a, b) => IDENTITY_RANK[a.identity] - IDENTITY_RANK[b.identity] || SOURCE_KIND_RANK[a.sourceKind] - SOURCE_KIND_RANK[b.sourceKind]);
    // Personne : dès qu'une page concorde avec le contexte du CRM (société, ou
    // métier + pays), les simples homonymes sont écartés — leurs détails ne
    // doivent pas se mêler à ceux de la bonne personne. S'il n'y a QUE des
    // homonymes possibles, ils sont gardés et signalés comme non vérifiés.
    const person = entity === "engineer" || entity === "person";
    const matched = person ? results.filter((r) => r.identity !== "unconfirmed") : results;
    const kept = (matched.length ? matched : results).slice(0, max);
    return {
      query: queries[0],
      queries,
      provider: this.provider.name,
      // Meilleure concordance obtenue : décide de la mise en garde affichée.
      identity: kept.length ? kept[0].identity : null,
      confidence: kept.length ? kept[0].confidence : null,
      results: kept,
    };
  }
}

module.exports = { WebSearchService, buildQuery, buildQueries, sanitizeTarget, stripPrivate, classifySource, identityOf, identityMatch, isGrounded, SOURCE_KIND_RANK };
