// lib/forms/industrial/model/industrial_record_model.dart
//
// Modèle générique partagé par PROBAR / MÉLANGE / MAINTENANCE — mirrors
// `/industrial-records` côté backend. Mêmes conventions que PorPromeshModel
// (fromJson/toJson tolérants, _toDouble helper).

class IndustrialRecordModel {
  final String? id;
  final String module; // 'probar' | 'melange' | 'maintenance'

  final String? machine;
  final String? poste; // 'matin' | 'nuit'
  final String? dateFiche; // yyyy-MM-dd
  final String? operateur;

  final double? quantiteProduite;
  final String? statutQualite; // 'ok' | 'nok'

  final String? typePanne;
  final String? urgence; // 'faible' | 'moyenne' | 'critique'
  final String? description;
  final String? observations;

  // Champ dédié au module MÉLANGE : stocke le JSON complet du formulaire
  // (ravitaillement, consommation, rapport journalier, chute fibre…).
  // null pour PROBAR et MAINTENANCE, et null aussi dans les vues LISTE
  // (voir melangeSummary) — présent uniquement au détail/à l'édition d'une
  // fiche (fetchById).
  final Map<String, dynamic>? melangeData;

  // Résumé léger précalculé côté serveur, présent uniquement dans les
  // réponses de LISTE (fetchAll) quand melangeData est allégé côté backend.
  // Voir MelangeSummary.fromSummaryMap.
  final Map<String, dynamic>? melangeSummary;

  final String statut;

  final String? createdBy;
  final Map<String, String>? creator;
  final String? createdAt;
  final String? updatedAt;

  const IndustrialRecordModel({
    this.id,
    required this.module,
    this.machine,
    this.poste,
    this.dateFiche,
    this.operateur,
    this.quantiteProduite,
    this.statutQualite,
    this.typePanne,
    this.urgence,
    this.description,
    this.observations,
    this.melangeData,
    this.melangeSummary,
    this.statut = 'enregistree',
    this.createdBy,
    this.creator,
    this.createdAt,
    this.updatedAt,
  });

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v.replaceAll(',', '.'));
    return null;
  }

  static Map<String, String>? _toNullableMapOfString(dynamic v) {
    if (v is! Map) return null;
    return v.map((k, val) => MapEntry(k.toString(), (val ?? '').toString()));
  }

  static Map<String, dynamic>? _toNullableJsonMap(dynamic v) {
    if (v is! Map) return null;
    return Map<String, dynamic>.from(v);
  }

  factory IndustrialRecordModel.fromJson(Map<String, dynamic> json) {
    return IndustrialRecordModel(
      id: json['id']?.toString(),
      module: (json['module'] ?? '').toString(),
      machine: json['machine']?.toString(),
      poste: json['poste']?.toString(),
      dateFiche: json['dateFiche']?.toString(),
      operateur: json['operateur']?.toString(),
      quantiteProduite: _toDouble(json['quantiteProduite']),
      statutQualite: json['statutQualite']?.toString(),
      typePanne: json['typePanne']?.toString(),
      urgence: json['urgence']?.toString(),
      description: json['description']?.toString(),
      observations: json['observations']?.toString(),
      melangeData: _toNullableJsonMap(json['melangeData']),
      melangeSummary: _toNullableJsonMap(json['melangeSummary']),
      statut: (json['statut'] ?? 'enregistree').toString(),
      createdBy: json['createdBy']?.toString(),
      creator: _toNullableMapOfString(json['creator']),
      createdAt: json['createdAt']?.toString(),
      updatedAt: json['updatedAt']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        if (id != null) 'id': id,
        'module': module,
        'machine': machine,
        'poste': poste,
        'dateFiche': dateFiche,
        'operateur': operateur,
        'quantiteProduite': quantiteProduite,
        'statutQualite': statutQualite,
        'typePanne': typePanne,
        'urgence': urgence,
        'description': description,
        'observations': observations,
        if (melangeData != null) 'melangeData': melangeData,
        'statut': statut,
      };
}
