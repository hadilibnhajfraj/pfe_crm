"use strict";

// QueryRouter, rapprochement de noms et recherche Web contrôlée — unités
// pures (aucune base, aucun réseau).

const { QueryRouter, extractTarget } = require("../src/ai/routing/queryRouter");
const { matchNames } = require("../src/utils/nameMatch");
const { WebSearchService, buildQuery, buildQueries, isGrounded } = require("../src/ai/web/webSearchService");
const { createWebSearchProvider, TavilyWebSearchProvider, BraveWebSearchProvider, SerperWebSearchProvider, SearxngWebSearchProvider } = require("../src/ai/web/webSearchProviders");

const router = new QueryRouter();
const ENGINEER_FOCUS = { type: "engineer", id: "e1", name: "Zakariah Derbel" };
const COMPANY_FOCUS = { type: "company", id: null, name: "CBI Tunisia" };

describe("un nom précis ⇒ details, jamais list", () => {
  test.each([
    ["Zakariah Derbel donne-moi plus de détails sur cet ingénieur", "fr"],
    ["zakariah derbel donne-moi plus de détails sur cet ingénieur", "fr"],
    ["ZAKARIAH DERBEL DONNE MOI PLUS DE DETAILS SUR CET INGENIEUR", "fr"],
    ["Donne-moi des informations sur l'ingénieur Zakariah Derbel", "fr"],
    ["Tell me more about the engineer Zakariah Derbel", "en"],
  ])("« %s » → engineer / details / crm_and_web", (message, language) => {
    const route = router.route(message);
    expect(route).toMatchObject({ entity: "engineer", operation: "details", source: "crm_and_web", crmSearch: true, webSearch: true, language });
    expect(route.target.toLowerCase()).toBe("zakariah derbel");
  });

  test.each([
    ["Give me more information about Zakariah Derbel", "en", "Zakariah Derbel"],
    ["Дайте мне больше информации о Закарии Дербеле", "ru", "Закарии Дербеле"],
    ["Qui est Zakariah Derbel ?", "fr", "Zakariah Derbel"],
    ["Donne-moi des informations sur CBI Tunisia", "fr", "CBI Tunisia"],
    ["Give me information about CBI Tunisia", "en", "CBI Tunisia"],
    ["Дайте мне информацию о CBI Tunisia", "ru", "CBI Tunisia"],
    ["Qui est Ahmed Ben Ali et quelle est son expérience professionnelle ?", "fr", "Ahmed Ben Ali"],
  ])("« %s » → type à résoudre par le CRM, puis Web", (message, language, target) => {
    expect(router.route(message)).toMatchObject({ entity: "unknown", operation: "details", source: "crm_and_web", target, language, onlyIfUnrouted: true });
  });

  test("« Quels sont les projets de Zakariah Derbel ? » → engineer.projects, CRM seul, sous réserve que ce soit un ingénieur", () => {
    expect(router.route("Quels sont les projets de Zakariah Derbel ?")).toMatchObject({
      entity: "engineer",
      operation: "projects",
      source: "crm",
      webSearch: false,
      target: "Zakariah Derbel",
      requiresEngineerMatch: true,
    });
  });

  test("société nommée : fiche CRM + Web ; ses activités : Web seul", () => {
    expect(router.route("Donne-moi plus d'informations sur l'entreprise CBI")).toMatchObject({ entity: "company", source: "crm_and_web", target: "CBI" });
    expect(router.route("Quelles sont les activités de la société Sotumag ?")).toMatchObject({ entity: "company", source: "web", crmSearch: false, target: "Sotumag" });
  });
});

describe("ce qui garde son routage existant (null)", () => {
  test.each([
    "Donne-moi la liste des ingénieurs qui existent dans le CRM",
    "DONNE MOI LA LISTE DES INGENIEURS QUI EXISTE DANS LE CRM",
    "donner moi les ingénieurs disponible dans crm",
    "Quel est l'ingénieur le plus utilisé dans le CRM ?",
    "Which engineer is assigned to the most projects?",
    "Quel ingénieur travaille sur le projet Résidence Holya ?",
    "Quel est l'ingénieur affecté au projet X ?",
    "Comment affecter un ingénieur à un projet ?",
    "Combien de projets a Zakariah Derbel ?",
    "Et ses projets ?",
    "Quel est son téléphone ?",
  ])("« %s »", (message) => {
    expect(router.route(message)).toBeNull();
  });
});

