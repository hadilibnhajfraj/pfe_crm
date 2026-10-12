"use strict";

// Rapprochement d'un nom saisi (« Zakariah Derbel », « ZAKARIAH DERBEL »,
// « Zakaria Derbel », « Закарии Дербеле ») avec une liste de noms connus.
//
// Paliers, du plus sûr au moins sûr — seul le MEILLEUR palier non vide est
// renvoyé, jamais un mélange :
//   1. exact       : même texte, casse et espaces ignorés
//   2. normalized  : accents retirés, ponctuation ignorée
//   3. tokens      : mêmes mots dans un autre ordre, ou tous les mots saisis
//                    présents (« Derbel Zakariah », « Zakariah » seul)
//   4. fuzzy       : faute de frappe légère sur chaque mot — uniquement si
//                    aucun palier précédent n'a rien trouvé
// Un rapprochement approximatif est toujours signalé (`matchType: "fuzzy"`)
// pour que l'appelant ne le présente jamais comme une certitude.

const CYRILLIC_TO_LATIN = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(text) {
  return String(text).replace(/[а-яё]/g, (c) => CYRILLIC_TO_LATIN[c] ?? c);
}

function normalizeName(value) {
  return transliterate(
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
  )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokensOf(value) {
  return normalizeName(value).split(" ").filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Tolérance par mot : aucune sous 4 lettres (« Ali » ≠ « Ala »), 1 faute de
// 4 à 6 lettres, 2 fautes à partir de 7.
function tolerance(word) {
  if (word.length < 4) return 0;
  return word.length < 7 ? 1 : 2;
}

function fuzzyWordMatch(a, b) {
  if (a === b) return true;
  // Les initiales doivent concorder : « Karim » ne devient jamais « Zarim ».
  if (a[0] !== b[0]) return false;
  return levenshtein(a, b) <= Math.min(tolerance(a), tolerance(b));
}

function matchType(queryText, candidateText) {
  const rawQuery = String(queryText || "").trim().toLowerCase().replace(/\s+/g, " ");
  const rawCandidate = String(candidateText || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!rawQuery || !rawCandidate) return null;
  if (rawQuery === rawCandidate) return "exact";

  const q = tokensOf(queryText);
  const c = tokensOf(candidateText);
  if (!q.length || !c.length) return null;
  if (q.join(" ") === c.join(" ")) return "normalized";

  const candidateSet = new Set(c);
  if (q.every((w) => candidateSet.has(w))) return "tokens";

  // Chaque mot saisi doit trouver SON mot (jamais deux fois le même), et un
  // nom complet saisi ne correspond pas à un nom plus court.
  if (q.length > c.length) return null;
  const free = [...c];
  for (const word of q) {
    const at = free.findIndex((w) => fuzzyWordMatch(word, w));
    if (at === -1) return null;
    free.splice(at, 1);
  }
  return "fuzzy";
}

const TIERS = ["exact", "normalized", "tokens", "fuzzy"];

/**
 * @param {string} query
 * @param {{ name: string }[]} candidates
 * @returns {{ matchType: "exact"|"normalized"|"tokens"|"fuzzy"|null, matches: object[] }}
 */
function matchNames(query, candidates) {
  const byTier = new Map(TIERS.map((t) => [t, []]));
  for (const candidate of candidates || []) {
    const type = matchType(query, candidate && candidate.name);
    if (type) byTier.get(type).push(candidate);
  }
  for (const tier of TIERS) {
    const matches = byTier.get(tier);
    if (matches.length) return { matchType: tier, matches };
  }
  return { matchType: null, matches: [] };
}

module.exports = { matchNames, matchType, normalizeName, tokensOf, transliterate, levenshtein };
