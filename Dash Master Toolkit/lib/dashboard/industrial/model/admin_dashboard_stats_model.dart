// lib/dashboard/industrial/model/admin_dashboard_stats_model.dart
//
// Statistiques consolidées PROMESH/PROBAR/Maintenance/RH/Mélange/
// Récupérables — calculées côté backend (GET /admin-dashboard/stats),
// jamais côté Flutter. Réservé Super Admin / Admin.

int _toInt(dynamic v) => v == null ? 0 : (v is num ? v.toInt() : int.tryParse(v.toString()) ?? 0);
double _toDouble(dynamic v) => v == null ? 0 : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);
Map<String, int> _toCountMap(dynamic v) {
  if (v is! Map) return {};
  return v.map((k, value) => MapEntry(k.toString(), _toInt(value)));
}
List<Map<String, dynamic>> _toList(dynamic v) {
  if (v is! List) return [];
  return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}

class PromeshDashboardStats {
  final int fichesCount;
  final int today;
  final int week;
  final int month;
  final int machinesActives;
  final Map<String, int> repartitionParMachine;
  final Map<String, int> repartitionParPoste;
  final List<Map<String, dynamic>> dernieresFiches;

  const PromeshDashboardStats({
    this.fichesCount = 0,
    this.today = 0,
    this.week = 0,
    this.month = 0,
    this.machinesActives = 0,
    this.repartitionParMachine = const {},
    this.repartitionParPoste = const {},
    this.dernieresFiches = const [],
  });

  factory PromeshDashboardStats.fromJson(Map<String, dynamic> j) => PromeshDashboardStats(
        fichesCount: _toInt(j['fichesCount']),
        today: _toInt(j['today']),
        week: _toInt(j['week']),
        month: _toInt(j['month']),
        machinesActives: _toInt(j['machinesActives']),
        repartitionParMachine: _toCountMap(j['repartitionParMachine']),
        repartitionParPoste: _toCountMap(j['repartitionParPoste']),
        dernieresFiches: _toList(j['dernieresFiches']),
      );
}

class ProbarDashboardStats {
  final int fichesCount;
  final int today;
  final int week;
  final int month;
  final int machinesActives;
  final Map<String, int> repartitionParMachine;
  final Map<String, int> repartitionParPoste;
  final List<Map<String, dynamic>> dernieresFiches;

  const ProbarDashboardStats({
    this.fichesCount = 0,
    this.today = 0,
    this.week = 0,
    this.month = 0,
    this.machinesActives = 0,
    this.repartitionParMachine = const {},
    this.repartitionParPoste = const {},
    this.dernieresFiches = const [],
  });

  factory ProbarDashboardStats.fromJson(Map<String, dynamic> j) => ProbarDashboardStats(
        fichesCount: _toInt(j['fichesCount']),
        today: _toInt(j['today']),
        week: _toInt(j['week']),
        month: _toInt(j['month']),
        machinesActives: _toInt(j['machinesActives']),
        repartitionParMachine: _toCountMap(j['repartitionParMachine']),
        repartitionParPoste: _toCountMap(j['repartitionParPoste']),
        dernieresFiches: _toList(j['dernieresFiches']),
      );
}

class MaintenanceDashboardStats {
  final int demandesOuvertes;
  final int demandesTerminees;
  final int urgentes;
  final int enAttente;
  final List<Map<String, dynamic>> dernieresDemandes;

  const MaintenanceDashboardStats({
    this.demandesOuvertes = 0,
    this.demandesTerminees = 0,
    this.urgentes = 0,
    this.enAttente = 0,
    this.dernieresDemandes = const [],
  });

  factory MaintenanceDashboardStats.fromJson(Map<String, dynamic> j) => MaintenanceDashboardStats(
        demandesOuvertes: _toInt(j['demandesOuvertes']),
        demandesTerminees: _toInt(j['demandesTerminees']),
        urgentes: _toInt(j['urgentes']),
        enAttente: _toInt(j['enAttente']),
        dernieresDemandes: _toList(j['dernieresDemandes']),
      );
}

