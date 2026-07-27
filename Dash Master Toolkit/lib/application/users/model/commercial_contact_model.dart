class CommercialContactProduct {
  final String id;
  final String produit;
  final double qte;

  CommercialContactProduct({
    required this.id,
    required this.produit,
    required this.qte,
  });

  factory CommercialContactProduct.fromJson(Map<String, dynamic> json) {
    return CommercialContactProduct(
      id: json['id']?.toString() ?? '',
      produit: (json['produit']?.toString().trim().isNotEmpty ?? false)
          ? json['produit'].toString()
          : 'PROBAR',
      qte: double.tryParse(json['qte']?.toString() ?? '1') ?? 1,
    );
  }
}

// Une ligne d'historique de statut (voir GET /commercial-contacts/:id) —
// "field" vaut "statut" (résultat d'appel) ou "pipelineStage" (étape de
// l'entonnoir commercial) ; ancienStatut/nouveauStatut portent la valeur
// brute du champ concerné.
class CommercialContactStatusHistoryItem {
  final String id;
  final String field;
  final String type; // "CREATED" | "STATUS_CHANGED"
  final String? ancienStatut;
  final String nouveauStatut;
  final String? commentaire;
  final String? changedByName;
  final DateTime? createdAt;

  CommercialContactStatusHistoryItem({
    required this.id,
    required this.field,
    this.type = 'STATUS_CHANGED',
    this.ancienStatut,
    required this.nouveauStatut,
    this.commentaire,
    this.changedByName,
    this.createdAt,
  });

  bool get isPipelineStage => field == 'pipelineStage';
  bool get isCreated => type == 'CREATED';

  factory CommercialContactStatusHistoryItem.fromJson(Map<String, dynamic> json) {
    return CommercialContactStatusHistoryItem(
      id: json['id']?.toString() ?? '',
      field: json['field']?.toString() ?? 'statut',
      type: json['type']?.toString() ?? 'STATUS_CHANGED',
      ancienStatut: json['ancienStatut']?.toString(),
      nouveauStatut: json['nouveauStatut']?.toString() ?? '',
      commentaire: json['commentaire']?.toString(),
      changedByName: json['changedByName']?.toString(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
    );
  }
}

class CommercialContactRelance {
  final String id;
  final String? dateRelance;
  final String? heureRelance;
  final String? commentaire;
  final String? statutRelance;
  final String? commercialId;
  final String? commercialName;
  final String? commercialEmail;

  CommercialContactRelance({
    required this.id,
    this.dateRelance,
    this.heureRelance,
    this.commentaire,
    this.statutRelance,
    this.commercialId,
    this.commercialName,
    this.commercialEmail,
  });

  factory CommercialContactRelance.fromJson(Map<String, dynamic> json) {
    return CommercialContactRelance(
      id: json['id']?.toString() ?? '',
      dateRelance: json['dateRelance']?.toString(),
      heureRelance: json['heureRelance']?.toString(),
      commentaire: json['commentaire']?.toString(),
      statutRelance: json['statutRelance']?.toString(),
      commercialId: json['commercialId']?.toString(),
      commercialName: json['commercialName']?.toString(),
      commercialEmail: json['commercialEmail']?.toString(),
    );
  }
}

// Utilisateur sélectionnable comme "Commercial" (chargé dynamiquement
// depuis la table users) — alimente le dropdown "Commercial" du Follow-up
// (GET /users/commercials).
class CommercialUserOption {
  final String id;
  final String email;
  final String fullName;
  final String? role;

  CommercialUserOption({
    required this.id,
    required this.email,
    required this.fullName,
    this.role,
  });

  factory CommercialUserOption.fromJson(Map<String, dynamic> json) {
    final email = json['email']?.toString() ?? '';
    return CommercialUserOption(
      id: json['id']?.toString() ?? '',
      email: email,
      fullName: (json['fullName']?.toString().trim().isNotEmpty ?? false)
          ? json['fullName'].toString()
          : email,
      role: json['role']?.toString(),
    );
  }

  String get label => '$fullName ($email)';
}

// Résultat de l'automatisation Follow-up renvoyé par le backend (calendrier /
// notifications / email / WhatsApp) — reflète ce qui a réellement réussi,
// null si l'automatisation ne s'est pas déclenchée (utilisateur autre que
// info@probardistribution.com, ou date/heure non renseignées).
class FollowupAutomationResult {
  final bool calendarEventCreated;
  final bool notificationsSent;
  final bool emailsSent;
  final bool whatsappSent;
  final bool whatsappConfigured;

  FollowupAutomationResult({
    required this.calendarEventCreated,
    required this.notificationsSent,
    required this.emailsSent,
    required this.whatsappSent,
    this.whatsappConfigured = true,
  });

