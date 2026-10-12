"use strict";

// Phase 1 — SemanticIntentResolver : comprendre au-delà des mots-clés SANS
// jamais dégrader le routage lexical déjà validé (corpus de 577 scénarios).

const { SCENARIOS } = require("./fixtures/copilotValidationScenarios");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { SemanticIntentResolver } = require("../src/ai/orchestrator/semanticIntentResolver");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");

const quietLogger = { info() {}, warn() {} };
const detector = createLexicalIntentDetector({});
const COMMERCIAL = { id: "u-com", role: "commercial" };
const RLA = { id: "u-rla", role: "responsable_logistique_achat" };

async function understand(message, { resolver = new SemanticIntentResolver({ logger: quietLogger }), contextManager = new ContextManager(), conversationId = null, user = COMMERCIAL } = {}) {
  const intent = await detector.detect(message, {});
  const entities = extractEntities(message);
  const turnContext = contextManager.buildTurnContext({ conversationId, userId: user.id, entities, intentName: intent.name });
  return resolver.resolve({ intent, message, entities, turnContext, user });
}

describe("Non-régression : les 577 scénarios validés gardent EXACTEMENT leur intention", () => {
  // Seule clarification assumée : « Montre les devis. » (smart-12) — une vraie
  // demande de consultation sans Tool correspondant ; proposer des options
  // plutôt qu'une réponse générique est le comportement voulu (l'intention
  // reste general_chat, jamais une intention inventée).
  const INTENTIONAL_CLARIFICATIONS = new Set(["smart-12"]);

  test.each(SCENARIOS.map((s) => [s.id, s]))("%s", async (_id, s) => {
    const out = await understand(s.message, { user: s.actingUser });
    expect(out.intent.name).toBe(s.expectedIntent);
    if (!INTENTIONAL_CLARIFICATIONS.has(s.id)) expect(out.clarification).toBeNull();
  });
});

describe("Formulations naturelles → même intention métier", () => {
  test.each([
    "Quels sont mes projets ?",
    "Montre-moi mes projets.",
    "Je veux voir les projets dont je m'occupe.",
    "Tu peux me donner mes projets en cours ?",
    "Quels projets sont actuellement sous ma responsabilité ?",
    "Montre-moi les projets que je suis actuellement en train de suivre.",
    "Quels dossiers sont à ma charge ?",
    "Montre-moi mes affaires en cours",
    "Liste mes chantiers",
  ])("%s → projects", async (message) => {
    const out = await understand(message);
    expect(out.intent.name).toBe("projects");
    expect(out.clarification).toBeNull();
  });

  test("une intention lexicale précise n'est JAMAIS remplacée", async () => {
    const out = await understand("Crée une demande de maintenance pour la machine 3");
    expect(out.intent.name).toBe("maintenance");
    expect(out.intent.resolvedBy).toBe("lexical");
  });
});

describe("Contexte conversationnel : un suivi sans mot-clé reprend l'entité active", () => {
  test("après une liste de projets, « Et ceux de cette semaine ? » → projects (confiance 0.75, via le contexte)", async () => {
    const contextManager = new ContextManager();
    contextManager.recordTurn({ conversationId: "c1", userId: COMMERCIAL.id, intentName: "projects", turnContext: { entityType: "project", filters: {} } });
    const out = await understand("Et ceux de cette semaine ?", { contextManager, conversationId: "c1" });
    expect(out.intent).toMatchObject({ name: "projects", resolvedBy: "context", confidence: 0.75 });
  });

  test("sans contexte, la même phrase ne devient jamais une intention inventée", async () => {
    const out = await understand("Et ceux de cette semaine ?");
    expect(out.intent.name).toBe("general_chat");
  });
});

