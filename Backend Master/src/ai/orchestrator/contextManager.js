"use strict";

const { createOrchestratorLogger } = require("./logger");

/**
 * # ContextManager — état conversationnel STRUCTURÉ (Phase 1, compréhension naturelle)
 *
 * ## Rôle
 * Complète `ConversationManager` (historique texte + `currentTopic`) par un
 * état compact et exploitable, jamais par un second historique :
 *
 *   {
 *     activeEntity: "project",           // dernière entité métier traitée
 *     activeIntent: "projects",
 *     lastResults: { entity, items: [{id, name, …}], filters, capturedAt },
 *     currentRecord: { entity, id, name, source },  // « celui-ci »
 *     filters: { ownership, status, … },  // filtres hérités d'un tour à l'autre
 *     pageContext: { screen, entity, recordId, label },  // écran Flutter courant
 *   }
 *
 * C'est cet état — et NON l'historique complet — qui permet de résoudre
 * « ceux qui sont en cours », « le deuxième », « celui-ci », « ceux de cette
 * semaine » : aucune donnée n'est réinjectée dans un prompt LLM.
 *
 * ## Sécurité
 * - Les `items` retenus ne proviennent QUE de résultats de Tools déjà
 *   exécutés sous le RBAC de l'utilisateur (McpServer) : le ContextManager ne
 *   lit jamais la base et n'élargit jamais un périmètre.
 * - `pageContext.recordId` vient du client : c'est un INDICE, jamais une
 *   autorisation — l'Agent qui l'utilise le revérifie par un Tool scopé
 *   (voir ProjectAgent._runContextualQuery).
 * - Seuls des champs métier utiles au raisonnement sont conservés (id, nom,
 *   statut, dates) — jamais d'email, de téléphone ni de donnée sensible.
 * - Un état est propre à UNE conversation (clé `conversationId`) et à UN
 *   utilisateur (`userId` vérifié à chaque lecture).
 *
 * ## Limites (volontaires)
 * En mémoire du process, comme `InMemoryConversationMemory` et
 * `PendingActionStore` : TTL (2 h par défaut) + nombre maximal de
 * conversations (LRU) + nombre maximal d'éléments retenus par résultat.
 */

// Extracteurs de résultats par Tool : transforment la sortie JSON brute d'un
// Tool de LISTE en éléments compacts. Seuls les Tools listés ici alimentent
// `lastResults` — un Tool d'écriture n'est jamais interprété comme une liste.
const RESULT_EXTRACTORS = {
  list_projects: (parsed) => {
    const rows = Array.isArray(parsed && parsed.data) ? parsed.data : null;
    if (!rows) return null;
    return {
      entity: "project",
      total: typeof parsed.total === "number" ? parsed.total : rows.length,
      items: rows.map(compactProject).filter(Boolean),
    };
  },
};

function compactProject(p) {
  if (!p || !p.id) return null;
  return {
    id: p.id,
    name: p.nomProjet || null,
    statut: p.statut || null,
    productFamily: p.productFamily || null,
    ownerName: (p.owner && (p.owner.name || p.owner.email)) || null,
    createdAt: p.createdAt || null,
    dateDemarrage: p.dateDemarrage || null,
    lastRelanceAt: p.lastRelanceAt || null,
    nextRelanceDate: p.nextRelanceDate || null,
  };
}

// Écran Flutter → entité métier (contrat `CopilotPageContext`, voir
// Dash Master Toolkit/lib/ai/models/copilot_page_context.dart).
const SCREEN_TO_ENTITY = {
  project: "project",
  client: "commercial_contact",
  industrial: "production_record",
  dashboard: null,
};

const ENTITY_TO_INTENT = {
  project: "projects",
  commercial_contact: "commercial_contacts",
  production_record: "industrial",
  maintenance_request: "maintenance",
  hr_request: "hr",
  por_promesh: "por_promesh",
  meeting: "meetings",
};