describe("contexte conversationnel", () => {
  test("« Et ses projets ? » après un ingénieur → ses projets, sans redemander de qui il s'agit", () => {
    expect(router.route("Et ses projets ?", { focus: ENGINEER_FOCUS })).toMatchObject({
      entity: "engineer",
      operation: "projects",
      source: "crm",
      target: "Zakariah Derbel",
      targetId: "e1",
      fromContext: true,
    });
    expect(router.route("And his projects?", { focus: ENGINEER_FOCUS })).toMatchObject({ operation: "projects", language: "en" });
  });

  test("« cet ingénieur » sans nom : sujet de la conversation, sinon question de clarification", () => {
    expect(router.route("Donne-moi plus de détails sur cet ingénieur", { focus: ENGINEER_FOCUS })).toMatchObject({ entity: "engineer", operation: "details", target: "Zakariah Derbel" });
    expect(router.route("Donne-moi plus de détails sur cet ingénieur")).toMatchObject({ source: "clarification", clarification: "whichEngineer" });
  });

  test.each([
    ["Show me information about this company", "en"],
    ["Покажи информацию об этой компании", "ru"],
  ])("« %s » → société du contexte, Web, langue de la question", (message, language) => {
    expect(router.route(message, { focus: COMPANY_FOCUS })).toMatchObject({ entity: "company", source: "web", crmSearch: false, webSearch: true, target: "CBI Tunisia", language, fromContext: true });
    expect(router.route(message)).toMatchObject({ source: "clarification", clarification: "whichCompany" });
  });
});

describe("promoteur", () => {
  test.each([
    ["Qui est le promoteur de ce projet ?", "fr"],
    ["Quel promoteur est derrière ce projet ?", "fr"],
    ["Who is the developer of this project?", "en"],
    ["Кто является застройщиком этого проекта?", "ru"],
  ])("« %s » → projet du contexte, CRM puis Web", (message, language) => {
    const route = router.route(message, { currentProject: { id: "p1", name: "Résidence Holya" } });
    expect(route).toMatchObject({ entity: "promoter", operation: "search", source: "crm_and_web", language, fromContext: true, project: { id: "p1", name: "Résidence Holya" } });
    expect(router.route(message)).toMatchObject({ source: "clarification", clarification: "whichProject" });
  });

  test("projet nommé dans la question", () => {
    expect(router.route("Qui est le promoteur du projet Résidence Holya ?")).toMatchObject({ entity: "promoter", project: { id: null, name: "Résidence Holya" } });
  });
});

describe("accepts() — ne détourne pas une intention déjà précise", () => {
  test("« informations sur X » sans mot d'entité : seulement si rien de précis n'a été reconnu", () => {
    const route = router.route("Donne-moi des informations sur CBI Tunisia");
    expect(router.accepts(route, "general_chat")).toBe(true);
    expect(router.accepts(route, "hr")).toBe(false);
  });

  test("« détails de X » classé « projets » : X est-il une personne ? à vérifier dans le CRM, jamais décidé à l'aveugle", () => {
    const route = router.route("Donne-moi les détails de Résidence HOLYA");
    expect(route).toMatchObject({ entity: "unknown", target: "Résidence HOLYA", onlyIfUnrouted: true });
    expect(router.accepts(route, "projects")).toBe("probe");
    expect(router.accepts(route, "commercial_contacts")).toBe("probe");
  });

  test("champ précis et question de suivi", () => {
    expect(router.route("Téléphone de Zakariah Derbel")).toMatchObject({ operation: "field", fields: ["phone"], source: "crm", webSearch: false, target: "Zakariah Derbel" });
    expect(router.route("donner moi les infos liées à Zakariah Derbel")).toMatchObject({ operation: "details", target: "Zakariah Derbel" });
    expect(router.route("Zakariah Derbel")).toMatchObject({ operation: "details", target: "Zakariah Derbel", onlyIfUnrouted: true });
    const focus = { type: "contact", id: "k1", name: "Sami Trabelsi" };
    expect(router.route("Combien de relances a-t-il ?", { focus })).toMatchObject({ entity: "contact", operation: "field", fields: ["relances"], targetId: "k1", fromContext: true });
    expect(router.route("Quelle est sa dernière action ?", { focus })).toMatchObject({ fields: ["lastAction"] });
    expect(router.route("Où travaille-t-il ?", { focus })).toMatchObject({ fields: ["company"] });
  });

  test("un ingénieur nommé l'emporte toujours (c'était le bug : la liste des 118 ingénieurs)", () => {
    const route = router.route("Zakariah Derbel donne-moi plus de détails sur cet ingénieur");
    expect(router.accepts(route, "engineers")).toBe(true);
    expect(router.accepts(route, "projects")).toBe(true);
  });
});

describe("extractTarget", () => {
  test("ignore les majuscules de début de phrase et les mots-outils", () => {
    expect(extractTarget("Donne-moi mes projets")).toBeNull();
    expect(extractTarget("Combien de projets ce mois ?")).toBeNull();
    expect(extractTarget("Parle-moi de « Société Générale de Travaux »")).toBe("Société Générale de Travaux");
    expect(extractTarget("Zakariah Derbel's projects")).toBe("Zakariah Derbel");
  });
});

