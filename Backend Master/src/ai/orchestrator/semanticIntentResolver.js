"use strict";

const { createOrchestratorLogger } = require("./logger");
const { DEFAULT_INTENT_CATALOG } = require("./intentCatalog");
const { tokenize } = require("../utils/tokenize");
const { normalizeAccents } = require("../reasoning/projectStatuses");
const { detectLanguage } = require("../language/languageDetector");

// « Ingénieurs », « Les contacts ? », « Et les machines » : UNIQUEMENT des
// noms d'entité (et des mots outils) — « Ajouter un client » est une action,
// pas une simple mention.
const BARE_MENTION_STOPWORDS = new Set(["le", "la", "les", "des", "du", "de", "l", "d", "un", "une", "et", "sur", "a", "propos", "the", "an", "and", "about", "и", "про", "о", "crm"]);
const ENTITY_NOUN =
  /^(?:ingenieurs?|engineers?|инженер\S*|responsables?|techniques?|contacts?|clients?|projets?|projects?|dossiers?|affaires?|chantiers?|machines?|relances?|fiches?|production|rendez|vous|rdv|reunions?|maintenance|pannes?|conges?|demandes?|rh|documents?|fichiers?|rapports?|pdf)$/i;
function isBareEntityMention(text) {
  const words = String(text || "")
    .split(/[^a-z0-9а-яё]+/i)
    .filter((w) => w && !BARE_MENTION_STOPWORDS.has(w));
  return words.length > 0 && words.every((w) => ENTITY_NOUN.test(w));
}

/**
 * # SemanticIntentResolver — comprendre au-delà des mots-clés (Phase 1)
 *
 * ## Rôle
 * S'exécute APRÈS `IntentDetector` (lexical, inchangé) et ne fait qu'une
 * chose : quand la détection lexicale n'a rien trouvé de précis
 * (`general_chat`), chercher une MEILLEURE compréhension, dans cet ordre —
 * du plus sûr/rapide au plus coûteux :
 *
 * 1. **Contexte** — un tour de suivi (« Quels sont ceux qui sont encore en
 *    cours ? », « le deuxième ») sur l'entité active de la conversation
 *    (ContextManager) → l'intention de cette entité. Confiance 0.75.
 * 2. **Entité reconnue** — synonyme métier explicite (« dossiers »,
 *    « affaires » → projets) dans une DEMANDE de données. Confiance 0.7.
 * 3. **Entité sans capacité Copilot** (machines, documents) → réponse de
 *    clarification HONNÊTE (« je n'ai pas encore accès à… »), jamais un
 *    routage vers un Agent qui inventerait.
 * 4. **Repli sémantique LLM** (optionnel) — le `LlmIntentRouter` EXISTANT
 *    (langchain/router), contraint aux SEULES clés du catalogue, avec délai
 *    maximal ; toute sortie hors catalogue est ignorée. Confiance 0.6.
 * 5. **Demande de données toujours incomprise** → clarification avec
 *    options (« Voulez-vous : 1. … 2. … »), jamais « je ne comprends pas ».
 * 6. Sinon : `general_chat` inchangé (salutations, remerciements, questions
 *    générales — jamais de clarification sur une conversation normale).
 *
 * Une intention lexicale PRÉCISE (≠ general_chat) n'est jamais remplacée :
 * le corpus de 577 scénarios validés reste la référence (voir
 * test/ai.orchestrator.semanticIntentResolver.test.js, qui le rejoue).
 *
 * ## Sécurité
 * Ne décide jamais d'une permission : une intention résolue ici passe
 * ensuite par EXACTEMENT les mêmes contrôles qu'une intention lexicale
 * (RBAC de l'intention dans AIManager, de l'Agent, puis des Tools).
 */

// Salutations, remerciements, politesse — jamais reroutés, jamais clarifiés.
const SMALL_TALK_PATTERN =
  /^\s*(bonjour|bonsoir|salut|coucou|hello|merci|au revoir|a bientot|bonne (journee|soiree)|ca va|tu vas bien|comment vas[- ]tu)\b/;

