"use strict";

const { isAuthorized } = require("../utils/authorization");
const { tokenize } = require("../utils/tokenize");
const { NOT_EXPOSED_DOMAINS, NOT_IMPLEMENTED_DOMAINS_BY_ROLE, findNotExposedDomain, findNotImplementedDomain } = require("./knownCopilotGaps");

/**
 * # CapabilityMatrixService — pure reasoning module (même famille que
 * reasoning/businessAnalyzer.js, reasoning/kpiInsights.js,
 * reasoning/dataCoherenceChecker.js)
 *
 * ## Rôle (AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md)
 * Calcule les capacités RÉELLES d'un `actingUser` en LISANT les mécanismes
 * RBAC déjà en place — jamais une seconde source de vérité, jamais une
 * règle recalculée :
 * - `AgentRegistry.findHandler()` (agents/agentRegistry.js) — EXACTEMENT le
 *   même appel que `AgentRouter.select()` (orchestrator/agentRouter.js) : ce
 *   dernier ne fait rien d'autre que déléguer à cette même méthode (voir son
 *   propre code), donc l'appeler directement ici n'est pas une duplication.
 * - `isAuthorized()` (utils/authorization.js) — le MÊME prédicat déjà utilisé
 *   par `BaseAgent.execute()` (Agents) et `PermissionManager` (Tools).
 * - `intentCatalog` — le catalogue RÉEL (`DEFAULT_INTENT_CATALOG` par
 *   défaut), jamais une liste réinventée.
 * - `toolPermissionIndex`/`toolModuleIndex` — les MÊMES index déjà
 *   construits par `orchestrator/pipeline.js::buildToolPermissionIndex()`/
 *   `buildToolModuleIndex()` pour `SuggestionEngine`/`ToolRouter` — jamais
 *   reconstruits une seconde fois ici.
 * - `moduleAccessByRole` — la même table que `middleware/moduleAccessGuard.js`
 *   (`ALLOWED_PREFIXES_BY_ROLE`, exportée pour cet usage), injectée depuis
 *   `aiCopilotBridge.service.js` (jamais require() directement sous
 *   `src/ai/` — même discipline que `createCopilotMeeting`).
 *
 * ## Sécurité — le rôle vient TOUJOURS de `actingUser`, jamais du message
 * Chaque méthode publique exige `actingUser.role` explicitement — aucune
 * méthode ne lit, ni ne devine, un rôle depuis un texte libre. `actingUser`
 * doit être le même objet déjà construit par `toActingUser()` (JWT réel),
 * jamais reconstruit ici.
 *
 * ## Ce que ce service NE fait PAS
 * N'exécute JAMAIS de Tool, ne lit ni n'écrit aucune donnée métier (Project,
 * User, etc.) — uniquement des registres déjà en mémoire (catalogue
 * d'intentions, agents enregistrés, index de permissions). Strictement
 * READ-ONLY par construction : aucune méthode de ce fichier n'appelle
 * jamais `.create(`/`.update(`/`.destroy(`/`tool.invoke(`.
 */

// Identique PARTOUT ailleurs dans ce noyau où une visibilité transverse est
// déjà accordée (listProjectsTool.js::ADMIN_TIER_ROLES,
// getPersonalKpiSummaryTool.js::ADMIN_TIER_ROLES, dashboard.service.js/
// commercialContactKpi.service.js::ADMIN_ROLES) — jamais une nouvelle liste
// inventée ; aucun module partagé n'existe pour ce triplet aujourd'hui, donc
// la même constante est répétée par convention, comme dans ces fichiers.
const ADMIN_TIER_ROLES = new Set(["admin", "superadmin", "superadmin2"]);

// Cette intention elle-même, et le repli générique — jamais pertinents comme
// "domaine nommé dans le message" pour `findMentionedIntent()`.
const IGNORED_KEYS_FOR_MENTION = new Set(["capability_audit", "general_chat"]);

class CapabilityMatrixService {
  constructor({ agentRegistry, intentCatalog, toolPermissionIndex = new Map(), toolModuleIndex = new Map(), moduleAccessByRole = {} } = {}) {
    if (!agentRegistry) throw new Error("CapabilityMatrixService requires an 'agentRegistry'.");
    if (!Array.isArray(intentCatalog) || intentCatalog.length === 0) {
      throw new Error("CapabilityMatrixService requires a non-empty 'intentCatalog'.");
    }
    this.agentRegistry = agentRegistry;
    this.intentCatalog = intentCatalog;
    this.toolPermissionIndex = toolPermissionIndex;
    this.toolModuleIndex = toolModuleIndex;
    this.moduleAccessByRole = moduleAccessByRole;
  }

  isAdminTier(role) {
    return ADMIN_TIER_ROLES.has(role);
  }

  _requireActingUser(actingUser) {
    if (!actingUser || !actingUser.role || !actingUser.id) {
      throw new Error("CapabilityMatrixService requires actingUser.id/actingUser.role (never derived from message text).");
    }
  }