describe("rapprochement de noms", () => {
  const ENGINEERS = [{ id: 1, name: "Zakariah Derbel" }, { id: 2, name: "Zakaria Ben Salah" }, { id: 3, name: "Karim Derbali" }, { id: 4, name: "Ali Derbel" }];

  test.each([
    ["Zakariah Derbel", "exact"],
    ["ZAKARIAH   DERBEL", "exact"],
    ["Zakàriah Dérbel", "normalized"],
    ["Derbel Zakariah", "tokens"],
    ["Zakaria Derbel", "fuzzy"],
    ["Закарии Дербеле", "fuzzy"],
  ])("« %s » → %s, une seule personne", (query, type) => {
    const { matchType, matches } = matchNames(query, ENGINEERS);
    expect(matchType).toBe(type);
    expect(matches.map((m) => m.id)).toEqual([1]);
  });

  test("une correspondance exacte écarte les noms seulement proches", () => {
    expect(matchNames("Zakariah Derbel", [...ENGINEERS, { id: 5, name: "Zakaria Derbel" }]).matches.map((m) => m.id)).toEqual([1]);
  });

  test("jamais une mauvaise personne pour un nom seulement ressemblant", () => {
    expect(matchNames("Zakariah Trabelsi", ENGINEERS).matches).toEqual([]);
    expect(matchNames("Ala Derbel", ENGINEERS).matches).toEqual([]); // « Ala » ≠ « Ali » : pas de tolérance sur un mot court
    expect(matchNames("Karim Derbel", ENGINEERS).matches).toEqual([]);
  });

  test("un nom partagé renvoie tous les homonymes (l'appelant demande lequel)", () => {
    expect(matchNames("Derbel", ENGINEERS).matches.map((m) => m.id)).toEqual([1, 4]);
  });
});

