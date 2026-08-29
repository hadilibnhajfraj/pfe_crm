"use strict";

const { IIntentDetector } = require("./intentDetector.interface");
const { IntentDetectionError, ConfigurationError } = require("./errors");
const { LexicalIntentRouter } = require("../langchain/router");
const { DEFAULT_INTENT_CATALOG } = require("./intentCatalog");
const { computeConfidenceAndEntities } = require("./intentConfidence");
const { applyProjectAnalysisOverride } = require("./projectAnalysisOverride");
const { applyCapabilityQuestionOverride } = require("./capabilityQuestionOverride");
const { applyProjectOwnershipOverride } = require("./projectOwnershipOverride");
const { applyProjectDescribeOverride } = require("./projectDescribeOverride");
const { applyCommercialRelanceOverride } = require("./commercialRelanceOverride");
const { applyCommercialAssignmentOverride } = require("./commercialAssignmentOverride");
const { applyIndustrialPromeshOverride } = require("./industrialPromeshOverride");

/**
 * # IntentDetector — comprendre l'intention d'un message
 *
 * ## Rôle
 * Délègue le choix d'une clé de route à un `IRouter` injecté
 * (`LexicalIntentRouter` par défaut — offline, voir
 * `createLexicalIntentDetector` ci-dessous — ou un `LlmIntentRouter` pour
 * une classification plus flexible, cf. langchain/router/), puis résout
 * cette clé en un objet `Intent` enrichi via un catalogue de métadonnées
 * CRM (`moduleKey`/`requiresRag`/`requiresTools`). C'est cette résolution
 * catalogue qui permet à `AgentRouter`/`ToolRouter`/`WorkflowManager` de
 * décider quoi faire sans connaître eux-mêmes la moindre règle de
 * classification. UNE exception délibérée, étroite et documentée à "ne
 * réimplémente aucune logique de routage" : `projectAnalysisOverride.js`
 * (voir AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md) — corrige
 * "pourquoi ce projet est critique" sans mot-clé de catalogue global (qui
 * casserait d'autres scénarios déjà validés, preuve dans ce fichier).
 *
 * ## Entrée
 * `detect(message: string, context?: object)`
 *
 * ## Sortie
 * `Promise<{ name, moduleKey, requiresRag, requiresTools, description, requiredRoles, allowedEmails, relatedModules, confidence, entities, ambiguous, alternateIntent }>`
 * — `confidence` (0..1) et `entities` (string[]) sont une annotation
 * additive en LECTURE SEULE de la décision déjà prise par `router`, jamais
 * un second choix concurrent — voir `intentConfidence.js` pour les 4
 * paliers de confiance et AI-Business-Copilot/10_INTENT_ROUTING_FIX.md
 * (étape 10). `ambiguous` (bool, presque toujours `false` — un signal
 * délibérément étroit, voir `intentConfidence.js`) et `alternateIntent`
 * (`{name, description}` du candidat concurrent réel, ou `null`) sont
 * consommés par `AIManager.handleMessage()` pour demander une clarification
 * plutôt que deviner (étape 11) — jamais une intention inventée : toujours
 * une entrée réelle du catalogue. `requiredRoles`/`allowedEmails` par défaut `[]` (aucune restriction),
 * consommés par `AIManager.handleMessage()` juste après cet appel (étape
 * "vérifier les permissions" du workflow) via le même prédicat
 * `utils/authorization.js::isAuthorized` que `PermissionManager`/`BaseAgent`.
 * `relatedModules` (par défaut `[]`) — modules métier supplémentaires,
 * au-delà de `moduleKey`, dont les Tools sont aussi pertinents pour cette
 * intention ; consommé par `ToolRouter.select()` (voir toolRouter.js et
 * TOOL_ROUTER.md) pour sélectionner plusieurs Tools de modules différents
 * en une seule fois.
 *
 * ## Erreurs
 * `IntentDetectionError` si `message` est vide, ou si le routeur sous-jacent
 * échoue (ex. `RoutingError` d'un `LexicalIntentRouter` sans `defaultRoute`).
 */
class IntentDetector extends IIntentDetector {
  constructor({ router, catalog = DEFAULT_INTENT_CATALOG, defaultIntentKey = "general_chat" }) {
    super();
    this.router = router;
    this.catalogByKey = new Map(catalog.map((entry) => [entry.key, entry]));
    this.defaultIntentKey = defaultIntentKey;
    if (!this.catalogByKey.has(defaultIntentKey)) {
      throw new ConfigurationError(`IntentDetector: defaultIntentKey "${defaultIntentKey}" is not present in the catalog.`);
    }
  }

