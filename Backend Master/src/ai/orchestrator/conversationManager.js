"use strict";

/**
 * # ConversationManager — bookkeeping d'un tour de conversation
 *
 * ## Rôle
 * Enveloppe `IConversationMemory` (memory/conversationMemory.interface.js)
 * avec les règles que `AIManager` a besoin d'appliquer à chaque tour :
 * forme du message (`{role, content}`), garde `conversationId` optionnelle
 * (un appelant "sans session" — ex. un simple `curl` de test — ne doit pas
 * avoir à fournir un identifiant de conversation), et une limite par défaut
 * d'historique. N'introduit aucun nouveau stockage : `memory` doit être la
 * MÊME instance que celle passée à `RagContextBuilder`
 * (langchain/context/ragContextBuilder.js) pour que l'historique écrit ici
 * soit visible par le Context Builder — voir orchestrator/pipeline.js.
 *
 * ## Le sujet courant — indépendant de la fenêtre d'historique (conversations longues)
 * `getHistory()` reste TOUJOURS fenêtrée (`maxHistoryMessages`, 20 par
 * défaut — voir `CONVERSATION_CONTEXT.md`) : garder tout le texte d'une
 * conversation indéfiniment n'aurait aucun sens (coût mémoire/tokens). Mais
 * `ConversationContextResolver` n'a besoin que d'UN mot (l'`intent` du
 * dernier tour assistant connu), pas du texte — le suivre séparément, dans
 * une simple `Map<conversationId, intentKey>` mise à jour à chaque tour
 * assistant, coûte presque rien et permet au Copilot de continuer à
 * comprendre "de quoi on parle" bien après que le tour qui a établi le
 * sujet soit sorti de la fenêtre d'historique — voir
 * `getCurrentTopic()`/`test/ai.orchestrator.conversationManager.test.js`,
 * "conversations longues".
 *
 * ## Erreurs
 * Aucune levée volontairement : sans `conversationId`, chaque méthode
 * devient un no-op silencieux plutôt qu'une erreur — un appelant qui ne
 * suit pas de conversation ne doit pas être pénalisé.
 */
class ConversationManager {
  constructor({ memory, maxHistoryMessages = 20 }) {
    this.memory = memory;
    this.maxHistoryMessages = maxHistoryMessages;
    this._currentTopic = new Map();
  }

  async recordUserMessage(conversationId, content) {
    if (!conversationId) return;
    await this.memory.append(conversationId, { role: "user", content });
  }

  async recordAssistantMessage(conversationId, content, meta = {}) {
    if (!conversationId) return;
    await this.memory.append(conversationId, { role: "assistant", content, ...meta });
    // "general_chat" est le repli DÉLIBÉRÉ "aucune intention métier précise
    // identifiée" (voir intentCatalog.js) — pas un sujet en soi. Une
    // digression générique ("merci", une salutation) au milieu d'une
    // conversation sur les projets ne doit pas faire OUBLIER ce sujet ;
    // même exclusion, pour la même raison, côté
    // ConversationContextResolver._lastKnownTopic() (repli sur l'historique
    // quand currentTopic n'est pas fourni).
    if (meta.intent && meta.intent !== "general_chat") this._currentTopic.set(conversationId, meta.intent);
  }

  async getHistory(conversationId, { limit } = {}) {
    if (!conversationId) return [];
    return this.memory.getHistory(conversationId, { limit: limit || this.maxHistoryMessages });
  }

  // Le dernier `intent` connu pour cette conversation, quel que soit le
  // nombre de tours écoulés depuis — jamais purgé par la fenêtre
  // d'historique (voir doc de classe). `null` si aucun tour assistant à
  // intention connue n'a encore eu lieu.
  getCurrentTopic(conversationId) {
    if (!conversationId) return null;
    return this._currentTopic.get(conversationId) || null;
  }

  // AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md — appelé par
  // AIManager UNIQUEMENT après une écriture calendrier réelle
  // (create/update/delete_calendar_event), jamais ailleurs : une
  // conversation "collante" (voir ConversationContinuityResolver) ne doit
  // JAMAIS rester bloquée sur meeting_agent une fois le workflow
  // effectivement terminé — le tour suivant repart sur une détection
  // neuve, sans aucune intervention de continuité.
  clearCurrentTopic(conversationId) {
    if (!conversationId) return;
    this._currentTopic.delete(conversationId);
  }

  async reset(conversationId) {
    if (!conversationId) return;
    await this.memory.clear(conversationId);
    this._currentTopic.delete(conversationId);
  }
}

module.exports = { ConversationManager };
