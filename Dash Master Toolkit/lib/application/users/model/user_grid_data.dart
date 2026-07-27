class ProjectGridData {
  final String id;
  final String nomProjet;
  final String entreprise;
  final String statut;
  final String dateDemarrage;
  final String adresse;

  final String ownerName;
  final bool canEdit;
  final bool canDelete;
  final bool hasDevis;
  final bool hasBonCommande;

  final int commentCount; // ✅ NEW

  ProjectGridData({
    required this.id,
    required this.nomProjet,
    required this.entreprise,
    required this.statut,
    required this.dateDemarrage,
    required this.adresse,
    required this.ownerName,
    required this.canEdit,
    required this.canDelete,
    required this.hasDevis,
    required this.hasBonCommande,
    required this.commentCount, // ✅
  });

  factory ProjectGridData.fromJson(Map<String, dynamic> json) {
    int _toInt(dynamic v) {
      if (v == null) return 0;
      if (v is int) return v;
      return int.tryParse(v.toString()) ?? 0;
    }

    return ProjectGridData(
      id: (json["id"] ?? "").toString(),
      nomProjet: (json["nomProjet"] ?? "").toString(),
      entreprise: (json["entreprise"] ?? "").toString(),
      statut: (json["statut"] ?? "").toString(),
      dateDemarrage: (json["dateDemarrage"] ?? "").toString(),
      adresse: (json["adresse"] ?? "").toString(),

      ownerName: (json["ownerName"] ?? "").toString(),
      canEdit: (json["permission"] ?? "") == "owner" || (json["permission"] ?? "") == "editor",
      canDelete: (json["permission"] ?? "") == "owner", // adapte si admin
      hasDevis: _toInt(json["devisCount"]) > 0,
      hasBonCommande: _toInt(json["bonCommandeCount"]) > 0,

      commentCount: _toInt(json["commentCount"]), // ✅ ICI
    );
  }
}