const INTENT_TO_ENTITY = Object.fromEntries(Object.entries(ENTITY_TO_INTENT).map(([entity, intent]) => [intent, entity]));

// Normalise et borne le pageContext reçu du client — jamais d'exception : un
// pageContext malformé est simplement ignoré (même politique défensive que
// pageContextFormatter.js).
// Options d'une liste paginée reprises à la page suivante (« avec leurs
// projets », « sans projet ») : deux valeurs fermées, rien d'autre.
function listOptions(options) {
  if (!options || typeof options !== "object") return null;
  const kept = {};
  if (options.view === "projects") kept.view = "projects";
  if (options.filter === "with_projects" || options.filter === "without_projects") kept.filter = options.filter;
  return Object.keys(kept).length ? kept : null;
}

function normalizePageContext(pageContext) {
  if (!pageContext || typeof pageContext !== "object") return null;
  const screen = typeof pageContext.screen === "string" ? pageContext.screen.slice(0, 40) : null;
  const entity =
    typeof pageContext.entity === "string" && ENTITY_TO_INTENT[pageContext.entity]
      ? pageContext.entity
      : (screen && SCREEN_TO_ENTITY[screen]) || null;
  const recordId =
    typeof pageContext.recordId === "string" || typeof pageContext.recordId === "number"
      ? String(pageContext.recordId).slice(0, 64)
      : null;
  const label = typeof pageContext.label === "string" ? pageContext.label.slice(0, 120) : null;
  if (!screen && !entity) return null;
  return { screen, entity, recordId, label };
}

class ContextManager {
  constructor({
    ttlMs = 2 * 60 * 60 * 1000,
    maxConversations = 500,
    maxItems = 100,
    // Entités dont l'Agent consomme réellement le contexte structuré
    // (références « celui-ci », « le deuxième », ensembles) — Phase 1 :
    // ProjectAgent. Pour les autres, aucune référence n'est résolue ni
    // clarifiée ici : leurs flux existants (ex. relance de CommercialAgent)
    // restent strictement inchangés.
    referenceEntities = ["project"],
    clock = () => Date.now(),
    logger = createOrchestratorLogger("context"),
  } = {}) {
    this.ttlMs = ttlMs;
    this.maxConversations = maxConversations;
    this.maxItems = maxItems;
    this.referenceEntities = new Set(referenceEntities);
    this.clock = clock;
    this.logger = logger;
    this._states = new Map();
  }

  _emptyState(userId) {
    return {
      userId,
      activeEntity: null,
      activeIntent: null,
      lastResults: null,
      currentRecord: null,
      filters: {},
      pageContext: null,
      // Phase 2 — documents joints à la conversation ({documentId, filename}),
      // déjà vérifiés comme appartenant à l'utilisateur par le bridge ; le
      // plus récent en tête, 5 au plus.
      activeDocuments: [],
      // Personne / société dont on parle (« Et ses projets ? ») — voir setFocusEntity().
      focusEntity: null,
      // Liste paginée en cours (« Afficher les suivants ») — voir setListCursor().
      listCursor: null,
      updatedAt: this.clock(),
    };
  }

  // Lecture/création — jamais l'état d'un AUTRE utilisateur, jamais un état expiré.
  _state(conversationId, userId, { create = false } = {}) {
    if (!conversationId) return null;
    const existing = this._states.get(conversationId);
    const expired = existing && this.clock() - existing.updatedAt > this.ttlMs;
    const foreign = existing && userId && existing.userId && existing.userId !== userId;
    // Un autre utilisateur ne voit RIEN — et ne peut ni lire, ni écraser, ni
    // purger l'état du propriétaire (un conversationId deviné ne donne aucun
    // levier).
    if (foreign) return null;
    if (existing && !expired) {
      // LRU : la conversation touchée repasse en fin de Map.
      this._states.delete(conversationId);
      this._states.set(conversationId, existing);
      return existing;
    }
    if (existing && expired) this._states.delete(conversationId);
    if (!create) return null;
    const fresh = this._emptyState(userId || null);
    this._states.set(conversationId, fresh);
    while (this._states.size > this.maxConversations) {
      this._states.delete(this._states.keys().next().value);
    }
    return fresh;
  }

