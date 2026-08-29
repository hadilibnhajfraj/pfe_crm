"use strict";

/**
 * # Diagnostic direct — crm_assistant_agent, RAG réel (AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md)
 *
 * Étapes 2/3/13 de l'incident : "tester directement l'agent sans passer par
 * Flutter", "vérifier que CRM_ASSISTANT peut réellement appeler le RAG"
 * (recherche documentaire → chunks → contexte → appel LLM → génération),
 * "NE PAS tester uniquement avec des mocks". Contrairement à
 * `test/ai.agents.crmAssistantAgent.test.js` (qaChain entièrement mocké,
 * pour l'identité/le prompt), ce fichier construit la VRAIE chaîne :
 * `RagRetrievalService` réel (ingestion réelle de `docs/user-guide/`,
 * `HashingEmbeddingProvider`/`LexicalOverlapReranker` réels, aucun mock) →
 * `RagContextBuilder` réel → `QaChain` réel → `CrmAssistantAgent` réel.
 * Seul le `chatModel` est factice : c'est la SEULE dépendance réellement
 * externe et actuellement indisponible (quota OpenAI épuisé, voir le
 * rapport d'incident) — isoler cette unique dépendance prouve que tout le
 * RESTE de la chaîne (steps 1 à 3) fonctionne réellement, indépendamment de
 * la disponibilité du fournisseur LLM.
 */

const path = require("path");
const { createRagPipeline } = require("../src/ai/rag/pipeline");
const { RagContextBuilder } = require("../src/ai/langchain/context/ragContextBuilder");
const { QaChain } = require("../src/ai/langchain/chains/qaChain");
const { createCrmAssistantAgent } = require("../src/ai/agents/crmAssistantAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER_GUIDE_ROOT = path.join(__dirname, "..", "docs", "user-guide");
const REPO_ROOT = path.join(__dirname, "..");
const USER = { id: "u1", role: "user" };

async function buildRealChain(chatModel) {
  const pipeline = createRagPipeline({ allowedRoots: [USER_GUIDE_ROOT], displayRoot: REPO_ROOT });
  await pipeline.ingestionService.ingestDirectories([USER_GUIDE_ROOT]);

  const contextBuilder = new RagContextBuilder({ retriever: pipeline.retrievalService });
  const qaChain = new QaChain({ chatModel, contextBuilder });
  const agent = createCrmAssistantAgent({ chatModel, workflowEngine: new LangChainWorkflowEngine(), qaChain });
  return { agent, contextBuilder, pipeline };
}

describe("Diagnostic — crm_assistant_agent avec le VRAI pipeline RAG (étapes 2/3)", () => {
  test("étape 1 (recherche documentaire) : retrieve('Comment créer un projet ?') retourne des candidats réels, jamais zéro", async () => {
    const { pipeline } = await buildRealChain(new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }));
    const result = await pipeline.retrievalService.retrieve("Comment créer un projet ?");
    expect(result.citations.length).toBeGreaterThan(0);
  });

  test("étape 2 (récupération des chunks) + étape 3 (construction du contexte) : le contexte contient un extrait réel du guide, pas un texte fabriqué", async () => {
    const { contextBuilder } = await buildRealChain(new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }));
    const context = await contextBuilder.buildContext(USER, { query: "Comment créer un projet ?" });

    expect(context.citations.length).toBeGreaterThan(0);
    expect(context.citations[0].title).toBe("Comment créer un projet dans le CRM");
    expect(context.contextText).toContain("[1]");
    expect(context.contextText).not.toContain("(aucun passage pertinent trouvé");
  });

  test("étape 4 (appel LLM) + étape 5 (génération) : le chatModel reçoit bien le contexte RAG réel dans son prompt, et sa réponse traverse jusqu'à l'utilisateur", async () => {
    let receivedMessages = null;
    // Ne JAMAIS faire d'assertion Jest à l'intérieur de `complete` : une
    // assertion qui échoue y lève une exception, que BaseAgent.execute()
    // absorbe alors comme n'importe quelle autre panne (dégradation
    // gracieuse) — masquant le vrai échec derrière le message générique
    // "n'a pas pu traiter cette demande" plutôt que de faire échouer CE
    // test avec un message clair (piège découvert en écrivant ce test).
    const complete = jest.fn(async (messages) => {
      receivedMessages = messages;
      return "### Créer un projet\n\n1. Ouvrez l'assistant de création (5 étapes : Général, Détails, Contacts, Localisation, Action).";
    });
    const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
    const { agent } = await buildRealChain(chatModel);

    const result = await agent.execute({ intent: { name: "documentation_question" }, message: "Comment créer un projet ?", user: USER, conversationId: null });

    expect(complete).toHaveBeenCalledTimes(1);
    // Preuve que le VRAI contexte RAG (pas un texte inventé) a atteint le
    // modèle : le message humain contient un extrait réel du guide
    // (formulaire en 5 étapes) et le nom exact du guide source, dans le
    // gabarit "Contexte: ... Question: ..." de QaChain.
    const humanMessage = receivedMessages.find((m) => m.role === "user");
    expect(humanMessage.content).toContain("formulaire en 5 étapes");
    expect(humanMessage.content).toContain("Comment créer un projet dans le CRM");
    expect(humanMessage.content).toContain("Question: Comment créer un projet ?");
    expect(result.answer).toContain("Créer un projet");
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].title).toBe("Comment créer un projet dans le CRM");
  });

  test("si le RAG ne trouve VRAIMENT rien (question hors sujet), le contexte le dit explicitement — jamais un contexte vide silencieux", async () => {
    const { contextBuilder } = await buildRealChain(new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }));
    const context = await contextBuilder.buildContext(USER, { query: "xyzxyz question totalement hors sujet abcabc" });

    // Le retriever a un plancher de pertinence (minScore) — une question
    // sans aucun recoupement lexical avec la base de connaissances peut
    // légitimement retourner 0 citation ; dans ce cas le contexte doit le
    // dire explicitement (jamais un contexte vide sans explication).
    if (context.citations.length === 0) {
      expect(context.contextText).toContain("aucun passage pertinent trouvé");
    } else {
      expect(context.citations.length).toBeGreaterThan(0);
    }
  });
});
