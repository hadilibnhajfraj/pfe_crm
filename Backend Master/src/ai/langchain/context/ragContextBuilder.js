"use strict";

const { IContextBuilder } = require("../../services/contextBuilder.interface");

// `guard` (security/promptInjectionGuard.js), when provided, scans text
// BEFORE it enters the rendered prompt — never the citation/history OBJECTS
// themselves (those keep flowing to the caller unchanged, e.g. for display —
// see RagContextBuilder's own doc comment). This is the kernel's primary
// defense against INDIRECT prompt injection: a RAG-ingested document is
// authored by someone who is not necessarily trustworthy (see
// rag/sourceGuard.js's own threat model), so its retrieved excerpt is
// exactly the kind of content that could carry a hidden "ignore previous
// instructions" payload.
function guardedText(text, guard) {
  if (!guard || !text) return text;
  return guard.scan(text).sanitizedText;
}

function renderContextText(citations, history, guard = null) {
  const parts = [];

  parts.push(
    citations.length
      ? citations.map((c) => `[${c.index}] (${c.title || c.sourceType || "source"}) ${guardedText(c.excerpt, guard)}`).join("\n\n")
      : "(aucun passage pertinent trouvé dans la documentation)"
  );

  if (history.length) {
    const historyText = history.map((m) => `${m.role}: ${guardedText(m.content, guard)}`).join("\n");
    parts.push(`Historique récent de la conversation :\n${historyText}`);
  }

  return parts.join("\n\n");
}

/**
 * # RagContextBuilder — assemble le contexte d'un appel LLM
 *
 * ## Rôle
 * Première implémentation concrète du port `IContextBuilder`
 * (src/ai/services/contextBuilder.interface.js), qui n'existait jusqu'ici
 * que comme contrat vide (passe d'infrastructure initiale). Assemble deux
 * sources déjà construites ailleurs dans le kernel — jamais de nouvel
 * accès aux données :
 * - `IRetriever` (voir rag/) pour les passages documentaires pertinents à
 *   `scope.query`, transformés en citations traçables ;
 * - `IConversationMemory` (voir memory/) pour l'historique récent de
 *   `scope.conversationId`, si fourni.
 *
 * Respecte à la lettre la règle déjà écrite dans le port : "ne jamais
 * introduire un nouvel accès aux données" — cette classe ne fait qu'appeler
 * deux collaborateurs déjà validés par leurs propres garanties (le RAG ne
 * lit jamais le métier — voir rag/sourceGuard.js — et la mémoire de
 * conversation n'est, à ce stade, qu'un stockage volatil générique).
 *
 * ## Entrée
 * `buildContext(user, scope?: { query？: string, conversationId?: string })`
 *
 * ## Sortie
 * `{ user, query, citations: Citation[], history: Message[], contextText: string }`
 * — `contextText` est la version pré-rendue en une seule chaîne, prête à
 * être injectée dans un `ChatPromptTemplate` (voir chains/qaChain.js, le
 * principal consommateur).
 *
 * ## Sécurité
 * `promptInjectionGuard` (security/promptInjectionGuard.js), optionnel :
 * quand fourni, chaque excerpt de citation et chaque message d'historique
 * est scanné avant d'entrer dans `contextText` — jamais les objets
 * `citations`/`history` retournés eux-mêmes, qui restent intacts pour un
 * éventuel affichage (voir `guardedText()` ci-dessus). Sans lui (défaut),
 * le comportement est strictement identique à avant — rétrocompatible avec
 * tout appelant existant.
 *
 * ## Erreurs
 * Aucune levée volontairement : `scope.query` absent → `citations: []` ;
 * `scope.conversationId` absent ou `memory` non fourni → `history: []`.
 * Un contexte vide reste un contexte valide (`contextText` l'indique
 * explicitement) — c'est à la chain appelante de décider quoi faire d'une
 * réponse sans passage pertinent. (En mode `"block"` du guard, un excerpt
 * jugé malveillant lève `PromptInjectionDetectedError` — la seule
 * exception à "aucune levée volontairement", délibérée : voir
 * security/errors.js.)
 */
class RagContextBuilder extends IContextBuilder {
  constructor({ retriever, memory = null, maxCitations = 5, maxHistoryMessages = 6, promptInjectionGuard = null }) {
    super();
    this.retriever = retriever;
    this.memory = memory;
    this.maxCitations = maxCitations;
    this.maxHistoryMessages = maxHistoryMessages;
    this.promptInjectionGuard = promptInjectionGuard;
  }

  async buildContext(user, scope = {}) {
    const { query = null, conversationId = null } = scope;

    const citations = query ? (await this.retriever.retrieve(query, { topK: this.maxCitations })).citations : [];

    const history =
      this.memory && conversationId ? await this.memory.getHistory(conversationId, { limit: this.maxHistoryMessages }) : [];

    return {
      user,
      query,
      citations,
      history,
      contextText: renderContextText(citations, history, this.promptInjectionGuard),
    };
  }
}

module.exports = { RagContextBuilder, renderContextText };
