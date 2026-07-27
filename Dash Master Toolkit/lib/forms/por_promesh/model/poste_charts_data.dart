// lib/forms/por_promesh/model/poste_charts_data.dart
//
// Séries graphiques du Dashboard du poste — calculées côté backend
// (GET /por-promesh/stats), jamais côté Flutter.

class HourlyProduction {
  final int hour;
  final double production;
  const HourlyProduction({required this.hour, required this.production});
}

class DailyProduction {
  final String date; // yyyy-MM-dd
  final double production;
  const DailyProduction({required this.date, required this.production});
}

class PosteChartsData {
  final List<HourlyProduction> parHeure;
  final int conforme;
  final int nonConforme;
  final List<DailyProduction> parJour;

  const PosteChartsData({
    this.parHeure = const [],
    this.conforme = 0,
    this.nonConforme = 0,
    this.parJour = const [],
  });

  factory PosteChartsData.fromJson(Map<String, dynamic> json) {
    double toDouble(dynamic v) => v == null ? 0 : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0);
    int toInt(dynamic v) => v == null ? 0 : (v is num ? v.toInt() : int.tryParse(v.toString()) ?? 0);

    final parHeure = (json['parHeure'] as List? ?? [])
        .whereType<Map>()
        .map((e) => HourlyProduction(hour: toInt(e['hour']), production: toDouble(e['production'])))
        .toList();
    final parJour = (json['parJour'] as List? ?? [])
        .whereType<Map>()
        .map((e) => DailyProduction(date: (e['date'] ?? '').toString(), production: toDouble(e['production'])))
        .toList();
    final conformite = json['conformite'] as Map? ?? {};

    return PosteChartsData(
      parHeure: parHeure,
      conforme: toInt(conformite['conforme']),
      nonConforme: toInt(conformite['nonConforme']),
      parJour: parJour,
    );
  }
}
