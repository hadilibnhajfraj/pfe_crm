"use strict";

const { detectLanguage, foldLatin } = require("../language/languageDetector");
const { EntityNormalizer, correctEntityTypos } = require("./entityNormalizer");
const { detectProjectListRequest } = require("../reasoning/projectListRequest");
const { detectContactStatusRequest } = require("../reasoning/contactStatusRequest");

const entityNormalizer = new EntityNormalizer();
// Listes servies directement par un Tool de lecture ; les autres entités ont
// déjà un Agent (projets, contacts, demandes RH / maintenance, ingénieurs).
const DIRECT_LIST_ENTITIES = new Set(["company", "machine", "promoter"]);

/**
 * # QueryRouter — une personne, une société ou un promoteur PRÉCIS (FR/EN/RU)
 *
 * Décide, pour une question qui désigne UNE entité nommée (ou reprise du
 * contexte : « cet ingénieur », « ses projets », « this company »), de quelle
 * source elle relève :
 *
 *   « Zakariah Derbel donne-moi plus de détails sur cet ingénieur »
 *   → { source: "crm_and_web", entity: "engineer", operation: "details", target: "Zakariah Derbel" }
 *   « Quels sont les projets de Zakariah Derbel ? »
 *   → { source: "crm", entity: "engineer", operation: "projects", target: "Zakariah Derbel" }
 *   « Donne-moi des informations sur CBI Tunisia »
 *   → { source: "crm_and_web", entity: "unknown", operation: "details", target: "CBI Tunisia" }
 *   « Qui est le promoteur de ce projet ? »
 *   → { source: "crm_and_web", entity: "promoter", operation: "search", project: {…} }
 *
 * Règle centrale : UN NOM PRÉCIS ⇒ `details` (ou `projects`), jamais `list`.
 * `route()` renvoie `null` pour tout le reste — listes, comptages,
 * « l'ingénieur du projet X », questions « comment… » — qui gardent leur
 * routage existant (aucun parcours n'est détourné).
 *
 * Déterministe (aucun modèle de langage) : incapable d'inventer une cible.
 * Le CRM reste l'autorité pour les données internes ; `web` ne sert qu'aux
 * informations publiques.
 */