describe("recherche Web contrôlée", () => {
  const RAW = [
    { title: "Zakariah Derbel | Facebook", url: "https://www.facebook.com/zd", snippet: "profil", source: "facebook.com" },
    { title: "CBI Tunisia dans la presse", url: "https://www.leaders.com.tn/article/1", snippet: "CBI Tunisia, contact : info@cbi.tn ou +216 71 000 000.", source: "leaders.com.tn" },
    { title: "Autre société", url: "https://example.org/x", snippet: "Rien à voir.", source: "example.org" },
    { title: "CBI Tunisia — LinkedIn", url: "https://www.linkedin.com/company/cbi-tunisia", snippet: "CBI Tunisia, matériaux composites.", source: "linkedin.com" },
    { title: "CBI Tunisia — Accueil", url: "https://www.cbi-tunisia.com/", snippet: "CBI Tunisia fabrique des armatures en fibre de verre.", source: "cbi-tunisia.com" },
  ];
  const provider = { name: "fake", isConfigured: () => true, search: jest.fn(async () => RAW) };

  test("filtre les résultats hors sujet et les réseaux personnels, classe par fiabilité, masque les coordonnées", async () => {
    const out = await new WebSearchService({ provider }).search({ target: "CBI Tunisia", entity: "company", language: "fr" });
    expect(out.results.map((r) => [r.source, r.sourceKind])).toEqual([
      ["cbi-tunisia.com", "official"],
      ["linkedin.com", "linkedin"],
      ["leaders.com.tn", "press"],
    ]);
    expect(out.results[2].snippet).not.toMatch(/@|216/);
    expect(provider.search).toHaveBeenCalledWith('"CBI Tunisia" entreprise activité site officiel', expect.any(Object));
    expect(out.results.map((r) => r.identity)).toEqual(["confirmed", "confirmed", "confirmed"]);
  });

  test("requête construite dans la langue de la question, sans donnée privée", () => {
    expect(buildQuery({ target: "CBI Tunisia", entity: "company", language: "en" })).toBe('"CBI Tunisia" company profile official website');
    expect(buildQuery({ target: "CBI Tunisia", entity: "company", language: "ru" })).toBe('"CBI Tunisia" компания деятельность официальный сайт');
    const dirty = buildQuery({ target: "Zakariah Derbel z.derbel@cbi.tn +216 98 123 456 token=eyJhbGciOi.abc.def", entity: "engineer", language: "fr" });
    expect(dirty).toBe('"Zakariah Derbel" ingénieur');
  });

  test("personne : nom + fonction + pays, puis nom + société — le nom propre n'est jamais traduit", () => {
    const base = { target: "Zied Hmidi", entity: "engineer", company: "CBI", country: "tunisia" };
    expect(buildQueries({ ...base, language: "fr" })).toEqual(['"Zied Hmidi" ingénieur Tunisie', '"Zied Hmidi" "CBI"']);
    expect(buildQueries({ ...base, language: "en" })).toEqual(['"Zied Hmidi" engineer Tunisia', '"Zied Hmidi" "CBI"']);
    expect(buildQueries({ ...base, language: "ru" })).toEqual(['"Zied Hmidi" инженер Тунис', '"Zied Hmidi" "CBI"']);
    expect(buildQueries({ target: "Zied Hmidi", entity: "person", language: "en" })).toEqual(['"Zied Hmidi" professional background']);
    // Une « société » contenant une coordonnée ne la laisse pas passer.
    expect(buildQueries({ ...base, company: "CBI contact@cbi.tn +216 71 123 456", language: "fr" })[1]).toBe('"Zied Hmidi" "CBI"');
  });

  test("identité : société du CRM citée → confirmée ; contexte professionnel → probable ; sinon non confirmée", async () => {
    const results = [
      { title: "Zied Hmidi - cuisine", url: "https://blog.example.com/a", snippet: "Zied Hmidi et ses recettes.", source: "blog.example.com" },
      { title: "Zied Hmidi, ingénieur", url: "https://annuaire.example.org/b", snippet: "Zied Hmidi, ingénieur en génie civil à Sfax, Tunisie.", source: "annuaire.example.org" },
      { title: "Zied Hmidi, engineer", url: "https://example.fr/c", snippet: "Zied Hmidi, ingénieur à Lyon.", source: "example.fr" },
      { title: "Équipe", url: "https://bureau-hmidi.tn/equipe", snippet: "Zied Hmidi dirige le Bureau Hmidi Structures.", source: "bureau-hmidi.tn" },
    ];
    const service = new WebSearchService({ provider: { name: "fake", isConfigured: () => true, search: async () => results }, env: {} });
    const out = await service.search({ target: "Zied Hmidi", entity: "engineer", company: "Hmidi Structures", language: "fr" });
    // Métier ET pays pour « probable » ; le métier seul (autre pays) ne suffit pas.
    // Les simples homonymes (blog de cuisine, ingénieur à Lyon) sont écartés dès qu'une page concorde.
    expect(out.results.map((r) => r.identity)).toEqual(["confirmed", "probable"]);
    // nom seul 0,30 ; + contexte professionnel 0,15 ; + société du CRM 0,45
    expect(out.results.map((r) => r.confidence)).toEqual([1, 0.55].map((c) => Math.min(0.95, c)));
    expect(out.confidence).toBe(0.95);
    expect(out.identity).toBe("confirmed");
    const alone = await service.search({ target: "Zied Hmidi", entity: "person", country: "", language: "fr" });
    expect(alone.results.find((r) => r.source === "blog.example.com").identity).toBe("unconfirmed");
  });

  test("cache : la même recherche n'est pas relancée aussitôt ; elle l'est après expiration", async () => {
    let now = 1_000_000;
    const cached = { name: "fake", isConfigured: () => true, search: jest.fn(async () => RAW) };
    const service = new WebSearchService({ provider: cached, env: {}, clock: () => now });
    await service.search({ target: "CBI Tunisia", entity: "company", language: "fr" });
    await service.search({ target: "cbi  tunisia", entity: "company", language: "fr" });
    expect(cached.search).toHaveBeenCalledTimes(1);
    await service.search({ target: "CBI Tunisia", entity: "company", language: "en" }); // autre langue, autre clé
    expect(cached.search).toHaveBeenCalledTimes(2);
    now += 16 * 60 * 1000;
    await service.search({ target: "CBI Tunisia", entity: "company", language: "fr" });
    expect(cached.search).toHaveBeenCalledTimes(3);
  });

  test("journal [WEB_SEARCH] : requête, fournisseur, nombre de résultats — jamais la clé d'API", async () => {
    const lines = [];
    const spies = ["log", "info"].map((m) => jest.spyOn(console, m).mockImplementation((...a) => lines.push(a.join(" "))));
    try {
      const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ organic: [{ title: "CBI Tunisia", link: "https://cbi-tunisia.com/", snippet: "CBI Tunisia", date: "2026-01-02" }] }) }));
      const provider = createWebSearchProvider({ WEB_SEARCH_PROVIDER: "serper", WEB_SEARCH_API_KEY: "SECRET-KEY-123" }, { fetchImpl });
      const out = await new WebSearchService({ provider, env: {} }).search({ target: "CBI Tunisia", entity: "company", language: "fr" });
      expect(out).toMatchObject({ provider: "serper", results: [expect.objectContaining({ url: "https://cbi-tunisia.com/", sourceKind: "official", publishedAt: "2026-01-02" })] });
      expect(fetchImpl.mock.calls[0][1].headers["X-API-KEY"]).toBe("SECRET-KEY-123");
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    const log = lines.join("\n");
    expect(log).toMatch(/\[WEB_SEARCH\] query="\\"CBI Tunisia\\" entreprise activité site officiel" provider="serper" results=1 cached=false/);
    expect(log).not.toContain("SECRET-KEY-123");
  });

  test("fournisseur choisi par WEB_SEARCH_PROVIDER (ou AI_WEB_SEARCH_PROVIDER, prioritaire) : tavily | serper | brave", () => {
    expect(createWebSearchProvider({ WEB_SEARCH_PROVIDER: "tavily", WEB_SEARCH_API_KEY: "k" })).toBeInstanceOf(TavilyWebSearchProvider);
    expect(createWebSearchProvider({ WEB_SEARCH_PROVIDER: "Serper", WEB_SEARCH_API_KEY: "k" })).toBeInstanceOf(SerperWebSearchProvider);
    expect(createWebSearchProvider({ WEB_SEARCH_PROVIDER: "tavily", AI_WEB_SEARCH_PROVIDER: "brave", AI_WEB_SEARCH_API_KEY: "k" })).toBeInstanceOf(BraveWebSearchProvider);
    expect(createWebSearchProvider({ WEB_SEARCH_PROVIDER: "serper", WEB_SEARCH_API_KEY: "k" }).isConfigured()).toBe(true);
  });

  test("routage : CRM_ONLY / WEB_ONLY / CRM_AND_WEB / CLARIFICATION", () => {
    expect(router.route("Donne-moi des informations publiques sur la société CBI Tunisia")).toMatchObject({ mode: "WEB_ONLY", crmSearch: false, target: "CBI Tunisia" });
    expect(router.route("Donne-moi des informations publiques sur Zied Hmidi")).toMatchObject({ mode: "CRM_AND_WEB", target: "Zied Hmidi" });
    // Liste : aucune cible, le routeur d'entité précise ne s'en mêle pas.
    for (const m of ["ingénieurs", "ingénieures", "les ingénieurs", "liste des ingénieurs", "donne-moi les ingénieurs", "Donne-moi mes ingénieurs"]) expect(router.route(m, { focus: ENGINEER_FOCUS })).toBeNull();
    expect(router.route("Qui est Zakariah Derbel ?")).toMatchObject({ mode: "CRM_AND_WEB" });
    expect(router.route("Téléphone de Zakariah Derbel")).toMatchObject({ mode: "CRM_ONLY", webSearch: false });
    expect(router.route("Donne-moi plus d'informations sur cet ingénieur")).toMatchObject({ mode: "CLARIFICATION" });
    expect(router.route("Donne-moi plus d'informations sur cet ingénieur", { focus: ENGINEER_FOCUS })).toMatchObject({ mode: "CRM_AND_WEB" });
    for (const m of ["Quel ingénieur est affecté au projet X ?", "Combien de projets ai-je ?"]) expect(router.route(m)).toBeNull();
    // Listes simples : CRM seul — confiées à leur Agent, ou servies par un Tool de lecture.
    expect(router.route("Quels sont mes projets ?")).toMatchObject({ mode: "CRM_ONLY", webSearch: false, delegateIntent: "projects" });
    expect(router.route("Donne-moi mes contacts")).toMatchObject({ mode: "CRM_ONLY", webSearch: false, delegateIntent: "commercial_contacts" });
    expect(router.route("Liste mes machines")).toMatchObject({ mode: "CRM_ONLY", webSearch: false, entity: "machine", operation: "list" });
  });

  test("sans fournisseur configuré : indisponible, jamais un résultat inventé", async () => {
    const service = new WebSearchService({ env: {} });
    expect(service.isConfigured()).toBe(false);
    await expect(service.search({ target: "CBI Tunisia" })).rejects.toMatchObject({ code: "WEB_SEARCH_NOT_CONFIGURED" });
    expect(createWebSearchProvider({ AI_WEB_SEARCH_PROVIDER: "tavily" }).isConfigured()).toBe(false); // clé absente
    expect(createWebSearchProvider({ AI_WEB_SEARCH_PROVIDER: "inconnu", AI_WEB_SEARCH_API_KEY: "k" }).name).toBe("none");
  });

  test("fournisseurs HTTP : réponse normalisée, URL invalides écartées, clé jamais dans l'URL ni dans l'erreur", async () => {
    const tavilyFetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [{ title: "A", url: "https://a.tn/x", content: "texte" }, { title: "B", url: "javascript:alert(1)" }] }) }));
    const tavily = new TavilyWebSearchProvider({ apiKey: "SECRET-KEY", fetchImpl: tavilyFetch });
    expect(await tavily.search("q")).toEqual([{ title: "A", url: "https://a.tn/x", snippet: "texte", source: "a.tn", publishedAt: null }]);
    expect(tavilyFetch.mock.calls[0][0]).not.toContain("SECRET-KEY");

    const braveFetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const brave = new BraveWebSearchProvider({ apiKey: "SECRET-KEY", fetchImpl: braveFetch });
    await expect(brave.search("q")).rejects.toMatchObject({ code: "WEB_SEARCH_PROVIDER_ERROR", message: "brave a répondu HTTP 401" });
    expect(braveFetch.mock.calls[0][0]).not.toContain("SECRET-KEY");
  });
});

