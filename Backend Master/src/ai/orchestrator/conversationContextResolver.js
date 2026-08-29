"use strict";

const { tokenize } = require("../utils/tokenize");
const { DEFAULT_INTENT_CATALOG } = require("./intentCatalog");

/**
 * # ConversationContextResolver — comprendre les références et reformulations
 *
 * ## Rôle
 * Résout l'exemple demandé : après « Montre-moi les projets » → « Voici les
 * projets », le message suivant « Et lesquels sont en retard ? » doit être
 * compris comme portant sur les PROJETS déjà affichés, alors que pris seul
 * il ne contient aucun mot-clé fort de l'intention "projects" (voir
 * `intentCatalog.js`). Entièrement hors-ligne et déterministe (aucun
 * fournisseur LLM requis) — même philosophie que
 * `LexicalIntentRouter`/`IntentClassifier` : un mécanisme à base de règles,
 * pas une "compréhension" au sens fort, avec ses limites assumées (voir
 * `CONVERSATION_CONTEXT.md`).
 *
 * ## Trois signaux de détection, combinés (voir CONVERSATION_CONTEXT.md)
 * 1. **Marqueur de référence explicite** (`REFERENCE_MARKERS`, `signal:
 *    "reference"`) — un pronom/déictique français qui ne peut
 *    grammaticalement renvoyer qu'à quelque chose déjà mentionné
 *    ("lesquels", "celui", "ça", ...). Volontairement restreint aux mots
 *    suffisamment DISTINCTIFS : "le"/"la"/"les"/"en"/"il" sont exclus malgré
 *    leur usage pronominal possible, car ce sont aussi des articles/
 *    prépositions extrêmement fréquents — les inclure produirait un faux
 *    positif sur presque n'importe quelle phrase française.
 * 2. **Marqueur de correction/reformulation** (`CORRECTION_MARKERS`,
 *    `signal: "correction"`) — "plutôt", "finalement", "non" en TÊTE de
 *    phrase seulement (même discipline que ci-dessus sur "le"/"la"/"les" :
 *    "non" ailleurs dans la phrase est trop fréquent pour être fiable), la
 *    locution "voulais dire". Même politique que le signal de référence.
 * 3. **Reformulation elliptique** (`signal: "ellipsis"`) — un message COURT
 *    (`shortMessageMaxTokens` mots ou moins) qui ne matche AUCUN mot-clé
 *    d'AUCUNE intention du catalogue : un signal indirect qu'il s'agit
 *    probablement d'une suite de la conversation plutôt que d'un nouveau
 *    sujet autonome (ex. "et les autres ?", "pourquoi ?", "depuis quand ?").
 *
 * ## Résolution
 * Si l'un des trois signaux est présent, résout le sujet via `currentTopic`
 * (fourni par l'appelant — `ConversationManager.getCurrentTopic()`, survit
 * au-delà de la fenêtre d'historique, voir conversationManager.js) s'il est
 * fourni et encore présent dans le catalogue actuel ; sinon, repli sur le
 * tour ASSISTANT le plus RÉCENT de `history` qui porte une intention connue
 * (`entry.intent`, jamais `"general_chat"` — le repli délibéré "aucune
 * intention précise", pas un sujet). Récupère son mot-clé le plus
 * représentatif (`catalog[intent].keywords[0]`) pour enrichir le message.
 *
 * ## Ambiguïté
 * Si un signal FORT (référence ou correction) est détecté mais qu'AUCUN
 * sujet n'est connu (ni `currentTopic`, ni l'historique — première question
 * de la conversation, historique vide/effacé), la résolution est
 * explicitement marquée `ambiguous: true` plutôt que de deviner — cohérent
 * avec le principe "jamais halluciner" de
 * `langchain/prompts/responsePrompts.js`. `AIManager` répond alors par une
 * demande de clarification (`ResponseBuilder.buildClarificationResponse()`),
 * jamais un Tool/une réponse RAG choisis au hasard.
 *
 * ## Entrée
 * `resolve({ message: string, history: {role, content, intent?}[], currentTopic?: string|null })` —
 * `history` au format renvoyé par `ConversationManager.getHistory()` (voir
 * conversationManager.js), oldest-first ; `currentTopic` optionnel (repli
 * sur `history` seul si absent, pour que ce module reste testable en
 * isolation).
 *
 * ## Sortie
 * `{ isReference: boolean, resolvedTopic: string|null, ambiguous: boolean,
 *    enrichedMessage: string, signal: "reference"|"correction"|"ellipsis"|null }`
 *    — `enrichedMessage` est TOUJOURS le message original quand
 *    `isReference` est faux ou `ambiguous` est vrai ; sinon, le message
 *    original complété par le terme du sujet résolu (ex. « Et lesquels sont
 *    en retard ? (à propos de projet) »), pour que `IntentDetector`/
 *    `ToolRouter` (lexicaux) redétectent la BONNE intention sans qu'aucun
 *    autre composant n'ait à connaître ce mécanisme.
 */
