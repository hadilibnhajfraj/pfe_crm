"use strict";

// Analytique CRM (PROBAR ASSISTANT) — compréhension des questions, FR/EN/RU :
// même requête interne quelle que soit la langue ou la formulation, filtres
// et périodes normalisés, règles de routage qui ne détournent aucun parcours
// existant (rejeu du corpus de validation).

const { AnalyticsQueryParser } = require("../src/ai/analytics/analyticsQueryParser");
const { detectLanguage } = require("../src/ai/language/languageDetector");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const SCENARIOS = require("./fixtures/copilotValidationScenarios");

const NOW = new Date("2026-09-30T10:00:00");
const parser = new AnalyticsQueryParser({ now: () => NOW });
const shape = (q) => q && { domain: q.domain, groupBy: q.groupBy, aggregation: q.aggregation, operation: q.operation };

describe("Une seule intention métier, quelle que soit la formulation ou la langue", () => {
  test.each([
    ["Quel est l'ingénieur le plus utilisé dans le CRM ?", "fr"],
    ["Quel ingénieur travaille sur le plus de projets ?", "fr"],
    ["Quel ingénieur a le plus de projets ?", "fr"],
    ["Which engineer is assigned to the most projects?", "en"],
    ["Какой инженер работает с наибольшим количеством проектов?", "ru"],
    ["Кто из инженеров работает с наибольшим количеством проектов?", "ru"],
  ])("« %s » → projets / ingénieur / count / max (%s)", (message, language) => {
    const q = parser.parse(message);
    expect(shape(q)).toEqual({ domain: "project", groupBy: "engineer", aggregation: "count", operation: "max" });
    expect(q.language).toBe(language);
  });

  test.each([
    ["Quels sont les ingénieurs les plus utilisés ?", 5],
    ["Donne-moi le classement des ingénieurs par nombre de projets.", 5],
    ["Donne-moi le classement des ingénieurs.", 5],
    ["Show me the engineers with the most projects.", 5],
    ["Top 5 engineers by number of projects.", 5],
    ["Donne-moi les 5 ingénieurs qui ont le plus de projets.", 5],
    ["Top 3 des ingénieurs", 3],
    ["Покажи инженеров с наибольшим количеством проектов.", 5],
  ])("classement : « %s » → top %i", (message, limit) => {
    const q = parser.parse(message);
    expect(shape(q)).toMatchObject({ domain: "project", groupBy: "engineer", operation: "top" });
    expect(q.limit).toBe(limit);
  });

  test.each([
    ["Combien de projets possède chaque ingénieur ?", "distribution"],
    ["Сколько проектов у каждого инженера?", "distribution"],
    ["Quels ingénieurs travaillent sur mes projets ?", "distribution"],
    ["Quel ingénieur a le moins de projets ?", "min"],
    ["Which engineer has the fewest projects?", "min"],
    ["Quel est le nombre moyen de projets par ingénieur ?", "average"],
    ["Average number of projects per engineer", "average"],
  ])("« %s » → %s", (message, operation) => {
    expect(parser.parse(message).operation).toBe(operation);
  });
});

describe("Autres dimensions et domaines", () => {
  test.each([
    ["Combien de projets par statut ?", { domain: "project", groupBy: "status", operation: "distribution" }],
    ["Quel statut contient le plus de projets ?", { domain: "project", groupBy: "status", operation: "max" }],
    ["Quel client possède le plus de projets ?", { domain: "project", groupBy: "client", operation: "max" }],
    ["Quel commercial gère le plus de projets ?", { domain: "project", groupBy: "owner", operation: "max" }],
    ["Which salesperson manages the most projects?", { domain: "project", groupBy: "owner", operation: "max" }],
    ["Quel commercial a le plus de contacts ?", { domain: "contact", groupBy: "commercial", operation: "max" }],
    ["Combien de relances ont été faites ce mois-ci ?", { domain: "relance", groupBy: null, operation: "total" }],
    ["Сколько напоминаний было создано в этом месяце?", { domain: "relance", groupBy: null, operation: "total" }],
    ["Quels contacts n'ont pas été relancés ?", { domain: "contact", groupBy: null, operation: "list_without_relance" }],
    ["Which contacts have never been followed up?", { domain: "contact", groupBy: null, operation: "list_without_relance" }],
    ["Quelle machine a produit le plus de fiches ?", { domain: "industrial", groupBy: "machine", operation: "max" }],
    ["Quelle machine a le plus d'activité ?", { domain: "industrial", groupBy: "machine", operation: "max" }],
    ["Какая машина произвела больше всего записей?", { domain: "industrial", groupBy: "machine", operation: "max" }],
    ["Combien de fiches PROBAR avons-nous ?", { domain: "industrial", groupBy: null, operation: "total" }],
    ["Combien de projets avons-nous ?", { domain: "project", groupBy: null, operation: "total" }],
  ])("« %s »", (message, expected) => {
    expect(shape(parser.parse(message))).toMatchObject(expected);
  });

  test.each([
    "Comment créer un projet ?",
    "Montre-moi mes projets en cours",
    "Quels projets sont les plus récents ?",
    "Quels projets n'ont aucune activité récente ?",
    "Покажи мои проекты.",
    "Quel opérateur a créé le plus de fiches POR PROMESH ce mois ?", // autre table : jamais confondue
    "Contacts commerciaux : quelle société a le plus de contacts ?", // client = dimension des projets
  ])("non analytique (ou non couverte) : « %s »", (message) => {
    expect(parser.parse(message)).toBeNull();
  });
});

