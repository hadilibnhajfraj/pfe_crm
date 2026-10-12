"use strict";

// Module Production — vue consolidée PROMESH + PROBAR (dashboard, listes,
// fiche, données d'export). LECTURE SEULE : aucune écriture, aucune règle
// métier modifiée — la création / modification / validation des fiches reste
// dans les modules por-promesh et industrial-records.
//
// Sources réelles :
//   - production PROMESH : por_promesh.productionM2 (m²)
//   - production PROBAR  : industrial_records.quantiteProduite (m², module probar)
//   - déchets            : recuperable_lignes.dechetKg (kg), rattachés à la
//                          ligne / machine / date / poste de leur fiche
//   - machines           : référentiel `machines`
//
// Périmètre : responsable_logistique_achat ne voit que ses propres fiches —
// même règle (isOwnerScoped) que les trois modules sources.

const repo = require("../repositories/production.repository");
const { parseMachineRef, formatMachineCode } = require("../../../utils/machineRef");
const { resolvePeriod, bucketKeys, bucketOf, ymd } = require("./productionPeriod");

const LINES = Object.freeze({
  promesh: { key: "promesh", label: "PROMESH", type: "PROMESH" },
  probar: { key: "probar", label: "PROBAR", type: "PROBAR" },
});
const LINE_KEYS = Object.freeze(Object.keys(LINES));
const STATUSES = Object.freeze(["BROUILLON", "VALIDEE", "ARCHIVEE"]);
const UNIT = "m²";
const WASTE_UNIT = "kg";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RECENT_LIMIT = 10;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

function isOwnerScoped(role) {
  return role === "responsable_logistique_achat";
}