// Une DEMANDE de données (par opposition à une question générale ou à une
// question « comment faire ») : un verbe de consultation explicite, OU un mot
// interrogatif accompagné d'un possessif (« quels sont MES… »). Un simple
// « quelle » ne suffit pas (« Quelle est la météo aujourd'hui ? » reste une
// conversation générale — scénarios gen-06/gen-16 du corpus).
// Testé sur le texte en minuscules AVEC accents : « affiché » (participe,
// scénario ctx-13) ne doit pas être pris pour l'impératif « affiche ».
const DATA_VERB_PATTERN =
  /(?:^|[^a-zà-ÿ])(montre|montrez|affiche|affichez|liste|listez|donne|donnez|combien|trouve|trouvez|cherche|recherche|sors|récupère|recupere|consulter|ai-je)(?![a-zà-ÿ])/;
const QUESTION_WORD_PATTERN = /\b(quels?|quelles?|lesquels|lesquelles)\b/;
const POSSESSIVE_PATTERN = /\b(mes|mon|ma|nos|notre)\b/;
const DATA_REQUEST_PATTERN = {
  // `accentedText` : minuscules avec accents ; `text` : normalisé sans accents.
  test: (text, accentedText = text) =>
    DATA_VERB_PATTERN.test(accentedText) || (QUESTION_WORD_PATTERN.test(text) && POSSESSIVE_PATTERN.test(text)),
};
const HOW_TO_PATTERN = /\b(comment|pourquoi|qu'est[- ]ce|c'est quoi|explique|aide[- ]moi a|a quoi sert)\b/;

// Entité → intention quand la détection lexicale a échoué. Volontairement
// limité aux intentions OUVERTES à tout utilisateur authentifié au niveau de
// l'Agent (les autres restent atteignables par leurs mots-clés propres).
const ENTITY_FALLBACK_INTENT = {
  project: "projects",
  maintenance_request: "maintenance",
  hr_request: "hr",
  meeting: "meetings",
  engineer: "engineers",
};

// Entité métier de chaque intention — sert à refuser qu'un repli LLM
// remplace une entité détectée par une autre (« ingénieurs » → projets).
const INTENT_ENTITY = {
  projects: "project",
  commercial_contacts: "commercial_contact",
  maintenance: "maintenance_request",
  hr: "hr_request",
  meetings: "meeting",
  engineers: "engineer",
  industrial: "production_record",
  por_promesh: "por_promesh",
};

// Entités sans Tool Copilot à ce jour — réponse honnête plutôt qu'un routage hasardeux.
const UNSUPPORTED_ENTITY_MESSAGES = {
  machine:
    "Je n'ai pas encore accès au catalogue des machines depuis le Copilot. Vous pouvez le consulter dans l'écran Production › Machines. Souhaitez-vous plutôt consulter les fiches de production ?",
  document:
    "Pour que j'analyse un fichier, joignez-le avec le bouton 📎 (PDF, DOCX, XLSX, CSV ou TXT, 10 Mo maximum), puis posez votre question. Je peux aussi répondre à partir de la documentation du CRM ou de vos données (projets, contacts, demandes).",
};

// ── Clarification PAR ENTITÉ ──────────────────────────────────────────────
// Une question sur une entité identifiée ne reçoit que des options sur CETTE
// entité — jamais une liste arbitraire de modules. Chaque libellé est une
// vraie question, renvoyée telle quelle par le client (puces de suggestion),
// et routée vers le bon Tool.
const ENTITY_CLARIFICATIONS = {
  engineer: {
    message: {
      fr: "Que souhaitez-vous savoir sur les ingénieurs ?",
      en: "What would you like to know about the engineers?",
      ru: "Что вы хотите узнать об инженерах?",
    },
    options: {
      fr: ["Voir la liste des ingénieurs", "Voir le nombre de projets par ingénieur", "Voir l'ingénieur qui a le plus de projets"],
      en: ["Show the list of engineers", "Show the number of projects per engineer", "Which engineer has the most projects?"],
      ru: ["Покажи список инженеров", "Сколько проектов у каждого инженера?", "Какой инженер работает с наибольшим количеством проектов?"],
    },
  },
  project: {
    message: { fr: "Que souhaitez-vous savoir sur les projets ?" },
    options: { fr: ["Voir mes projets", "Voir le nombre de projets par statut", "Voir mes projets sans relance depuis 30 jours"] },
  },
  commercial_contact: {
    message: { fr: "Que souhaitez-vous savoir sur les contacts ?" },
    options: { fr: ["Voir mes contacts commerciaux", "Voir les contacts à rappeler", "Voir les contacts jamais relancés"] },
  },
  relance: {
    message: { fr: "Que souhaitez-vous savoir sur les relances ?" },
    options: { fr: ["Voir les contacts à rappeler", "Combien de relances ont été faites ce mois-ci ?", "Voir mes projets sans relance depuis 30 jours"] },
  },
  meeting: {
    message: { fr: "Que souhaitez-vous savoir sur les rendez-vous ?" },
    options: { fr: ["Voir mes rendez-vous"] },
  },
  machine: {
    message: { fr: "Que souhaitez-vous savoir sur les machines ?" },
    options: { fr: ["Voir la machine qui a le plus de fiches", "Voir le nombre de fiches par machine", "Voir les fiches de production"] },
  },
  production_record: {
    message: { fr: "Que souhaitez-vous savoir sur les fiches de production ?" },
    options: { fr: ["Voir les fiches de production", "Voir le nombre de fiches par machine"] },
  },
  maintenance_request: {
    message: { fr: "Que souhaitez-vous savoir sur la maintenance ?" },
    options: { fr: ["Voir mes demandes de maintenance"] },
  },
  hr_request: {
    message: { fr: "Que souhaitez-vous savoir sur les demandes RH ?" },
    options: { fr: ["Voir mes demandes RH"] },
  },
};

