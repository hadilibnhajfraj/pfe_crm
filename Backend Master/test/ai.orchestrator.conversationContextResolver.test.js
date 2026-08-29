"use strict";

const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");

const CATALOG = [
  { key: "projects", moduleKey: "projects", requiresRag: false, requiresTools: true, keywords: ["projet", "projets", "retard"], description: "..." },
  { key: "maintenance", moduleKey: "maintenance", requiresRag: false, requiresTools: true, keywords: ["maintenance", "panne"], description: "..." },
  { key: "general_chat", moduleKey: null, requiresRag: true, requiresTools: false, keywords: [], description: "..." },
];

function history(...entries) {
  return entries;
}

describe("ConversationContextResolver — l'exemple demandé (« Montre-moi les projets » → « Voici les projets » → « Et lesquels sont en retard ? »)", () => {
  test("résout 'lesquels' vers le sujet 'projects' du tour assistant précédent", () => {
    const resolver = new ConversationContextResolver({ catalog: CATALOG });
    const priorHistory = history(
      { role: "user", content: "Montre-moi les projets." },
      { role: "assistant", content: "Voici les projets.", intent: "projects" }
    );

    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: priorHistory });

    expect(result.isReference).toBe(true);
    expect(result.ambiguous).toBe(false);
    expect(result.resolvedTopic).toBe("projects");
    expect(result.enrichedMessage).toBe("Et lesquels sont en retard ? (à propos de projet)");
  });
});

describe("ConversationContextResolver — historique", () => {
  const resolver = new ConversationContextResolver({ catalog: CATALOG });

  test("prend le sujet du tour assistant le PLUS RÉCENT, pas le premier", () => {
    const priorHistory = history(
      { role: "assistant", content: "...", intent: "maintenance" },
      { role: "user", content: "Et les projets ?" },
      { role: "assistant", content: "Voici les projets.", intent: "projects" }
    );
    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: priorHistory });
    expect(result.resolvedTopic).toBe("projects");
  });

  test("ignore un tour utilisateur (n'a pas d'intent) pour trouver le sujet", () => {
    const priorHistory = history(
      { role: "assistant", content: "Voici les projets.", intent: "projects" },
      { role: "user", content: "merci" }
    );
    const result = resolver.resolve({ message: "Et lesquelles sont en retard ?", history: priorHistory });
    expect(result.resolvedTopic).toBe("projects");
  });

  test("ignore un tour 'general_chat' (repli sans intention précise, pas un sujet) — retombe sur un sujet réel plus ancien", () => {
    const priorHistory = history(
      { role: "assistant", content: "Voici les projets.", intent: "projects" },
      { role: "user", content: "merci" },
      { role: "assistant", content: "Je vous en prie.", intent: "general_chat" }
    );
    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: priorHistory });
    expect(result.resolvedTopic).toBe("projects");
  });

  test("ignore une intention qui n'existe plus dans le catalogue actuel", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "une_intention_disparue" });
    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: priorHistory });
    expect(result.ambiguous).toBe(true);
  });

  test("historique vide", () => {
    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: [] });
    expect(result.ambiguous).toBe(true);
    expect(result.resolvedTopic).toBeNull();
  });
});

describe("ConversationContextResolver — ambiguïté (signal fort, sans sujet antérieur)", () => {
  const resolver = new ConversationContextResolver({ catalog: CATALOG });

  test.each(["lesquels", "lesquelles", "celui", "celle", "ceux", "ça", "cela"])(
    "'%s' sans historique => ambiguous: true, message inchangé",
    (marker) => {
      const result = resolver.resolve({ message: `Et ${marker} sont concernés ?`, history: [] });
      expect(result.isReference).toBe(true);
      expect(result.ambiguous).toBe(true);
      expect(result.enrichedMessage).toBe(`Et ${marker} sont concernés ?`);
    }
  );
});

describe("ConversationContextResolver — reformulations (signal faible, jamais bloquant)", () => {
  const resolver = new ConversationContextResolver({ catalog: CATALOG });

  test("un message court sans mot-clé propre, AVEC un sujet antérieur connu : résolu silencieusement", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    const result = resolver.resolve({ message: "Et les autres ?", history: priorHistory });
    expect(result.isReference).toBe(true);
    expect(result.ambiguous).toBe(false);
    expect(result.resolvedTopic).toBe("maintenance");
  });

  test("un message court sans mot-clé propre, SANS sujet antérieur : jamais ambigu, simplement pas une référence (faux positif corrigé — ex. une salutation générique)", () => {
    const result = resolver.resolve({ message: "Bonjour, une question generale", history: [] });
    expect(result.isReference).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect(result.enrichedMessage).toBe("Bonjour, une question generale");
  });

  test("un message qui matche un mot-clé connu n'est jamais traité comme une reformulation, même court", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    const result = resolver.resolve({ message: "une panne", history: priorHistory });
    expect(result.isReference).toBe(false);
  });

  test("un message long, sans mot-clé ET sans marqueur de référence, n'est pas traité comme une reformulation (dépasse shortMessageMaxTokens)", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    const longMessage = "je voudrais vraiment beaucoup savoir globalement aujourd'hui merci d'avance";
    const result = resolver.resolve({ message: longMessage, history: priorHistory });
    expect(result.isReference).toBe(false);
  });
});

