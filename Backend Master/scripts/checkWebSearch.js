"use strict";

// Vérifie la recherche Web de PROBAR ASSISTANT par un APPEL RÉEL au
// fournisseur configuré dans .env (WEB_SEARCH_PROVIDER / WEB_SEARCH_API_KEY,
// ou WEB_SEARCH_BASE_URL pour searxng).
//
//   npm run web-search:check
//   npm run web-search:check -- "Amin Mansour" engineer
//
// Affiche le fournisseur, la requête envoyée et les sources retenues — jamais
// la clé d'API.

require("dotenv").config({ quiet: true });

const { WebSearchService } = require("../src/ai/web/webSearchService");
const { PROVIDER_NAMES } = require("../src/ai/web/webSearchProviders");

async function main() {
  const [target = "CBI Tunisia", entity = "company", language = "fr"] = process.argv.slice(2);
  const service = new WebSearchService();

  if (!service.isConfigured()) {
    console.error("Recherche Web NON configurée.");
    console.error(`  WEB_SEARCH_PROVIDER = ${process.env.AI_WEB_SEARCH_PROVIDER || process.env.WEB_SEARCH_PROVIDER || "(vide)"}  — valeurs acceptées : ${PROVIDER_NAMES.join(", ")}`);
    console.error(`  WEB_SEARCH_API_KEY  = ${process.env.AI_WEB_SEARCH_API_KEY || process.env.WEB_SEARCH_API_KEY ? "(renseignée)" : "(vide)"}`);
    console.error("Renseignez ces valeurs dans le fichier .env du backend, puis relancez cette commande.");
    process.exit(2);
  }

  console.log(`Fournisseur : ${service.provider.name}`);
  try {
    const out = await service.search({ target, entity, language });
    console.log(`Requête(s)  : ${out.queries.join("  |  ")}`);
    console.log(`Sources retenues : ${out.results.length}${out.identity ? `  (concordance : ${out.identity})` : ""}`);
    out.results.forEach((r, i) => console.log(`  ${i + 1}. [${r.sourceKind}/${r.identity}] ${r.title}\n     ${r.url}`));
    if (!out.results.length) console.log("Le fournisseur répond, mais aucun résultat ne mentionne cette cible.");
    console.log("\nRecherche Web opérationnelle.");
  } catch (err) {
    const hints = {
      invalid_key: "clé refusée par le fournisseur — vérifiez WEB_SEARCH_API_KEY (copie complète, sans espace ni guillemet).",
      quota_exceeded: "quota ou crédit épuisé chez le fournisseur.",
      rate_limited: "trop de requêtes — réessayez dans une minute.",
      timeout: "délai dépassé — vérifiez l'accès Internet du serveur (WEB_SEARCH_TIMEOUT_MS).",
      unavailable: "fournisseur injoignable — vérifiez l'accès Internet du serveur.",
    };
    console.error(`Échec de la recherche : ${err.message}`);
    if (err.reason && hints[err.reason]) console.error(`Cause : ${hints[err.reason]}`);
    process.exit(1);
  }
}

main();
