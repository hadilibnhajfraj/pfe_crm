"use strict";

const { detectLanguage, foldLatin } = require("../language/languageDetector");
const { extractEntities } = require("../orchestrator/entityExtractor");

/**
 * # AnalyticsQueryParser — comprendre une question analytique CRM (FR/EN/RU)
 *
 * « Quel est l'ingénieur le plus utilisé dans le CRM ? »
 * « Which engineer is assigned to the most projects? »
 * « Какой инженер работает с наибольшим количеством проектов? »
 *   → { domain: "project", groupBy: "engineer", aggregation: "count", operation: "max" }
 *
 * Déterministe (aucun modèle de langage) : une DIMENSION (ingénieur,
 * commercial, statut, client, famille, mois, machine, opérateur, module), un
 * SIGNAL analytique (le plus / le moins / top N / classement / chaque / par X
 * / moyenne / combien) et un DOMAINE (projets, contacts, relances, fiches).
 * Les filtres (PROBAR, statut, période, « mes », hors archivés) sont
 * normalisés vers des valeurs techniques uniques, quelle que soit la langue.
 *
 * `parse()` renvoie `null` quand la question n'est pas analytique — elle
 * suit alors le routage habituel (aucun parcours existant n'est détourné).
 */

// Priorité : la première dimension trouvée l'emporte (« Quelle machine a
// produit le plus de fiches » → machine, jamais « produit »).
const DIMENSIONS = [
  { key: "engineer", domain: "project", re: /\bingenieure?s?\b|\bengineers?\b|инженер/, plural: /\bingenieure?s\b|\bengineers\b|инженер(?:ов|ы|ам|ами)(?![а-я])/ },
  { key: "machine", domain: "industrial", re: /\bmachines?\b|машин|станк|оборудован/, plural: /\bmachines\b|машин(?:ы|ах|ами)?(?![а-я])|станк(?:и|ов)/ },
  { key: "operator", domain: "industrial", re: /\boperateurs?\b|\boperators?\b|оператор/, plural: /\boperateurs\b|\boperators\b|оператор(ов|ы)/ },
  {
    key: "owner",
    domain: null,
    re: /(?<!contacts? )\bcommercia(?:l|ux)\b|\bsales ?(?:reps?|people|persons?|representatives?|managers?)\b|\bsalespe(?:ople|rson)\b|менеджер|продавц/,
    plural: /(?<!contacts? )\bcommerciaux\b|\bsales ?(?:reps|people|representatives|managers)\b|\bsalespeople\b|менеджер(ов|ы)|продавц(ов|ы)/,
  },
  { key: "client", domain: null, re: /\bclients?\b|\bcustomers?\b|\bsocietes?\b|\bcompan(?:y|ies)\b|клиент|компани/, plural: /\bclients\b|\bcustomers\b|\bsocietes\b|\bcompanies\b|клиент(ов|ы)|компани(й|и)\b/ },
  // « étape » désigne l'étape du pipeline (pipelineStageId), pas le statut : exclue.
  { key: "status", domain: null, re: /\bstatuts?\b|\bstatus(?:es)?\b|статус/, plural: /\bstatuts\b|\bstatuses\b|статус(?:ов|ы)/ },
  { key: "month", domain: null, re: /\bpar mois\b|\bmensuel|\b(?:per|by|each) month\b|\bmonthly\b|по месяц|помесячн|\bevolution\b|\btrend\b|динамик/, plural: /$^/ },
  { key: "module", domain: "industrial", re: /\b(?:par|chaque|per|by|each) (?:module|type de fiche)\b|по модул/, plural: /$^/ },
  {
    key: "product_family",
    domain: "project",
    re: /\b(?:par|chaque|each|per|by|quelle?s?|which) (?:famille|produit|product)s?\b|\bfamilles? de produits?\b|\bproduct famil|по (?:продукт|семейств)/,
    plural: /$^/,
  },
];