function scopeOf(actor) {
  return isOwnerScoped(actor.role) ? actor.id : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// Taux de déchets = déchets / production × 100 (kg de déchets pour 100 m²
// produits). null quand rien n'a été produit : pas de division par zéro ni de
// taux inventé.
function wasteRate(wasteKg, quantity) {
  return quantity > 0 ? round2((wasteKg / quantity) * 100) : null;
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return ymd(value);
}

// ── Machines ──────────────────────────────────────────────────────────────

function indexMachines(machines) {
  const byId = new Map();
  const byKey = new Map();
  for (const m of machines) {
    byId.set(m.id, m);
    byKey.set(`${m.typeMachine}-${m.numero}`, m);
  }
  return { list: machines, byId, byKey };
}

// Lien réel `machineId` → référentiel ; à défaut, le libellé saisi ("1",
// "PROBAR-01"…) — même repli que industrialStatistics.service.
function resolveMachine(row, type, index) {
  const linked = row.machineId ? index.byId.get(row.machineId) : null;
  if (linked) return toMachineRef(linked);
  const parsed = parseMachineRef(row.machine, type);
  if (!parsed) return null;
  const known = index.byKey.get(`${parsed.typeMachine}-${parsed.numero}`);
  if (known) return toMachineRef(known);
  return {
    id: null,
    code: formatMachineCode(parsed.typeMachine, parsed.numero),
    nom: `Machine ${parsed.numero}`,
    numero: parsed.numero,
    typeMachine: parsed.typeMachine,
  };
}

function toMachineRef(m) {
  return { id: m.id, code: m.code, nom: m.nom, numero: m.numero, typeMachine: m.typeMachine };
}

// ── Normalisation des fiches (une même forme pour PROMESH et PROBAR) ───────

function userOf(r) {
  const operateur = (r.operateur || "").trim();
  return operateur || (r.creator && r.creator.email) || null;
}

function yearOf(r) {
  return r.createdAt ? new Date(r.createdAt).getFullYear() : new Date().getFullYear();
}

function normalizePromesh(r, index) {
  return {
    id: r.id,
    line: "promesh",
    lineLabel: LINES.promesh.label,
    // Même format que porPromesh.dto.formatNumero.
    reference: r.sequenceNumber == null ? null : `PROMESH-${yearOf(r)}-${String(r.sequenceNumber).padStart(6, "0")}`,
    date: dateOnly(r.dateProduction) || dateOnly(r.createdAt ? new Date(r.createdAt) : null),
    machine: resolveMachine(r, LINES.promesh.type, index),
    poste: r.poste || null,
    user: userOf(r),
    quantity: num(r.productionM2),
    unit: UNIT,
    status: r.status === "VALIDE" ? "VALIDEE" : "BROUILLON",
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function probarStatus(statut) {
  const s = String(statut || "").toLowerCase();
  if (s === "validee") return "VALIDEE";
  if (s === "archivee") return "ARCHIVEE";
  return "BROUILLON";
}

function normalizeProbar(r, index) {
  return {
    id: r.id,
    line: "probar",
    lineLabel: LINES.probar.label,
    // Les fiches PROBAR n'ont pas de numéro séquentiel en base : référence
    // d'affichage stable dérivée de l'identifiant.
    reference: `PROBAR-${yearOf(r)}-${String(r.id).slice(0, 8).toUpperCase()}`,
    date: dateOnly(r.dateFiche),
    machine: resolveMachine(r, LINES.probar.type, index),
    poste: r.poste || null,
    user: userOf(r),
    quantity: num(r.quantiteProduite),
    unit: UNIT,
    status: probarStatus(r.statut),
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Les fiches Récupérables nomment le second poste "soir", les fiches de
// production "nuit" : c'est le même poste.
function normalizePoste(poste) {
  return poste === "soir" ? "nuit" : poste || null;
}

function normalizeWaste(fiche, index) {
  const line = String(fiche.module || "").toLowerCase();
  if (!LINES[line]) return null;
  const lignes = fiche.lignes || [];
  return {
    line,
    lineLabel: LINES[line].label,
    date: dateOnly(fiche.date),
    machine: resolveMachine(fiche, LINES[line].type, index),
    poste: normalizePoste(fiche.poste),
    wasteKg: round2(lignes.reduce((s, l) => s + num(l.dechetKg), 0)),
    recuperableKg: round2(lignes.reduce((s, l) => s + num(l.dechetProduitFiniKg), 0)),
  };
}

function shiftKey(entry) {
  if (!entry.machine || !entry.poste || !entry.date) return null;
  return `${entry.line}|${entry.machine.numero}|${entry.date}|${entry.poste}`;
}

function byRecency(a, b) {
  if (a.date !== b.date) return (b.date || "").localeCompare(a.date || "");
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

async function loadDataset(actor, range) {
  const query = { from: range.from, to: range.to, createdBy: scopeOf(actor) };
  const [machines, promesh, probar, recuperables] = await Promise.all([
    repo.findMachines(),
    repo.findPromesh(query),
    repo.findProbar(query),
    repo.findRecuperables(query),
  ]);

  const index = indexMachines(machines);
  const waste = recuperables.map((f) => normalizeWaste(f, index)).filter(Boolean);

  // Déchets du poste (ligne + machine + date + poste) affichés sur chaque
  // fiche de ce poste. Les TOTAUX ne sont jamais calculés en sommant cette
  // colonne (deux fiches d'un même poste compteraient deux fois) mais
  // directement sur `waste`.
  const shiftWaste = new Map();
  for (const w of waste) {
    const key = shiftKey(w);
    if (!key) continue;
    const acc = shiftWaste.get(key) || { wasteKg: 0, recuperableKg: 0 };
    acc.wasteKg = round2(acc.wasteKg + w.wasteKg);
    acc.recuperableKg = round2(acc.recuperableKg + w.recuperableKg);
    shiftWaste.set(key, acc);
  }

  const rows = [...promesh.map((r) => normalizePromesh(r, index)), ...probar.map((r) => normalizeProbar(r, index))]
    .map((row) => {
      const shift = shiftWaste.get(shiftKey(row));
      return { ...row, wasteKg: shift ? shift.wasteKg : null, recuperableKg: shift ? shift.recuperableKg : null, wasteUnit: WASTE_UNIT };
    })
    .sort(byRecency);

  return { index, rows, waste };
}

// ── Agrégats ───────────────────────────────────────────────────────────────

function summarize(rows, waste) {
  const quantity = round2(rows.reduce((s, r) => s + r.quantity, 0));
  const wasteKg = round2(waste.reduce((s, w) => s + w.wasteKg, 0));
  return {
    fiches: rows.length,
    quantity,
    unit: UNIT,
    wasteKg,
    wasteUnit: WASTE_UNIT,
    recuperableKg: round2(waste.reduce((s, w) => s + w.recuperableKg, 0)),
    wasteRate: wasteRate(wasteKg, quantity),
    brouillons: rows.filter((r) => r.status === "BROUILLON").length,
    validees: rows.filter((r) => r.status === "VALIDEE").length,
    archivees: rows.filter((r) => r.status === "ARCHIVEE").length,
  };
}

function machineBreakdown(line, dataset, todayRows) {
  const rows = dataset.rows.filter((r) => r.line === line);
  const waste = dataset.waste.filter((w) => w.line === line);
  const producingToday = new Set(todayRows.filter((r) => r.line === line && r.machine).map((r) => r.machine.numero));

  // Toutes les machines du référentiel de la ligne (même sans fiche sur la
  // période), plus celles qu'une fiche référence hors référentiel.
  const machines = new Map();
  for (const m of dataset.index.list.filter((x) => x.typeMachine === LINES[line].type)) {
    machines.set(m.numero, { ...toMachineRef(m), statut: m.statut });
  }
  for (const entry of [...rows, ...waste]) {
    if (entry.machine && !machines.has(entry.machine.numero)) {
      machines.set(entry.machine.numero, { ...entry.machine, statut: null });
    }
  }

  return [...machines.values()]
    .sort((a, b) => a.numero - b.numero)
    .map((m) => {
      const own = rows.filter((r) => r.machine && r.machine.numero === m.numero);
      const ownWaste = waste.filter((w) => w.machine && w.machine.numero === m.numero);
      const quantity = round2(own.reduce((s, r) => s + r.quantity, 0));
      const wasteKg = round2(ownWaste.reduce((s, w) => s + w.wasteKg, 0));
      let state = "ACTIVE";
      if (m.statut === "INACTIVE") state = "INACTIVE";
      else if (producingToday.has(m.numero)) state = "EN_PRODUCTION";
      return {
        machineId: m.id,
        code: m.code,
        nom: m.nom,
        numero: m.numero,
        line,
        fiches: own.length,
        quantity,
        unit: UNIT,
        wasteKg,
        wasteRate: wasteRate(wasteKg, quantity),
        // `rows` est trié du plus récent au plus ancien.
        lastProduction: own.length ? own[0].date : null,
        state,
      };
    });
}

function series(period, entries, valueOf) {
  const buckets = new Map(bucketKeys(period).map((k) => [k, { date: k, promesh: 0, probar: 0, total: 0 }]));
  for (const e of entries) {
    if (!e.date) continue;
    const bucket = buckets.get(bucketOf(e.date, period));
    if (!bucket) continue;
    const value = valueOf(e);
    bucket[e.line] = round2(bucket[e.line] + value);
    bucket.total = round2(bucket.total + value);
  }
  return [...buckets.values()];
}

function buildDashboard(dataset, period, todayRows) {
  const lines = {};
  for (const line of LINE_KEYS) {
    lines[line] = {
      ...summarize(dataset.rows.filter((r) => r.line === line), dataset.waste.filter((w) => w.line === line)),
      machines: machineBreakdown(line, dataset, todayRows),
    };
  }

  const total = summarize(dataset.rows, dataset.waste);
  const allMachines = [...lines.promesh.machines, ...lines.probar.machines];
  const referentiel = dataset.index.list;

  return {
    period: { key: period.key, from: period.from, to: period.to, label: period.label, granularity: period.granularity },
    generatedAt: new Date().toISOString(),
    promesh: lines.promesh,
    probar: lines.probar,
    machines: {
      // Machines ACTIVES du référentiel / machines du référentiel.
      active: referentiel.filter((m) => m.statut === "ACTIVE").length,
      total: referentiel.length,
      // Machines ayant au moins une fiche sur la période.
      withProduction: allMachines.filter((m) => m.fiches > 0).length,
      producingToday: allMachines.filter((m) => m.state === "EN_PRODUCTION").length,
      productionsToday: todayRows.length,
    },
    production: { fiches: total.fiches, quantity: total.quantity, unit: UNIT },
    waste: { kg: total.wasteKg, unit: WASTE_UNIT, recuperableKg: total.recuperableKg, rate: total.wasteRate },
    charts: {
      granularity: period.granularity,
      production: series(period, dataset.rows, (r) => r.quantity),
      waste: series(period, dataset.waste, (w) => w.wasteKg),
      byMachine: allMachines.map((m) => ({
        code: m.code,
        line: m.line,
        numero: m.numero,
        fiches: m.fiches,
        quantity: m.quantity,
        wasteKg: m.wasteKg,
      })),
    },
    recent: dataset.rows.slice(0, RECENT_LIMIT).map(publicRow),
  };
}

function publicRow(row) {
  const { createdBy, ...rest } = row;
  return rest;
}

// « Productions aujourd'hui » et l'état « En production » des machines
// portent toujours sur le jour courant, quelle que soit la période affichée.
async function loadTodayRows(actor, period, dataset) {
  if (period.today >= period.from && period.today <= period.to) {
    return dataset.rows.filter((r) => r.date === period.today);
  }
  const today = await loadDataset(actor, { from: period.today, to: period.today });
  return today.rows.filter((r) => r.date === period.today);
}

// ── Cache du dashboard ─────────────────────────────────────────────────────
// Le dashboard agrège 4 tables à chaque appel ; plusieurs utilisateurs (ou un
// retour de navigation) dans la même demi-minute réutilisent le résultat.
// Clé = périmètre + période : un utilisateur restreint à ses fiches ne reçoit
// jamais le résultat global. Le bouton « Actualiser » passe refresh=1.
const CACHE_TTL_MS = 30 * 1000;
const CACHE_MAX_ENTRIES = 200;
const dashboardCache = new Map();

function cacheGet(key) {
  const hit = dashboardCache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    dashboardCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (dashboardCache.size >= CACHE_MAX_ENTRIES) dashboardCache.delete(dashboardCache.keys().next().value);
  dashboardCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

async function getDashboard(actor, query = {}) {
  const period = resolvePeriod(query);
  const key = `${scopeOf(actor) || "all"}|${period.key}|${period.from}|${period.to}`;
  const refresh = query.refresh === true || query.refresh === "1" || query.refresh === "true";

  if (!refresh) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const dataset = await loadDataset(actor, period);
  const todayRows = await loadTodayRows(actor, period, dataset);
  const dashboard = buildDashboard(dataset, period, todayRows);
  cacheSet(key, dashboard);
  return dashboard;
}

// ── Liste d'une ligne (pages PROMESH / PROBAR) ─────────────────────────────

function assertLine(line) {
  if (!LINES[line]) throw { status: 400, message: `Ligne de production invalide : ${line}` };
  return line;
}

function parseListFilters(query) {
  const status = query.status ? String(query.status).toUpperCase() : null;
  if (status && !STATUSES.includes(status)) throw { status: 400, message: `Statut invalide : ${query.status}` };
  const poste = query.poste ? String(query.poste).toLowerCase() : null;
  if (poste && !["matin", "nuit"].includes(poste)) throw { status: 400, message: `Poste invalide : ${query.poste}` };
  const machine = query.machine ? parseInt(query.machine, 10) : null;
  if (query.machine && !Number.isInteger(machine)) throw { status: 400, message: `Machine invalide : ${query.machine}` };
  return {
    status,
    poste,
    machine,
    user: query.user ? String(query.user).trim().toLowerCase() : null,
    search: query.search ? String(query.search).trim().toLowerCase() : null,
  };
}

function filterLine(dataset, line, filters) {
  const lineRows = dataset.rows.filter((r) => r.line === line);
  const rows = lineRows.filter((r) => {
    if (filters.machine != null && (!r.machine || r.machine.numero !== filters.machine)) return false;
    if (filters.poste && r.poste !== filters.poste) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.user && (r.user || "").toLowerCase() !== filters.user) return false;
    if (filters.search) {
      const haystack = [r.reference, r.user, r.date, r.machine && r.machine.code].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });

  let waste = dataset.waste.filter(
    (w) =>
      w.line === line &&
      (filters.machine == null || (w.machine && w.machine.numero === filters.machine)) &&
      (!filters.poste || w.poste === filters.poste)
  );
  // Les déchets sont saisis par poste, pas par fiche : un filtre Utilisateur /
  // Statut / Recherche ne peut donc s'appliquer qu'en ne gardant que les
  // postes des fiches retenues (chaque poste compté une seule fois).
  if (filters.user || filters.status || filters.search) {
    const kept = new Set(rows.map(shiftKey).filter(Boolean));
    waste = waste.filter((w) => kept.has(shiftKey(w)));
  }

  return { lineRows, rows, waste };
}

async function listFiches(actor, query = {}) {
  const line = assertLine(query.line);
  const period = resolvePeriod(query);
  const filters = parseListFilters(query);
  const dataset = await loadDataset(actor, period);
  const { lineRows, rows, waste } = filterLine(dataset, line, filters);

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const summary = summarize(rows, waste);

  return {
    line,
    period: { key: period.key, from: period.from, to: period.to, label: period.label },
    kpi: summary,
    // Valeurs proposées par les filtres : celles réellement présentes.
    filterOptions: {
      users: [...new Set(lineRows.map((r) => r.user).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      machines: dataset.index.list
        .filter((m) => m.typeMachine === LINES[line].type)
        .map((m) => ({ numero: m.numero, code: m.code, statut: m.statut })),
    },
    count: rows.length,
    page,
    pageSize,
    data: rows.slice((page - 1) * pageSize, page * pageSize).map(publicRow),
  };
}

// ── Fiche (Identification / Données / Résumé / Traçabilité) ────────────────

function field(label, value, unit) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return { label, value: unit ? `${value} ${unit}` : String(value) };
}

function hoursBetween(start, end) {
  const toMinutes = (t) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a == null || b == null || a === b) return null;
  // Un poste de nuit finit le lendemain.
  return ((b - a + 1440) % 1440) / 60;
}

// Fiches PROBAR : heures et mesures sont sérialisées dans `description`
// (format compact hd/hf/qm — voir probar_detail_data.dart côté Flutter).
function parseProbarDescription(description) {
  const raw = String(description || "").trim();
  if (!raw.startsWith("{")) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function promeshDetail(r) {
  return {
    heureDebut: r.heureDebut,
    heureFin: r.heureFin,
    donnees: [
      { label: "Quantité", value: String(num(r.productionM2)) },
      { label: "Unité", value: UNIT },
      field("Diamètre maille 1", r.diametreMaille1),
      field("Diamètre maille 2", r.diametreMaille2),
      field("Diamètre maille 3", r.diametreMaille3),
      field("Heure début", r.heureDebut && String(r.heureDebut).slice(0, 5)),
      field("Heure fin", r.heureFin && String(r.heureFin).slice(0, 5)),
      field("Démarrage production 1", r.demarrageProductionQuantite1, UNIT),
      field("Démarrage production 2", r.demarrageProductionQuantite2, UNIT),
      field("Conformité", r.conformite === "conforme" ? "Conforme" : r.conformite === "non_conforme" ? "Non conforme" : null),
      field("Total chute barres", r.totalChuteBarres),
      field("Total déchet graine", r.totalDechetGraine),
    ].filter(Boolean),
    validatedAt: r.validatedAt,
  };
}

function probarDetail(r) {
  const d = parseProbarDescription(r.description);
  const qm = d.qm && typeof d.qm === "object" ? d.qm : {};
  const mesures = [];
  for (const n of [1, 2, 3, 4]) {
    mesures.push(field(`Diamètre L${n}`, qm[`l${n}d`], "mm"));
    mesures.push(field(`Longueur L${n}`, qm[`l${n}l`], "mm"));
    mesures.push(field(`Grammage L${n}`, qm[`l${n}m`], "g/m²"));
  }
  return {
    heureDebut: d.hd,
    heureFin: d.hf,
    donnees: [
      { label: "Quantité", value: String(num(r.quantiteProduite)) },
      { label: "Unité", value: UNIT },
      field("Heure début", d.hd),
      field("Heure fin", d.hf),
      field("Contrôle qualité", r.statutQualite === "ok" ? "Conforme" : r.statutQualite === "nok" ? "Non conforme" : null),
      ...mesures,
    ].filter(Boolean),
    validatedAt: null,
  };
}

async function getFiche(actor, lineParam, id) {
  const line = assertLine(lineParam);
  // Un id non-UUID ferait échouer la requête PostgreSQL (500).
  const record = UUID_RE.test(String(id))
    ? await (line === "promesh" ? repo.findPromeshById(id) : repo.findProbarById(id))
    : null;
  if (!record) throw { status: 404, message: "Fiche introuvable" };
  const raw = record.toJSON ? record.toJSON() : record;
  if (isOwnerScoped(actor.role) && raw.createdBy !== actor.id) {
    throw { status: 403, message: "Vous ne pouvez accéder qu'à vos propres fiches" };
  }

  const index = indexMachines(await repo.findMachines());
  const row = line === "promesh" ? normalizePromesh(raw, index) : normalizeProbar(raw, index);
  const detail = line === "promesh" ? promeshDetail(raw) : probarDetail(raw);

  let shift = null;
  if (row.date && shiftKey(row)) {
    const fiches = await repo.findRecuperables({ from: row.date, to: row.date, createdBy: scopeOf(actor) });
    const matching = fiches
      .map((f) => normalizeWaste(f, index))
      .filter((w) => w && shiftKey(w) === shiftKey(row));
    if (matching.length) {
      shift = {
        wasteKg: round2(matching.reduce((s, w) => s + w.wasteKg, 0)),
        recuperableKg: round2(matching.reduce((s, w) => s + w.recuperableKg, 0)),
      };
    }
  }

  const hours = hoursBetween(detail.heureDebut, detail.heureFin);
  const creator = raw.creator ? raw.creator.email : null;
  // Seuls les événements réellement horodatés en base sont listés (aucun
  // journal d'audit champ par champ n'existe pour les fiches de production).
  const tracabilite = [{ event: "CREATION", label: "Création de la fiche", at: raw.createdAt, by: creator }];
  if (raw.updatedAt && new Date(raw.updatedAt) - new Date(raw.createdAt) > 1000) {
    tracabilite.push({ event: "MODIFICATION", label: "Dernière modification", at: raw.updatedAt, by: null });
  }
  if (detail.validatedAt) {
    tracabilite.push({ event: "VALIDATION", label: "Validation définitive", at: detail.validatedAt, by: null });
  }
  tracabilite.sort((a, b) => new Date(a.at) - new Date(b.at));

  return {
    identification: {
      id: row.id,
      line,
      lineLabel: row.lineLabel,
      reference: row.reference,
      date: row.date,
      machine: row.machine,
      poste: row.poste,
      user: row.user,
      status: row.status,
    },
    donnees: detail.donnees,
    resume: {
      quantity: row.quantity,
      unit: UNIT,
      wasteKg: shift ? shift.wasteKg : null,
      recuperableKg: shift ? shift.recuperableKg : null,
      wasteUnit: WASTE_UNIT,
      wasteRate: shift ? wasteRate(shift.wasteKg, row.quantity) : null,
      // m² produits par heure de poste — null si les heures sont absentes.
      rendement: hours ? round2(row.quantity / hours) : null,
      rendementUnit: `${UNIT}/h`,
      dureeHeures: hours ? round2(hours) : null,
    },
    tracabilite,
  };
}

// ── Données d'export (Excel / PDF) ─────────────────────────────────────────

async function getExportData(actor, query = {}) {
  const period = resolvePeriod(query);
  const line = query.line && query.line !== "all" ? assertLine(query.line) : null;
  const dataset = await loadDataset(actor, period);
  const todayRows = await loadTodayRows(actor, period, dataset);

  let rows = dataset.rows;
  let waste = dataset.waste;
  if (line) {
    const filtered = filterLine(dataset, line, parseListFilters(query));
    rows = filtered.rows;
    waste = filtered.waste;
  }

  const scopedDataset = { index: dataset.index, rows, waste };
  return {
    line,
    dashboard: buildDashboard(scopedDataset, period, todayRows),
    rows: rows.map(publicRow),
    waste,
  };
}

module.exports = {
  LINES,
  LINE_KEYS,
  STATUSES,
  getDashboard,
  listFiches,
  getFiche,
  getExportData,
  _clearCache: () => dashboardCache.clear(),
};