  /**
   * Personne ou société identifiée au tour précédent (EntityLookupAgent) :
   * sert uniquement à résoudre « cet ingénieur », « ses projets », « this
   * company » au tour suivant. Jamais une autorisation : le nom est
   * recherché de nouveau par un Tool scopé.
   */
  setFocusEntity(conversationId, userId, focus) {
    const valid = focus && typeof focus.type === "string" && typeof focus.name === "string" && focus.name.trim();
    const state = this._state(conversationId, userId, { create: Boolean(valid) });
    if (!state) return null;
    state.focusEntity = valid ? { type: focus.type.slice(0, 40), id: focus.id ? String(focus.id).slice(0, 64) : null, name: focus.name.trim().slice(0, 120) } : null;
    state.updatedAt = this.clock();
    return state.focusEntity;
  }

  /** Position dans une liste paginée ; `null` : plus de liste en cours. */
  setListCursor(conversationId, userId, cursor) {
    const valid = cursor && typeof cursor.entity === "string" && Number.isInteger(cursor.nextOffset) && cursor.nextOffset > 0;
    const state = this._state(conversationId, userId, { create: Boolean(valid) });
    if (!state) return null;
    state.listCursor = valid ? { entity: cursor.entity, nextOffset: cursor.nextOffset, total: cursor.total || null, language: cursor.language || null, ...(cursor.mine === true ? { mine: true } : {}), ...(listOptions(cursor.options) ? { options: listOptions(cursor.options) } : {}) } : null;
    state.updatedAt = this.clock();
    return state.listCursor;
  }

  getListCursor(conversationId, userId) {
    const state = this._state(conversationId, userId);
    return state && state.listCursor ? { ...state.listCursor } : null;
  }

  getFocusEntity(conversationId, userId) {
    const state = this._state(conversationId, userId);
    return state && state.focusEntity ? { ...state.focusEntity } : null;
  }

  getState(conversationId, userId) {
    const state = this._state(conversationId, userId);
    return state ? JSON.parse(JSON.stringify(state)) : null;
  }

  setPageContext(conversationId, userId, pageContext) {
    const normalized = normalizePageContext(pageContext);
    const state = this._state(conversationId, userId, { create: Boolean(normalized) });
    if (!state) return null;
    state.pageContext = normalized;
    state.updatedAt = this.clock();
    return normalized;
  }

  /**
   * Phase 2 — mémorise les documents joints à un message (le plus récent en
   * tête). Uniquement des métadonnées ({documentId, filename}), jamais le
   * contenu. Renvoie la liste active après mise à jour.
   */
  setActiveDocuments(conversationId, userId, documents) {
    const list = (Array.isArray(documents) ? documents : [])
      .filter((d) => d && typeof d.documentId === "string")
      .map((d) => ({ documentId: d.documentId, filename: typeof d.filename === "string" ? d.filename.slice(0, 120) : null }));
    const state = this._state(conversationId, userId, { create: list.length > 0 });
    if (!state) return [];
    const merged = [...list, ...state.activeDocuments.filter((d) => !list.some((n) => n.documentId === d.documentId))];
    state.activeDocuments = merged.slice(0, 5);
    state.updatedAt = this.clock();
    return state.activeDocuments.slice();
  }

