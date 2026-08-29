"use strict";

const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { IChain } = require("./chain.interface");
const { LangChainError } = require("../errors");

/**
 * # SummarizationChain — résumé borné d'un texte fourni en entrée
 *
 * ## Rôle
 * Résume un texte déjà en main (ex. un passage RAG, une note, un
 * commentaire) — ne va chercher aucune donnée lui-même : tout le contexte
 * à résumer arrive dans l'entrée `text`. Utile en étape de `WorkflowEngine`
 * pour condenser plusieurs passages avant une réponse finale.
 *
 * ## Entrée
 * `{ text: string, focus?: string }` — `focus` oriente le résumé sur un
 * aspect particulier sans changer les faits résumés.
 *
 * ## Sortie
 * `{ summary: string }`
 *
 * ## Composition LangChain
 * `ChatPromptTemplate` → `chatModel` → `StringOutputParser`, via
 * `RunnableSequence` — la chain la plus simple du module, volontairement,
 * pour servir de gabarit de référence aux deux autres.
 *
 * ## Erreurs
 * Lève `LangChainError` si `text` est vide/absent.
 */
class SummarizationChain extends IChain {
  constructor({ chatModel, maxWords = 150 }) {
    super();
    this.chatModel = chatModel;
    this.maxWords = maxWords;
  }

  get name() {
    return "summarization_chain";
  }

  async invoke({ text, focus }) {
    if (!text || !text.trim()) {
      throw new LangChainError("SummarizationChain requires a non-empty 'text'.");
    }

    const instruction = focus
      ? `Résume le texte suivant en français, en au plus ${this.maxWords} mots, en te concentrant sur : ${focus}. Ne dépasse jamais les faits présents dans le texte.`
      : `Résume le texte suivant en français, en au plus ${this.maxWords} mots. Ne dépasse jamais les faits présents dans le texte.`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", instruction],
      ["human", "{text}"],
    ]);
    const runnable = RunnableSequence.from([prompt, this.chatModel, new StringOutputParser()]);
    const summary = await runnable.invoke({ text });

    return { summary };
  }
}

module.exports = { SummarizationChain };
