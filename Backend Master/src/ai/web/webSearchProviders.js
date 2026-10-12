"use strict";

/**
 * # WebSearchProvider — abstraction du moteur de recherche Web
 *
 * Aucun moteur n'existait dans le projet : PROBAR ASSISTANT ne dépend que de
 * ce contrat, jamais d'un fournisseur précis.
 *
 *   search(query, { language, limit }) → Promise<WebResult[]>
 *   WebResult = { title, url, snippet, source, publishedAt }
 *
 * Fournisseurs livrés : appels HTTP à l'API officielle du service (jamais
 * d'automatisation de l'interface d'un moteur). Le fournisseur est choisi par
 * `AI_WEB_SEARCH_PROVIDER` ; sans configuration, `isConfigured()` est faux et
 * l'assistant le dit au lieu d'inventer des résultats.
 *
 * Ajouter un fournisseur = une classe avec `name`, `isConfigured()` et
 * `search()`, puis une entrée dans PROVIDERS.
 */

class IWebSearchProvider {
  get name() {
    throw new Error("IWebSearchProvider.name must be implemented");
  }

  isConfigured() {
    return false;
  }

  // eslint-disable-next-line no-unused-vars
  async search(query, options) {
    throw new Error("IWebSearchProvider.search must be implemented");
  }
}

class WebSearchNotConfiguredError extends Error {
  constructor() {
    super("Web search provider is not configured");
    this.code = "WEB_SEARCH_NOT_CONFIGURED";
  }
}

// `reason` : cause de l'échec, pour le journal et pour le message affiché.
//   invalid_key    clé refusée (HTTP 401 / 403)
//   quota_exceeded crédit ou forfait épuisé (HTTP 402 ; Tavily : 432, 433)
//   rate_limited   trop de requêtes (HTTP 429)
//   bad_request    requête refusée (HTTP 400 / 422)
//   timeout        délai dépassé
//   bad_response   réponse illisible
//   unavailable    service injoignable ou en erreur (réseau, HTTP 5xx, autre)
class WebSearchProviderError extends Error {
  constructor(message, reason = "unavailable") {
    super(message);
    this.code = "WEB_SEARCH_PROVIDER_ERROR";
    this.reason = reason;
  }
}

function reasonOfStatus(status) {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 402 || status === 432 || status === 433) return "quota_exceeded";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "bad_request";
  return "unavailable";
}

class NotConfiguredWebSearchProvider extends IWebSearchProvider {
  get name() {
    return "none";
  }

  async search() {
    throw new WebSearchNotConfiguredError();
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (_err) {
    return null;
  }
}

// Seuls les résultats dotés d'une URL http(s) valide sont conservés : une
// source doit toujours pouvoir être ouverte et vérifiée.
function toResult({ title, url, snippet, publishedAt }) {
  const host = hostOf(url);
  if (!host || !/^https?:\/\//i.test(String(url))) return null;
  return {
    title: String(title || host).trim().slice(0, 200),
    url: String(url),
    snippet: String(snippet || "").replace(/\s+/g, " ").trim().slice(0, 500),
    source: host,
    publishedAt: publishedAt || null,
  };
}

async function fetchJson(fetchImpl, url, init, timeoutMs, providerName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    // Jamais le corps de la réponse d'erreur dans le message : il peut
    // reprendre la clé d'API ou la requête.
    if (!res.ok) throw new WebSearchProviderError(`${providerName} a répondu HTTP ${res.status}`, reasonOfStatus(res.status));
    try {
      return await res.json();
    } catch (_err) {
      throw new WebSearchProviderError(`${providerName} : réponse illisible`, "bad_response");
    }
  } catch (err) {
    if (err instanceof WebSearchProviderError) throw err;
    const timedOut = err && err.name === "AbortError";
    throw new WebSearchProviderError(timedOut ? `${providerName} : délai dépassé` : `${providerName} injoignable`, timedOut ? "timeout" : "unavailable");
  } finally {
    clearTimeout(timer);
  }
}

class HttpWebSearchProvider extends IWebSearchProvider {
  // eslint-disable-next-line no-unused-vars
  constructor({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 8000, baseUrl } = {}) {
    super();
    // Guillemets ou espaces recopiés avec la clé dans .env : retirés.
    this.apiKey = String(apiKey || "").trim().replace(/^["']|["']$/g, "");
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  isConfigured() {
    return Boolean(this.apiKey) && typeof this.fetchImpl === "function";
  }
}

// https://docs.tavily.com — POST /search
class TavilyWebSearchProvider extends HttpWebSearchProvider {
  get name() {
    return "tavily";
  }

  async search(query, { limit = 8 } = {}) {
    if (!this.isConfigured()) throw new WebSearchNotConfiguredError();
    const body = await fetchJson(
      this.fetchImpl,
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ query, max_results: limit, search_depth: "basic", include_answer: false }),
      },
      this.timeoutMs,
      this.name
    );
    return (Array.isArray(body && body.results) ? body.results : [])
      .map((r) => toResult({ title: r.title, url: r.url, snippet: r.content, publishedAt: r.published_date }))
      .filter(Boolean);
  }
}

// https://api.search.brave.com — GET /res/v1/web/search
class BraveWebSearchProvider extends HttpWebSearchProvider {
  get name() {
    return "brave";
  }