class RhDashboardStats {
  final int demandesConge;
  final int autorisationsSortie;
  final int acceptees;
  final int refusees;
  final int enAttente;
  final List<Map<String, dynamic>> dernieresDemandes;

  const RhDashboardStats({
    this.demandesConge = 0,
    this.autorisationsSortie = 0,
    this.acceptees = 0,
    this.refusees = 0,
    this.enAttente = 0,
    this.dernieresDemandes = const [],
  });

  factory RhDashboardStats.fromJson(Map<String, dynamic> j) => RhDashboardStats(
        demandesConge: _toInt(j['demandesConge']),
        autorisationsSortie: _toInt(j['autorisationsSortie']),
        acceptees: _toInt(j['acceptees']),
        refusees: _toInt(j['refusees']),
        enAttente: _toInt(j['enAttente']),
        dernieresDemandes: _toList(j['dernieresDemandes']),
      );
}

class MelangeDashboardStats {
  final int fichesCount;
  final double productionTotale;
  final List<Map<String, dynamic>> dernieresFiches;

  const MelangeDashboardStats({
    this.fichesCount = 0,
    this.productionTotale = 0,
    this.dernieresFiches = const [],
  });

  factory MelangeDashboardStats.fromJson(Map<String, dynamic> j) => MelangeDashboardStats(
        fichesCount: _toInt(j['fichesCount']),
        productionTotale: _toDouble(j['productionTotale']),
        dernieresFiches: _toList(j['dernieresFiches']),
      );
}

class RecuperablesDashboardStats {
  final int fichesCount;
  final double dechetsKg;
  final double produitFiniKg;
  final double totalRecupereKg;

  const RecuperablesDashboardStats({
    this.fichesCount = 0,
    this.dechetsKg = 0,
    this.produitFiniKg = 0,
    this.totalRecupereKg = 0,
  });

  factory RecuperablesDashboardStats.fromJson(Map<String, dynamic> j) => RecuperablesDashboardStats(
        fichesCount: _toInt(j['fichesCount']),
        dechetsKg: _toDouble(j['dechetsKg']),
        produitFiniKg: _toDouble(j['produitFiniKg']),
        totalRecupereKg: _toDouble(j['totalRecupereKg']),
      );
}

class AdminDashboardStats {
  final PromeshDashboardStats promesh;
  final ProbarDashboardStats probar;
  final MaintenanceDashboardStats maintenance;
  final RhDashboardStats rh;
  final MelangeDashboardStats melange;
  final RecuperablesDashboardStats recuperables;

  const AdminDashboardStats({
    this.promesh = const PromeshDashboardStats(),
    this.probar = const ProbarDashboardStats(),
    this.maintenance = const MaintenanceDashboardStats(),
    this.rh = const RhDashboardStats(),
    this.melange = const MelangeDashboardStats(),
    this.recuperables = const RecuperablesDashboardStats(),
  });

  factory AdminDashboardStats.fromJson(Map<String, dynamic> j) => AdminDashboardStats(
        promesh: PromeshDashboardStats.fromJson(Map<String, dynamic>.from(j['promesh'] as Map? ?? {})),
        probar: ProbarDashboardStats.fromJson(Map<String, dynamic>.from(j['probar'] as Map? ?? {})),
        maintenance: MaintenanceDashboardStats.fromJson(Map<String, dynamic>.from(j['maintenance'] as Map? ?? {})),
        rh: RhDashboardStats.fromJson(Map<String, dynamic>.from(j['rh'] as Map? ?? {})),
        melange: MelangeDashboardStats.fromJson(Map<String, dynamic>.from(j['melange'] as Map? ?? {})),
        recuperables:
            RecuperablesDashboardStats.fromJson(Map<String, dynamic>.from(j['recuperables'] as Map? ?? {})),
      );
}
