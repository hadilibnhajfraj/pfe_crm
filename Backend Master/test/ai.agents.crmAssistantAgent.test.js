"use strict";

const { createCrmAssistantAgent, SYSTEM_PROMPT } = require("../src/ai/agents/crmAssistantAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER = { id: "u1", role: "user" };

function chatModelReturning(text) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => text) } });
}

describe("CrmAssistantAgent — identité et prompt système", () => {
  test("gère exclusivement l'intention 'documentation_question'", () => {
    const agent = createCrmAssistantAgent({ chatModel: chatModelReturning("x"), workflowEngine: new LangChainWorkflowEngine(), qaChain: { invoke: jest.fn() } });
    expect(agent.name).toBe("crm_assistant_agent");
    expect(agent.canHandle({ name: "documentation_question" })).toBe(true);
    expect(agent.canHandle({ name: "projects" })).toBe(false);
  });

  test("ouvert à tout utilisateur authentifié — pas de restriction de rôle", () => {
    const agent = createCrmAssistantAgent({ chatModel: chatModelReturning("x"), workflowEngine: new LangChainWorkflowEngine(), qaChain: { invoke: jest.fn() } });
    expect(agent.requiredRoles).toEqual([]);
    expect(agent.allowedEmails).toEqual([]);
  });

  test("n'a accès à AUCUN Tool — répond uniquement via le RAG", () => {
    const agent = createCrmAssistantAgent({ chatModel: chatModelReturning("x"), workflowEngine: new LangChainWorkflowEngine(), qaChain: { invoke: jest.fn() } });
    expect(agent.allowedToolNames).toEqual([]);
  });

  // Vérifie littéralement, dans le texte du prompt système, chaque exigence
  // demandée : connaît les modules/écrans/boutons/formulaires/workflows/
  // permissions, répond en français, explique simplement, guide étape par
  // étape, ne jamais inventer.
  test.each([
    [/modules/i, "connaît tous les modules"],
    [/écrans/i, "connaît tous les écrans"],
    [/boutons/i, "connaît tous les boutons"],
    [/champ/i, "connaît tous les champs de formulaire"],
    [/workflows/i, "connaît tous les workflows"],
    [/permission/i, "connaît toutes les permissions"],
    [/français/i, "répond en français"],
    [/simples/i, "explique simplement"],
    [/ÉTAPE PAR ÉTAPE|étape par étape/i, "guide étape par étape"],
    [/jamais.*invente|jamais inventer/i, "ne jamais inventer"],
    // AI-Business-Copilot/17_CRM_ASSISTANT_DIAGNOSTIC.md, étape 11 —
    // défense en profondeur explicite dans le TEXTE du prompt, en plus de
    // la garantie architecturale déjà en place (allowedToolNames: []).
    [/ne modifies, ne crées et ne supprimes jamais/i, "n'effectue jamais d'écriture"],
    [/ne prétends jamais avoir effectué une action/i, "ne prétend jamais avoir agi"],
    // AI-Business-Copilot/22_RAG_USER_GUIDE_PRIORITY.md — le bug rapporté
    // n'était pas "aucune source trouvée" mais "réponse vague alors que la
    // vraie procédure était disponible" (ex. "consultez le guide dédié..."
    // au lieu des étapes réelles) — défense en profondeur ajoutée au texte
    // du prompt, en plus de la correction du ranking RAG lui-même.
    [/ne dis JAMAIS simplement que le guide existe/i, "extrait le contenu réel, ne renvoie jamais juste vers le guide"],
    [/indique.*précisément ce qui manque/i, "précise ce qui manque plutôt qu'une réponse vague"],
  ])("le prompt système satisfait l'exigence : %s (%s)", (pattern) => {
    expect(SYSTEM_PROMPT).toMatch(pattern);
  });
});

describe("CrmAssistantAgent — ne jamais exécuter d'action, jamais de Tool même si fourni", () => {
  test("un Tool disponible n'est jamais appelé — répond toujours via qaChain", async () => {
    const tool = { name: "list_projects", description: "d", invoke: jest.fn() };
    const qaChain = { invoke: jest.fn(async () => ({ answer: "Voici comment faire.", citations: [] })) };
    const agent = createCrmAssistantAgent({ chatModel: chatModelReturning("x"), tools: [tool], workflowEngine: new LangChainWorkflowEngine(), qaChain });

    await agent.execute({ intent: { name: "documentation_question" }, message: "Comment créer un projet ?", user: USER, conversationId: null });

    expect(tool.invoke).not.toHaveBeenCalled();
    expect(qaChain.invoke).toHaveBeenCalled();
  });
});

describe("CrmAssistantAgent — dégrade gracieusement si le RAG échoue", () => {
  test("une erreur du qaChain devient une réponse honnête, jamais une exception visible", async () => {
    const qaChain = { invoke: jest.fn(async () => { throw new Error("vector store unavailable"); }) };
    const agent = createCrmAssistantAgent({ chatModel: chatModelReturning("x"), workflowEngine: new LangChainWorkflowEngine(), qaChain });

    const result = await agent.execute({ intent: { name: "documentation_question" }, message: "Comment créer un client ?", user: USER, conversationId: null });

    expect(result.answer).toContain("crm_assistant_agent");
  });
});