// Formes SANS trait d'union délibérément : `utils/tokenize.js` découpe sur
// le trait d'union (classe de caractères `[a-zà-ÿ0-9]+`), donc un marqueur
// comme "celui-ci" ne pourrait jamais matcher un token ("celui" et "ci"
// devenant deux tokens distincts) — bug réel découvert par test, corrigé en
// gardant seulement la racine ("celui"/"celle"/"ceux"/"celles"), un pronom
// démonstratif tout aussi distinctif seul qu'accompagné de "-ci"/"-là".
const REFERENCE_MARKERS = [
  "lesquels",
  "lesquelles",
  "lequel",
  "laquelle",
  "celui",
  "celle",
  "ceux",
  "celles",
  "ca",
  "ça",
  "cela",
];

// Marqueurs de CORRECTION/REFORMULATION — l'utilisateur ne demande pas
// autre chose, il précise/corrige ce qu'il vient de demander ("Non, plutôt
// les urgents.", "Finalement, uniquement ceux de ce mois."). Signal FORT,
// même politique que REFERENCE_MARKERS (bloquant sans sujet antérieur —
// une correction en tout DÉBUT de conversation ne corrige rien de connu,
// une vraie ambiguïté) : voir CONVERSATION_CONTEXT.md, "Reformulations".
// Volontairement RESTREINT à des mots peu fréquents en dehors de ce rôle
// ("non" est exclu comme simple token — trop générique, voir
// _hasLeadingNon ci-dessous pour la version sûre, position-dépendante).
const CORRECTION_MARKERS = ["plutot", "plutôt", "finalement", "correction"];

class ConversationContextResolver {
  constructor({
    catalog = DEFAULT_INTENT_CATALOG,
    referenceMarkers = REFERENCE_MARKERS,
    correctionMarkers = CORRECTION_MARKERS,
    shortMessageMaxTokens = 5,
  } = {}) {
    this.catalogByKey = new Map(catalog.map((entry) => [entry.key, entry]));
    this.referenceMarkers = referenceMarkers.map((m) => m.toLowerCase());
    this.correctionMarkers = correctionMarkers.map((m) => m.toLowerCase());
    this.shortMessageMaxTokens = shortMessageMaxTokens;
    this._allKnownKeywords = new Set(
      catalog.flatMap((entry) => (entry.keywords || []).map((kw) => kw.toLowerCase()))
    );
  }

  resolve({ message, history = [], currentTopic = null }) {
    const terms = tokenize(message);
    const termSet = new Set(terms);

    // Signal FORT : un pronom/déictique qui ne peut grammaticalement que
    // renvoyer à quelque chose déjà mentionné — sans sujet antérieur connu,
    // c'est une VRAIE ambiguïté (voir _resolveAgainstTopic ci-dessous).
    const hasReferenceMarker = this.referenceMarkers.some((marker) => termSet.has(marker));

    // Signal FORT également : une correction/reformulation explicite ("non,
    // plutôt...", "finalement...", "je voulais dire..."). "non" seul est
    // trop fréquent pour être un token-marqueur fiable (voir REFERENCE_MARKERS
    // pour la même discipline sur "le"/"la"/"les") — reconnu seulement en
    // position de TÊTE de phrase ("Non, ..."), là où il joue effectivement
    // ce rôle grammatical, jamais ailleurs dans le message.
    const hasCorrectionMarker =
      this.correctionMarkers.some((marker) => termSet.has(marker)) ||
      terms[0] === "non" ||
      message.toLowerCase().includes("voulais dire");

    // Signal FAIBLE : une reformulation courte, sans mot-clé propre — ex.
    // "et les autres ?", "pourquoi ?". Contrairement au signal fort, sans
    // sujet antérieur connu ce n'est PAS une ambiguïté à signaler : ça peut
    // tout aussi bien être un message générique autonome (une salutation,
    // "bonjour" — vérifié par test, un vrai faux positif rencontré en
    // développant ce fichier) qui doit simplement retomber sur son intention
    // par défaut (`general_chat`), sans blocage.
    const isShortAndUnmatched =
      terms.length > 0 &&
      terms.length <= this.shortMessageMaxTokens &&
      ![...termSet].some((term) => this._allKnownKeywords.has(term));

    if (hasReferenceMarker) {
      return this._resolveAgainstTopic(message, history, { blockIfUnresolved: true, signal: "reference", currentTopic });
    }
    if (hasCorrectionMarker) {
      return this._resolveAgainstTopic(message, history, { blockIfUnresolved: true, signal: "correction", currentTopic });
    }
    if (isShortAndUnmatched) {
      return this._resolveAgainstTopic(message, history, { blockIfUnresolved: false, signal: "ellipsis", currentTopic });
    }
    return { isReference: false, resolvedTopic: null, ambiguous: false, enrichedMessage: message, signal: null };
  }

