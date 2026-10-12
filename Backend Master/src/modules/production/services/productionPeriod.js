"use strict";

// Résolution du filtre « Période » du module Production (dashboard, listes,
// export) en un intervalle de dates calendaires INCLUSIF [from, to] au format
// YYYY-MM-DD — même découpage que porPromesh.repository.dateRangeWhere
// (semaine commençant le lundi, bornes en heure locale du serveur).

const PERIOD_KEYS = Object.freeze(["today", "week", "month", "year", "custom"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Au-delà, le graphique journalier bascule en regroupement mensuel.
const MAX_DAILY_BUCKETS = 62;
const MAX_CUSTOM_SPAN_DAYS = 366 * 5;

function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseYmd(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // Refuse 2026-02-31 (que Date normaliserait silencieusement en mars).
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function frDate(value) {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * @param {{ period?: string, from?: string, to?: string }} query
 * @param {Date} [now]
 * @returns {{ key: string, from: string, to: string, label: string, granularity: "day"|"month", today: string }}
 */
function resolvePeriod(query = {}, now = new Date()) {
  const key = query.period || "month";
  if (!PERIOD_KEYS.includes(key)) {
    throw { status: 400, message: `Période invalide : ${key}` };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = today;
  let to = today;
  let label = "Aujourd'hui";

  if (key === "week") {
    const weekday = today.getDay() === 0 ? 7 : today.getDay(); // lundi = 1
    from = addDays(today, -(weekday - 1));
    label = "Cette semaine";
  } else if (key === "month") {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
    label = "Ce mois";
  } else if (key === "year") {
    from = new Date(today.getFullYear(), 0, 1);
    label = "Cette année";
  } else if (key === "custom") {
    from = parseYmd(query.from);
    to = parseYmd(query.to);
    if (!from || !to) {
      throw { status: 400, message: "Période personnalisée : date début et date fin requises (YYYY-MM-DD)." };
    }
    if (from > to) {
      throw { status: 400, message: "Période personnalisée : la date début doit précéder la date fin." };
    }
    if ((to - from) / 86400000 > MAX_CUSTOM_SPAN_DAYS) {
      throw { status: 400, message: "Période personnalisée : intervalle limité à 5 ans." };
    }
    label = `Du ${frDate(ymd(from))} au ${frDate(ymd(to))}`;
  }

  const days = Math.round((to - from) / 86400000) + 1;
  return {
    key,
    from: ymd(from),
    to: ymd(to),
    label,
    granularity: days > MAX_DAILY_BUCKETS ? "month" : "day",
    today: ymd(today),
  };
}

// Clés de regroupement (jour ou mois) couvrant toute la période, dans l'ordre
// — les graphiques affichent ainsi les jours sans production à 0.
function bucketKeys(period) {
  const keys = [];
  const from = parseYmd(period.from);
  const to = parseYmd(period.to);
  if (period.granularity === "month") {
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      keys.push(ymd(d).slice(0, 7));
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) keys.push(ymd(d));
  }
  return keys;
}

function bucketOf(date, period) {
  return period.granularity === "month" ? date.slice(0, 7) : date;
}

module.exports = { PERIOD_KEYS, resolvePeriod, bucketKeys, bucketOf, ymd, parseYmd, addDays, frDate };
