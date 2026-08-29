"use strict";

// Mission "CORRIGER LA PRÉSENTATION DES RÉPONSES POR PROMESH" — vérifie
// qu'une réponse RÉELLE de por_promesh_agent (VRAI Ollama/qwen3:8b, VRAI
// Tool list_por_promesh contre la vraie base) ne contient JAMAIS de balise
// HTML (<br>, <p>, <div>, <table>, <tr>, <td>, <b>, <strong>, <ul>, <li>) —
// le bug concret signalé ("Identifiant: xxx<br>Date de production:
// ...<br>..."). Complète le test statique (ci-dessous, déterministe, sans
// LLM) qui verrouille la présence de l'instruction anti-HTML elle-même dans
// SYSTEM_PROMPT.
require("dotenv").config();
const { sequelize } = require("../src/db");
const { createPorPromeshAgent, SYSTEM_PROMPT } = require("../src/ai/agents/porPromeshAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { createServer } = require("../src/ai/mcp/server/start");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools/mcpToolAdapter");
const { loadAiConfig } = require("../src/ai/config/ai.config");
const { createLlmProvider } = require("../src/ai/services/providers");

const REAL_SUPERADMIN = { id: "6242fb88-a0bc-4535-bddd-5285b91ca0ed", role: "superadmin" };

const HTML_TAG_RE = /<\/?(br|p|div|table|tr|td|b|strong|ul|li)\b[^>]*>/i;

afterAll(async () => {
  await sequelize.close();
});

describe("PorPromeshAgent — la nouvelle instruction anti-HTML est bien présente dans SYSTEM_PROMPT (déterministe, sans LLM)", () => {
  test("SYSTEM_PROMPT interdit explicitement les balises HTML citées dans le bug signalé", () => {
    expect(SYSTEM_PROMPT).toMatch(/INTERDICTION ABSOLUE DES BALISES HTML/i);
    for (const tag of ["<br>", "<p>", "<div>", "<table>", "<tr>", "<td>", "<b>", "<strong>", "<ul>", "<li>"]) {
      expect(SYSTEM_PROMPT).toContain(tag);
    }
  });
});

describe("PorPromeshAgent — TEST LIVE : une réponse RÉELLE (Ollama qwen3:8b + vraie base) ne contient jamais de balise HTML", () => {
  test('"donner moi les fiches produites PROMESH" -> réponse réelle sans aucune balise HTML', async () => {
    const llmProvider = createLlmProvider(loadAiConfig().llm);
    if (!llmProvider) {
      // Environnement sans LLM configuré/joignable : ne fait pas échouer la
      // suite pour une raison d'infrastructure, mais le signale clairement
      // plutôt que de prétendre avoir vérifié quelque chose.
      console.warn("[TEST LIVE ignoré] Aucun provider LLM configurable (voir .env AI_LLM_PROVIDER) — impossible de vérifier une VRAIE réponse.");
      return;
    }

    const server = createServer({ rateLimiter: null, auditLog: null });
    const tools = createMcpToolAdapters({ mcpServer: server, actingUser: REAL_SUPERADMIN });
    const chatModel = new LlmProviderChatModel({ llmProvider });
    const agent = createPorPromeshAgent({
      chatModel,
      tools,
      workflowEngine: new LangChainWorkflowEngine(),
      maxToolCalls: 5,
      maxHistoryMessages: 6,
    });

    const result = await agent.execute({
      intent: { name: "por_promesh" },
      message: "donner moi les fiches produites PROMESH",
      user: REAL_SUPERADMIN,
      conversationId: null,
    });

    expect(typeof result.answer).toBe("string");
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.answer).not.toMatch(HTML_TAG_RE);
  }, 480000);
});