  _resolveAgainstTopic(message, history, { blockIfUnresolved, signal, currentTopic }) {
    // `currentTopic` (fourni par ConversationManager.getCurrentTopic(),
    // survit au-delà de la fenêtre d'historique — voir
    // conversationManager.js, "conversations longues") prend le pas quand
    // fourni ET encore présent dans le catalogue actuel — même garde que
    // `_lastKnownTopic` (catalogue reconfiguré entre deux tours) ; sinon,
    // repli sur la relecture de l'historique fourni (les deux voies
    // existent pour que ce module reste testable en isolation, sans
    // dépendre de ConversationManager — voir les tests).
    const validCurrentTopic = currentTopic && this.catalogByKey.has(currentTopic) ? currentTopic : null;
    const lastTopic = validCurrentTopic || this._lastKnownTopic(history);

    if (!lastTopic) {
      return blockIfUnresolved
        ? { isReference: true, resolvedTopic: null, ambiguous: true, enrichedMessage: message, signal }
        : { isReference: false, resolvedTopic: null, ambiguous: false, enrichedMessage: message, signal: null };
    }

    const entry = this.catalogByKey.get(lastTopic);
    const canonicalTerm = (entry && entry.keywords && entry.keywords[0]) || lastTopic;

    return {
      isReference: true,
      resolvedTopic: lastTopic,
      ambiguous: false,
      enrichedMessage: `${message} (à propos de ${canonicalTerm})`,
      signal,
    };
  }

  // Le tour ASSISTANT le plus récent portant une intention connue — jamais
  // un tour utilisateur (qui n'a pas d'`intent` résolue), ni une intention
  // absente du catalogue actuel (catalogue reconfiguré entre deux tours), ni
  // "general_chat" (le repli délibéré "aucune intention précise identifiée"
  // — pas un sujet, voir ConversationManager.recordAssistantMessage pour la
  // même exclusion côté currentTopic).
  //
  // AI-Business-Copilot/32_MEETING_CONTEXT_AFTER_EXECUTION.md — reproduit en
  // direct : `AIManager` efface bien `currentTopic` (Map séparée) après une
  // réunion confirmée/annulée, mais CE repli relit l'historique brut, qui
  // lui garde pour toujours le tag `intent:"meetings"` du tour de
  // confirmation — un message court sans mot-clé propre ("Créer une
  // activité") ressuscitait alors ce sujet déjà clos. `entry.topicClosed`
  // (posé par AIManager.handleMessage() UNIQUEMENT sur le tour qui clôt
  // réellement le workflow — écriture calendrier réelle OU PendingAction
  // résolu, jamais ambigu) arrête la remontée : un `return null` immédiat,
  // jamais un simple `continue`, qui laisserait remonter un tour PLUS ANCIEN
  // et non clos du MÊME sujet (ex. la réunion PRÉCÉDENTE d'une conversation
  // qui en a créé plusieurs).
  _lastKnownTopic(history) {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (entry.role !== "assistant") continue;
      if (entry.topicClosed) return null;
      if (entry.intent && entry.intent !== "general_chat" && this.catalogByKey.has(entry.intent)) {
        return entry.intent;
      }
    }
    return null;
  }
}

module.exports = { ConversationContextResolver, REFERENCE_MARKERS, CORRECTION_MARKERS };