function entityClarification(entityType, language = "fr") {
  const entry = ENTITY_CLARIFICATIONS[entityType];
  if (!entry) return null;
  const l = entry.message[language] ? language : "fr";
  const labels = entry.options[l] || entry.options.fr;
  return {
    message: entry.message[l],
    options: labels.map((label, i) => ({ id: `clarify_${entityType}_${i + 1}`, label, reason: entityType })),
  };
}

// Aucune entité identifiable : une question de précision, SANS options
// arbitraires (jamais « projets / maintenance / RH » par défaut).
const GENERIC_CLARIFICATION = {
  fr: "Je veux m'assurer de bien comprendre votre demande. Pouvez-vous préciser les données que vous souhaitez consulter (par exemple : projets, contacts, ingénieurs, machines, demandes de maintenance ou RH) ?",
  en: "I want to make sure I understand your request. Could you specify which data you would like to see (for example: projects, contacts, engineers, machines, maintenance or HR requests)?",
  ru: "Хочу убедиться, что правильно понял запрос. Уточните, какие данные вы хотите посмотреть (например: проекты, контакты, инженеры, машины, заявки на обслуживание или кадровые заявки)?",
};

// Options historiques (conservées pour compatibilité d'API) — plus utilisées
// par défaut : remplacées par les clarifications par entité ci-dessus.
const INDUSTRIAL_ROLES = new Set(["admin", "superadmin", "superadmin2", "responsable_logistique_achat"]);
function clarificationOptions(user) {
  const options = [
    { id: "clarify_projects", label: "Voir mes projets", reason: "projects" },
    { id: "clarify_maintenance", label: "Voir mes demandes de maintenance", reason: "maintenance" },
    { id: "clarify_hr", label: "Voir mes demandes RH", reason: "hr" },
  ];
  if (user && INDUSTRIAL_ROLES.has(user.role)) {
    options.push({ id: "clarify_industrial", label: "Voir les fiches de production", reason: "industrial" });
  }
  return options;
}

// ── Phase 2 — assistant documentaire ─────────────────────────────────────
// Référence explicite au document joint : « ce fichier », « dans le rapport »…
const DOCUMENT_REFERENCE_PATTERN =
  /\b(ce|cet|cette|le|du|dans le|dans ce|dans cette|dans la) (fichier|document|rapport|pdf|tableau|classeur|compte[- ]rendu|piece jointe)\b|\b(dedans|joint|jointe|ci-joint|ci-jointe)\b/;
// Verbes typiques d'une question sur un texte (résumer, chercher, citer…).
const DOCUMENT_VERB_PATTERN =
  /\b(resume|resumer|resumes|synthese|synthetise|trouve|trouver|cherche|chercher|mentionne|mentionnes|mentionnees|contient|indique|explique|compare|comparer|extrait|cite|parle)\b/;
