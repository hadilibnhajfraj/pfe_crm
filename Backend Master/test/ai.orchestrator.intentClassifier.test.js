"use strict";

const { IntentClassifier, INTENT_DEFINITIONS } = require("../src/ai/orchestrator/intentClassifier");

describe("IntentClassifier — catalogue des 15 intentions", () => {
  test("expose exactement les 15 intentions demandées, avec des clés uniques", () => {
    expect(INTENT_DEFINITIONS).toHaveLength(15);
    const keys = INTENT_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(15);
  });

  test("chaque intention a un label, une description et au moins un mot-clé", () => {
    for (const def of INTENT_DEFINITIONS) {
      expect(typeof def.label).toBe("string");
      expect(def.label.length).toBeGreaterThan(0);
      expect(typeof def.description).toBe("string");
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.keywords.length).toBeGreaterThan(0);
    }
  });

  test("les 10 intentions 'question_*' et les 5 intentions 'demande_*' sont bien celles demandées", () => {
    const keys = INTENT_DEFINITIONS.map((d) => d.key);
    expect(keys.filter((k) => k.startsWith("question_"))).toEqual([
      "question_kpi",
      "question_projet",
      "question_commerciale",
      "question_rh",
      "question_maintenance",
      "question_industrielle",
      "question_dashboard",
      "question_reporting",
      "question_recherche",
      "question_documentation",
    ]);
    expect(keys.filter((k) => k.startsWith("demande_"))).toEqual([
      "demande_action",
      "demande_resume",
      "demande_comparaison",
      "demande_statistiques",
      "demande_prevision",
    ]);
  });
});

describe("IntentClassifier.classify — reconnaissance des 15 intentions en français", () => {
  const classifier = new IntentClassifier();

  test.each([
    ["question_kpi", "Quel est l'indicateur de performance ce mois-ci ?"],
    ["question_projet", "Quelle est l'étape actuelle du projet et qui est le propriétaire ?"],
    ["question_commerciale", "Peux-tu me donner la liste des contacts commerciaux à relancer ?"],
    ["question_rh", "Combien de demandes de congé sont en attente ?"],
    ["question_maintenance", "Y a-t-il une panne signalée et un technicien affecté ?"],
    ["question_industrielle", "Montre-moi la fiche de production industrielle d'aujourd'hui."],
    ["question_dashboard", "Peux-tu m'afficher le tableau de bord ?"],
    ["question_reporting", "Je voudrais voir le dernier rapport de reporting."],
    ["question_recherche", "Cherche et localise ce dossier, je n'arrive pas à le trouver."],
    ["question_documentation", "Peux-tu expliquer la procédure et le fonctionnement, avec un guide ou un tutoriel ?"],
    ["demande_action", "Crée une nouvelle tâche et assigne-la à un technicien."],
    ["demande_resume", "Peux-tu me faire un résumé synthèse de la situation ?"],
    ["demande_comparaison", "Fais une comparaison entre les deux périodes."],
    ["demande_statistiques", "Donne-moi la moyenne et le total des ventes du trimestre."],
    ["demande_prevision", "Peux-tu estimer la tendance pour le mois prochain ?"],
  ])("reconnaît %s à partir d'une phrase réaliste", (expectedIntent, message) => {
    const result = classifier.classify(message);
    expect(result.intent).toBe(expectedIntent);
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe("IntentClassifier.classify — score de confiance", () => {
  const classifier = new IntentClassifier();

  test("un message qui ne matche qu'une seule intention obtient une confiance de 1", () => {
    const result = classifier.classify("Il y a une panne, il faut un technicien.");
    expect(result.intent).toBe("question_maintenance");
    expect(result.confidence).toBe(1);
  });

  test("un message ambigu (mots-clés de deux intentions) obtient une confiance partagée, inférieure à 1", () => {
    // "rapport" (reporting) + "kpi" (kpi) — un seul mot-clé chacun.
    const result = classifier.classify("Je veux le rapport avec le kpi principal.");
    expect(result.confidence).toBeLessThan(1);
    expect(result.confidence).toBeGreaterThan(0);
  });

  test("un message sans aucun mot-clé reconnu renvoie intent: null et confidence: 0", () => {
    const result = classifier.classify("Bonjour, comment vas-tu ?");
    expect(result.intent).toBeNull();
    expect(result.confidence).toBe(0);
  });

  test("un message sans aucun mot-clé reconnu utilise fallbackIntent si configuré", () => {
    const withFallback = new IntentClassifier({ fallbackIntent: "question_documentation" });
    const result = withFallback.classify("Bonjour, comment vas-tu ?".replace("comment", ""));
    expect(result.intent).toBe("question_documentation");
    expect(result.confidence).toBe(0); // fallback choisi, mais aucun signal réel ne le justifie
  });

  test("scores contient les 15 intentions, triées du score le plus élevé au plus faible", () => {
    const result = classifier.classify("Il y a une panne, il faut un technicien.");
    expect(result.scores).toHaveLength(15);
    for (let i = 1; i < result.scores.length; i++) {
      expect(result.scores[i - 1].score).toBeGreaterThanOrEqual(result.scores[i].score);
    }
  });

  test("chaque entrée de scores expose les mots-clés qui ont matché, pour l'auditabilité", () => {
    const result = classifier.classify("Il y a une panne, il faut un technicien.");
    const top = result.scores[0];
    expect(top.key).toBe("question_maintenance");
    expect(top.matchedKeywords).toEqual(expect.arrayContaining(["panne", "technicien"]));
  });
});

describe("IntentClassifier — accents et casse", () => {
  const classifier = new IntentClassifier();

  test("reconnaît un mot-clé aussi bien accentué que non accentué (saisie mobile fréquente)", () => {
    expect(classifier.classify("creer une action").intent).toBe("demande_action");
    expect(classifier.classify("créer une action").intent).toBe("demande_action");
  });

  test("insensible à la casse", () => {
    expect(classifier.classify("MERCI D'ESTIMER LA TENDANCE POUR LE MOIS PROCHAIN").intent).toBe("demande_prevision");
  });
});

describe("IntentClassifier.route — compatibilité IRouter", () => {
  const classifier = new IntentClassifier({ fallbackIntent: "question_documentation" });

  test("renvoie uniquement la clé gagnante (Promise<string>), pas l'objet complet", async () => {
    await expect(classifier.route("Il y a une panne, il faut un technicien.")).resolves.toBe("question_maintenance");
  });

  test("renvoie fallbackIntent quand aucune intention ne matche", async () => {
    await expect(classifier.route("Bonjour !")).resolves.toBe("question_documentation");
  });

  test("sans fallbackIntent configuré, renvoie null plutôt que de lever une exception", async () => {
    const noFallback = new IntentClassifier();
    await expect(noFallback.route("Bonjour !")).resolves.toBeNull();
  });
});

describe("IntentClassifier — configuration personnalisée (modularité)", () => {
  test("accepte un jeu de définitions personnalisé, indépendant de INTENT_DEFINITIONS", () => {
    const custom = new IntentClassifier({
      definitions: [
        { key: "salutation", label: "Salutation", description: "...", keywords: ["bonjour", "salut"] },
      ],
      fallbackIntent: null,
    });
    const result = custom.classify("Bonjour !");
    expect(result.intent).toBe("salutation");
    expect(result.scores).toHaveLength(1);
  });
});