  /**
   * Construit le contexte d'UN tour à partir des entités extraites et de
   * l'état courant. Ne lit rien d'autre que cet état — aucune I/O.
   *
   * @returns {{
   *   activeEntity: string|null, entityType: string|null, filters: object,
   *   reference: {kind, items?, item?, source}|null, pageContext: object|null,
   *   clarification: string|null, inferredIntent: string|null
   * }}
   */
  buildTurnContext({ conversationId, userId, entities, intentName = null }) {
    const state = this._state(conversationId, userId) || this._emptyState(userId);
    const e = entities || {};
    const pageEntity = state.pageContext && state.pageContext.entity;

    // Entité du tour : explicite dans le message > entité de l'intention >
    // entité active de la conversation (pour une référence/un filtre sans nom) > écran courant.
    const explicitEntity = e.entityType && ENTITY_TO_INTENT[e.entityType] ? e.entityType : null;
    const intentEntity = intentName ? INTENT_TO_ENTITY[intentName] || null : null;
    const isFollowUp = Boolean(e.reference || (e.hasFilters && !explicitEntity));
    const contextEntity = isFollowUp ? state.activeEntity || pageEntity || null : null;
    const entityType = explicitEntity || intentEntity || contextEntity;
    // D'où vient l'entité : seules "context"/"page" autorisent une résolution
    // d'intention PAR LE CONTEXTE (SemanticIntentResolver) — une entité lue
    // dans le message lui-même relève de la détection normale.
    const entitySource = explicitEntity
      ? "message"
      : intentEntity
        ? "intent"
        : contextEntity
          ? state.activeEntity
            ? "context"
            : "page"
          : null;

    // Filtres : un tour de SUIVI (référence/filtre sans nouvelle entité) hérite
    // des filtres précédents sur la même entité (« mes projets » → « ceux en cours »
    // reste « mes » projets) ; une nouvelle question repart de zéro.
    const inherited = isFollowUp && entityType && state.activeEntity === entityType ? { ...state.filters } : {};
    const filters = { ...inherited };
    if (e.ownership) filters.ownership = e.ownership;
    if (e.status) filters.status = e.status;
    if (e.period) filters.period = e.period;
    if (e.relance) filters.relance = e.relance;
    if (e.product) filters.product = e.product;
    if (e.person) filters.person = e.person;
    if (e.quantity) filters.quantity = e.quantity;

    let reference = null;
    let clarification = null;
    const sameEntityResults = state.lastResults && state.lastResults.entity === entityType ? state.lastResults : null;

    const referencesSupported = Boolean(entityType && this.referenceEntities.has(entityType));
    if (!referencesSupported) {
      // Pas de résolution de référence pour cette entité (voir referenceEntities).
    } else if (e.ordinal) {
      const items = sameEntityResults ? sameEntityResults.items : [];
      const index = e.ordinal === -1 ? items.length - 1 : e.ordinal - 1;
      if (items[index]) {
        reference = { kind: "single", item: items[index], source: "ordinal" };
      } else {
        clarification = items.length
          ? `La liste précédente ne contient que ${items.length} élément(s) — lequel souhaitez-vous ?`
          : "Je n'ai pas de liste précédente à laquelle ce rang pourrait correspondre — pouvez-vous préciser l'élément souhaité ?";
      }
    } else if (e.reference && e.reference.kind === "single") {
      if (state.currentRecord && (!entityType || state.currentRecord.entity === entityType)) {
        reference = { kind: "single", item: state.currentRecord, source: state.currentRecord.source || "conversation" };
      } else if (sameEntityResults && sameEntityResults.items.length === 1) {
        reference = { kind: "single", item: sameEntityResults.items[0], source: "last_result" };
      } else if (state.pageContext && state.pageContext.recordId && (!entityType || pageEntity === entityType)) {
        reference = {
          kind: "single",
          item: { entity: pageEntity, id: state.pageContext.recordId, name: state.pageContext.label || null },
          source: "page",
        };
      } else {
        clarification = sameEntityResults && sameEntityResults.items.length > 1
          ? `Plusieurs éléments ont été affichés (${sameEntityResults.items.length}) — lequel souhaitez-vous (par exemple « le deuxième ») ?`
          : "Je ne sais pas à quel élément vous faites référence — pouvez-vous le nommer ou ouvrir sa fiche ?";
      }
    } else if (e.reference && e.reference.kind === "set" && sameEntityResults) {
      reference = { kind: "set", items: sameEntityResults.items, total: sameEntityResults.total, source: "last_result" };
    }

    // Phase 2 — projet « actuel » pour une comparaison document ↔ CRM : fiche
    // courante de la conversation, sinon fiche projet ouverte dans Flutter.
    // Un simple identifiant, toujours relu par un Tool scopé (RBAC).
    let currentProject = null;
    if (state.currentRecord && state.currentRecord.entity === "project") {
      currentProject = { id: state.currentRecord.id, name: state.currentRecord.name || null, source: state.currentRecord.source || "conversation" };
    } else if (state.pageContext && state.pageContext.entity === "project" && state.pageContext.recordId) {
      currentProject = { id: state.pageContext.recordId, name: state.pageContext.label || null, source: "page" };
    }

    return {
      activeEntity: state.activeEntity,
      entityType,
      entitySource,
      documents: state.activeDocuments ? state.activeDocuments.slice() : [],
      currentProject,
      filters,
      reference,
      pageContext: state.pageContext,
      clarification,
      inferredIntent: entityType ? ENTITY_TO_INTENT[entityType] || null : null,
      isFollowUp,
    };
  }

