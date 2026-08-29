"use strict";

const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { IChain } = require("./chain.interface");
const { LangChainError } = require("../errors");
const { buildResponseSystemPrompt } = require("../prompts");

const QA_SPECIFIC_INSTRUCTIONS = [
  "Tu réponds UNIQUEMENT à partir du contexte fourni ci-dessous",
  "(documentation, guides, FAQ du CRM — jamais de données métier).",
  'Si le contexte ne contient pas la réponse, dis explicitement "Je ne trouve pas',
  'cette information dans la documentation" plutôt que d\'inventer.',
  "Cite tes sources par leur numéro entre crochets, ex. [1], [2].",
].join(" ");

/**
 * # QaChain — question/réponse ancrée sur la documentation (RAG-grounded)
 *
 * ## Rôle
 * Répond à une question en s'appuyant *exclusivement* sur le contexte que
 * `IContextBuilder` a construit (passages RAG + historique de
 * conversation) — jamais sur des données métier du CRM, puisque
 * `IContextBuilder`/`IRetriever` n'y ont eux-mêmes jamais accès (voir
 * rag/sourceGuard.js et test/ai.rag.policy.test.js).
 *
 * ## Entrée
 * `{ question: string, user: object, scope?: object }` — `scope` est
 * transmis tel quel à `contextBuilder.buildContext(user, { ...scope,
 * query: question })` (ex. `conversationId` pour inclure l'historique).
 *
 * ## Génération de réponse — principes + ton par rôle
 * Le prompt système compose toujours `langchain/prompts/responsePrompts.js`
 * (professionnel, naturel, court, sans hallucination, citer les sources,
 * expliquer le raisonnement, signaler une information manquante) avec les
 * instructions propres au RAG ci-dessus. `role` (optionnel, constructeur)
 * adapte en plus le ton pour l'un des 5 rôles reconnus (admin, commercial,
 * rh, maintenance, direction) — voir `RESPONSE_PROMPTS.md`. Sans `role`
 * (défaut), seuls les principes de base et les instructions RAG s'appliquent.
 *
 * ## Sortie
 * `{ answer: string, citations: Citation[] }` — `citations` provient
 * directement du RAG (`rag/citations/CitationBuilder`), pas reformulée par
 * le modèle : la traçabilité de chaque source est garantie même si le
 * modèle "oublie" de citer correctement dans le texte.
 *
 * ## Composition LangChain
 * `ChatPromptTemplate` (system + human) → `chatModel` (n'importe quel
 * `BaseChatModel`, généralement `LlmProviderChatModel`) → `StringOutputParser`,
 * assemblés via `RunnableSequence`.
 *
 * ## Erreurs
 * Lève `LangChainError` si `question` est vide/absente. Toute erreur du
 * modèle sous-jacent (`ILlmProvider.complete`) remonte telle quelle — cette
 * chain n'avale aucune erreur.
 */
class QaChain extends IChain {
  constructor({ chatModel, contextBuilder, role = null }) {
    super();
    this.chatModel = chatModel;
    this.contextBuilder = contextBuilder;
    this.role = role;
  }

  get name() {
    return "qa_chain";
  }

  async invoke({ question, user, scope = {} }) {
    if (!question || !question.trim()) {
      throw new LangChainError("QaChain requires a non-empty 'question'.");
    }

    const context = await this.contextBuilder.buildContext(user, { ...scope, query: question });

    const systemPrompt = buildResponseSystemPrompt({ role: this.role, extra: QA_SPECIFIC_INSTRUCTIONS });
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", "Contexte:\n{context}\n\nQuestion: {question}"],
    ]);
    const runnable = RunnableSequence.from([prompt, this.chatModel, new StringOutputParser()]);
    const answer = await runnable.invoke({ context: context.contextText, question });

    return { answer, citations: context.citations };
  }
}

module.exports = { QaChain };
