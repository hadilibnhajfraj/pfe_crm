// lib/forms/production/model/production_models.dart
//
// Modèles du module Production (vue consolidée PROMESH + PROBAR) — miroir de
// `production.service.js` côté backend (GET /production/dashboard, /fiches,
// /fiches/:line/:id). Parsing tolérant, mêmes conventions que PorPromeshModel.

double _d(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString().replaceAll(',', '.')) ?? 0;
}

double? _dn(dynamic v) => v == null ? null : _d(v);

int _i(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? 0;
}

String? _s(dynamic v) {
  final s = v?.toString();
  return (s == null || s.isEmpty) ? null : s;
}

Map<String, dynamic> _m(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

List<Map<String, dynamic>> _l(dynamic v) =>
    v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : <Map<String, dynamic>>[];

/// Filtre « Période » partagé par le dashboard, les listes et l'export.
class ProductionPeriod {
  final String key; // today | week | month | year | custom
  final DateTime? from;
  final DateTime? to;

  const ProductionPeriod(this.key, {this.from, this.to});

  static const today = ProductionPeriod('today');
  static const week = ProductionPeriod('week');
  static const month = ProductionPeriod('month');
  static const year = ProductionPeriod('year');

  static const presets = [
    (ProductionPeriod.today, "Aujourd'hui"),
    (ProductionPeriod.week, 'Cette semaine'),
    (ProductionPeriod.month, 'Ce mois'),
    (ProductionPeriod.year, 'Cette année'),
  ];

  bool get isCustom => key == 'custom';

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Map<String, String> toQuery() => {
        'period': key,
        if (isCustom && from != null) 'from': _ymd(from!),
        if (isCustom && to != null) 'to': _ymd(to!),
      };

  /// Relit une période depuis les paramètres d'URL (?period=…&from=…&to=…).
  static ProductionPeriod fromQuery(Map<String, String> q, {ProductionPeriod fallback = ProductionPeriod.month}) {
    final key = q['period'];
    if (key == 'custom') {
      final from = DateTime.tryParse(q['from'] ?? '');
      final to = DateTime.tryParse(q['to'] ?? '');
      if (from != null && to != null) return ProductionPeriod('custom', from: from, to: to);
      return fallback;
    }
    for (final p in presets) {
      if (p.$1.key == key) return p.$1;
    }
    return fallback;
  }
}

class ProductionMachineRef {
  final String? id;
  final String code;
  final String nom;
  final int numero;

  const ProductionMachineRef({this.id, required this.code, required this.nom, required this.numero});

  static ProductionMachineRef? fromJson(dynamic v) {
    if (v is! Map) return null;
    return ProductionMachineRef(
      id: _s(v['id']),
      code: (v['code'] ?? '').toString(),
      nom: (v['nom'] ?? '').toString(),
      numero: _i(v['numero']),
    );
  }
}

/// Une fiche de production, PROMESH ou PROBAR, sous une forme commune.
class ProductionRow {
  final String id;
  final String line; // promesh | probar
  final String lineLabel;
  final String? reference;
  final String? date; // yyyy-MM-dd
  final ProductionMachineRef? machine;
  final String? poste; // matin | nuit
  final String? user;
  final double quantity;
  final String unit;
  final double? wasteKg; // déchets du poste (fiche Récupérables), null si aucune
  final String status; // BROUILLON | VALIDEE | ARCHIVEE

  const ProductionRow({
    required this.id,
    required this.line,
    required this.lineLabel,
    this.reference,
    this.date,
    this.machine,
    this.poste,
    this.user,
    this.quantity = 0,
    this.unit = 'm²',
    this.wasteKg,
    this.status = 'BROUILLON',
  });

  bool get isLocked => status != 'BROUILLON';

  factory ProductionRow.fromJson(Map<String, dynamic> j) => ProductionRow(
        id: (j['id'] ?? '').toString(),
        line: (j['line'] ?? '').toString(),
        lineLabel: (j['lineLabel'] ?? '').toString(),
        reference: _s(j['reference']),
        date: _s(j['date']),
        machine: ProductionMachineRef.fromJson(j['machine']),
        poste: _s(j['poste']),
        user: _s(j['user']),
        quantity: _d(j['quantity']),
        unit: (j['unit'] ?? 'm²').toString(),
        wasteKg: _dn(j['wasteKg']),
        status: (j['status'] ?? 'BROUILLON').toString(),
      );
}

class ProductionMachineStat {
  final String code;
  final String nom;
  final int numero;
  final String line;
  final int fiches;
  final double quantity;
  final double wasteKg;
  final double? wasteRate;
  final String? lastProduction;
  final String state; // EN_PRODUCTION | ACTIVE | INACTIVE

  const ProductionMachineStat({
    required this.code,
    required this.nom,
    required this.numero,
    required this.line,
    required this.fiches,
    required this.quantity,
    required this.wasteKg,
    this.wasteRate,
    this.lastProduction,
    required this.state,
  });

  factory ProductionMachineStat.fromJson(Map<String, dynamic> j) => ProductionMachineStat(
        code: (j['code'] ?? '').toString(),
        nom: (j['nom'] ?? '').toString(),
        numero: _i(j['numero']),
        line: (j['line'] ?? '').toString(),
        fiches: _i(j['fiches']),
        quantity: _d(j['quantity']),
        wasteKg: _d(j['wasteKg']),
        wasteRate: _dn(j['wasteRate']),
        lastProduction: _s(j['lastProduction']),
        state: (j['state'] ?? 'ACTIVE').toString(),
      );
}

/// Agrégats d'une ligne (ou d'une liste filtrée).
class ProductionSummary {
  final int fiches;
  final double quantity;
  final String unit;
  final double wasteKg;
  final double recuperableKg;
  final double? wasteRate; // kg de déchets pour 100 m² — null si rien produit
  final int brouillons;
  final int validees;
  final List<ProductionMachineStat> machines;

  const ProductionSummary({
    this.fiches = 0,
    this.quantity = 0,
    this.unit = 'm²',
    this.wasteKg = 0,
    this.recuperableKg = 0,
    this.wasteRate,
    this.brouillons = 0,
    this.validees = 0,
    this.machines = const [],
  });

  factory ProductionSummary.fromJson(Map<String, dynamic> j) => ProductionSummary(
        fiches: _i(j['fiches']),
        quantity: _d(j['quantity']),
        unit: (j['unit'] ?? 'm²').toString(),
        wasteKg: _d(j['wasteKg']),
        recuperableKg: _d(j['recuperableKg']),
        wasteRate: _dn(j['wasteRate']),
        brouillons: _i(j['brouillons']),
        validees: _i(j['validees']),
        machines: _l(j['machines']).map(ProductionMachineStat.fromJson).toList(),
      );
}

/// Un point des séries temporelles (jour `yyyy-MM-dd` ou mois `yyyy-MM`).
class ProductionSeriesPoint {
  final String date;
  final double promesh;
  final double probar;
  final double total;

  const ProductionSeriesPoint({required this.date, required this.promesh, required this.probar, required this.total});

  factory ProductionSeriesPoint.fromJson(Map<String, dynamic> j) => ProductionSeriesPoint(
        date: (j['date'] ?? '').toString(),
        promesh: _d(j['promesh']),
        probar: _d(j['probar']),
        total: _d(j['total']),
      );
}

class ProductionDashboardData {
  final String periodLabel;
  final String periodFrom;
  final String periodTo;
  final String granularity; // day | month
  final ProductionSummary promesh;
  final ProductionSummary probar;
  final int machinesActive;
  final int machinesTotal;
  final int machinesWithProduction;
  final int productionsToday;
  final int totalFiches;
  final double totalQuantity;
  final double totalWasteKg;
  final double? totalWasteRate;
  final List<ProductionSeriesPoint> productionSeries;
  final List<ProductionSeriesPoint> wasteSeries;
  final List<ProductionRow> recent;

  const ProductionDashboardData({
    this.periodLabel = '',
    this.periodFrom = '',
    this.periodTo = '',
    this.granularity = 'day',
    this.promesh = const ProductionSummary(),
    this.probar = const ProductionSummary(),
    this.machinesActive = 0,
    this.machinesTotal = 0,
    this.machinesWithProduction = 0,
    this.productionsToday = 0,
    this.totalFiches = 0,
    this.totalQuantity = 0,
    this.totalWasteKg = 0,
    this.totalWasteRate,
    this.productionSeries = const [],
    this.wasteSeries = const [],
    this.recent = const [],
  });

  List<ProductionMachineStat> get allMachines => [...promesh.machines, ...probar.machines];

  factory ProductionDashboardData.fromJson(Map<String, dynamic> j) {
    final period = _m(j['period']);
    final machines = _m(j['machines']);
    final production = _m(j['production']);
    final waste = _m(j['waste']);
    final charts = _m(j['charts']);
    return ProductionDashboardData(
      periodLabel: (period['label'] ?? '').toString(),
      periodFrom: (period['from'] ?? '').toString(),
      periodTo: (period['to'] ?? '').toString(),
      granularity: (charts['granularity'] ?? 'day').toString(),
      promesh: ProductionSummary.fromJson(_m(j['promesh'])),
      probar: ProductionSummary.fromJson(_m(j['probar'])),
      machinesActive: _i(machines['active']),
      machinesTotal: _i(machines['total']),
      machinesWithProduction: _i(machines['withProduction']),
      productionsToday: _i(machines['productionsToday']),
      totalFiches: _i(production['fiches']),
      totalQuantity: _d(production['quantity']),
      totalWasteKg: _d(waste['kg']),
      totalWasteRate: _dn(waste['rate']),
      productionSeries: _l(charts['production']).map(ProductionSeriesPoint.fromJson).toList(),
      wasteSeries: _l(charts['waste']).map(ProductionSeriesPoint.fromJson).toList(),
      recent: _l(j['recent']).map(ProductionRow.fromJson).toList(),
    );
  }
}

class ProductionMachineOption {
  final int numero;
  final String code;
  final bool active;
  const ProductionMachineOption({required this.numero, required this.code, required this.active});
}

/// Page d'une liste PROMESH / PROBAR : KPI + valeurs de filtres + fiches.
class ProductionListResult {
  final ProductionSummary kpi;
  final List<String> users;
  final List<ProductionMachineOption> machines;
  final int count;
  final List<ProductionRow> rows;

  const ProductionListResult({
    this.kpi = const ProductionSummary(),
    this.users = const [],
    this.machines = const [],
    this.count = 0,
    this.rows = const [],
  });

  factory ProductionListResult.fromJson(Map<String, dynamic> j) {
    final options = _m(j['filterOptions']);
    return ProductionListResult(
      kpi: ProductionSummary.fromJson(_m(j['kpi'])),
      users: options['users'] is List ? (options['users'] as List).map((e) => e.toString()).toList() : const [],
      machines: _l(options['machines'])
          .map((m) => ProductionMachineOption(
                numero: _i(m['numero']),
                code: (m['code'] ?? '').toString(),
                active: m['statut'] == 'ACTIVE',
              ))
          .toList(),
      count: _i(j['count']),
      rows: _l(j['data']).map(ProductionRow.fromJson).toList(),
    );
  }
}

class ProductionTraceEvent {
  final String event; // CREATION | MODIFICATION | VALIDATION
  final String label;
  final String? at;
  final String? by;
  const ProductionTraceEvent({required this.event, required this.label, this.at, this.by});
}

/// Fiche structurée : Identification / Données / Résumé / Traçabilité.
class ProductionFicheDetail {
  final ProductionRow identification;
  final List<(String, String)> donnees;
  final double quantity;
  final String unit;
  final double? wasteKg;
  final double? recuperableKg;
  final double? wasteRate;
  final double? rendement; // m² par heure de poste
  final double? dureeHeures;
  final List<ProductionTraceEvent> tracabilite;

  const ProductionFicheDetail({
    required this.identification,
    this.donnees = const [],
    this.quantity = 0,
    this.unit = 'm²',
    this.wasteKg,
    this.recuperableKg,
    this.wasteRate,
    this.rendement,
    this.dureeHeures,
    this.tracabilite = const [],
  });

  factory ProductionFicheDetail.fromJson(Map<String, dynamic> j) {
    final resume = _m(j['resume']);
    return ProductionFicheDetail(
      identification: ProductionRow.fromJson(_m(j['identification'])),
      donnees: _l(j['donnees']).map((e) => ((e['label'] ?? '').toString(), (e['value'] ?? '').toString())).toList(),
      quantity: _d(resume['quantity']),
      unit: (resume['unit'] ?? 'm²').toString(),
      wasteKg: _dn(resume['wasteKg']),
      recuperableKg: _dn(resume['recuperableKg']),
      wasteRate: _dn(resume['wasteRate']),
      rendement: _dn(resume['rendement']),
      dureeHeures: _dn(resume['dureeHeures']),
      tracabilite: _l(j['tracabilite'])
          .map((e) => ProductionTraceEvent(
                event: (e['event'] ?? '').toString(),
                label: (e['label'] ?? '').toString(),
                at: _s(e['at']),
                by: _s(e['by']),
              ))
          .toList(),
    );
  }
}