  async detect(message, context = {}) {
    if (!message || !message.trim()) {
      throw new IntentDetectionError("message must not be empty");
    }

    let key;
    try {
      key = await this.router.route(message, context);
    } catch (err) {
      throw new IntentDetectionError(err.message);
    }
    // AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md — six exceptions
    // délibérées à "IntentDetector ne réimplémente aucune logique de
    // routage" (voir docstring ci-dessus), chacune isolée dans son propre
    // module, chacune n'affectant JAMAIS un autre choix du routeur que sa
    // clé de départ documentée, et seulement sur une combinaison étroite de
    // signaux : `projectAnalysisOverride.js` ("pourquoi ce projet est
    // critique" depuis `documentation_question`), `capabilityQuestionOverride.js`
    // ("qu'est-ce que je peux faire ?" depuis `general_chat` — mission
    // "CORRIGER LES 3 PROBLÈMES IDENTIFIÉS PAR L'AUDIT COPILOT", problème 2),
    // `projectOwnershipOverride.js` ("projets associés à un utilisateur"
    // depuis `users` — même mission, problème 3), `projectDescribeOverride.js`
    // ("détails de Résidence HOLYA" depuis `general_chat` — mission
    // "CORRIGER LA RECHERCHE/DESCRIPTION D'UN PROJET PAR SON NOM"),
    // `commercialRelanceOverride.js` ("clients en retard de relance" depuis
    // `projects` — mission "CORRIGER LE COPILOT POUR LE RÔLE COMMERCIAL"),
    // `commercialAssignmentOverride.js` ("affecter <contact> à <email>"
    // depuis `general_chat` — mission "CORRIGER LES ACTIONS COMMERCIALES
    // DEPUIS LA LISTE DES CONTACTS"), `industrialPromeshOverride.js`
    // ("fiches PROMESH"/"fiche PRO PROMESH" depuis `industrial` — mission
    // "CORRIGER DÉFINITIVEMENT LES REQUÊTES FICHES PRO PROMESH / PRO
    // PROBAR"). Les sept s'enchaînent sans interaction possible : chacun ne
    // lit que la clé de départ qui le concerne et laisse toute autre clé
    // strictement inchangée.
    const routerKey = key;
    key = applyProjectAnalysisOverride(message, key, this.catalogByKey);
    key = applyCapabilityQuestionOverride(message, key, this.catalogByKey);
    key = applyProjectOwnershipOverride(message, key, this.catalogByKey);
    key = applyProjectDescribeOverride(message, key, this.catalogByKey);
    key = applyCommercialRelanceOverride(message, key, this.catalogByKey);
    key = applyCommercialAssignmentOverride(message, key, this.catalogByKey);
    key = applyIndustrialPromeshOverride(message, key, this.catalogByKey);

    const entry = this.catalogByKey.get(key) || this.catalogByKey.get(this.defaultIntentKey);
    const { confidence, entities, ambiguous, alternateIntentKey } = computeConfidenceAndEntities({
      message,
      catalog: [...this.catalogByKey.values()],
      winnerKey: entry.key,
      overriddenFrom: key !== routerKey ? routerKey : null,
    });
    const alternateEntry = alternateIntentKey ? this.catalogByKey.get(alternateIntentKey) : null;
    return {
      name: entry.key,
      moduleKey: entry.moduleKey,
      requiresRag: entry.requiresRag,
      requiresTools: entry.requiresTools,
      // AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md — annotation
      // additive en LECTURE SEULE, même politique que confidence/entities
      // ci-dessous : `false` par défaut pour toute entrée qui ne le
      // déclare pas explicitement (voir intentCatalog.js), donc aucun
      // changement pour les intentions existantes.
      conversational: Boolean(entry.conversational),
      description: entry.description,
      requiredRoles: entry.requiredRoles || [],
      allowedEmails: entry.allowedEmails || [],
      relatedModules: entry.relatedModules || [],
      confidence,
      entities,
      ambiguous,
      alternateIntent: alternateEntry ? { name: alternateEntry.key, description: alternateEntry.description } : null,
    };
  }
}

// Convenience factory: builds the offline default (LexicalIntentRouter over
// the catalog's own keywords) so most callers never need to construct a
// router by hand. Pass a pre-built `router` (e.g. an LlmIntentRouter with a
// lexical fallback) directly to `new IntentDetector({...})` instead when a
// richer classification strategy is wanted.
function createLexicalIntentDetector({ catalog = DEFAULT_INTENT_CATALOG, defaultIntentKey = "general_chat" } = {}) {
  const router = new LexicalIntentRouter({
    routes: catalog.map((entry) => ({ key: entry.key, keywords: entry.keywords })),
    defaultRoute: defaultIntentKey,
  });
  return new IntentDetector({ router, catalog, defaultIntentKey });
}

module.exports = { IntentDetector, createLexicalIntentDetector };
