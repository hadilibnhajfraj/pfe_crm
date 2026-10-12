"use strict";

const { detectLanguage, foldLatin } = require("../language/languageDetector");

/**
 * # EntityNormalizer — « liste des X » → { entity, operation: "list" } (FR/EN/RU)
 *
 * Dictionnaire UNIQUE des entités du CRM : toutes les formes d'un mot
 * (singulier, pluriel, féminin, emprunt anglais dans une phrase française,
 * déclinaisons russes) mènent à la même entité canonique.
 *
 *   « donner moi liste des sociétés dans crm »   → company.list
 *   « donner moi liste des company dans crm »    → company.list
 *   « list all companies » / « покажи список компаний » → company.list
 *   « toutes les machines »                      → machine.list
 *   « liste des demandes RH »                    → hr_request.list
 *
 * `detectList()` ne reconnaît qu'une liste SIMPLE : une entité, un signal de
 * liste (ou le groupe nominal seul), et rien d'autre de significatif. Dès que
 * la phrase porte un filtre, un nom propre, un comptage ou une question
 * « comment… » (« projets en retard », « société ABC », « combien de
 * machines »), elle renvoie `null` et le routage existant s'applique — aucun
 * parcours déjà validé n'est détourné.
 *
 * Déterministe (aucun modèle de langage).
 */

// Ordre : les entités à plusieurs mots d'abord (« demande de maintenance »
// avant « maintenance », « demande RH » avant tout autre mot).
const ENTITIES = [
  {
    entity: "hr_request",
    intent: "hr",
    re: /\bdemandes?\s+(?:de\s+)?(?:rh|ressources humaines|conges?|sorties?)\b|\b(?:hr|leave)\s+requests?\b|кадров\S*\s+заяв\S*|заяв\S*\s+(?:в\s+)?(?:hr|отдел\S*\s+кадров)|заявк\S*\s+на\s+отпуск/,
  },
  {
    entity: "maintenance_request",
    intent: "maintenance",
    re: /\bdemandes?\s+(?:de\s+)?maintenance\b|\bmaintenance\s+requests?\b|заяв\S*\s+на\s+(?:обслуживани|ремонт)\S*|заяв\S*\s+(?:по\s+)?техобслуживани\S*/,
  },
  { entity: "engineer", intent: "engineers", re: /\bingenieure?s?\b|\bengineers?\b|(?:^|[^а-яё])инженер\S*/ },
  { entity: "promoter", intent: null, re: /\bpromoteurs?\b|\bpromoters?\b|\b(?:real estate |property )?developers?\b|застройщик\S*|девелопер\S*/ },
  { entity: "company", intent: null, re: /\bsocietes?\b|\bentreprises?\b|\bcompagnies?\b|\bcompan(?:y|ys|ies)\b|\bfirm(?:e|es|s)?\b|компани\S*|фирм\S*|организаци\S*|предприяти\S*/ },
  { entity: "machine", intent: null, re: /\bmachines?\b|(?:^|[^а-яё])машин\S*|станк\S*|оборудовани\S*/ },
  { entity: "project", intent: "projects", re: /\bprojets?\b|\bprojects?\b|\bchantiers?\b|проект\S*/ },
  { entity: "contact", intent: "commercial_contacts", re: /\bcontacts?\b|\bprospects?\b|контакт\S*/ },
];

// Signal de liste : verbe de consultation, « liste », « tous », question
// ouverte au pluriel.
const LIST_SIGNAL =
  /\blistes?\b|\blister\b|\btou(?:s|tes)\b|\bdonne[rz]?\b|\bmontre[rz]?\b|\baffiche[rz]?\b|\bvoir\b|\bconsulter\b|\bveux\b|\bvoudrais\b|\bquel(?:le)?s\b|\bshow\b|\bgive\b|\bdisplay\b|\blist\b|\ball\b|\bsee\b|\bget\b|\bwhich\b|\bwhat\b|\bexist\w*\b|\benregistr\w*\b|\breferenc\w*\b|\bregistered\b|\b(?:dans|sur|du) (?:le |notre )?crm\b|\bin (?:the |our )?crm\b|(?:^|\s)есть(?=\s|$)|в crm|покаж|списо|перечисл|выведи|(?:^|\s)все(?:х)?(?=\s|$)|(?:^|\s)дай(?:те)?(?=\s|$)|какие/;

// Ce qui disqualifie une liste simple.
const NOT_A_PLAIN_LIST =
  /\bcomment\b|\bhow (?:do|can|to|should)\b|(?:^|\s)как(?=\s)|\bcombien\b|\bhow many\b|\bnombre\b|\bnumber of\b|\ble plus\b|\ble moins\b|\bmost\b|\bleast\b|\bclassement\b|\branking\b|\btop\b|\bmoyen|\baverage\b|сколько|больше всего|меньше всего|рейтинг|\bcre(?:e|er|ez)\b|\bajoute[rz]?\b|\bsupprime[rz]?\b|\bmodifie[rz]?\b|\bcreate\b|\badd\b|\bdelete\b|\bupdate\b|созда|удал|измен/;

