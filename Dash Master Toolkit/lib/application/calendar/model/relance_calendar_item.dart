class RelanceContactInfo {
  final String id;
  final String nom;
  final String prenom;
  final String? nomSociete;
  final String? telephone;
  final String? email;
  final String? localisation;
  final String? statut;
  final String? sujetDiscussion;

  RelanceContactInfo({
    required this.id,
    required this.nom,
    required this.prenom,
    this.nomSociete,
    this.telephone,
    this.email,
    this.localisation,
    this.statut,
    this.sujetDiscussion,
  });

  String get fullName => "$nom $prenom".trim();

  factory RelanceContactInfo.fromJson(Map<String, dynamic> json) {
    return RelanceContactInfo(
      id: (json["id"] ?? "").toString(),
      nom: (json["nom"] ?? "").toString(),
      prenom: (json["prenom"] ?? "").toString(),
      nomSociete: json["nomSociete"]?.toString(),
      telephone: json["telephone"]?.toString(),
      email: json["email"]?.toString(),
      localisation: json["localisation"]?.toString(),
      statut: json["statut"]?.toString(),
      sujetDiscussion: json["sujetDiscussion"]?.toString(),
    );
  }
}

class RelanceCalendarItem {
  final String id;
  final String commercialContactId;
  final String dateRelance;
  final String? heureRelance;
  final String? commentaire;
  final String statutRelance;
  final String? commercialId;
  final String? commercialName;
  final String? commercialEmail;
  final String? projectName;
  final RelanceContactInfo? contact;

  RelanceCalendarItem({
    required this.id,
    required this.commercialContactId,
    required this.dateRelance,
    this.heureRelance,
    this.commentaire,
    required this.statutRelance,
    this.commercialId,
    this.commercialName,
    this.commercialEmail,
    this.projectName,
    this.contact,
  });

  DateTime get startDateTime {
    final time = (heureRelance != null && heureRelance!.isNotEmpty) ? heureRelance! : "09:00";
    return DateTime.tryParse("${dateRelance}T$time") ?? DateTime.tryParse(dateRelance) ?? DateTime.now();
  }

  factory RelanceCalendarItem.fromJson(Map<String, dynamic> json) {
    return RelanceCalendarItem(
      id: (json["id"] ?? "").toString(),
      commercialContactId: (json["commercialContactId"] ?? "").toString(),
      dateRelance: (json["dateRelance"] ?? "").toString(),
      heureRelance: json["heureRelance"]?.toString(),
      commentaire: json["commentaire"]?.toString(),
      statutRelance: (json["statutRelance"] ?? "planifiee").toString(),
      commercialId: json["commercialId"]?.toString(),
      commercialName: json["commercialName"]?.toString(),
      commercialEmail: json["commercialEmail"]?.toString(),
      projectName: json["projectName"]?.toString(),
      contact: json["contact"] is Map
          ? RelanceContactInfo.fromJson(Map<String, dynamic>.from(json["contact"]))
          : null,
    );
  }
}