const DOMAINS = [
  { key: "relance", re: /\brelances?\b|\bfollow[- ]?ups?\b|\breminders?\b|напоминани|последующ/ },
  { key: "industrial", re: /\bfiches?\b|\b(?:industrial|production) records?\b|\brecords?\b|\bproduction\b|запис|карточ|производств|выпуск/ },
  { key: "contact", re: /\bcontacts?\b|\bprospects?\b|контакт/ },
  { key: "project", re: /\bprojets?\b|\bprojects?\b|\baffaires?\b|\bchantiers?\b|проект/ },
];

const MAX = /\ble plus\b|\bla plus\b|\bles plus\b|\bmaximum\b|\bmost\b|\bhighest\b|\blargest\b|\bbiggest\b|\bbusiest\b|наибольш|больше всего|максимальн|чаще всего|самы\S* (?:активн|загруж|популярн|востребован)/;
const MIN = /\ble moins\b|\bla moins\b|\bles moins\b|\bminimum\b|\bleast\b|\bfewest\b|\blowest\b|наименьш|меньше всего|минимальн/;
const RANKING = /\bclassement\b|\bpalmares\b|\branking\b|\bleaderboard\b|\branked\b|рейтинг|\btop\b/;
const AVERAGE = /\bmoyen(?:ne)?s?\b|\baverage\b|\bmean\b|средн/;
const COUNT = /\bcombien\b|\bhow many\b|\bnombre (?:total )?(?:de|d)\b|\bnumber of\b|\btotal\b|сколько|количеств|\bcount\b/;
const BREAKDOWN = /\brepartition\b|\bbreakdown\b|\bdistribution\b|распределени/;
// NB : \b ne reconnaît que les lettres ASCII — les mots cyrilliques courts
// sont délimités explicitement.
const DISTRIBUTIVE = /\b(?:par|chaque|pour chaque|per|by|each|every)\b|(?:^|\s)по\s|кажд/;
// Question qui attend UNE réponse (« quel », « which », « кто из … ») :
// superlatif → max, même si la dimension est au pluriel (« Кто из инженеров »).
const SINGLE_ANSWER = /\b(?:quel|quelle|which|who)\b|(?:^|\s)(?:кто|какой|какая|какое)(?=\s|$|[?.!,])/;
const WHICH_PLURAL = /\b(?:quels|quelles|which|what)\b|(?:^|\s)(?:какие|каких|кто)(?=\s|$|[?.!,])/;
const NOT_FOLLOWED_UP = /\b(?:pas|jamais|non|sans|aucune?)\b[^.?!]{0,30}?relanc|\bnever\b[^.?!]{0,20}follow|\bnot\b[^.?!]{0,20}follow|\bwithout (?:a |any )?follow|\bno follow|(?:^|\s)не\s[^.?!]{0,20}(?:напомин|связ|перезвон)|без напомин/;
const EXCLUDE_ARCHIVED = /hors archiv|non[- ]archiv|sauf (?:les )?archiv|sans (?:les )?archiv|excluding archived|not archived|non-archived|without archived|без архив|кроме архив|неархив/;
const MINE = /\bmes\b|\bmon\b|\bma\b|\bmy\b|(?:^|\s)(?:мои|моих|моим|мой|моя|моё|мое)(?=\s|$|[?.!,])/;

const PROJECT_STATUS_SYNONYMS = [
  { re: /\bin progress\b|\bongoing\b|\bactive\b|\bactifs?\b|в работе|активн/, value: "En cours" },
  { re: /\bnegotiation\b|переговор/, value: "Négociation" },
  { re: /\bdelivery\b|поставк|доставк/, value: "Livraison" },
  { re: /\bcompleted\b|\bfinished\b|\bclosed\b|завершен/, value: "Terminé" },
  { re: /\bidentification\b|идентификац/, value: "Identification" },
];

// POR PROMESH vit dans une autre table (por_promesh) que les fiches
// industrielles analysées ici : jamais confondus.
const POR_PROMESH = /\bpor[- ]?promesh\b|\bporpromesh\b/;

