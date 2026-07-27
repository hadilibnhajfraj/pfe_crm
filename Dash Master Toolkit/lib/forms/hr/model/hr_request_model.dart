// lib/forms/hr/model/hr_request_model.dart
//
// Modèle d'une demande RH (congé / autorisation de sortie) — miroir du DTO
// backend `hrRequest.dto.js`. Toutes les informations employé sont un
// snapshot pris à la création (jamais resaisies par l'utilisateur).

class HrRequestActivityModel {
  final String id;
  final String type;
  final String message;
  final String actorName;
  final DateTime createdAt;

  HrRequestActivityModel({
    required this.id,
    required this.type,
    required this.message,
    required this.actorName,
    required this.createdAt,
  });

  factory HrRequestActivityModel.fromJson(Map<String, dynamic> j) {
    final actor = j['actor'] is Map ? Map<String, dynamic>.from(j['actor'] as Map) : <String, dynamic>{};
    return HrRequestActivityModel(
      id: (j['id'] ?? '').toString(),
      type: (j['type'] ?? '').toString(),
      message: (j['message'] ?? '').toString(),
      actorName: (actor['name'] ?? 'Système').toString(),
      createdAt: DateTime.tryParse((j['createdAt'] ?? '').toString()) ?? DateTime.now(),
    );
  }
}

class HrRequestModel {
  final String? id;
  final int? ticketNo;
  final String type; // 'conge' | 'sortie'
  final String statut; // 'en_attente' | 'acceptee' | 'refusee' | 'traitee'

  final String? requestedBy;
  final String? employeeEmailAccount;

  final String? employeeNom;
  final String? employeePrenom;
  final String? employeeMatricule;
  final String? employeeQualification;
  final String? employeeDepartement;
  final String? employeeService;
  final String? employeeEmail;

  // Congé
  final String? typeConge; // 'ordinaire' | 'maladie'
  final String? dateDebut;
  final String? dateFin;
  final int? nombreJours;
  final int? anneeConge;
  final String? adresse;
  final String? telephone;

  // Sortie
  final String? motif;
  final String? dateSortie;
  final String? heureSortie;
  final String? heureRetour;

  final String? commentaire;
  final String? signature;
  final String? emailSentAt;

  final String? reviewComment;
  final String? reviewedAt;
  final String? reviewedByName;
  final String? processedAt;
  final String? processedByName;
  final List<String> justificatifs;

  final String? createdAt;
  final String? updatedAt;

  const HrRequestModel({
    this.id,
    this.ticketNo,
    required this.type,
    this.statut = 'en_attente',
    this.requestedBy,
    this.employeeEmailAccount,
    this.employeeNom,
    this.employeePrenom,
    this.employeeMatricule,
    this.employeeQualification,
    this.employeeDepartement,
    this.employeeService,
    this.employeeEmail,
    this.typeConge,
    this.dateDebut,
    this.dateFin,
    this.nombreJours,
    this.anneeConge,
    this.adresse,
    this.telephone,
    this.motif,
    this.dateSortie,
    this.heureSortie,
    this.heureRetour,
    this.commentaire,
    this.signature,
    this.emailSentAt,
    this.reviewComment,
    this.reviewedAt,
    this.reviewedByName,
    this.processedAt,
    this.processedByName,
    this.justificatifs = const [],
    this.createdAt,
    this.updatedAt,
  });

  bool get isConge => type == 'conge';
  bool get isEnAttente => statut == 'en_attente';
  bool get isAcceptee => statut == 'acceptee';
  bool get isRefusee => statut == 'refusee';
  bool get isTraitee => statut == 'traitee';

  factory HrRequestModel.fromJson(Map<String, dynamic> json) {
    final employee = json['employee'];
    final reviewedByUser = json['reviewedByUser'];
    final processedByUser = json['processedByUser'];
    final rawJustificatifs = json['justificatifs'] is List ? json['justificatifs'] as List : [];
    return HrRequestModel(
      id: json['id']?.toString(),
      ticketNo: json['ticketNo'] is num ? (json['ticketNo'] as num).toInt() : null,
      type: (json['type'] ?? '').toString(),
      statut: (json['statut'] ?? 'en_attente').toString(),
      requestedBy: json['requestedBy']?.toString(),
      employeeEmailAccount: employee is Map ? employee['email']?.toString() : null,
      employeeNom: json['employeeNom']?.toString(),
      employeePrenom: json['employeePrenom']?.toString(),
      employeeMatricule: json['employeeMatricule']?.toString(),
      employeeQualification: json['employeeQualification']?.toString(),
      employeeDepartement: json['employeeDepartement']?.toString(),
      employeeService: json['employeeService']?.toString(),
      employeeEmail: json['employeeEmail']?.toString(),
      typeConge: json['typeConge']?.toString(),
      dateDebut: json['dateDebut']?.toString(),
      dateFin: json['dateFin']?.toString(),
      nombreJours: json['nombreJours'] is num ? (json['nombreJours'] as num).toInt() : null,
      anneeConge: json['anneeConge'] is num ? (json['anneeConge'] as num).toInt() : null,
      adresse: json['adresse']?.toString(),
      telephone: json['telephone']?.toString(),
      motif: json['motif']?.toString(),
      dateSortie: json['dateSortie']?.toString(),
      heureSortie: json['heureSortie']?.toString(),
      heureRetour: json['heureRetour']?.toString(),
      commentaire: json['commentaire']?.toString(),
      signature: json['signature']?.toString(),
      emailSentAt: json['emailSentAt']?.toString(),
      reviewComment: json['reviewComment']?.toString(),
      reviewedAt: json['reviewedAt']?.toString(),
      reviewedByName: reviewedByUser is Map ? reviewedByUser['name']?.toString() : null,
      processedAt: json['processedAt']?.toString(),
      processedByName: processedByUser is Map ? processedByUser['name']?.toString() : null,
      justificatifs: rawJustificatifs.map((p) => p.toString()).toList(),
      createdAt: json['createdAt']?.toString(),
      updatedAt: json['updatedAt']?.toString(),
    );
  }

  Map<String, dynamic> toCreateJson() => {
        'type': type,
        // Repli utilisé uniquement quand le profil RH ne contient pas déjà
        // la valeur (le formulaire ne bloque plus si le profil est
        // incomplet — l'utilisateur peut compléter directement ces champs).
        if ((employeeNom ?? '').trim().isNotEmpty) 'employeeNom': employeeNom!.trim(),
        if ((employeePrenom ?? '').trim().isNotEmpty) 'employeePrenom': employeePrenom!.trim(),
        if ((employeeMatricule ?? '').trim().isNotEmpty) 'employeeMatricule': employeeMatricule!.trim(),
        if ((employeeQualification ?? '').trim().isNotEmpty) 'employeeQualification': employeeQualification!.trim(),
        if ((employeeDepartement ?? '').trim().isNotEmpty) 'employeeDepartement': employeeDepartement!.trim(),
        if ((employeeService ?? '').trim().isNotEmpty) 'employeeService': employeeService!.trim(),
        if (isConge) ...{
          'typeConge': typeConge,
          'dateDebut': dateDebut,
          'dateFin': dateFin,
          'adresse': adresse,
          'telephone': telephone,
        } else ...{
          'motif': motif,
          'dateSortie': dateSortie,
          'heureSortie': heureSortie,
          'heureRetour': heureRetour,
        },
        if ((commentaire ?? '').trim().isNotEmpty) 'commentaire': commentaire!.trim(),
      };
}
