// ================= PRODUCTS =================
class CommercialProductInput {
  String produit;
  double qte;

  CommercialProductInput({
    this.produit = "PROBAR",
    this.qte = 1,
  });

  Map<String, dynamic> toJson() => {
        "produit": produit.trim().isEmpty ? "PROBAR" : produit.trim(),
        "qte": qte <= 0 ? 1 : qte,
      };
}

// ================= PROJECTS =================
class CommercialProjectInput {
  String nomProjet;
  String? localisation;
  String? typeProjet;
  String? description;
   String createdBy; // ✅ NEW

  CommercialProjectInput({
    this.nomProjet = "",
    this.localisation,
    this.typeProjet,
    this.description,
    this.createdBy = "", // ✅ NEW
  });

  Map<String, dynamic> toJson() => {
        "nomProjet": nomProjet.trim().isEmpty ? "Projet" : nomProjet.trim(),
        "localisation":
            (localisation ?? "").trim().isEmpty ? null : localisation!.trim(),
        "typeProjet":
            (typeProjet ?? "").trim().isEmpty ? null : typeProjet!.trim(),
        "description":
            (description ?? "").trim().isEmpty ? null : description!.trim(),
             "createdBy": createdBy, // ✅ IMPORTANT
      };
}

// ================= RELANCE =================
class CommercialRelanceInput {
  String? dateRelance;
  String? heureRelance;
  String commentaire;
  int nbAppels;
  String sujetDiscussion;

  CommercialRelanceInput({
    this.dateRelance,
    this.heureRelance,
    this.commentaire = "",
    this.nbAppels = 0,
    this.sujetDiscussion = "",
  });

  Map<String, dynamic> toJson() => {
        "dateRelance": dateRelance,
        "heureRelance": heureRelance,
        "commentaire": commentaire.trim().isEmpty ? null : commentaire.trim(),
        "nbAppels": nbAppels,
        "sujetDiscussion":
            sujetDiscussion.trim().isEmpty ? null : sujetDiscussion.trim(),
      };
}

// ================= DTO =================
class CommercialContactCreateDto {
  String typeClient;
  String statut;
  String nomSociete;
  String? matriculeFiscale;
  String nom;
  String prenom;
  String localisation;
  String telephone;
  String message;
  int nbAppels;
  String sujetDiscussion;
  String? email;

  List<CommercialProductInput> produits;
  List<CommercialProjectInput> projects;

  CommercialRelanceInput? relance;

  String pipelineStage;
  String? dateAppel;
  String userNom;

  CommercialContactCreateDto({
    this.typeClient = "autre",
    this.statut = "user_injoignable",
    this.nomSociete = "",
    this.nom = "",
    this.prenom = "",
    this.localisation = "",
    this.matriculeFiscale = "",
    this.telephone = "",
    this.email = "",
    this.message = "",
    this.nbAppels = 0,
    this.sujetDiscussion = "",
    List<CommercialProductInput>? produits,
    List<CommercialProjectInput>? projects,
    this.relance,
    this.pipelineStage = "Prospect",
    this.userNom = "najeh",
    this.dateAppel,
  })  : produits = produits ?? [CommercialProductInput()],
        projects = projects ?? [CommercialProjectInput()];

  Map<String, dynamic> toJson() {
    final data = <String, dynamic>{
      "typeClient": typeClient,
      "statut": statut,
      "nomSociete": nomSociete.trim().isEmpty ? null : nomSociete.trim(),
      "nom": nom.trim(),
      "matriculeFiscale":
       matriculeFiscale == null || matriculeFiscale!.trim().isEmpty
        ? null
        : matriculeFiscale!.trim(),
      "prenom": prenom.trim(),
      "localisation": localisation.trim().isEmpty ? null : localisation.trim(),
      "telephone": telephone.trim(),
      "email": email?.trim(),
      "message": message.trim().isEmpty ? null : message.trim(),
      "nbAppels": nbAppels,
      "sujetDiscussion":
          sujetDiscussion.trim().isEmpty ? null : sujetDiscussion.trim(),
      "user_nom": userNom,

      // ✅ PRODUITS
      "produits": produits.map((p) => p.toJson()).toList(),

      // ✅ PROJECTS
      "projects": projects
    .where((p) => p.nomProjet.trim().isNotEmpty)
    .map((p) => p.toJson())
    .toList(),

      // ✅ PIPELINE
      "pipelineStage": pipelineStage,
      "dateAppel": dateAppel,
    };

    // ✅ RELANCE
    if (relance != null) {
      data.addAll(relance!.toJson());
    }

    return data;
  }
}