"use strict";

// Hasard DÉTERMINISTE : même graine et même configuration → mêmes données,
// mêmes identifiants. C'est ce qui rend un lot rejouable sans doublons.

const crypto = require("crypto");

// Générateur pseudo-aléatoire mulberry32, initialisé par la graine du lot.
function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max, digits = 2) => Number((min + next() * (max - min)).toFixed(digits)),
    bool: (probability = 0.5) => next() < probability,
    pick: (list) => list[Math.floor(next() * list.length)],
    // [[valeur, poids], …] → une valeur tirée selon les poids.
    weighted: (pairs) => {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [value, weight] of pairs) {
        r -= weight;
        if (r < 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },
    // Sous-générateur indépendant : ajouter une famille de données ne décale
    // pas les tirages des autres.
    fork: (label) => createRng(parseInt(crypto.createHash("sha1").update(`${seed}|${label}`).digest("hex").slice(0, 8), 16)),
  };
  return rng;
}

// Identifiant UUID dérivé du lot, de la table et d'une clé stable : le même
// enregistrement reçoit toujours le même identifiant.
function stableUuid(batchName, table, key) {
  const h = crypto.createHash("sha1").update(`${batchName}|${table}|${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const pad = (n, width = 3) => String(n).padStart(width, "0");
const DAY = 86400000;
const ymd = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * DAY);

module.exports = { createRng, stableUuid, pad, DAY, ymd, addDays };