const ENGINEER = /\bingenieure?s?\b|\bengineers?\b|(?:^|[^а-яё])инженер/;
const ARCHITECT = /\barchitectes?\b|\barchitects?\b|архитектор/;
const THIS_ARCHITECT = /\bcet(?:te)? architecte\b|\bthis architect\b|этого архитектора|этом архитекторе|этот архитектор|этому архитектору/;
const COMPANY = /\b(?:entreprises?|societes?|compagnies?|company|companies|firms?|firmes?)\b|компани|фирм|организаци/;
const PROMOTER = /\bpromoteurs?\b|\bpromoters?\b|\b(?:real[- ]estate |property )?developers?\b|\bqui developpe\b|\bwho (?:is developing|develops|developed|is building)\b|застройщик|девелопер/;
// LES promoteurs (pluriel, ou « liste / tous ») : c'est la liste qui est
// demandée — jamais « le promoteur de quel projet ? ».
const PROMOTERS_PLURAL = /\bpromoteurs\b|\bpromoters\b|\bdevelopers\b|застройщик(?:и|ов|ам|ами|ах)(?![а-яё])|девелопер(?:ы|ов)(?![а-яё])/;
const LIST_WORDS = /\blistes?\b|\btou(?:s|tes)\b|\blist\b|\ball\b|список|(?:^|\s)все(?=\s|$)|перечисл/;
// « les projets DU promoteur X » — pas « le promoteur du projet X ».
const PROJECTS_OF_PROMOTER = /\bprojets?\s+(?:du|de la|de l'|des|d'un|de)\s*(?:promoteur|promotrice)\b|\bprojects?\s+(?:of|by|for|from)\s+(?:the\s+)?(?:developer|promoter)\b|(?:developer|promoter)\s+\S+(?:\s+\S+){0,3}['’]s\s+projects\b|проект\S*\s+застройщика/;
const PROJECT_WORD = /\bprojets?\b|\bprojects?\b|проект/;
// « les projets DE LA société X » — pas « la société du projet X ».
const PROJECTS_OF_COMPANY = /\bprojets?\s+(?:de la|de l'|des|d'une|de)\s*(?:societe|entreprise|compagnie)\b|\bprojects?\s+(?:of|by|for|from)\s+(?:the\s+)?(?:company|firm)\b|проект\S*\s+(?:компании|фирмы)/;
// « les projets DE quelqu'un » (pluriel) — jamais « l'ingénieur du projet X ».
const PROJECTS_OF = /\bprojets\s+(?:de\b|d'|du\b|des\b)|\bprojects\s+(?:of|by|for)\b|['’]s\s+projects\b|(?:^|\s)проекты(?=\s|$|[?.!,])/;
const PROJECT_NAME = [
  /\b(?:sur|du|au|pour|de|dans)\s+(?:le\s+)?projet\s+["«“]?\s*([^"»”?.!]+?)\s*["»”]?\s*[?.!]*$/i,
  /\b(?:on|of|for|in|behind)\s+(?:the\s+)?project\s+["“]?\s*([^"”?.!]+?)\s*["”]?\s*[?.!]*$/i,
  /(?:проекта|проекту|проекте|проектом)\s+["«“]?\s*([^"»”?.!]+?)\s*["»”]?\s*[?.!]*$/i,
];
const THIS_PROJECT = /\bce projet\b|\bdu projet\b|\bthis project\b|\bthe project\b|этого проекта|этот проект|этом проекте|данн\S* проект/;

const DETAILS =
  /\bdetails?\b|\binformations?\b|\binfos?\b|\bactualites?\b|\bnouvelles\b|\bnews\b|новост|\brenseignements?\b|\bprofil\b|\bqui est\b|\bparle[- ]moi\b|\bpresente\b|\ben savoir plus\b|\bprofile\b|\btell me\b|\bwho is\b|\babout\b|информаци|подробн|расскаж|кто так|кто это|сведени/;
const WHO_IS = /\bqui est\b|\bwho is\b|\bwho's\b|кто так(?:ой|ая)|кто это/;
const ABOUT_NAME = /\b(?:sur|concernant|a propos de|about|regarding)\b|(?:^|\s)(?:о|об|про)\s/;
const ACTIVITIES = /\bactivites?\b|\bsecteurs?\b|\bactivities\b|\bsector\b|\bwhat does\b.*\bdo\b|\bque fait\b|деятельност|чем занима/;
// « informations publiques sur X », « sur le Web », « sur Internet » : la
// recherche Web seule est demandée.
const PUBLIC_ONLY = /\bpubli(?:c|que|ques|cs)\b|\bsur (?:le |l')?(?:web|internet|google)\b|\bon(?:line| the web| the internet| google)\b|\ben ligne\b|публичн|в интернете|в сети/;
// Actualité : par nature absente du CRM — recherche Web seule.
const NEWS = /\bdernieres? (?:informations?|nouvelles|actualites?)\b|\bactualites?\b|\bnouvelles\b|\blatest\b|\brecent news\b|\bnews\b|последни\S* (?:новост|информаци|сведени)|новост/;
// Commande explicite : « Recherche sur le Web : X », « search the web for X ».
const WEB_COMMAND = /\b(?:recherche[rz]?|cherche[rz]?|trouve[rz]?)\b.{0,25}\b(?:sur|dans) (?:le |l')?(?:web|internet|google)\b|\bsearch (?:the )?(?:web|internet|online)\b|\bweb search\b|\bgoogle\b.{0,10}\b(?:for|sur)\b|(?:найди|поищи|поиск)\S*\s+в (?:интернете|сети)/;
const HOW_TO = /\bcomment\b|\bhow (?:do|can|to|should)\b|\bexplique|(?:^|\s)как(?=\s)/;
// Comptages et classements : analytique CRM, jamais une fiche.
const ANALYTIC = /\ble plus\b|\ble moins\b|\bmost\b|\bleast\b|\bcombien\b|\bhow many\b|\bnombre\b|\bnumber of\b|\bclassement\b|\branking\b|\btop\b|\bmoyen|\baverage\b|сколько|больше всего|меньше всего|рейтинг|количеств/;
const ENGINEER_OF_PROJECT = /\baffect|\bassigned\b|\bresponsable du projet\b|назначен/;

// Sociétés + projets : « avec leurs projets » (vue), « sans projet » / « qui ont des projets » (filtre).
const WITH_THEIR_PROJECTS = /\b(?:avec|et|ainsi que|plus) (?:leurs?|les|ses) projets?\b|\b(?:and|with|plus) (?:their|the|its) projects?\b|\bprojets? (?:de chacune|de chaque (?:societe|entreprise))\b|(?:и|с) (?:их|её|ее) проект|с проектами/;
const WITHOUT_PROJECTS = /\bsans (?:aucun )?projets?\b|\b(?:n'? ?ont|n'? ?a|ont|a) (?:aucun|pas de|pas encore de) projets?\b|\baucun projet\b|\bwithout (?:any )?projects?\b|\b(?:with|have|has|having) no projects?\b|без проект/;
const HAVING_PROJECTS = /\b(?:qui ont|ayant|avec|possedant) (?:des|au moins un|un ou plusieurs|un) projets?\b|\b(?:that|which|who) have (?:a |some )?projects?\b|\b(?:with|having) (?:at least one |some |a )?projects?\b|у которых есть проект/;
const COUNT_WORD = /\bcombien\b|\bnombre\b|\bhow many\b|\bnumber of\b|сколько|количеств/;
// « projets associés à X », « projects linked to X » : X est une personne ou une société.
const PROJECTS_LINKED_TO = /\bprojets?\b.{0,30}\b(?:associes?|lies?|rattaches?|relies?)\s+(?:a|au|aux|avec)\b|\bprojects?\b.{0,30}\b(?:associated|linked|related|tied)\s+(?:to|with)\b|проект\S*.{0,20}(?:связан|относ)/;
// LES sociétés (pluriel), sans nom : c'est la liste — jamais « de quelle société ? ».
const COMPANIES_PLURAL = /\b(?:societes|entreprises|compagnies|companies|firms|firmes)\b|компани(?:и|й|ях|ям)(?![а-яё])|фирм(?:ы|ах)?(?![а-яё])/;
// RECHERCHE par nom : « Recherche la société X », « find company X ».
const SEARCH_VERB = /\b(?:recherche[rz]?|cherche[rz]?|trouve[rz]?|retrouve[rz]?|search(?: for)?|find|look ?up)\b|найди|найти|поищи|ищу/;
const NAME_AFTER_ENTITY = /(?:soci[eé]t[eé]s?|entreprises?|compagnies?|company|companies|firm|firme|ing[eé]nieure?s?|engineers?|architectes?|architects?|компани[юия]|фирм[уаы]|инженера?|архитектора?)\s+(?:nomm[eé]e?\s+|appel[eé]e?\s+|named\s+|called\s+)?["«“]?\s*([^"»”?.!]{2,60}?)\s*["»”]?\s*[?.!]*$/i;

const THIS_ENGINEER = /\bcet(?:te)? ingenieure?\b|\bthis engineer\b|этого инженера|этом инженере|этот инженер|этому инженеру/;
const THIS_COMPANY = /\bcette (?:entreprise|societe|compagnie)\b|\bthis (?:company|firm)\b|этой компани|эта компани|эту компани|этой фирм/;
const THIS_PERSON = /\bcette personne\b|\bthis person\b|\bsur lui\b|\bsur elle\b|\babout (?:him|her|them)\b|этом человеке|этого человека|(?:^|\s)о н[её]м(?=\s|$|[?.!,])|(?:^|\s)о ней(?=\s|$|[?.!,])/;
const POSSESSIVE = /\b(?:ses|son|sa|leurs?)\b|\b(?:his|her|their|its)\b|(?:^|\s)(?:его|её|ее|их)(?=\s|$|[?.!,])/;

const PRONOUN = /\b(?:il|elle|lui)\b|-t-(?:il|elle)\b|\b(?:he|she|him)\b|(?:^|\s)(?:он|она)(?=\s|$|[?.!,])|у (?:него|неё|нее)/;

// Champ précis demandé (« son téléphone », « où travaille-t-il ? ») → clé de la
// fiche CRM. L'ordre compte : « dernière action » avant « action ».
const FIELD_PATTERNS = [
  ["phone", /\btelephone\b|\btel\b|\bnumero\b|\bmobile\b|\bportable\b|\bphone\b|телефон|номер/],
  ["email", /\be-?mail\b|\bcourriel\b|\bmail\b|почт|имейл/],
  ["address", /\badresse\b|\blocalisation\b|\baddress\b|\blocation\b|\bou habite|адрес/],
  ["company", /\bsociete\b|\bentreprise\b|\bemployeur\b|\bcompany\b|\bemployer\b|\bou travaille|\btravaille[- ]t[- ]|\bwhere does\b.*\bwork\b|\bworks? (?:for|at)\b|где работает/],
  ["projects", /\bprojets?\b|\bprojects?\b|проект/],
  ["relances", /\brelanc|\bfollow[- ]?ups?\b|\bfollowed up\b|напоминани/],
  ["lastAction", /\bderniere (?:action|interaction|activite)\b|\blast (?:action|interaction|activity)\b|последн\S* (?:действи|взаимодейств)/],
  ["actions", /\bactions?\b|действи/],
  ["status", /\bstatuts?\b|\bstatus\b|статус/],
  ["coordinates", /\bcoordonnees\b|\bcontact (?:details|info(?:rmation)?)\b|контактн/],
];

function detectFields(t) {
  const fields = FIELD_PATTERNS.filter(([, re]) => re.test(t)).map(([key]) => key);
  // « dernière action » ne demande pas aussi le nombre d'actions.
  return fields.includes("lastAction") ? fields.filter((f) => f !== "actions") : fields;
}

// Mots qui portent une majuscule sans être un nom propre recherché : débuts de
// phrase, mots-outils, noms d'entité, noms du produit.
const NOT_A_NAME = new Set(
  (
    "donne donnez montre montrez affiche affichez liste lister listez cherche recherche trouve dis dites parle parlez presente qui que quoi quel quelle quels quelles " +
    "est sont je j tu il elle nous vous peux pouvez peut et ou mais donc avec pour sur dans plus moi svp stp merci bonjour bonsoir salut " +
    "show give tell who what which where when list find search get can could would please and or but the a an is are do does i me my more about for on in of hello hi thanks " +
    "дайте дай покажи покажите кто что какой какая какие расскажи расскажите найди найдите мне и а или о об про больше пожалуйста привет " +
    "crm web google internet linkedin probar promesh assistant copilot recherche rechercher cherche search найди поиск " +
    "architecte architectes architect architects архитектор архитектора архитекторе архитекторы " +
    "promoters promotrice ingenieur ingenieurs ingenieure ingenieures engineer engineers entreprise entreprises societe societes compagnie company companies firm promoteur promoteurs developer developers " +
    "projet projets project projects details detail informations information infos info profil profile " +
    "telephone tel email mail adresse coordonnees phone address statut status contact contacts client clients " +
    "телефон адрес почта статус контакт " +
    "инженер инженера инженере инженеры компания компании компанию фирма застройщик застройщика проект проекта проекты информацию информация информации"
  ).split(" ")
);
// Particules admises À L'INTÉRIEUR d'un nom (« Ahmed Ben Ali », « Société de Construction »).
const NAME_PARTICLES = new Set(["de", "du", "des", "la", "le", "el", "al", "ben", "bin", "bou", "abu", "abou", "van", "von", "di", "da", "&", "et", "and"]);
const DETERMINERS = /^(?:le|la|les|l'|un|une|des|ce|cet|cette|ces|mes|mon|ma|nos|the|this|that|these|my|our|a|an|этот|эта|этой|этого|этом)\b/i;
const VERB_AFTER_NAME = /^(.+?)\s+(?:donne|donnez|montre|montrez|affiche|dis|give|show|tell|покажи|дай|дайте)\b/i;

function fold(word) {
  return foldLatin(word).replace(/[^a-zа-яё0-9&]/g, "");
}

function stripEdges(token) {
  return token.replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}]+$/gu, "").replace(/['’]s$/i, "");
}

function isProperToken(token) {
  if (token.length < 2) return false;
  if (!/^(?:\d+[A-ZÀ-Ý]|[A-ZÀ-ÝА-ЯЁ])/.test(token)) return false;
  // Élision (« L'ingénieur », « D'après ») : jamais un nom.
  if (/^[A-Za-zÀ-ÿ]['’]/.test(token)) return false;
  // « Donne-moi », « Dis-moi » : le premier élément décide.
  return !NOT_A_NAME.has(fold(token)) && !NOT_A_NAME.has(fold(token.split(/[-‐]/)[0]));
}

function cleanTarget(text) {
  const target = String(text || "").trim().replace(/\s+/g, " ").replace(/[?.!,;:]+$/, "");
  return target.length >= 2 && target.length <= 80 ? target : null;
}

/**
 * Nom propre désigné par le message : entre guillemets, ou la plus longue
 * suite de mots en majuscule initiale ; à défaut (message tout en minuscules
 * ou tout en majuscules) le nom placé avant le verbe ou après « sur / about / о ».
 */
function extractTarget(raw) {
  const quoted = raw.match(/["«“]\s*([^"»”]{2,80}?)\s*["»”]/);
  if (quoted) return cleanTarget(quoted[1]);

  const tokens = raw.split(/\s+/).map(stripEdges).filter(Boolean);
  const hasCase = /\p{Ll}/u.test(raw) && /\p{Lu}/u.test(raw);
  if (hasCase) {
    let best = null;
    let run = [];
    const flush = () => {
      while (run.length && NAME_PARTICLES.has(run[run.length - 1].toLowerCase())) run.pop();
      if (run.length && (!best || run.length > best.length)) best = run;
      run = [];
    };
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (isProperToken(token)) run.push(token);
      else if (run.length && NAME_PARTICLES.has(token.toLowerCase()) && tokens[i + 1] && isProperToken(tokens[i + 1])) run.push(token);
      else flush();
    }
    flush();
    // Un mot isolé en tête de phrase n'est qu'une majuscule de début de phrase.
    if (best && !(best.length === 1 && tokens[0] === best[0] && tokens.length > 1)) return cleanTarget(best.join(" "));
    if (best && tokens.length === 1) return cleanTarget(best[0]);
  }

  const plain = (candidate) => {
    const words = String(candidate || "").trim().split(/\s+/).map(stripEdges).filter(Boolean);
    if (!words.length || words.length > 4) return null;
    if (DETERMINERS.test(words.join(" ")) || words.some((w) => NOT_A_NAME.has(fold(w)))) return null;
    return cleanTarget(words.join(" "));
  };
  const before = raw.match(VERB_AFTER_NAME);
  if (before && plain(before[1])) return plain(before[1]);
  const after = raw.match(/(?:\b(?:sur|concernant|about|regarding)|(?:^|\s)(?:о|об|про))\s+(.+?)\s*[?.!]*$/i);
  return after ? plain(after[1]) : null;
}

function extractProjectName(raw) {
  for (const re of PROJECT_NAME) {
    const m = raw.match(re);
    const name = m && cleanTarget(m[1]);
    if (name && !DETERMINERS.test(name)) return name.slice(0, 200);
  }
  return null;
}

const FOCUS_TYPES = new Set(["engineer", "architect", "company", "person", "contact"]);
// Intentions qu'une question « Qui est X ? » / « informations sur X » sans mot
// d'entité peut remplacer : uniquement celles où rien de précis n'a été reconnu.
const UNROUTED_INTENTS = new Set(["general_chat", "documentation_question", "engineers", "entity_lookup"]);
// Intentions métier qu'un nom de PERSONNE connue du CRM peut remplacer —
// vérifié dans le CRM par l'appelant (« informations de X » : X est-il un
// projet ou une personne ?).
const PROBED_INTENTS = new Set(["projects", "commercial_contacts", "crm_analytics"]);
const PROJECTS_OF_NAME_INTENTS = new Set(["general_chat", "documentation_question", "engineers", "projects", "crm_analytics"]);

class QueryRouter {
  /**
   * @param {string} message
   * @param {{ focus?: {type, id, name}|null, currentProject?: {id, name}|null }} context
   * @returns {null | { language, source: "crm"|"web"|"crm_and_web"|"clarification", entity, operation,
   *   target, targetId, project, crmSearch, webSearch, fromContext, onlyIfUnrouted, requiresEngineerMatch, clarification }}
   */
  route(message, context = {}) {
    const route = this._route(message, context);
    if (route) return route;
    const corrected = correctEntityTypos(String(message || ""));
    return corrected === String(message || "") ? null : this._route(corrected, context);
  }

  _route(message, { focus = null, currentProject = null } = {}) {
    const raw = String(message || "").trim();
    if (!raw || raw.length > 400) return null;
    const t = foldLatin(raw).replace(/[’`]/g, "'").replace(/\s+/g, " ");
    const { language } = detectLanguage(raw);
    const knownFocus = focus && FOCUS_TYPES.has(focus.type) && focus.name ? focus : null;

    const build = (fields) => {
      const source = fields.source;
      return {
        language,
        entity: "unknown",
        operation: "details",
        target: null,
        targetId: null,
        project: null,
        fromContext: false,
        fields: [],
        delegateIntent: null,
        onlyIfUnrouted: false,
        requiresEngineerMatch: false,
        requiresKnownEntity: false,
        clarification: null,
        ...fields,
        // CRM_ONLY | WEB_ONLY | CRM_AND_WEB | CLARIFICATION
        mode: { crm: "CRM_ONLY", web: "WEB_ONLY", crm_and_web: "CRM_AND_WEB", clarification: "CLARIFICATION" }[source],
        crmSearch: source === "crm" || source === "crm_and_web",
        webSearch: source === "web" || source === "crm_and_web",
      };
    };
    const clarify = (entity, key) => build({ source: "clarification", entity, clarification: key });
    const fromFocus = (fields) => build({ target: knownFocus.name, targetId: knownFocus.id || null, fromContext: true, ...fields });

    if (HOW_TO.test(t)) return null;

    // ── « liste des X », « tous les X », « X » : ENTITÉ.list ────────────────
    // Entité explicite + liste simple → exécution directe, jamais une
    // clarification, jamais le sujet de la conversation précédente.
    const list = entityNormalizer.detectList(raw);
    if (list && DIRECT_LIST_ENTITIES.has(list.entity)) return build({ source: "crm", entity: list.entity, operation: "list" });
    // Liste déjà servie par un Agent existant : on lui confie la demande si
    // rien de précis n'a été reconnu (« list all projects », « покажи все проекты »).
    if (list && list.intent && list.entity !== "engineer") {
      return build({ source: "crm", entity: list.entity, operation: "list", delegateIntent: list.intent });
    }
    // Analyse de l'ensemble des projets (« Analyze my projects », « Проанализируй
    // мои проекты ») : même Agent que la liste, qui lit toutes les pages.
    const projectRequest = detectProjectListRequest(raw);
    if (projectRequest && projectRequest.kind === "analysis") {
      return build({ source: "crm", entity: "project", operation: "analyze", delegateIntent: "projects" });
    }

    // Contacts commerciaux d'un statut (« contacts refusés », « projets dont le
    // client est refusé ») : l'Agent commercial, y compris quand le mot
    // « projet » a fait classer la demande ailleurs.
    const statusRequest = detectContactStatusRequest(raw);
    if (statusRequest) {
      return build({ source: "crm", entity: "contact", operation: statusRequest.operation, delegateIntent: "commercial_contacts", overrideIntents: statusRequest.operation === "projects" ? ["projects", "crm_analytics"] : [] });
    }

    // « Résume mon activité commerciale », « my sales activity » : l'Agent
    // commercial (qui applique le périmètre de l'utilisateur), si rien de plus
    // précis n'a été reconnu.
    if (/\b(?:mon|ma|mes|notre)\b.{0,20}\bactivites? commerciales?\b|\bmy (?:sales|commercial) activity\b|мо\S+ коммерческ\S+ деятельност/.test(t)) {
      return build({ source: "crm", entity: "contact", operation: "analyze", delegateIntent: "commercial_contacts" });
    }

    // ── Sociétés : compter, filtrer, lister avec leurs projets ─────────────
    // Aucune société nommée ; les projets ne sont mentionnés que comme
    // complément (« avec leurs projets ») ou comme critère (« sans projet »).
    if (COMPANY.test(t) && !THIS_COMPANY.test(t) && !PROMOTER.test(t) && !ENGINEER.test(t) && !extractTarget(raw)) {
      const filter = WITHOUT_PROJECTS.test(t) ? "without_projects" : !WITH_THEIR_PROJECTS.test(t) && HAVING_PROJECTS.test(t) ? "with_projects" : null;
      const mentionsProjects = PROJECT_WORD.test(t);
      if (COUNT_WORD.test(t) && (!mentionsProjects || filter)) return build({ source: "crm", entity: "company", operation: "count", ...(filter ? { filter } : {}) });
      if (!ANALYTIC.test(t)) {
        if (filter) return build({ source: "crm", entity: "company", operation: "list", filter });
        if (mentionsProjects && WITH_THEIR_PROJECTS.test(t)) return build({ source: "crm", entity: "company", operation: "list", view: "projects" });
      }
    }

    // ── Promoteur d'un projet ──────────────────────────────────────────────
    if (PROMOTER.test(t)) {
      // « Donne-moi les projets du promoteur Alpha » → promoter.projects.
      if (PROJECTS_OF_PROMOTER.test(t)) {
        const promoterName = extractTarget(raw);
        if (promoterName) return build({ source: "crm", entity: "promoter", operation: "projects", target: promoterName });
      }
      // « liste des promoteurs », « tous les promoteurs », « promoteurs » →
      // promoter.list : nouvelle demande, sans cible, quel que soit le projet
      // ouvert ou la question précédente.
      const namesProject = Boolean(extractProjectName(raw)) || THIS_PROJECT.test(t);
      // Un comptage (« combien de promoteurs ? ») reçoit aussi la liste : elle
      // porte le total et le nombre de projets de chacun.
      if (!namesProject && (PROMOTERS_PLURAL.test(t) || LIST_WORDS.test(t) || ANALYTIC.test(t))) {
        return build({ source: "crm", entity: "promoter", operation: "list" });
      }
      const projectName = extractProjectName(raw);
      if (projectName) return build({ source: "crm_and_web", entity: "promoter", operation: "search", project: { id: null, name: projectName } });
      if (currentProject && (currentProject.id || currentProject.name)) {
        return build({ source: "crm_and_web", entity: "promoter", operation: "search", fromContext: true, project: { id: currentProject.id || null, name: currentProject.name || null } });
      }
      const target = extractTarget(raw);
      // « Informations sur le promoteur X » : la société elle-même.
      if (target && !THIS_PROJECT.test(t)) return build({ source: "crm_and_web", entity: "company", target });
      return clarify("promoter", "whichProject");
    }

    let target = extractTarget(raw);
    const fields = detectFields(t);
    // « recherche la société soroubat » (sans majuscule) : le nom suit le mot d'entité.
    const searching = SEARCH_VERB.test(t) && !WEB_COMMAND.test(t);
    if (!target && searching) {
      const tail = raw.match(NAME_AFTER_ENTITY);
      const words = tail ? tail[1].trim().split(/\s+/) : [];
      if (words.length >= 1 && words.length <= 5 && !DETERMINERS.test(tail[1].trim()) && !words.some((w) => NOT_A_NAME.has(fold(w)))) target = cleanTarget(tail[1]);
    }

    // ── Question de suivi sur la personne dont on parle ─────────────────────
    // « Quel est son téléphone ? », « Où travaille-t-il ? », « Combien de
    // relances a-t-il ? », « Et ses projets ? » : jamais « de qui parlez-vous ? ».
    const refersToFocus = (POSSESSIVE.test(t) || PRONOUN.test(t) || THIS_PERSON.test(t)) && !THIS_COMPANY.test(t) && !THIS_ENGINEER.test(t);
    if (knownFocus && !target && refersToFocus && t.split(" ").length <= 12) {
      if (fields.length === 1 && fields[0] === "projects") return fromFocus({ source: "crm", entity: knownFocus.type, operation: "projects" });
      if (fields.length) return fromFocus({ source: "crm", entity: knownFocus.type, operation: "field", fields });
      if (ACTIVITIES.test(t)) return fromFocus({ source: "web", entity: knownFocus.type });
      if (DETAILS.test(t)) return fromFocus({ source: "crm_and_web", entity: knownFocus.type });
    }

    // Recherche Web demandée en toutes lettres : Web seul, quel que soit le sujet.
    if (target && WEB_COMMAND.test(t)) return build({ source: "web", entity: "topic", target });

    if (ANALYTIC.test(t)) return null;
    const projectsOf = PROJECTS_OF.test(t);
    const personFields = fields.filter((f) => f !== "projects" && f !== "company");

    // ── Architecte ─────────────────────────────────────────────────────────
    // Un architecte NOMMÉ (ou déjà identifié) : sa fiche ou ses projets.
    // « l'architecte du projet X », « liste des architectes » : routage existant.
    if (ARCHITECT.test(t) && !ENGINEER.test(t)) {
      if (THIS_ARCHITECT.test(t) && knownFocus && knownFocus.type === "architect") {
        return fromFocus({ source: PROJECT_WORD.test(t) ? "crm" : "crm_and_web", entity: "architect", operation: PROJECT_WORD.test(t) ? "projects" : "details" });
      }
      if (target && !(PROJECT_WORD.test(t) && !projectsOf)) {
        if (!projectsOf && personFields.length) return build({ source: "crm", entity: "architect", operation: "field", fields: personFields, target });
        return build({ source: projectsOf ? "crm" : "crm_and_web", entity: "architect", operation: projectsOf ? "projects" : "details", target });
      }
    }

    // ── Ingénieur ──────────────────────────────────────────────────────────
    if (ENGINEER.test(t)) {
      if (PROJECT_WORD.test(t) && !projectsOf && !(POSSESSIVE.test(t) && knownFocus) && !THIS_ENGINEER.test(t)) return null; // « l'ingénieur du projet X »
      if (ENGINEER_OF_PROJECT.test(t) && !target) return null;
      if (target && !projectsOf && personFields.length) return build({ source: "crm", entity: "engineer", operation: "field", fields: personFields, target });
      // « Recherche l'ingénieur X » : recherche par nom dans le CRM seul.
      if (target && searching && !projectsOf) return build({ source: "crm", entity: "engineer", operation: "search", target });
      if (target) return build({ source: projectsOf ? "crm" : "crm_and_web", entity: "engineer", operation: projectsOf ? "projects" : "details", target });
      if (THIS_ENGINEER.test(t)) {
        if (!knownFocus) return clarify("engineer", "whichEngineer");
        return fromFocus({ source: PROJECT_WORD.test(t) ? "crm" : "crm_and_web", entity: "engineer", operation: PROJECT_WORD.test(t) ? "projects" : "details" });
      }
      return null; // liste, « ingénieurs » seul… : routage existant
    }

    // ── Société ────────────────────────────────────────────────────────────
    if (COMPANY.test(t) && PROJECT_WORD.test(t)) {
      if (THIS_COMPANY.test(t)) return knownFocus ? fromFocus({ source: "crm", entity: "company", operation: "projects" }) : clarify("company", "whichCompany");
      if (target && PROJECTS_OF_COMPANY.test(t)) return build({ source: "crm", entity: "company", operation: "projects", target });
    }
    if (COMPANY.test(t) && !(PROJECT_WORD.test(t) && !THIS_COMPANY.test(t))) {
      const wantsInfo = DETAILS.test(t) || ACTIVITIES.test(t) || WHO_IS.test(t);
      // RECHERCHE : « Recherche la société X » → les sociétés du CRM portant ce
      // nom (fiche si une seule, choix si plusieurs), sans recherche Web.
      if (target && searching && !wantsInfo) return build({ source: "crm", entity: "company", operation: "search", target });
      if (target && wantsInfo) return build({ source: ACTIVITIES.test(t) || PUBLIC_ONLY.test(t) || NEWS.test(t) ? "web" : "crm_and_web", entity: "company", target });
      if (THIS_COMPANY.test(t) && wantsInfo) {
        if (!knownFocus) return clarify("company", "whichCompany");
        // Société déjà identifiée dans la conversation : seules les
        // informations publiques restent à chercher.
        return fromFocus({ source: "web", entity: "company" });
      }
      // LISTE : « informations sur les sociétés », « parle-moi des sociétés du
      // CRM », « détails des sociétés » — pluriel sans nom : toutes les sociétés.
      if (!target && !THIS_COMPANY.test(t) && COMPANIES_PLURAL.test(t) && t.split(" ").length <= 14) {
        return build({ source: "crm", entity: "company", operation: "list" });
      }
      return null;
    }

    // ── « Quels projets sont associés à 2M Batiment ? » ─────────────────────
    // Retenu seulement si ce nom est une personne ou une société du CRM
    // (vérifié par l'appelant) ; la fiche trouvée décide du type.
    if (target && !projectsOf && PROJECTS_LINKED_TO.test(t)) {
      return build({ source: "crm", entity: "unknown", operation: "projects", target, requiresKnownEntity: true });
    }

    if (!target || PROJECT_WORD.test(t) !== projectsOf) return null;

    // ── « Quels sont les projets de X ? » (sans le mot ingénieur) ───────────
    // « projets de Hadil » peut aussi désigner un commercial : la route n'est
    // retenue que si X est bien un ingénieur du CRM (vérifié par l'appelant).
    if (projectsOf) return build({ source: "crm", entity: "engineer", operation: "projects", target, requiresEngineerMatch: true });

    // ── « Téléphone de X », « coordonnées de X » : un champ de sa fiche ──────
    if (personFields.length) return build({ source: "crm", entity: "unknown", operation: "field", fields: personFields, target, onlyIfUnrouted: true });

    // ── « Qui est X ? », « infos liées à X », « informations de X » ─────────
    if (WHO_IS.test(t) || DETAILS.test(t)) {
      // « informations publiques sur Zied Hmidi » : le CRM dit d'abord qui
      // c'est (et fournit le contexte de la recherche), le Web complète.
      return build({ source: NEWS.test(t) ? "web" : "crm_and_web", entity: "unknown", target, onlyIfUnrouted: true });
    }

    // ── Le message EST un nom (« Zakariah Derbel ») ─────────────────────────
    const words = raw.replace(/[?.!,;:]+$/, "").trim().split(/\s+/);
    if (words.length >= 2 && words.length <= 5 && words.join(" ") === target) {
      return build({ source: "crm_and_web", entity: "unknown", target, onlyIfUnrouted: true });
    }
    return null;
  }

  /**
   * La route peut-elle remplacer l'intention déjà détectée ?
   * `true` / `false`, ou `"probe"` : seulement si le CRM connaît ce nom
   * (voir AIManager : une personne connue l'emporte sur « projet X »).
   */
  accepts(route, currentIntent) {
    if (!route) return false;
    // Liste confiée à un Agent existant : jamais traitée par l'Agent de fiche.
    if (route.delegateIntent) return false;
    if (route.requiresEngineerMatch) return PROJECTS_OF_NAME_INTENTS.has(currentIntent);
    if (route.requiresKnownEntity) return PROJECTS_OF_NAME_INTENTS.has(currentIntent) ? "known" : false;
    if (route.onlyIfUnrouted) {
      if (UNROUTED_INTENTS.has(currentIntent)) return true;
      return PROBED_INTENTS.has(currentIntent) ? "probe" : false;
    }
    return true;
  }
}

// Des mots sans majuscule forment-ils un nom plausible ? Non dès qu'un mot
// est générique (mot-outil, nom d'entité : « ingénieurs », « les contacts »).
function looksLikeName(words) {
  return words.length > 0 && words.every((w) => /^\p{L}[\p{L}'’.-]+$/u.test(w) && !NOT_A_NAME.has(fold(w)) && !DETERMINERS.test(w));
}

module.exports = { QueryRouter, extractTarget, extractProjectName, detectFields, looksLikeName, UNROUTED_INTENTS };