  // Résout UNE entrée du catalogue pour CET actingUser — jamais une
  // intention inventée : `entry` doit toujours être une entrée réelle
  // d'`intentCatalog`. L'agent est résolu EXACTEMENT comme le fait le
  // routage réel (`AgentRegistry.findHandler({name})` — `canHandle()` ne lit
  // jamais que `.name`, voir baseAgent.js — donc ce pseudo-intent minimal
  // est strictement équivalent à un Intent complet pour cette résolution).
  _resolveIntentCapability(entry, actingUser) {
    const isAdminTier = this.isAdminTier(actingUser.role);
    const intentAllowed = isAuthorized(
      { requiredRoles: entry.requiredRoles || [], allowedEmails: entry.allowedEmails || [] },
      actingUser
    );
    const agent = this.agentRegistry.findHandler({ name: entry.key });

    if (!intentAllowed) {
      return {
        intent: entry.key,
        description: entry.description,
        agent: agent ? agent.name : null,
        status: "denied",
        reason: "intent_rbac",
        isAdminTier,
      };
    }
    if (!agent) {
      return {
        intent: entry.key,
        description: entry.description,
        agent: null,
        status: "generic",
        reason: null,
        isAdminTier,
      };
    }
    const agentAllowed = isAuthorized(
      { requiredRoles: agent.requiredRoles || [], allowedEmails: agent.allowedEmails || [] },
      actingUser
    );
    return {
      intent: entry.key,
      description: entry.description,
      agent: agent.name,
      requiredRoles: agent.requiredRoles || [],
      status: agentAllowed ? "available" : "denied",
      reason: agentAllowed ? null : "agent_rbac",
      isAdminTier,
    };
  }

  // Vue complète : une ligne par intention du catalogue RÉEL, jamais une
  // liste partielle ou réordonnée pour "faire joli" — l'ordre du catalogue
  // est préservé tel quel.
  getCapabilities(actingUser) {
    this._requireActingUser(actingUser);

    const intents = this.intentCatalog.map((entry) => this._resolveIntentCapability(entry, actingUser));
    const availableAgents = [...new Set(intents.filter((i) => i.status === "available").map((i) => i.agent))];
    const deniedAgents = [...new Set(intents.filter((i) => i.status === "denied" && i.agent).map((i) => i.agent))];
    const genericIntents = intents.filter((i) => i.status === "generic").map((i) => i.intent);

    return {
      role: actingUser.role,
      isAdminTier: this.isAdminTier(actingUser.role),
      intents,
      availableAgents,
      deniedAgents,
      genericIntents,
      // `null` = aucune restriction connue à ce niveau (la grande majorité
      // des rôles) — jamais confondu avec "aucun module" (tableau vide) :
      // voir moduleAccessGuard.js, seul `responsable_logistique_achat` y a
      // une entrée aujourd'hui.
      moduleAccessPrefixes: Object.prototype.hasOwnProperty.call(this.moduleAccessByRole, actingUser.role)
        ? this.moduleAccessByRole[actingUser.role]
        : null,
      // knownCopilotGaps.js — faits d'architecture, jamais mélangés aux
      // `intents` réels du catalogue ci-dessus. NOT_EXPOSED est identique
      // pour tout rôle (aucune intention/Tool Copilot n'existe pour ce
      // domaine, quel que soit qui demande) ; NOT_IMPLEMENTED dépend du rôle
      // réel (seul finance_probar en a un aujourd'hui).
      nonExposedDomains: NOT_EXPOSED_DOMAINS.map((d) => ({ domain: d.key, label: d.label })),
      notImplementedDomains: (NOT_IMPLEMENTED_DOMAINS_BY_ROLE[actingUser.role] || []).map((d) => ({ domain: d.key, label: d.label })),
      // Aucune détection dynamique n'existe (exécuter un Tool pour répondre
      // à une question de capacité serait dangereux et hors-scope) — reste
      // toujours vide tant qu'aucune source fiable de "Tool cassé" n'existe
      // sans l'exécuter. Voir 35_ROLE_CAPABILITY_AUDIT_AGENT.md.
      brokenCapabilities: [],
    };
  }

  // "Puis-je utiliser <intentKey> ?" — `null` si `intentKey` n'existe pas
  // dans le catalogue réel (jamais un intent halluciné pour répondre quand
  // même).
  canUseIntent(actingUser, intentKey) {
    this._requireActingUser(actingUser);
    const entry = this.intentCatalog.find((e) => e.key === intentKey);
    if (!entry) return null;
    return this._resolveIntentCapability(entry, actingUser);
  }

  // Repère, dans le texte BRUT du message, si un AUTRE domaine du catalogue
  // est nommé explicitement — relit les mots-clés déjà réels du catalogue
  // (jamais une resimulation du routage lexical, seulement une LECTURE de la
  // même donnée) pour que "Puis-je consulter les [maintenance] ?" réponde
  // précisément sur `maintenance`, pas seulement un résumé générique.
  // Jamais utilisé pour décider un rôle/une permission — uniquement pour
  // savoir DE QUOI l'utilisateur parle.
  findMentionedIntent(message) {
    const terms = new Set(tokenize(message));
    let best = null;
    let bestScore = 0;
    for (const entry of this.intentCatalog) {
      if (IGNORED_KEYS_FOR_MENTION.has(entry.key)) continue;
      const score = (entry.keywords || []).reduce((sum, kw) => sum + (terms.has(kw.toLowerCase()) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return best;
  }

  // Repli — consulté par l'appelant UNIQUEMENT quand `findMentionedIntent()`
  // n'a trouvé aucune intention réelle du catalogue (jamais l'inverse : une
  // intention réelle a TOUJOURS priorité sur knownCopilotGaps, voir
  // roleCapabilityAuditAgent.js::_run()). Ne décide jamais un statut RBAC :
  // relit simplement les faits d'architecture déjà établis dans
  // knownCopilotGaps.js, jamais une permission recalculée.
  findKnownGap(message, actingUser) {
    this._requireActingUser(actingUser);
    const terms = new Set(tokenize(message));

    const notExposed = findNotExposedDomain(terms);
    if (notExposed) return { status: "not_exposed", domain: notExposed.key, label: notExposed.label };

    const notImplemented = findNotImplementedDomain(actingUser.role, terms);
    if (notImplemented) return { status: "not_implemented", domain: notImplemented.key, label: notImplemented.label };

    return null;
  }
}

module.exports = { CapabilityMatrixService, ADMIN_TIER_ROLES };
