// lib/forms/por_promesh/model/poste_dashboard_stats.dart
//
// KPI agrégés du Dashboard du poste — calculés côté backend
// (GET /por-promesh/dashboard), jamais côté Flutter.

class PosteDashboardStats {
  final int fichesCount;
  final int fichesValidees;
  final int fichesBrouillon;
  final double productionTotale;
  final int nonConformites;
  final int operateursPresents;

  const PosteDashboardStats({
    this.fichesCount = 0,
    this.fichesValidees = 0,
    this.fichesBrouillon = 0,
    this.productionTotale = 0,
    this.nonConformites = 0,
    this.operateursPresents = 0,
  });

  factory PosteDashboardStats.fromJson(Map<String, dynamic> json) {
    double toDouble(dynamic v) => v == null ? 0 : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);
    int toInt(dynamic v) => v == null ? 0 : (v is num ? v.toInt() : int.tryParse(v.toString()) ?? 0);

    return PosteDashboardStats(
      fichesCount: toInt(json['fichesCount']),
      fichesValidees: toInt(json['fichesValidees']),
      fichesBrouillon: toInt(json['fichesBrouillon']),
      productionTotale: toDouble(json['productionTotale']),
      nonConformites: toInt(json['nonConformites']),
      operateursPresents: toInt(json['operateursPresents']),
    );
  }
}