  /**
   * Mémorise le résultat d'un tour : l'Agent peut fournir `resultSet`
   * (`{entity, items, total}`) explicitement ; sinon, les sorties JSON des
   * Tools de liste connus (`RESULT_EXTRACTORS`) sont analysées.
   */
  recordTurn({ conversationId, userId, intentName, turnContext = null, resultSet = null, selectedRecord = null, toolSteps = [] }) {
    const state = this._state(conversationId, userId, { create: true });
    if (!state) return;

    const captured = resultSet || this._captureFromToolSteps(toolSteps);
    const entity = (captured && captured.entity) || (turnContext && turnContext.entityType) || INTENT_TO_ENTITY[intentName] || null;

    if (entity) {
      if (entity !== state.activeEntity) {
        // Changement de sujet : les résultats/fiche de l'ancienne entité ne
        // doivent plus servir de référence (« le deuxième » ≠ l'ancien sujet).
        state.lastResults = null;
        state.currentRecord = null;
      }
      state.activeEntity = entity;
      state.activeIntent = ENTITY_TO_INTENT[entity] || intentName || null;
      // Filtres effectivement appliqués à CE tour — hérités au tour suivant
      // s'il s'agit d'un suivi (voir buildTurnContext).
      state.filters = turnContext && turnContext.entityType === entity ? { ...turnContext.filters } : {};
    }
    if (captured && Array.isArray(captured.items)) {
      state.lastResults = {
        entity: captured.entity,
        total: typeof captured.total === "number" ? captured.total : captured.items.length,
        items: captured.items.slice(0, this.maxItems),
        capturedAt: this.clock(),
      };
      if (captured.items.length === 1) {
        state.currentRecord = { entity: captured.entity, ...captured.items[0], source: "last_result" };
      }
    }
    if (selectedRecord) {
      state.currentRecord = { ...selectedRecord, source: selectedRecord.source || "selection" };
    }
    state.updatedAt = this.clock();
  }

  _captureFromToolSteps(toolSteps) {
    // Le DERNIER Tool de liste exécuté fait foi (un tour peut en appeler plusieurs).
    for (let i = (toolSteps || []).length - 1; i >= 0; i--) {
      const step = toolSteps[i];
      const extractor = step && RESULT_EXTRACTORS[step.tool];
      if (!extractor) continue;
      try {
        const parsed = typeof step.output === "string" ? JSON.parse(step.output) : step.output;
        const captured = extractor(parsed);
        if (captured) return captured;
      } catch (_err) {
        // Sortie non-JSON (résumé textuel d'un chemin déterministe, ou
        // « Error: … ») : rien à capturer, jamais une exception.
      }
    }
    return null;
  }

  clear(conversationId) {
    this._states.delete(conversationId);
  }
}

module.exports = { ContextManager, normalizePageContext, compactProject, ENTITY_TO_INTENT, INTENT_TO_ENTITY };