// Mots sans contenu : une fois retirés avec l'entité, il ne doit rien rester.
const FILLERS = new Set(
  (
    "donner donne donnez moi me la le les l des de du d un une liste listes lister tous toutes tout toute affiche afficher affichez montre montrer montrez voir " +
    "consulter je j veux voudrais souhaite aimerais quels quelles quel quelle sont est qui que existent existe existants disponibles disponible dans sur crm " +
    "notre nos svp stp merci sil vous plait te peux tu pouvez et a au aux en y il ya avons nous on t " +
    "complete complet completes complets entiere integrale full entire whole полный полностью весь целиком " +
    "enregistre enregistres enregistree enregistrees reference references referencee referencees connues connus existantes registered recorded stored saved known зарегистрированные зарегистрированных " +
    "please show give display see get list all the of in our me i want would like to can you could are is what which there have we do " +
    "покажи покажите список всех все дай дайте мне в какие какой есть хочу увидеть вывести выведи пожалуйста у нас наши наших"
  ).split(" ")
);
const OWNERSHIP = new Set(["mes", "mon", "ma", "my", "мои", "моих", "мой"]);

// Faute de frappe sur un mot d'entité (« socités », « ingénieus », « compagnies ») :
// le mot est remplacé par sa forme correcte, le reste du message est intact.
// Limité aux mots d'au moins 7 lettres, à une lettre près (deux à partir de 10).
const TYPO_KEYWORDS = ["societe", "societes", "entreprise", "entreprises", "compagnie", "compagnies", "company", "companies", "ingenieur", "ingenieurs", "engineer", "engineers", "promoteur", "promoteurs"];
const TYPO_EXACT = new Set(TYPO_KEYWORDS.concat(["society", "societies", "engineering", "ingenierie", "entrepreneur", "entrepreneurs", "promotion", "promotions", "compagnon"]));

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let prev2 = null;
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

function correctEntityTypos(message) {
  return String(message || "").replace(/[A-Za-zÀ-ÿ]{6,}/g, (word, offset) => {
    // Majuscule en cours de phrase : un nom propre, jamais corrigé.
    if (offset > 0 && /^[A-ZÀ-Ý]/.test(word)) return word;
    const w = foldLatin(word);
    if (TYPO_EXACT.has(w)) return word;
    const max = w.length >= 10 ? 2 : 1;
    let best = null;
    for (const keyword of TYPO_KEYWORDS) {
      if (keyword.length < 7) continue;
      const d = editDistance(w, keyword, max);
      if (d <= max && (!best || d < best.d)) best = { keyword, d };
    }
    return best ? best.keyword : word;
  });
}

function normalize(text) {
  return foldLatin(text).replace(/[’`'‐-]/g, " ").replace(/[?.!,;:«»"()]/g, " ").replace(/\s+/g, " ").trim();
}

class EntityNormalizer {
  /** Entité canonique nommée par le message, ou null. */
  entityOf(message) {
    const t = normalize(message);
    const found = ENTITIES.find((e) => e.re.test(t));
    return found ? found.entity : null;
  }

  /**
   * @returns {null | { language: "fr"|"en"|"ru", entity: string, operation: "list", target: null,
   *   source: "crm", mine: boolean, intent: string|null }}
   *   `intent` : intention existante du catalogue qui sait déjà servir cette
   *   liste (projets, contacts, demandes RH / maintenance, ingénieurs) ; `null`
   *   quand la liste est servie directement par un Tool (sociétés, machines,
   *   promoteurs).
   */
  detectList(message) {
    const raw = String(message || "").trim();
    if (!raw || raw.length > 160) return null;
    const t = normalize(correctEntityTypos(raw));
    if (NOT_A_PLAIN_LIST.test(t)) return null;

    const found = ENTITIES.find((e) => e.re.test(t));
    if (!found) return null;

    const rest = t.replace(found.re, " ").split(" ").filter(Boolean);
    const leftovers = rest.filter((w) => !FILLERS.has(w) && !OWNERSHIP.has(w));
    // Un mot de contenu en plus (filtre, nom propre, statut…) : pas une liste simple.
    if (leftovers.length) return null;
    // Sans verbe ni « liste » : uniquement le groupe nominal seul (« sociétés »,
    // « les machines »).
    if (!LIST_SIGNAL.test(t) && rest.length > 2) return null;

    return {
      language: detectLanguage(raw).language,
      entity: found.entity,
      operation: "list",
      target: null,
      source: "crm",
      mine: rest.some((w) => OWNERSHIP.has(w)),
      intent: found.intent,
    };
  }
}

module.exports = { EntityNormalizer, correctEntityTypos, ENTITY_DICTIONARY: ENTITIES.map((e) => e.entity) };
