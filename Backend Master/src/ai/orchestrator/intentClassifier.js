"use strict";

const { tokenize } = require("../utils/tokenize");

/**
 * # Les 15 intentions reconnues, en français
 *
 * Deux familles, volontairement distinguées (voir INTENT_CLASSIFIER.md) :
 * - **Question sur un domaine métier** (`question_*`, 10 entrées) — QUOI
 *   l'utilisateur demande : KPI, Projet, Commerciale, RH, Maintenance,
 *   Industrielle, Dashboard, Reporting, Recherche, Documentation.
 * - **Demande transversale** (`demande_*`, 5 entrées) — COMMENT l'utilisateur
 *   veut la réponse : Action, Résumé, Comparaison, Statistiques, Prévision —
 *   une demande de résumé peut porter sur n'importe quel domaine ci-dessus,
 *   ce n'est donc pas un module métier au même sens.
 *
 * Chaque entrée : `key` (identifiant stable), `label` (nom demandé,
 * affichable), `keywords` (français, formes accentuées ET non accentuées —
 * un utilisateur tape rarement les accents sur mobile), `description`.
 */
const INTENT_DEFINITIONS = [
  {
    key: "question_kpi",
    label: "Question KPI",
    description: "Question sur un indicateur clé de performance (KPI) précis.",
    keywords: ["kpi", "kpis", "indicateur", "indicateurs", "performance", "objectif", "objectifs", "taux", "indice"],
  },
  {
    key: "question_projet",
    label: "Question Projet",
    description: "Question sur un ou plusieurs projets (étape, propriétaire, avancement).",
    keywords: ["projet", "projets", "etape", "étape", "etapes", "étapes", "jalon", "jalons", "avancement", "proprietaire", "propriétaire", "owner"],
  },
  {
    key: "question_commerciale",
    label: "Question Commerciale",
    description: "Question sur les contacts commerciaux, prospects, relances ou opportunités.",
    keywords: ["commercial", "commerciaux", "contact", "contacts", "client", "clients", "prospect", "prospects", "relance", "relances", "opportunite", "opportunité", "vente", "ventes"],
  },
  {
    key: "question_rh",
    label: "Question RH",
    description: "Question sur les demandes RH : congés, absences, recrutement.",
    keywords: ["rh", "conge", "congé", "conges", "congés", "absence", "absences", "employe", "employé", "employes", "employés", "recrutement", "embauche"],
  },
  {
    key: "question_maintenance",
    label: "Question Maintenance",
    description: "Question sur une demande de maintenance : panne, technicien, intervention.",
    keywords: ["maintenance", "panne", "pannes", "technicien", "techniciens", "intervention", "interventions", "reparation", "réparation", "equipement", "équipement"],
  },
  {
    key: "question_industrielle",
    label: "Question Industrielle",
    description: "Question sur une fiche de production industrielle (PROBAR, mélange, ...).",
    keywords: ["industriel", "industrielle", "industrielles", "production", "fiche", "fiches", "usine", "atelier", "fabrication"],
  },
  {
    key: "question_dashboard",
    label: "Question Dashboard",
    description: "Question sur un tableau de bord ou une vue d'ensemble.",
    keywords: ["dashboard", "tableau", "bord", "apercu", "aperçu", "vue"],
  },
  {
    key: "question_reporting",
    label: "Question Reporting",
    description: "Question sur un rapport ou un bilan déjà produit.",
    keywords: ["rapport", "rapports", "reporting", "bilan", "bilans"],
  },
  {
    key: "question_recherche",
    label: "Question Recherche",
    description: "Recherche libre d'une information précise (pas une question de documentation générale).",
    keywords: ["recherche", "cherche", "cherché", "trouve", "trouver", "chercher", "localise", "localiser"],
  },
  {
    key: "question_documentation",
    label: "Question Documentation",
    description: "Question sur le fonctionnement du CRM, une procédure, ou la documentation.",
    // Volontairement SANS "comment"/"pourquoi" seuls : trop génériques en
    // français courant ("comment vas-tu ?") — faux positif systématique sur
    // une simple salutation, découvert par test (voir
    // test/ai.orchestrator.intentClassifier.test.js).
    keywords: ["documentation", "guide", "procedure", "procédure", "manuel", "tutoriel", "explique", "expliquer", "fonctionne"],
  },
  {
    key: "demande_action",
    label: "Demande d'action",
    description: "Demande d'exécuter une action métier concrète (créer, modifier, assigner, ...).",
    keywords: ["cree", "crée", "creer", "créer", "ajoute", "ajouter", "supprime", "supprimer", "modifie", "modifier", "assigne", "assigner", "planifie", "planifier", "valide", "valider", "annule", "annuler"],
  },
  {
    key: "demande_resume",
    label: "Demande de résumé",
    description: "Demande une synthèse courte d'une situation, quel que soit le domaine.",
    keywords: ["resume", "résume", "resumer", "résumer", "résumé", "synthetise", "synthétise", "synthese", "synthèse", "bref"],
  },
  {
    key: "demande_comparaison",
    label: "Demande de comparaison",
    description: "Demande de comparer deux périodes, entités ou valeurs.",
    keywords: ["compare", "comparer", "comparaison", "difference", "différence", "versus", "evolution", "évolution"],
  },
  {
    key: "demande_statistiques",
    label: "Demande de statistiques",
    description: "Demande un chiffre agrégé : moyenne, total, pourcentage, décompte.",
    keywords: ["statistique", "statistiques", "stats", "moyenne", "total", "pourcentage", "nombre", "somme"],
  },
  {
    key: "demande_prevision",
    label: "Demande de prévision",
    description: "Demande une projection ou une tendance future, pas un état actuel.",
    keywords: ["prevision", "prévision", "previsions", "prévisions", "prevoir", "prévoir", "predire", "prédire", "prediction", "prédiction", "tendance", "tendances", "estimer", "estimation", "futur"],
  },
];