describe("SearXNG (auto-hébergé, sans clé) et actualités", () => {
  test("configuré par WEB_SEARCH_BASE_URL ; réponse JSON normalisée", async () => {
    expect(createWebSearchProvider({ WEB_SEARCH_PROVIDER: "searxng" }).isConfigured()).toBe(false);
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ results: [{ title: "CBI Tunisia", url: "https://cbi-tunisia.com/", content: "Armatures composites.", publishedDate: null }] }) }));
    const provider = createWebSearchProvider({ WEB_SEARCH_PROVIDER: "searxng", WEB_SEARCH_BASE_URL: "http://localhost:8080/" }, { fetchImpl });
    expect(provider).toBeInstanceOf(SearxngWebSearchProvider);
    expect(provider.isConfigured()).toBe(true);
    expect(await provider.search("cbi tunisia", { language: "fr" })).toEqual([{ title: "CBI Tunisia", url: "https://cbi-tunisia.com/", snippet: "Armatures composites.", source: "cbi-tunisia.com", publishedAt: null }]);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:8080/search?q=cbi+tunisia&format=json&language=fr&safesearch=1");
  });

  test("actualité d'une société : Web seul ; fiche d'une personne : CRM + Web", () => {
    expect(router.route("Quelles sont les dernières informations publiques sur CBI Tunisia ?")).toMatchObject({ mode: "WEB_ONLY", target: "CBI Tunisia" });
    expect(router.route("Latest news about CBI Tunisia")).toMatchObject({ mode: "WEB_ONLY", language: "en" });
    expect(router.route("Donne-moi des informations sur Amin Mansour")).toMatchObject({ mode: "CRM_AND_WEB", target: "Amin Mansour" });
    expect(router.route("Qui est cet ingénieur ?", { focus: ENGINEER_FOCUS })).toMatchObject({ mode: "CRM_AND_WEB", entity: "engineer" });
    expect(router.route("Donne-moi mes projets")).toMatchObject({ mode: "CRM_ONLY", webSearch: false, delegateIntent: "projects" });
  });
});