describe("ConversationContextResolver — corrections/reformulations (signal fort, comme une référence)", () => {
  const resolver = new ConversationContextResolver({ catalog: CATALOG });

  test("'plutôt'/'finalement' avec un sujet antérieur : résolu, signal 'correction'", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    const result = resolver.resolve({ message: "Finalement, uniquement les urgentes.", history: priorHistory });
    expect(result.isReference).toBe(true);
    expect(result.ambiguous).toBe(false);
    expect(result.resolvedTopic).toBe("maintenance");
    expect(result.signal).toBe("correction");
    expect(result.enrichedMessage).toBe("Finalement, uniquement les urgentes. (à propos de maintenance)");
  });

  test("un marqueur de correction SANS sujet antérieur : vraie ambiguïté, comme un marqueur de référence", () => {
    const result = resolver.resolve({ message: "Non, plutôt autre chose de complètement différent.", history: [] });
    expect(result.isReference).toBe(true);
    expect(result.ambiguous).toBe(true);
    expect(result.signal).toBe("correction");
  });

  test("'non' EN TÊTE de phrase compte comme une correction", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    const result = resolver.resolve({ message: "Non, ce n'est pas ce que je voulais.", history: priorHistory });
    expect(result.signal).toBe("correction");
    expect(result.resolvedTopic).toBe("maintenance");
  });

  test("'non' PAS en tête de phrase n'est jamais un marqueur de correction (trop générique ailleurs)", () => {
    const result = resolver.resolve({ message: "Merci beaucoup pour cette réponse non négligeable aujourd'hui.", history: [] });
    expect(result.signal).toBeNull();
    expect(result.isReference).toBe(false);
  });

  test("la locution 'voulais dire' déclenche le signal de correction, même hors des mots-clés dédiés", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    const result = resolver.resolve({ message: "Je voulais dire quelque chose d'urgent.", history: priorHistory });
    expect(result.signal).toBe("correction");
    expect(result.resolvedTopic).toBe("maintenance");
  });
});

describe("ConversationContextResolver — currentTopic (conversations longues, survit à la fenêtre d'historique)", () => {
  const resolver = new ConversationContextResolver({ catalog: CATALOG });

  test("résout via currentTopic MÊME avec un historique vide — le sujet a survécu au-delà de la fenêtre", () => {
    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: [], currentTopic: "projects" });
    expect(result.ambiguous).toBe(false);
    expect(result.resolvedTopic).toBe("projects");
  });

  test("currentTopic est PRIORITAIRE sur ce que suggère l'historique fourni", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: priorHistory, currentTopic: "projects" });
    expect(result.resolvedTopic).toBe("projects");
  });

  test("un currentTopic qui n'existe plus dans le catalogue actuel est ignoré, comme pour l'historique", () => {
    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: [], currentTopic: "une_intention_disparue" });
    expect(result.ambiguous).toBe(true);
    expect(result.resolvedTopic).toBeNull();
  });

  test("sans currentTopic fourni (défaut), le comportement reste identique à avant (repli sur l'historique)", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "projects" });
    const result = resolver.resolve({ message: "Et lesquels sont en retard ?", history: priorHistory });
    expect(result.resolvedTopic).toBe("projects");
  });
});

describe("ConversationContextResolver — pas de référence du tout", () => {
  const resolver = new ConversationContextResolver({ catalog: CATALOG });

  test("un message avec son propre mot-clé n'est jamais réinterprété", () => {
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    const result = resolver.resolve({ message: "Y a-t-il une panne aujourd'hui ?", history: priorHistory });
    expect(result).toEqual({
      isReference: false,
      resolvedTopic: null,
      ambiguous: false,
      enrichedMessage: "Y a-t-il une panne aujourd'hui ?",
      signal: null,
    });
  });
});

describe("ConversationContextResolver — configuration", () => {
  test("shortMessageMaxTokens est configurable", () => {
    const strict = new ConversationContextResolver({ catalog: CATALOG, shortMessageMaxTokens: 1 });
    const priorHistory = history({ role: "assistant", content: "...", intent: "maintenance" });
    // 3 tokens > shortMessageMaxTokens=1 => pas traité comme reformulation
    expect(strict.resolve({ message: "et les autres", history: priorHistory }).isReference).toBe(false);
  });

  test("referenceMarkers est configurable (remplace la liste par défaut) — vérifié via le signal FORT (ambiguïté bloquante sans historique)", () => {
    const custom = new ConversationContextResolver({ catalog: CATALOG, referenceMarkers: ["toto"] });
    // "toto" est désormais un marqueur fort : sans sujet antérieur, bloquant.
    expect(custom.resolve({ message: "et toto ?", history: [] }).ambiguous).toBe(true);
    // "lesquels" n'est plus un marqueur fort avec cette config personnalisée :
    // seul un message assez long pour dépasser shortMessageMaxTokens confirme
    // qu'il n'est plus traité comme référence du tout, faute de signal fort.
    const longMessage = "je me demandais lesquels de ces éléments seraient globalement concernés";
    expect(custom.resolve({ message: longMessage, history: [] }).isReference).toBe(false);
  });
});