/**
 * # IntentClassifier — détection d'intention en français, avec score de confiance
 *
 * ## Rôle
 * Classifie un message utilisateur dans l'une des 15 intentions demandées
 * (`INTENT_DEFINITIONS` ci-dessus), en français, entièrement hors-ligne
 * (aucun appel à un fournisseur LLM — même philosophie que
 * `LexicalIntentRouter`/`HashingEmbeddingProvider` : un adaptateur qui
 * fonctionne sans modèle configuré). Réutilise le même `tokenize()` partagé
 * que `LexicalIntentRouter`/`ToolRouter`/`LexicalOverlapReranker` — un seul
 * tokenizer dans tout le kernel, jamais un second réécrit ici.
 *
 * Distinct de `orchestrator/intentCatalog.js`/`IntentDetector` (le
 * classificateur déjà câblé dans `AIManager`) : celui-là résout UNE
 * intention par MODULE métier (`moduleKey`, `requiresTools`, `requiresRag`)
 * pour piloter `ToolRouter`/`WorkflowManager`. Celui-ci répond à une demande
 * différente et plus fine — reconnaître, en plus du domaine, le TYPE de
 * demande (question vs action vs résumé vs comparaison vs statistiques vs
 * prévision) — voir `INTENT_CLASSIFIER.md` pour la correspondance complète
 * entre les deux taxonomies et comment les brancher ensemble si besoin.
 *
 * ## Score de confiance
 * `confidence = score de l'intention gagnante / somme des scores de TOUTES
 * les intentions` — la part du signal lexical total qui pointe vers la
 * gagnante. Un message qui ne matche qu'une seule intention obtient
 * `confidence: 1`. Un message ambigu (mots-clés de plusieurs intentions)
 * obtient une confiance plus basse, proportionnelle au partage du signal.
 * Un message sans aucun mot-clé reconnu obtient `intent: null,
 * confidence: 0`.
 *
 * ## Entrée
 * `classify(message: string)`
 *
 * ## Sortie
 * `{ intent: string|null, label: string|null, confidence: number,
 *    scores: {key, label, score, matchedKeywords}[] }` — `scores` est
 * TOUJOURS trié du score le plus élevé au plus faible, pour audit/débogage
 * (voir « documenter toutes les intentions » — chaque décision est
 * traçable jusqu'aux mots-clés qui l'ont déclenchée).
 */
class IntentClassifier {
  constructor({ definitions = INTENT_DEFINITIONS, fallbackIntent = null } = {}) {
    this.definitions = definitions;
    this.fallbackIntent = fallbackIntent;
  }

  classify(message) {
    const termSet = new Set(tokenize(message));

    const scores = this.definitions.map((def) => {
      const matchedKeywords = def.keywords.filter((kw) => termSet.has(kw));
      return { key: def.key, label: def.label, score: matchedKeywords.length, matchedKeywords };
    });

    // Array#sort is a stable sort (guaranteed since ES2019): ties keep the
    // definitions' original declaration order rather than being shuffled.
    scores.sort((a, b) => b.score - a.score);

    const top = scores[0];
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);

    if (!top || top.score === 0 || totalScore === 0) {
      return { intent: this.fallbackIntent, label: null, confidence: 0, scores };
    }

    const confidence = Number((top.score / totalScore).toFixed(3));
    return { intent: top.key, label: top.label, confidence, scores };
  }

  // Adaptateur IRouter (langchain/router/router.interface.js) : renvoie
  // uniquement la clé gagnante (ou `fallbackIntent`), pour un branchement
  // direct comme routeur d'IntentDetector si les clés du catalogue cible
  // sont alignées sur celles-ci (voir INTENT_CLASSIFIER.md).
  async route(message) {
    const result = this.classify(message);
    return result.intent || this.fallbackIntent;
  }
}

module.exports = { IntentClassifier, INTENT_DEFINITIONS };
