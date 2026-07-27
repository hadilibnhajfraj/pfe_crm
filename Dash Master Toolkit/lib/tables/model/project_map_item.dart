class ProjectMapItem {
  final String id;
  final String nomProjet;
  final double lat;
  final double lng;
  final String? validationStatut;
  final String? statut;
  final String? adresse;
  final String? localisationCommentaire;
  final DateTime? createdAt;

  ProjectMapItem({
    required this.id,
    required this.nomProjet,
    required this.lat,
    required this.lng,
    this.validationStatut,
    this.statut,
    this.adresse,
    this.localisationCommentaire,
    this.createdAt,
  });

  factory ProjectMapItem.fromJson(Map<String, dynamic> j) {
    double toDouble(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0;
    }

    return ProjectMapItem(
      id: (j["id"] ?? "").toString(),
      nomProjet: (j["nomProjet"] ?? "").toString(),
      lat: toDouble(j["latitude"]),
      lng: toDouble(j["longitude"]),
      validationStatut: j["validationStatut"]?.toString(),
      statut: j["statut"]?.toString(),
      adresse: j["adresse"]?.toString(),
      localisationCommentaire: j["localisationCommentaire"]?.toString(),
      createdAt: j["createdAt"] != null ? DateTime.tryParse(j["createdAt"].toString()) : null,
    );
  }
}