// Entités CRM : « trouve les projets en retard » reste une question CRM même
// si un document est actif.
const CRM_ENTITIES = new Set(["project", "commercial_contact", "maintenance_request", "hr_request", "meeting", "machine", "production_record", "relance"]);

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]);
}

class SemanticIntentResolver {
  /**
   * @param {object} [options]
   * @param {Array} [options.catalog] — catalogue d'intentions (même source que IntentDetector).
   * @param {{route(input): Promise<string>}|null} [options.llmRouter] — `LlmIntentRouter` existant, ou `null` (désactivé).
   * @param {number} [options.llmTimeoutMs]
   */
  constructor({ catalog = DEFAULT_INTENT_CATALOG, llmRouter = null, llmTimeoutMs = 8000, logger = createOrchestratorLogger("semantic") } = {}) {
    this.catalogByKey = new Map(catalog.map((entry) => [entry.key, entry]));
    this.llmRouter = llmRouter;
    this.llmTimeoutMs = llmTimeoutMs;
    this.logger = logger;
  }

  _intentFromKey(key, confidence, resolvedBy, base) {
    const entry = this.catalogByKey.get(key);
    if (!entry) return null;
    return {
      ...base,
      name: entry.key,
      moduleKey: entry.moduleKey,
      requiresRag: entry.requiresRag,
      requiresTools: entry.requiresTools,
      conversational: Boolean(entry.conversational),
      description: entry.description,
      requiredRoles: entry.requiredRoles || [],
      allowedEmails: entry.allowedEmails || [],
      relatedModules: entry.relatedModules || [],
      confidence,
      ambiguous: false,
      alternateIntent: null,
      resolvedBy,
    };
  }

  /**
   * Phase 2 — la question porte-t-elle sur un document JOINT ? Seulement si
   * la conversation a au moins un document actif (déjà vérifié comme
   * appartenant à l'utilisateur). Règles, de la plus forte à la plus prudente :
   * 1. document joint à CE message → question documentaire (sauf salutation) ;
   * 2. référence explicite (« ce fichier », « dans le rapport ») ;
   * 3. aucune intention lexicale précise (general_chat) ;
   * 4. verbe de lecture (« résume », « trouve », « mentionnés ») SANS entité
   *    CRM nommée — « Trouve les informations concernant PROBAR » → document,
   *    mais « Trouve mes projets en retard » → CRM.
   * @returns {object|null} l'intention `document_question`, ou `null`.
   */
  resolveDocumentFocus({ intent, message, entities, turnContext, attachedThisTurn = false }) {
    const documents = (turnContext && turnContext.documents) || [];
    if (!documents.length || !this.catalogByKey.has("document_question")) return null;
    const text = normalizeAccents(message);
    if (SMALL_TALK_PATTERN.test(text)) return null;
    const e = entities || {};
    const explicitReference = DOCUMENT_REFERENCE_PATTERN.test(text) || e.entityType === "document" || Boolean(e.filename);
    const namesCrmEntity = CRM_ENTITIES.has(e.entityType);
    const readingVerbWithoutCrmEntity = DOCUMENT_VERB_PATTERN.test(text) && !namesCrmEntity;
    // general_chat avec une entité CRM reconnue (« mes affaires en cours ») :
    // c'est une question CRM, laissée à la résolution sémantique.
    const openQuestion = intent && intent.name === "general_chat" && !namesCrmEntity;
    const focused = attachedThisTurn || explicitReference || openQuestion || readingVerbWithoutCrmEntity;
    if (!focused) return null;
    return this._intentFromKey("document_question", attachedThisTurn || explicitReference ? 0.9 : 0.7, "document", { ...intent, entities: intent && intent.entities });
  }

