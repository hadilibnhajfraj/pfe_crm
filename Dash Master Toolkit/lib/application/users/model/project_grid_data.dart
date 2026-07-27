import 'package:dash_master_toolkit/forms/constants/product_family.dart';

class ProjectGridData {
  final String id;
  final String nomProjet;
  final String entreprise;
  final String statut;
  final String adresse;
  final String dateDemarrage;
  final String permission;
  final String? surfaceProspectee;
  final String? pourcentageReussite;

  final String ingenieurResponsable;
  final String architecte;

  final int commentCount;
  final int taskCount; // ✅

  final String validationStatut;
  final String ownerName;
  final String? ownerId;
  final bool isArchived;
  final bool hasDevis;
  final bool hasBonCommande;
  final String projectModele;
  final String? productFamily; // 'PROBAR' | 'PROMESH' | null
  final int? diameterMm;

  ProjectGridData({
    required this.id,
    required this.nomProjet,
    required this.entreprise,
    required this.statut,
    required this.adresse,
    required this.dateDemarrage,
    required this.permission,
    required this.commentCount,
    required this.surfaceProspectee,
    required this.pourcentageReussite,
    required this.taskCount,
    required this.ingenieurResponsable,
    required this.isArchived,
    required this.architecte,
    required this.validationStatut,
    required this.ownerName,
    this.ownerId,
    required this.hasDevis,
    required this.hasBonCommande,
    this.projectModele = 'project',
    this.productFamily,
    this.diameterMm,
  });

  bool get canEdit => permission == "owner" || permission == "editor";
  bool get canDelete => permission == "owner";

  /// Libellé calculé — jamais stocké tel quel ("Probar Ø12 mm").
  String get diameterLabel => diameterMm == null ? '—' : 'Ø$diameterMm mm';
  String get productFamilyLabelText => productFamilyLabel(productFamily);

static String _resolveOwnerName(Map<String, dynamic> json) {
  final userNom = json["user_nom"]?.toString().trim();
  final userNomCustom = json["user_nom_custom"]?.toString().trim();
  final email = json["ownerName"]?.toString().trim();

  // 🔥 CAS 1 : user_nom + custom
  if (userNom != null && userNom.isNotEmpty) {
    if (userNomCustom != null && userNomCustom.isNotEmpty) {
      return "$userNom ($userNomCustom)";
    }
    return userNom;
  }

  // 🔥 CAS 2 : seulement custom
  if (userNomCustom != null && userNomCustom.isNotEmpty) {
    return userNomCustom;
  }

  // 🔥 CAS 3 : fallback email
  if (email != null && email.isNotEmpty) {
    return email;
  }

  return "Unknown";
}
static String _safeUser(dynamic v) {
  if (v == null) return "Unknown";

  final s = v.toString().trim();

  if (s.isEmpty || s == "null") return "Unknown";

  return s;
}
  static int _toInt(dynamic v) {
    if (v == null) return 0;
    if (v is int) return v;
    return int.tryParse(v.toString()) ?? 0;
  }

  static int? _toIntOrNull(dynamic v) {
    if (v == null) return null;
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString());
  }

  ProjectGridData copyWith({
    String? statut,
    String? projectModele,
    String? productFamily,
    int? diameterMm,
    bool clearDiameterMm = false,
  }) {
    return ProjectGridData(
      id:                   id,
      nomProjet:            nomProjet,
      entreprise:           entreprise,
      statut:               statut ?? this.statut,
      adresse:              adresse,
      dateDemarrage:        dateDemarrage,
      permission:           permission,
      commentCount:         commentCount,
      taskCount:            taskCount,
      surfaceProspectee:    surfaceProspectee,
      pourcentageReussite:  pourcentageReussite,
      ingenieurResponsable: ingenieurResponsable,
      architecte:           architecte,
      validationStatut:     validationStatut,
      ownerName:            ownerName,
      ownerId:              ownerId,
      hasDevis:             hasDevis,
      hasBonCommande:       hasBonCommande,
      isArchived:           isArchived,
      projectModele:        projectModele ?? this.projectModele,
      productFamily:        productFamily ?? this.productFamily,
      diameterMm:           clearDiameterMm ? null : (diameterMm ?? this.diameterMm),
    );
  }

  factory ProjectGridData.fromJson(Map<String, dynamic> json) {
    final devisCount = _toInt(json["devisCount"]);
    final bcCount = _toInt(json["bonCommandeCount"]);


    return ProjectGridData(
      id: (json["id"] ?? "").toString(),
      nomProjet: (json["nomProjet"] ?? "").toString(),
      entreprise: (json["entreprise"] ?? "").toString(),
      isArchived: json["isArchived"] ?? false,
      statut: (json["statut"] ?? "").toString(),
      adresse: (json["adresse"] ?? "").toString(),
      dateDemarrage: (json["dateDemarrage"] ?? "").toString(),
      permission: (json["permission"] ?? "viewer").toString(),
      commentCount: _toInt(json["commentCount"]),
      taskCount: _toInt(json["taskCount"]), // ✅ IMPORTANT
       surfaceProspectee: json["surfaceProspectee"]?.toString(),
    pourcentageReussite: json["pourcentageReussite"]?.toString(),
      ingenieurResponsable: (json["ingenieurResponsable"] ?? "").toString(),
      architecte: (json["architecte"] ?? "").toString(),
      validationStatut: (json["validationStatut"] ?? "").toString(),
      ownerName:     _resolveOwnerName(json),
      ownerId:       json['ownerId']?.toString(),
      projectModele: (json['projectModele'] ?? 'project').toString(),
      productFamily: json['productFamily']?.toString(),
      diameterMm:    _toIntOrNull(json['diameterMm']),
      hasDevis:      devisCount > 0,
      hasBonCommande: bcCount > 0,
    );
  }
}