describe("ancrage d'une synthèse dans les sources", () => {
  const SOURCES = [{ title: "Zied Hmidi | LinkedIn", snippet: "Zied Hmidi, ingénieur génie civil à Sfax depuis 2015.", source: "linkedin.com" }];

  test("acceptée si chaque nom propre et chaque nombre vient des extraits", () => {
    expect(isGrounded("Zied Hmidi est ingénieur en génie civil à Sfax depuis 2015 [1].", SOURCES, "Zied Hmidi")).toBe(true);
    expect(isGrounded("Il exerce à Sfax [1]. Selon LinkedIn, il est ingénieur [1].", SOURCES, "Zied Hmidi")).toBe(true);
  });

  test("rejetée dès qu'un nom, une société ou une date n'y figure pas", () => {
    expect(isGrounded("Zied Hmidi travaille chez Vinci à Sfax [1].", SOURCES, "Zied Hmidi")).toBe(false);
    expect(isGrounded("Zied Hmidi est ingénieur depuis 2009 [1].", SOURCES, "Zied Hmidi")).toBe(false);
    expect(isGrounded("Zied Hmidi vit à Sousse [1].", SOURCES, "Zied Hmidi")).toBe(false);
  });
});

describe("recherche Web explicite et journal d'erreur", () => {
  test.each(["Recherche sur le Web : CBI Tunisia", "Cherche sur internet CBI Tunisia", "Search the web for CBI Tunisia"])("« %s » → WEB_ONLY", (message) => {
    expect(router.route(message)).toMatchObject({ mode: "WEB_ONLY", entity: "topic", target: "CBI Tunisia", crmSearch: false });
  });

  test("erreur du fournisseur : journalisée avec sa cause réelle, jamais la clé, jamais « non configurée »", async () => {
    const lines = [];
    const spies = ["log", "info", "warn"].map((m) => jest.spyOn(console, m).mockImplementation((...a) => lines.push(a.join(" "))));
    try {
      const fetchImpl = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
      const provider = createWebSearchProvider({ WEB_SEARCH_PROVIDER: "tavily", WEB_SEARCH_API_KEY: "tvly-SECRET-KEY-123" }, { fetchImpl });
      await expect(new WebSearchService({ provider, env: {} }).search({ target: "CBI Tunisia", entity: "company" })).rejects.toMatchObject({ code: "WEB_SEARCH_PROVIDER_ERROR" });
    } finally {
      spies.forEach((x) => x.mockRestore());
    }
    const log = lines.join("\n");
    expect(log).toContain('[WEB_SEARCH] provider="tavily" configured=true executed=true status=ERROR error="tavily a répondu HTTP 401"');
    expect(log).not.toContain("SECRET-KEY");
  });
});

describe("promoteurs : liste, promoteur d'un projet, projets d'un promoteur", () => {
  const PROJECT = { id: "p1", name: "Alpha" };

  test.each([
    "donner moi les listes des promoteurs dans le crm",
    "tous les promoteurs",
    "liste des promoteurs",
    "donne-moi les promoteurs",
    "quels sont les promoteurs du CRM ?",
    "Combien de promoteurs avons-nous ?",
    "list all developers",
    "show me all promoters",
    "покажи список застройщиков",
    "все застройщики",
  ])("« %s » → promoter.list, target=null, CRM seul — même avec un projet ouvert", (message) => {
    for (const context of [{}, { currentProject: PROJECT }]) {
      expect(router.route(message, context)).toMatchObject({ entity: "promoter", operation: "list", target: null, project: null, mode: "CRM_ONLY", webSearch: false });
    }
  });

  test("promoteur D'UN projet : inchangé, et la clarification lui est réservée", () => {
    expect(router.route("Qui est le promoteur du projet Alpha ?")).toMatchObject({ entity: "promoter", operation: "search", project: { name: "Alpha" }, mode: "CRM_AND_WEB" });
    expect(router.route("Donne-moi le promoteur de ce projet", { currentProject: PROJECT })).toMatchObject({ operation: "search", project: PROJECT });
    expect(router.route("Quel est le promoteur de ce projet ?")).toMatchObject({ mode: "CLARIFICATION", clarification: "whichProject" });
  });

  test("projets D'UN promoteur", () => {
    expect(router.route("Donne-moi les projets du promoteur Alpha")).toMatchObject({ entity: "promoter", operation: "projects", target: "Alpha", mode: "CRM_ONLY" });
    expect(router.route("Show me the projects of developer Alpha Immo")).toMatchObject({ operation: "projects", target: "Alpha Immo", language: "en" });
  });
});