  async search(query, { language = "fr", limit = 8 } = {}) {
    if (!this.isConfigured()) throw new WebSearchNotConfiguredError();
    const params = new URLSearchParams({ q: query, count: String(limit), search_lang: language });
    const body = await fetchJson(
      this.fetchImpl,
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      { method: "GET", headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey } },
      this.timeoutMs,
      this.name
    );
    const results = body && body.web && Array.isArray(body.web.results) ? body.web.results : [];
    return results
      .map((r) => toResult({ title: r.title, url: r.url, snippet: String(r.description || "").replace(/<[^>]+>/g, ""), publishedAt: r.page_age }))
      .filter(Boolean);
  }
}

// https://serper.dev — POST /search (résultats Google via une API officielle
// du service ; jamais d'automatisation de l'interface du moteur).
class SerperWebSearchProvider extends HttpWebSearchProvider {
  get name() {
    return "serper";
  }

  async search(query, { language = "fr", limit = 8 } = {}) {
    if (!this.isConfigured()) throw new WebSearchNotConfiguredError();
    const body = await fetchJson(
      this.fetchImpl,
      "https://google.serper.dev/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": this.apiKey },
        body: JSON.stringify({ q: query, num: limit, hl: language }),
      },
      this.timeoutMs,
      this.name
    );
    return (Array.isArray(body && body.organic) ? body.organic : [])
      .map((r) => toResult({ title: r.title, url: r.link, snippet: r.snippet, publishedAt: r.date }))
      .filter(Boolean);
  }
}

// SearXNG — métamoteur libre AUTO-HÉBERGÉ (https://docs.searxng.org), sans
// compte ni clé : l'instance est désignée par WEB_SEARCH_BASE_URL et doit
// avoir le format JSON activé (search.formats: [html, json]).
class SearxngWebSearchProvider extends HttpWebSearchProvider {
  constructor({ baseUrl = "", ...rest } = {}) {
    super(rest);
    this.baseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  }

  get name() {
    return "searxng";
  }

  isConfigured() {
    return /^https?:\/\//i.test(this.baseUrl) && typeof this.fetchImpl === "function";
  }

  async search(query, { language = "fr", limit = 8 } = {}) {
    if (!this.isConfigured()) throw new WebSearchNotConfiguredError();
    const params = new URLSearchParams({ q: query, format: "json", language, safesearch: "1" });
    const body = await fetchJson(this.fetchImpl, `${this.baseUrl}/search?${params}`, { method: "GET", headers: { Accept: "application/json" } }, this.timeoutMs, this.name);
    return (Array.isArray(body && body.results) ? body.results : [])
      .slice(0, limit)
      .map((r) => toResult({ title: r.title, url: r.url, snippet: r.content, publishedAt: r.publishedDate }))
      .filter(Boolean);
  }
}

const PROVIDERS = Object.freeze({
  searxng: SearxngWebSearchProvider,
  tavily: TavilyWebSearchProvider,
  serper: SerperWebSearchProvider,
  brave: BraveWebSearchProvider,
});

/**
 * WEB_SEARCH_PROVIDER = tavily | serper | brave | searxng (vide : recherche Web désactivée)
 * WEB_SEARCH_BASE_URL = adresse de l'instance SearXNG (searxng uniquement)
 * WEB_SEARCH_API_KEY  = clé d'API du fournisseur — lue dans l'environnement
 *                       uniquement, jamais écrite dans un journal ni une erreur
 * WEB_SEARCH_TIMEOUT_MS (optionnel, défaut 8000)
 * Les mêmes noms préfixés AI_ (AI_WEB_SEARCH_PROVIDER…) sont acceptés et
 * prioritaires.
 * Une valeur inconnue ou une clé absente ne fait jamais échouer le démarrage :
 * la recherche Web est simplement indisponible.
 */
function createWebSearchProvider(env = process.env, { fetchImpl } = {}) {
  const read = (name) => String(env[`AI_${name}`] || env[name] || "").trim();
  const key = read("WEB_SEARCH_PROVIDER").toLowerCase();
  const Provider = PROVIDERS[key];
  if (!Provider) return new NotConfiguredWebSearchProvider();
  const timeout = Number(read("WEB_SEARCH_TIMEOUT_MS"));
  return new Provider({
    apiKey: read("WEB_SEARCH_API_KEY"),
    baseUrl: read("WEB_SEARCH_BASE_URL"),
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(Number.isInteger(timeout) && timeout >= 1000 && timeout <= 30000 ? { timeoutMs: timeout } : {}),
  });
}

module.exports = {
  IWebSearchProvider,
  NotConfiguredWebSearchProvider,
  TavilyWebSearchProvider,
  BraveWebSearchProvider,
  SerperWebSearchProvider,
  SearxngWebSearchProvider,
  WebSearchNotConfiguredError,
  WebSearchProviderError,
  createWebSearchProvider,
  hostOf,
  PROVIDER_NAMES: Object.keys(PROVIDERS),
};