  static FollowupAutomationResult? fromJson(dynamic json) {
    if (json is! Map<String, dynamic>) return null;
    return FollowupAutomationResult(
      calendarEventCreated: json['calendarEventCreated'] == true,
      notificationsSent: json['notificationsSent'] == true,
      emailsSent: json['emailsSent'] == true,
      whatsappSent: json['whatsappSent'] == true,
      whatsappConfigured: json['whatsappConfigured'] != false,
    );
  }
}
class CommercialProject {
  final String id;
  final String? nomProjet;
  final String? localisation;
  final String? typeProjet;
  final String? description;

  CommercialProject({
    required this.id,
    this.nomProjet,
    this.localisation,
    this.typeProjet,
    this.description,
  });

  factory CommercialProject.fromJson(Map<String, dynamic> json) {
    return CommercialProject(
      id: json['id']?.toString() ?? '',
      nomProjet: json['nomProjet']?.toString(),
      localisation: json['localisation']?.toString(),
      typeProjet: json['typeProjet']?.toString(),
      description: json['description']?.toString(),
    );
  }
}
class CommercialContact {
  final String id;
  final String typeClient;
  final String statut;
  final String? nomSociete;
  final String nom;
  final String prenom;
  
  final String? localisation;
  final String telephone;
  final String? message;
  final String? createdBy;
  final int nbAppels;
  final String? sujetDiscussion;
  final String? email;
  final String? matriculeFiscale;
  // ✅ NEW FIELDS (IMPORTANT)
  final String pipelineStage;
  final DateTime? dateAppel;

  final List<CommercialContactProduct> produits;
  final List<CommercialProject> projects;
  final List<CommercialContactRelance> relances;
  final DateTime? createdAt;
  final String? userNom;
final String? userNomCustom;
  final FollowupAutomationResult? automation;
  CommercialContact({
    required this.id,
    required this.typeClient,
    required this.statut,
    this.nomSociete,
    required this.nom,
    required this.prenom,
    this.matriculeFiscale,
    this.localisation,
    required this.telephone,
    this.message,
    this.createdBy,
    required this.nbAppels,
    this.sujetDiscussion,
    this.email,

    // ✅ NEW
    required this.pipelineStage,
    this.dateAppel,
    required this.projects,
    required this.produits,
    required this.relances,
    this.createdAt,
    this.userNom,
        this.userNomCustom,
    this.automation,
  });

  factory CommercialContact.fromJson(Map<String, dynamic> json) {
    return CommercialContact(
      id: json['id']?.toString() ?? '',

      typeClient: json['typeClient']?.toString() ?? 'autre',
      statut: json['statut']?.toString() ?? 'user_injoignable',

      nomSociete: json['nomSociete']?.toString(),

      nom: (json['nom']?.toString() ?? '').trim(),
      prenom: (json['prenom']?.toString() ?? '').trim(),

      localisation: json['localisation']?.toString(),
      telephone: json['telephone']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      matriculeFiscale: json['matriculeFiscale']?.toString(),

      message: json['message']?.toString(),
      createdBy: json['createdBy']?.toString(),

      nbAppels: int.tryParse(json['nbAppels']?.toString() ?? '0') ?? 0,
      sujetDiscussion: json['sujetDiscussion']?.toString(),

      // ✅ NEW PARSING
      pipelineStage: json['pipelineStage']?.toString() ?? 'Prospect',

      dateAppel: json['dateAppel'] != null
          ? DateTime.tryParse(json['dateAppel'].toString())
          : null,

      produits: (json['produits'] as List<dynamic>? ?? [])
          .map((e) => CommercialContactProduct.fromJson(
                e as Map<String, dynamic>,
              ))
          .toList(),
      projects: (json['projects'] as List<dynamic>? ?? [])
    .map((e) => CommercialProject.fromJson(e as Map<String, dynamic>))
    .toList(),

      relances: (json['relances'] as List<dynamic>? ?? [])
          .map((e) => CommercialContactRelance.fromJson(
                e as Map<String, dynamic>,
              ))
          .toList(),

      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      userNom: json['user_nom']?.toString(),
      userNomCustom: json['userNomCustom']?.toString(),
      automation: FollowupAutomationResult.fromJson(json['automation']),
    );
  }

  String get fullName => '$nom $prenom';

  // ✅ BONUS UI (pro)
  String get displayPipeline {
    switch (pipelineStage) {
      case "Prospect":
        return "🔵 Prospect";
      case "Devis envoyé":
        return "🟣 Devis";
      case "Negociation":
        return "🟡 Négociation";
      case "Gagné":
        return "🟢 Gagné";
      case "Perdu":
        return "🔴 Perdu";
      default:
        return pipelineStage;
    }
  }
}