describe("EntityNormalizer — dictionnaire unique des entités et listes simples", () => {
  const { EntityNormalizer } = require("../src/ai/routing/entityNormalizer");
  const normalizer = new EntityNormalizer();

  test.each([
    ["company", ["société", "sociétés", "entreprise", "entreprises", "company", "companies", "companys", "компания", "компании"]],
    ["engineer", ["ingénieur", "ingénieurs", "ingénieure", "ingénieures", "engineer", "engineers", "инженер", "инженеры", "инженера"]],
    ["promoter", ["promoteur", "promoteurs", "developer", "developers", "застройщик", "застройщики"]],
    ["project", ["projet", "projets", "project", "projects", "проект", "проекты"]],
    ["contact", ["contact", "contacts", "контакт", "контакты"]],
    ["machine", ["machine", "machines", "машина", "машины"]],
    ["hr_request", ["demande RH", "demandes RH", "HR request", "HR requests"]],
    ["maintenance_request", ["demande de maintenance", "demandes de maintenance", "maintenance request", "maintenance requests"]],
  ])("%s ← toutes ses formes", (entity, forms) => {
    for (const form of forms) expect(normalizer.entityOf(form)).toBe(entity);
  });

  test.each([
    ["donner moi liste des sociétés dans crm", "company", "fr"],
    ["donner moi liste des company dans crm", "company", "fr"],
    ["list all companies", "company", "en"],
    ["покажи список компаний", "company", "ru"],
    ["tous les promoteurs", "promoter", "fr"],
    ["tous les ingénieurs", "engineer", "fr"],
    ["liste des projets", "project", "fr"],
    ["donne-moi mes projets", "project", "fr"],
    ["liste des contacts", "contact", "fr"],
    ["liste des machines", "machine", "fr"],
    ["liste des demandes RH", "hr_request", "fr"],
    ["liste des demandes de maintenance", "maintenance_request", "fr"],
  ])("« %s » → %s.list (target=null, source=crm)", (message, entity, language) => {
    expect(normalizer.detectList(message)).toMatchObject({ entity, operation: "list", target: null, source: "crm", language });
  });

  test.each(["liste des projets en retard", "société ABC", "donne-moi des informations sur ABC", "combien de machines", "comment créer une société", "liste des sociétés de Sfax", "créer une demande RH", "bonjour"])(
    "« %s » n'est pas une liste simple",
    (message) => expect(normalizer.detectList(message)).toBeNull()
  );

  test("le routeur : listes directes (Tool) et listes confiées à un Agent existant", () => {
    expect(router.route("liste des sociétés", { focus: ENGINEER_FOCUS })).toMatchObject({ entity: "company", operation: "list", target: null, mode: "CRM_ONLY", delegateIntent: null });
    expect(router.route("toutes les machines")).toMatchObject({ entity: "machine", operation: "list" });
    const projects = router.route("list all projects");
    expect(projects).toMatchObject({ entity: "project", operation: "list", delegateIntent: "projects" });
    expect(router.accepts(projects, "general_chat")).toBe(false); // jamais traité par l'Agent de fiche
    expect(router.route("liste des ingénieurs")).toBeNull(); // servie par l'intention `engineers`
  });
});