describe("Clarification automatique — jamais « je ne comprends pas »", () => {
  // Plus jamais « projets / maintenance / RH » proposés par défaut : sans
  // entité identifiable, une question de précision SANS options arbitraires.
  test("demande de données incomprise, sans entité → question de précision, aucune option arbitraire", async () => {
    for (const user of [undefined, RLA]) {
      const out = await understand("Montre-moi les trucs importants", user ? { user } : undefined);
      expect(out.intent.name).toBe("general_chat");
      expect(out.clarification.message).toMatch(/Je veux m'assurer de bien comprendre votre demande/);
      expect(out.clarification.options).toEqual([]);
    }
  });

  test("entité identifiée (ingénieurs) mais opération floue → options sur les ingénieurs UNIQUEMENT", async () => {
    const out = await understand("Ingénieurs");
    expect(out.clarification.message).toBe("Que souhaitez-vous savoir sur les ingénieurs ?");
    expect(out.clarification.options.map((o) => o.label)).toEqual(["Voir la liste des ingénieurs", "Voir le nombre de projets par ingénieur", "Voir l'ingénieur qui a le plus de projets"]);
    expect(out.clarification.options.map((o) => o.label).join(" ")).not.toMatch(/maintenance|RH/);
  });

  test.each([["Engineers", "What would you like to know about the engineers?"], ["Инженеры", "Что вы хотите узнать об инженерах?"]])(
    "« %s » : clarification sur les ingénieurs dans la langue du message",
    async (message, expected) => {
      expect((await understand(message)).clarification.message).toBe(expected);
    }
  );

  test("« Ajouter un client » n'est pas une simple mention d'entité : aucune clarification", async () => {
    expect((await understand("Ajouter un client")).clarification).toBeNull();
  });

  test("entité ingénieur dans une demande de données → intention engineers (sans LLM)", async () => {
    const out = await understand("Affiche tous les ingénieurs référencés");
    expect(out.intent.name).toBe("engineers");
  });

  test("entité sans capacité Copilot (machines) → réponse honnête, aucun Agent sollicité", async () => {
    const out = await understand("Combien de machines sont actives ?");
    expect(out.intent.resolvedBy).toBe("unsupported_entity");
    expect(out.clarification.message).toMatch(/pas encore accès au catalogue des machines/);
  });

  test.each(["Bonjour !", "Merci beaucoup, à bientôt !", "Quelle est la météo aujourd'hui ?", "Raconte-moi une blague."])(
    "« %s » : conversation normale, aucune clarification",
    async (message) => {
      const out = await understand(message);
      expect(out.intent.name).toBe("general_chat");
      expect(out.clarification).toBeNull();
    }
  );
});

describe("Repli sémantique LLM — contraint au catalogue, borné dans le temps", () => {
  test("clé valide renvoyée par le routeur LLM existant → intention résolue (confiance 0.6)", async () => {
    const llmRouter = { route: jest.fn(async () => "hr") };
    const resolver = new SemanticIntentResolver({ llmRouter, logger: quietLogger });
    const out = await understand("Je voudrais poser quelques jours la semaine prochaine", { resolver });
    expect(llmRouter.route).toHaveBeenCalledTimes(1);
    expect(out.intent).toMatchObject({ name: "hr", resolvedBy: "llm", confidence: 0.6 });
  });

  test("clé hors catalogue → ignorée (jamais une intention inventée)", async () => {
    const resolver = new SemanticIntentResolver({ llmRouter: { route: async () => "delete_everything" }, logger: quietLogger });
    const out = await understand("Je voudrais poser quelques jours la semaine prochaine", { resolver });
    expect(out.intent.name).toBe("general_chat");
  });

  test("LLM trop lent → délai dépassé, repli déterministe", async () => {
    const resolver = new SemanticIntentResolver({ llmRouter: { route: () => new Promise((r) => setTimeout(() => r("hr"), 500)) }, llmTimeoutMs: 20, logger: quietLogger });
    const out = await understand("Je voudrais poser quelques jours la semaine prochaine", { resolver });
    expect(out.intent.name).toBe("general_chat");
  });

  test("LLM en erreur → aucun plantage", async () => {
    const resolver = new SemanticIntentResolver({ llmRouter: { route: async () => { throw new Error("ollama down"); } }, logger: quietLogger });
    const out = await understand("Je voudrais poser quelques jours la semaine prochaine", { resolver });
    expect(out.intent.name).toBe("general_chat");
  });

  test("une entité détectée n'est JAMAIS remplacée par le LLM (« ingénieurs » → projects refusé) : clarification sur les ingénieurs", async () => {
    const llmRouter = { route: jest.fn(async () => "projects") };
    const resolver = new SemanticIntentResolver({ llmRouter, logger: quietLogger });
    const out = await understand("Je voudrais consulter les ingénieurs", { resolver });
    expect(out.intent.name).not.toBe("projects");
    expect(out.intent.name).toBe("engineers"); // « consulter » + entité ingénieur → engineers, avant même le LLM
  });

  test("LLM qui propose une intention d'une autre entité pour une question floue sur les ingénieurs : refusée", async () => {
    const llmRouter = { route: jest.fn(async () => "maintenance") };
    const resolver = new SemanticIntentResolver({ llmRouter, logger: quietLogger });
    const out = await understand("Et côté ingénieurs, qu'en est-il ?", { resolver });
    expect(llmRouter.route).toHaveBeenCalled();
    expect(out.intent.name).not.toBe("maintenance");
  });

  test("jamais appelé pour une salutation ni pour une intention lexicale précise (aucun coût inutile)", async () => {
    const llmRouter = { route: jest.fn(async () => "hr") };
    const resolver = new SemanticIntentResolver({ llmRouter, logger: quietLogger });
    await understand("Bonjour, tu vas bien ?", { resolver });
    await understand("Quels sont mes projets ?", { resolver });
    expect(llmRouter.route).not.toHaveBeenCalled();
  });
});