describe("Filtres normalisés (valeurs techniques uniques)", () => {
  test("PROBAR, statut, « mes », hors archivés", () => {
    expect(parser.parse("Quel ingénieur possède le plus de projets PROBAR ?").filters.productFamily).toBe("PROBAR");
    expect(parser.parse("Quel ingénieur a le plus de projets en cours ?").filters.statut).toBe("En cours");
    expect(parser.parse("Which engineer has the most active projects?").filters.statut).toBe("En cours");
    expect(parser.parse("Какой инженер ведёт больше всего проектов в работе?").filters.statut).toBe("En cours");
    expect(parser.parse("Quels ingénieurs travaillent sur mes projets ?").mine).toBe(true);
    expect(parser.parse("Which engineer has the most projects?").mine).toBe(false);
    expect(parser.parse("Quel ingénieur a le plus de projets ?").filters.includeArchived).toBe(true);
    expect(parser.parse("Quel ingénieur a le plus de projets hors archivés ?").filters.includeArchived).toBe(false);
    expect(parser.parse("Combien de fiches PROBAR avons-nous ?").filters.module).toBe("probar");
  });

  test.each([
    ["Combien de relances ce mois-ci ?", "this_month", "2026-09-01"],
    ["How many follow-ups this month?", "this_month", "2026-09-01"],
    ["Сколько напоминаний в этом месяце?", "this_month", "2026-09-01"],
    ["Quel ingénieur a le plus de projets cette année ?", "this_year", "2026-01-01"],
    ["Which engineer had the most projects last year?", "last_year", "2025-01-01"],
    ["Какой инженер вёл больше всего проектов в прошлом году?", "last_year", "2025-01-01"],
    ["Quel ingénieur a le plus de projets le mois dernier ?", "last_month", "2026-08-01"],
    ["Combien de relances les 30 derniers jours ?", "last_n_days", "2026-08-31"],
  ])("période « %s » → %s", (message, key, fromDay) => {
    const { period } = parser.parse(message).filters;
    expect(period.key).toBe(key);
    const from = new Date(period.from);
    expect(`${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`).toBe(fromDay);
  });
});

describe("Détection de langue", () => {
  test.each([
    ["Quels sont mes projets ?", "fr"],
    ["Show me my active projects.", "en"],
    ["Покажи мои активные проекты.", "ru"],
    ["Покажи мои projects.", "ru"],
    ["Which ingénieur a le plus de projets ?", "fr"],
  ])("« %s » → %s", (message, language) => expect(detectLanguage(message).language).toBe(language));
});

describe("Routage : aucun parcours existant n'est détourné", () => {
  const detector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });

  test("question non reconnue (general_chat) : toujours l'analytique", () => {
    expect(parser.shouldRoute(parser.parse("Quel est l'ingénieur le plus utilisé dans le CRM ?"), "general_chat")).toBe(true);
  });

  test("intention métier précise : un total reste à l'Agent existant, un classement va à l'analytique", () => {
    expect(parser.shouldRoute(parser.parse("Combien de projets avons-nous ?"), "projects")).toBe(false);
    expect(parser.shouldRoute(parser.parse("Quel ingénieur a le plus de projets ?"), "projects")).toBe(true);
    expect(parser.shouldRoute(parser.parse("Combien de projets par statut ?"), "projects")).toBe(true);
    expect(parser.shouldRoute(parser.parse("Quel ingénieur a le plus de projets ?"), "dashboard")).toBe(false);
  });

  test("rejeu des 571 questions du corpus de validation : une seule change de route (com-07, voulu)", async () => {
    const messages = [];
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        if (typeof v.message === "string" || typeof v.suggestion === "string") messages.push({ id: v.id, text: v.message || v.suggestion });
        Object.values(v).forEach(walk);
      }
    };
    walk(SCENARIOS);
    const seen = new Set();
    const unique = messages.filter((m) => !seen.has(m.text) && seen.add(m.text));
    expect(unique.length).toBeGreaterThanOrEqual(571);

    const rerouted = [];
    for (const m of unique) {
      const lexical = await detector.detect(m.text, {});
      if (parser.shouldRoute(parser.parse(m.text), lexical.name)) rerouted.push(m.id);
    }
    // com-07 « Combien de contacts commerciaux ai-je relancés aujourd'hui ? » :
    // CommercialAgent y répondait par la liste des contacts « à rappeler » —
    // l'analytique compte désormais réellement les relances du jour.
    expect(rerouted).toEqual(["com-07"]);
  });
});

describe("Question de données CRM non couverte : jamais la documentation", () => {
  test.each(["Combien de devis avons-nous ?", "How many invoices do we have?", "Сколько у нас сделок?"])("« %s » → question de données", (message) => {
    expect(parser.parse(message)).toBeNull();
    expect(parser.looksLikeCrmDataQuestion(message)).toBe(true);
  });

  test.each(["Comment créer un projet ?", "Bonjour", "Explique-moi le module maintenance"])("« %s » → pas une question de données", (message) => {
    expect(parser.looksLikeCrmDataQuestion(message)).toBe(false);
  });
});