describe("Tavily — appel officiel et erreurs (réponses simulées)", () => {
  const { WebSearchProviderError } = require("../src/ai/web/webSearchProviders");
  const KEY = "tvly-FAUSSE-CLE-DE-TEST";
  const tavily = (fetchImpl, extra = {}) => createWebSearchProvider({ WEB_SEARCH_PROVIDER: "tavily", WEB_SEARCH_API_KEY: KEY, ...extra }, { fetchImpl });
  const http = (status, body = {}) => jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));

  test("requête : POST https://api.tavily.com/search, clé en en-tête Authorization, jamais dans l'adresse ni le corps", async () => {
    const fetchImpl = http(200, { results: [{ title: "CBI Tunisia — Accueil", url: "https://www.cbi-tunisia.com/", content: "Armatures en fibre de verre.", score: 0.9 }] });
    const results = await tavily(fetchImpl).search('"CBI Tunisia" société', { limit: 5 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: `Bearer ${KEY}` });
    expect(JSON.parse(init.body)).toEqual({ query: '"CBI Tunisia" société', max_results: 5, search_depth: "basic", include_answer: false });
    expect(url + init.body).not.toContain(KEY);
    expect(results).toEqual([{ title: "CBI Tunisia — Accueil", url: "https://www.cbi-tunisia.com/", snippet: "Armatures en fibre de verre.", source: "cbi-tunisia.com", publishedAt: null }]);
  });

  test("réponse vide : aucun résultat, aucune erreur", async () => {
    expect(await tavily(http(200, { results: [] })).search("q")).toEqual([]);
    expect(await tavily(http(200, {})).search("q")).toEqual([]);
  });

  test("un résultat sans adresse http(s) valide n'est jamais renvoyé", async () => {
    const results = await tavily(http(200, { results: [{ title: "Sans lien", content: "x" }, { title: "Lien douteux", url: "javascript:alert(1)", content: "x" }, { title: "Valide", url: "https://a.tn/p", content: "x" }] })).search("q");
    expect(results.map((r) => r.url)).toEqual(["https://a.tn/p"]);
  });

  test.each([
    [401, "invalid_key"],
    [403, "invalid_key"],
    [429, "rate_limited"],
    [432, "quota_exceeded"],
    [433, "quota_exceeded"],
    [400, "bad_request"],
    [500, "unavailable"],
    [503, "unavailable"],
  ])("HTTP %i → cause « %s », sans la clé ni le corps de la réponse dans le message", async (status, reason) => {
    const err = await tavily(http(status, { detail: { error: `Unauthorized: ${KEY}` } })).search("q").catch((e) => e);
    expect(err).toBeInstanceOf(WebSearchProviderError);
    expect(err.reason).toBe(reason);
    expect(err.message).toBe(`tavily a répondu HTTP ${status}`);
    expect(JSON.stringify({ m: err.message, s: String(err.stack) })).not.toContain(KEY);
  });

  test("délai dépassé → cause « timeout »", async () => {
    const fetchImpl = jest.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    const provider = new TavilyWebSearchProvider({ apiKey: KEY, fetchImpl, timeoutMs: 20 });
    await expect(provider.search("q")).rejects.toMatchObject({ reason: "timeout", message: "tavily : délai dépassé" });
  });

  test("service injoignable → cause « unavailable » ; réponse illisible → « bad_response »", async () => {
    await expect(tavily(jest.fn(async () => { throw new Error(`getaddrinfo ENOTFOUND api.tavily.com ${KEY}`); })).search("q")).rejects.toMatchObject({ reason: "unavailable", message: "tavily injoignable" });
    await expect(tavily(jest.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } }))).search("q")).rejects.toMatchObject({ reason: "bad_response" });
  });

  test("clé absente : fournisseur non configuré, aucun appel réseau", async () => {
    const fetchImpl = http(200, {});
    const provider = createWebSearchProvider({ WEB_SEARCH_PROVIDER: "tavily", WEB_SEARCH_API_KEY: "   " }, { fetchImpl });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.search("q")).rejects.toMatchObject({ code: "WEB_SEARCH_NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("clé recopiée entre guillemets ou avec des espaces dans .env : nettoyée avant l'appel", async () => {
    const fetchImpl = http(200, { results: [] });
    await createWebSearchProvider({ WEB_SEARCH_PROVIDER: " Tavily ", WEB_SEARCH_API_KEY: `  "${KEY}"  ` }, { fetchImpl }).search("q");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  test("une erreur du fournisseur n'est jamais mise en cache : l'appel suivant réessaie", async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) }).mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [{ title: "CBI Tunisia", url: "https://www.cbi-tunisia.com/", content: "CBI Tunisia, armatures." }] }) });
    const spies = ["log", "info", "warn"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    try {
      const service = new WebSearchService({ provider: tavily(fetchImpl), env: {} });
      await expect(service.search({ target: "CBI Tunisia", entity: "company" })).rejects.toMatchObject({ reason: "rate_limited" });
      const ok = await service.search({ target: "CBI Tunisia", entity: "company" });
      expect(ok.provider).toBe("tavily");
      expect(ok.results[0].url).toBe("https://www.cbi-tunisia.com/");
    } finally {
      spies.forEach((x) => x.mockRestore());
    }
  });

  test("architecte nommé → fiche ; « l'architecte du projet X » et « liste des architectes » gardent leur routage", () => {
    expect(router.route("Qui est l'architecte Karim Ben Salah ?")).toMatchObject({ entity: "architect", operation: "details", target: "Karim Ben Salah", mode: "CRM_AND_WEB" });
    expect(router.route("Give me information about architect Karim Ben Salah")).toMatchObject({ entity: "architect", operation: "details", language: "en" });
    expect(router.route("Les projets de l'architecte Karim Ben Salah")).toMatchObject({ entity: "architect", operation: "projects", mode: "CRM_ONLY" });
    expect(router.route("Quel est l'architecte du projet Holya ?")).toBeNull();
    expect(router.route("liste des architectes")).toBeNull();
  });
});
