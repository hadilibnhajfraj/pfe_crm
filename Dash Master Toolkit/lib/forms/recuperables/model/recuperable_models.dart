// lib/forms/recuperables/model/recuperable_models.dart
//
// Modèles du module "Récupérables Traités" — une fiche est identifiée de
// façon unique par (module, machine, ligne, poste, date) et contient une
// grille FIXE de 12 diamètres (jamais de lignes ajoutées/retirées
// dynamiquement) : seuls Déchet (kg) et Déchet + Produit fini (kg) sont
// saisis par diamètre. Miroir des DTO backend `recuperable.dto.js`.

const List<String> kRecuperableModules = ['PROBAR', 'PROMESH'];
const List<String> kRecuperableMachines = ['1', '2', '3', '4'];
const List<String> kRecuperableLignes = ['L1', 'L2', 'L3', 'L4'];
const List<(String, String)> kRecuperablePostes = [
  ('matin', 'Matin'),
  ('soir', 'Soir'),
];

// 12 diamètres fixes, non modifiables par l'utilisateur.
const List<String> kRecuperableDiametres = [
  '6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '26', '28',
];

class RecuperableItemModel {
  final String diametre;
  final double dechetKg;
  final double dechetProduitFiniKg;

  const RecuperableItemModel({
    required this.diametre,
    this.dechetKg = 0,
    this.dechetProduitFiniKg = 0,
  });

  static double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString().replaceAll(',', '.')) ?? 0;
  }

  factory RecuperableItemModel.fromJson(Map<String, dynamic> json) {
    return RecuperableItemModel(
      diametre: (json['diametre'] ?? '').toString(),
      dechetKg: _toDouble(json['dechetKg']),
      dechetProduitFiniKg: _toDouble(json['dechetProduitFiniKg']),
    );
  }

  Map<String, dynamic> toJson() => {
        'diametre': diametre,
        'dechetKg': dechetKg,
        'dechetProduitFiniKg': dechetProduitFiniKg,
      };
}

class RecuperableFicheModel {
  final String? id;
  final String module; // 'PROBAR' | 'PROMESH'
  final String machine;
  final String ligne; // 'L1'..'L4'
  final String poste; // 'matin' | 'soir'
  final String date;
  final String? operateur;
  final String statut; // 'en_cours' | 'cloturee'
  final String? dateCloture;
  final String? createdBy;
  final String? creatorEmail;
  final List<RecuperableItemModel> recuperables;
  final String? createdAt;
  final String? updatedAt;
  final bool reused;

  const RecuperableFicheModel({
    this.id,
    required this.module,
    required this.machine,
    required this.ligne,
    required this.poste,
    required this.date,
    this.operateur,
    this.statut = 'en_cours',
    this.dateCloture,
    this.createdBy,
    this.creatorEmail,
    this.recuperables = const [],
    this.createdAt,
    this.updatedAt,
    this.reused = false,
  });

  bool get isOpen => statut == 'en_cours';

  double get totalDechetKg => recuperables.fold(0.0, (s, i) => s + i.dechetKg);
  double get totalDechetProduitFiniKg => recuperables.fold(0.0, (s, i) => s + i.dechetProduitFiniKg);

  /// Nombre de diamètres réellement renseignés (valeur non nulle).
  int get nombreLignes => recuperables.where((i) => i.dechetKg > 0 || i.dechetProduitFiniKg > 0).length;

  String get posteLabel => kRecuperablePostes.firstWhere((p) => p.$1 == poste, orElse: () => (poste, poste)).$2;

  /// Valeur saisie pour un diamètre donné, ou zéro par défaut si absente.
  RecuperableItemModel itemFor(String diametre) {
    return recuperables.firstWhere(
      (i) => i.diametre == diametre,
      orElse: () => RecuperableItemModel(diametre: diametre),
    );
  }

  factory RecuperableFicheModel.fromJson(Map<String, dynamic> json) {
    final creator = json['creator'];
    final itemsRaw = (json['recuperables'] as List?) ?? const [];
    return RecuperableFicheModel(
      id: json['id']?.toString(),
      module: (json['module'] ?? '').toString(),
      machine: (json['machine'] ?? '').toString(),
      ligne: (json['ligne'] ?? '').toString(),
      poste: (json['poste'] ?? '').toString(),
      date: (json['date'] ?? '').toString(),
      operateur: json['operateur']?.toString(),
      statut: (json['statut'] ?? 'en_cours').toString(),
      dateCloture: json['dateCloture']?.toString(),
      createdBy: json['createdBy']?.toString(),
      creatorEmail: creator is Map ? creator['email']?.toString() : null,
      recuperables: itemsRaw
          .whereType<Map>()
          .map((e) => RecuperableItemModel.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      createdAt: json['createdAt']?.toString(),
      updatedAt: json['updatedAt']?.toString(),
      reused: json['reused'] == true,
    );
  }

  /// Payload "Enregistrer" — en-tête + tableau complet (jamais de champs
  /// séparés par diamètre).
  Map<String, dynamic> toSaveJson() => {
        'module': module,
        'machine': machine,
        'ligne': ligne,
        'poste': poste,
        'date': date,
        if ((operateur ?? '').trim().isNotEmpty) 'operateur': operateur,
        'recuperables': recuperables.map((i) => i.toJson()).toList(),
      };
}