// Répartition EXPLICITE : le marqueur précède directement la dimension
// (« par statut », « chaque ingénieur », « per engineer », « по статусам »).
const EXPLICIT_DISTRIBUTIVE_BEFORE = /(?:\b(?:par|chaque|pour chaque|per|by|each|every)|(?:^|\s)по|кажд\S*)\s+(?:l'|le |la |les |the )?$/;

const DAY_MS = 86400000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Périodes FR/EN/RU → { key, from, to } (dates ISO).
function extractPeriod(t, now) {
  const today = startOfDay(now);
  const iso = (d) => d.toISOString();
  const lastN = t.match(/\b(?:les|ces) (\d{1,3}) derniers jours\b|\blast (\d{1,3}) days\b|за последние (\d{1,3}) (?:дн|сут)/);
  if (lastN) {
    const days = Number(lastN[1] || lastN[2] || lastN[3]);
    return { key: "last_n_days", days, from: iso(new Date(today.getTime() - days * DAY_MS)), to: iso(now) };
  }
  if (/\bce mois(?:[- ]ci)?\b|\bthis month\b|в этом месяце|за этот месяц|текущ\S* месяц/.test(t)) {
    return { key: "this_month", from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(now) };
  }
  if (/\ble mois dernier\b|\blast month\b|в прошлом месяце|за прошлый месяц/.test(t)) {
    return { key: "last_month", from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: iso(new Date(new Date(today.getFullYear(), today.getMonth(), 1).getTime() - 1)) };
  }
  if (/\bcette annee\b|\bthis year\b|в этом году|за этот год|текущ\S* год/.test(t)) {
    return { key: "this_year", from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(now) };
  }
  if (/\bl'?annee derniere\b|\blast year\b|в прошлом году|за прошлый год/.test(t)) {
    return { key: "last_year", from: iso(new Date(today.getFullYear() - 1, 0, 1)), to: iso(new Date(new Date(today.getFullYear(), 0, 1).getTime() - 1)) };
  }
  if (/\bcette semaine\b|\bthis week\b|на этой неделе/.test(t)) {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { key: "this_week", from: iso(monday), to: iso(now) };
  }
  if (/\bla semaine derniere\b|\blast week\b|на прошлой неделе/.test(t)) {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { key: "last_week", from: iso(new Date(monday.getTime() - 7 * DAY_MS)), to: iso(new Date(monday.getTime() - 1)) };
  }
  if (/\baujourd'?hui\b|\btoday\b|сегодня/.test(t)) return { key: "today", from: iso(today), to: iso(now) };
  return null;
}

function extractLimit(t) {
  const m =
    t.match(/\btop\s*(\d{1,2})\b/) ||
    t.match(/\b(?:les|the)\s+(\d{1,2})\s/) ||
    t.match(/\b(\d{1,2})\s+(?:premiers|premieres|meilleurs|ingenieurs|commerciaux|clients|machines|operateurs|engineers|customers|salespeople)\b/) ||
    t.match(/(?:^|\s)(\d{1,2})\s+(?:инженер|клиент|менеджер|машин|оператор)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 50 ? n : null;
}

function normalize(text) {
  // Minuscules + accents latins retirés ; le cyrillique est conservé tel quel
  // (une décomposition NFD casserait « й »).
  return foldLatin(text).replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
}

function resolveDomain(dimension, t) {
  const found = DOMAINS.filter((d) => d.re.test(t)).map((d) => d.key);
  if (dimension && dimension.domain) return dimension.domain;
  if (dimension && dimension.key === "client") {
    // « quelle société a le plus de contacts » : non couvert (le client est
    // une dimension des projets) → routage habituel.
    if (!found.includes("project") && (found.includes("contact") || found.includes("relance"))) return null;
    return "project";
  }
  if (dimension && dimension.key === "owner") {
    if (found.includes("project")) return "project";
    if (found.includes("relance")) return "relance";
    if (found.includes("contact")) return "contact";
    return "project";
  }
  if (found.includes("project")) return "project";
  return found[0] || null;
}

// Dimensions admises par domaine (clé canonique du Tool correspondant).
const DOMAIN_DIMENSIONS = {
  project: { engineer: "engineer", owner: "owner", status: "status", client: "client", product_family: "product_family", month: "month" },
  contact: { owner: "commercial", status: "status", month: "month" },
  relance: { owner: "commercial", status: "status", month: "month" },
  industrial: { machine: "machine", module: "module", operator: "operator", month: "month", status: "status" },
};

// ── Ingénieurs (intention `engineers`) ────────────────────────────────────
// Entité = le concept « ingénieur » (FR/EN/RU) ; opération = « list » dès
// qu'il y a un signal de consultation (verbe, question, « existent »,
// « disponibles » — qui signifie ici « référencés », aucun statut de
// disponibilité n'existant dans la table `engineers`).
// Normalisation sémantique : ingénieur(e)(s), engineer(s), инженер(ы/а/ов…)
// désignent tous l'entité « engineer ».
const ENGINEER_WORD = /\bingenieure?s?\b|\bengineers?\b|\bresponsables? techniques?\b|(?:^|[^а-яё])инженер/;
// « Afficher les suivants », « suite », « show more », « next », « ещё » :
// page suivante de la liste en cours.
const NEXT_PAGE = /^(?:(?:affiche[rz]?|montre[rz]?|voir|donne[rz]?(?:[- ]moi)?)\s+)?(?:les\s+|la\s+)?(?:suivante?s?|suite|plus|autres)\s*[?.!]*$|^afficher (?:plus|la suite)\s*[?.!]*$|^(?:show |see |give me )?(?:more|next|the next ones|next page)\s*[?.!]*$|^(?:далее|ещё|еще|дальше|следующие|показать (?:ещё|еще|следующие|дальше))\s*[?.!]*$/;
const HOW_TO = /\bcomment\b|\bhow (?:do|can|to|should)\b|\bexplique|(?:^|\s)как(?=\s)/;
const LIST_SIGNAL =
  /\b(?:liste[rsz]?|donne[rsz]?|montre[rsz]?|affiche[rsz]?|voir|consulter|veux|voudrais|souhaite|show|give|display|get|list|see|want|need|quels?|quelles?|qui sont|qui est|which|who|what|existe(?:nt)?|exist(?:s|ing)?|disponibles?|available|registered|references?)\b|покажи|перечисли|список|выведи|дай|какие|какой|кто|есть|доступн|хочу|нужн/;
const PROJECT_REFERENCE = [
  /\b(?:sur|du|au|pour|de|dans)\s+(?:le\s+|ce\s+)?projet\s+["«“]?\s*(.+?)\s*["»”]?\s*[?.!]*$/i,
  /\b(?:on|of|for|in)\s+(?:the\s+|this\s+)?project\s+["“]?\s*(.+?)\s*["”]?\s*[?.!]*$/i,
  /(?:над\s+проектом|по\s+проекту|проекта|проекте)\s+["«“]?\s*(.+?)\s*["»”]?\s*[?.!]*$/i,
];

/**
 * `undefined` : pas une question sur les ingénieurs (suite du parseur) ;
 * `null` : question sur les ingénieurs laissée à l'analytique ou au routage
 * habituel ; sinon la requête `engineers`.
 */
function parseEngineerRequest(t, raw, language) {
  if (!ENGINEER_WORD.test(t)) return undefined;
  if (HOW_TO.test(t)) return null; // « Comment affecter un ingénieur ? » → documentation
  if (MAX.test(t) || MIN.test(t) || RANKING.test(t) || AVERAGE.test(t) || COUNT.test(t) || BREAKDOWN.test(t)) return undefined;
  if (/(?:\b(?:par|chaque|per|each|every)\b|кажд)\s+\S*(?:ingenieur|engineer|инженер)/.test(t)) return undefined;

  for (const re of PROJECT_REFERENCE) {
    const m = raw.match(re);
    const name = m && m[1].trim();
    if (name && !/^(?:mes|mon|ma|nos|ces|les|my|our|these|the|мои|моих|наши)\b/i.test(name)) {
      return { language, domain: "engineer", groupBy: null, aggregation: null, operation: "of_project", projectName: name.slice(0, 200), limit: null, filters: {}, mine: false };
    }
  }
  // Les PROJETS sont le sujet (« Quels ingénieurs travaillent sur mes
  // projets ? » → répartition par ingénieur dans le périmètre ; « Quels projets
  // ont une date limite ingénieur proche ? » → projets) : routage existant.
  if (/\bprojets?\b|\bprojects?\b|проект/.test(t)) return undefined;
  // Groupe nominal seul (« ingénieurs », « les ingénieures », « инженеры ») :
  // c'est la liste qui est demandée — jamais une clarification, jamais la
  // fiche de la personne dont on parlait juste avant.
  const bareNounPhrase = t.replace(/[?.!]+$/, "").trim().split(" ").length <= 3;
  if (!LIST_SIGNAL.test(t) && !bareNounPhrase) return null;
  return { language, domain: "engineer", groupBy: null, aggregation: null, operation: "list", limit: null, filters: {}, mine: false };
}

const RANKING_OPERATIONS = new Set(["max", "min", "top", "average"]);
const OVERRIDABLE_INTENTS = new Set(["projects", "commercial_contacts", "industrial"]);
const UNCOVERED_DIMENSIONS = new Set(["engineer", "machine", "operator"]);

class AnalyticsQueryParser {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
  }

  /** Langue du message (fr/en/ru), pour les réponses hors requête comprise. */
  languageOf(message) {
    return detectLanguage(message).language;
  }

  /** « Afficher les suivants » : page suivante d'une liste déjà affichée. */
  isNextPage(message) {
    return NEXT_PAGE.test(normalize(message));
  }

  /** `true` si la question relève de l'analytique CRM. */
  detect(message) {
    return this.parse(message) !== null;
  }

  /**
   * Faut-il router vers l'analytique alors que la détection lexicale a déjà
   * trouvé \`currentIntent\` ? Oui pour general_chat (question non reconnue :
   * cas signalé, EN/RU). Pour une intention métier précise, uniquement un
   * vrai classement ou une répartition explicite que ses Agents ne savent
   * pas calculer — les totaux (« combien de … ») restent à l'Agent existant.
   */
  shouldRoute(query, currentIntent) {
    if (!query) return false;
    // Ingénieurs : entité EXPLICITE + opération évidente (liste, ingénieur
    // d'un projet) → exécution directe, quelle que soit l'intention détectée
    // (y compris celle héritée d'un sujet précédent de la conversation) :
    // aucune intention existante ne sait y répondre.
    if (query.domain === "engineer") return true;
    if (currentIntent === "general_chat") return true;
    if (!OVERRIDABLE_INTENTS.has(currentIntent)) return false;
    // CommercialAgent répond à toute question contenant « relance » par la
    // liste des contacts « à rappeler » : ni un nombre de relances, ni les
    // contacts JAMAIS relancés. Ces deux questions vont donc à l'analytique.
    if (query.operation === "list_without_relance") return true;
    if (query.domain === "relance" && query.operation === "total") return true;
    if (!query.groupBy) return false;
    if (RANKING_OPERATIONS.has(query.operation)) return true;
    if (query.operation !== "distribution" || query.domain === "contact" || query.domain === "relance") return false;
    // Répartition explicite (« par statut », « chaque ingénieur ») ou
    // dimension qu'aucun Agent existant ne sait lister (ingénieurs, machines,
    // opérateurs : « Quels ingénieurs travaillent sur mes projets ? »).
    return query.explicitDistribution || UNCOVERED_DIMENSIONS.has(query.groupBy);
  }

  /**
   * @returns {null | { language, domain, groupBy, aggregation, operation, limit,
   *   filters: { productFamily, module, statut, period, includeArchived }, mine }}
   */
  parse(message) {
    const raw = String(message || "");
    if (!raw.trim()) return null;
    const t = normalize(raw);
    if (POR_PROMESH.test(t)) return null;
    const now = this.now();
    const { language } = detectLanguage(raw);

    // Ingénieurs : liste, ou ingénieur d'un projet précis (intention
    // `engineers`) — avant l'analytique, qui garde les comptages/classements
    // et « les ingénieurs de mes projets » (répartition dans le périmètre).
    const engineerRequest = parseEngineerRequest(t, raw, language);
    if (engineerRequest !== undefined) return engineerRequest;

    const dimension = DIMENSIONS.find((d) => d.re.test(t)) || null;
    // « Quels contacts n'ont pas été relancés ? » : contacts JAMAIS relancés,
    // avant que le mot « relancés » ne fasse choisir le domaine des relances.
    const contactsWithoutRelance = !dimension && /\bcontacts?\b|\bprospects?\b|контакт/.test(t) && NOT_FOLLOWED_UP.test(t);
    const domain = contactsWithoutRelance ? "contact" : resolveDomain(dimension, t);
    if (!domain) return null;

    const isMax = MAX.test(t);
    const isMin = MIN.test(t);
    const isRanking = RANKING.test(t);
    const isAverage = AVERAGE.test(t);
    const isCount = COUNT.test(t);
    const limit = extractLimit(t);

    let operation = null;
    let groupBy = null;
    let explicitDistribution = false;
    if (dimension) {
      groupBy = (DOMAIN_DIMENSIONS[domain] || {})[dimension.key] || null;
      if (!groupBy) return null;
      const plural = dimension.plural.test(t);
      const at = t.search(dimension.re);
      explicitDistribution = at > 0 && EXPLICIT_DISTRIBUTIVE_BEFORE.test(t.slice(Math.max(0, at - 16), at));
      const distributive = DISTRIBUTIVE.test(t) || BREAKDOWN.test(t);
      const listQuestion = WHICH_PLURAL.test(t) && plural;
      if (isMin) operation = "min";
      else if (isRanking || limit) operation = "top";
      else if (isMax) operation = plural && !SINGLE_ANSWER.test(t) ? "top" : "max";
      else if (isAverage) operation = "average";
      else if (distributive || listQuestion || (isCount && plural)) operation = "distribution";
      if (!operation) return null;
    } else if (contactsWithoutRelance) {
      operation = "list_without_relance";
    } else if (isCount && !isMax && !isMin) {
      operation = "total";
    } else {
      return null;
    }

    const filters = { productFamily: null, module: null, statut: null, period: extractPeriod(t, now), includeArchived: !EXCLUDE_ARCHIVED.test(t) };
    if (domain === "industrial") {
      if (/\bprobar\b|пробар/.test(t)) filters.module = "probar";
      else if (/\bmelange\b|\bmixture\b|смес/.test(t)) filters.module = "melange";
      else if (/\bmaintenance\b|техобслуж/.test(t)) filters.module = "maintenance";
    } else if (domain === "project") {
      if (/\bprobar\b|пробар/.test(t)) filters.productFamily = "PROBAR";
      else if (/\bpromesh\b|промеш/.test(t)) filters.productFamily = "PROMESH";
      if (groupBy !== "status") {
        const fr = extractEntities(raw, { now }).status;
        const synonym = PROJECT_STATUS_SYNONYMS.find((s) => s.re.test(t));
        filters.statut = fr || (synonym ? synonym.value : null);
      }
    }

    return {
      language,
      domain,
      groupBy,
      aggregation: "count",
      operation,
      // Vrai classement (max, min, top, moyenne) ou répartition explicite :
      // voir AIManager, seuls ces cas remplacent une intention déjà précise.
      explicitDistribution,
      limit: operation === "top" ? limit || 5 : limit,
      filters,
      mine: MINE.test(t),
    };
  }

  /**
   * Question de DONNÉES CRM que le parseur ne sait pas (encore) traiter —
   * servie par une réponse honnête plutôt que par la documentation.
   */
  looksLikeCrmDataQuestion(message) {
    const t = normalize(message);
    const signal = MAX.test(t) || MIN.test(t) || RANKING.test(t) || AVERAGE.test(t) || COUNT.test(t);
    if (!signal) return false;
    const crmNoun =
      DOMAINS.some((d) => d.re.test(t)) ||
      DIMENSIONS.some((d) => d.re.test(t)) ||
      /\bdevis\b|\bquotes?\b|\bcommandes?\b|\borders?\b|\bfactures?\b|\binvoices?\b|\bopportunit|\binterventions?\b|\bdemandes?\b|\butilisateurs?\b|\busers?\b|\barchitectes?\b|\barchitects?\b|смет|заказ|счет|сдел(?:к|ок)|пользоват/.test(t);
    return crmNoun;
  }
}

module.exports = { AnalyticsQueryParser, normalizeAnalyticsText: normalize, extractPeriod };