  /**
   * @returns {Promise<{ intent: object, clarification: {message, options}|null }>}
   */
  async resolve({ intent, message, entities, turnContext, user }) {
    const lexical = { ...intent, resolvedBy: intent.resolvedBy || "lexical" };
    if (!intent || intent.name !== "general_chat") {
      return { intent: lexical, clarification: null };
    }

    const text = normalizeAccents(message);
    const isSmallTalk = SMALL_TALK_PATTERN.test(text);
    const isDataRequest = DATA_REQUEST_PATTERN.test(text, String(message || "").toLowerCase()) && !HOW_TO_PATTERN.test(text);
    const e = entities || {};

    // 1. Suivi contextuel (référence ou filtre seul) sur l'entité ACTIVE de la
    // conversation ou de l'écran — jamais sur une entité simplement nommée
    // dans le message (scénario ctx-13 du corpus : « …ce client ? » sans
    // contexte reste general_chat).
    const fromContext = turnContext && (turnContext.entitySource === "context" || turnContext.entitySource === "page");
    if (fromContext && turnContext.isFollowUp && turnContext.inferredIntent && !isSmallTalk) {
      const resolved = this._intentFromKey(turnContext.inferredIntent, 0.75, "context", lexical);
      if (resolved) {
        this.logger.info(`intention résolue par le contexte : "${resolved.name}"`);
        return { intent: resolved, clarification: null };
      }
    }

    // 2. Entité reconnue (synonyme) dans une demande de données.
    const fallbackKey = e.entityType && ENTITY_FALLBACK_INTENT[e.entityType];
    if (fallbackKey && (isDataRequest || e.ownership) && !isSmallTalk) {
      const resolved = this._intentFromKey(fallbackKey, 0.7, "entity", lexical);
      if (resolved) {
        this.logger.info(`intention résolue par l'entité "${e.entityType}" : "${resolved.name}"`);
        return { intent: resolved, clarification: null };
      }
    }

    const language = detectLanguage(message).language;
    const entityOptions = e.entityType ? entityClarification(e.entityType, language) : null;

    // 3. Entité connue mais sans capacité Copilot : le dire honnêtement, avec
    // les seules options qui concernent cette entité.
    if (e.entityType && UNSUPPORTED_ENTITY_MESSAGES[e.entityType] && isDataRequest) {
      return {
        intent: { ...lexical, resolvedBy: "unsupported_entity" },
        clarification: { message: UNSUPPORTED_ENTITY_MESSAGES[e.entityType], options: entityOptions ? entityOptions.options : [] },
      };
    }

    // 3 bis. Entité seule (« Ingénieurs », « Contacts ? ») : que veut-on savoir
    // sur CETTE entité ?
    if (entityOptions && !isSmallTalk && !HOW_TO_PATTERN.test(text) && isBareEntityMention(text)) {
      return { intent: { ...lexical, resolvedBy: "entity_clarification" }, clarification: entityOptions };
    }

    // 4. Repli sémantique LLM (routeur existant, contraint au catalogue). Une
    // entité DÉTECTÉE ne peut pas être remplacée par une autre : « la liste
    // des ingénieurs » ne devient jamais « projets ».
    if (this.llmRouter && !isSmallTalk && tokenize(message).length >= 3) {
      try {
        const key = await withTimeout(this.llmRouter.route(message), this.llmTimeoutMs);
        const conflicting = key && e.entityType && INTENT_ENTITY[key] && INTENT_ENTITY[key] !== e.entityType;
        if (conflicting) {
          this.logger.warn(`repli sémantique LLM : "${key}" refusé (entité détectée « ${e.entityType} »)`);
        } else if (key && key !== "general_chat" && this.catalogByKey.has(key)) {
          const resolved = this._intentFromKey(key, 0.6, "llm", lexical);
          this.logger.info(`intention résolue par le repli sémantique LLM : "${key}"`);
          return { intent: resolved, clarification: null };
        }
        if (key === null) this.logger.warn(`repli sémantique LLM : délai dépassé (${this.llmTimeoutMs} ms), ignoré`);
      } catch (err) {
        this.logger.warn(`repli sémantique LLM indisponible : ${err.message}`);
      }
    }

    // 5. Demande de données toujours incomprise : clarification sur l'entité
    // détectée, ou question de précision — jamais une liste arbitraire.
    if (isDataRequest && !isSmallTalk) {
      return {
        intent: { ...lexical, resolvedBy: "clarification" },
        clarification: entityOptions || { message: GENERIC_CLARIFICATION[language] || GENERIC_CLARIFICATION.fr, options: [] },
      };
    }

    return { intent: lexical, clarification: null };
  }
}

module.exports = {
  SemanticIntentResolver,
  ENTITY_FALLBACK_INTENT,
  INTENT_ENTITY,
  clarificationOptions,
  entityClarification,
  GENERIC_CLARIFICATION,
  SMALL_TALK_PATTERN,
  DATA_REQUEST_PATTERN,
};
