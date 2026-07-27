// lib/forms/hr/model/employee_profile_model.dart
//
// Profil employé (auto-remplissage du module RH "Demandes") — miroir de la
// réponse `GET /users/me/profile` (UserProfile + email/role fusionnés côté
// backend). Champs RH (matricule/qualification/departement/service) jamais
// saisis par l'utilisateur : renseignés une fois par un administrateur.

class EmployeeProfileModel {
  final String? userId;
  final String? nom;
  final String? prenom;
  final String? matricule;
  final String? qualification;
  final String? departement;
  final String? service;
  final String? email;

  const EmployeeProfileModel({
    this.userId,
    this.nom,
    this.prenom,
    this.matricule,
    this.qualification,
    this.departement,
    this.service,
    this.email,
  });

  /// Le module RH exige ces 6 champs — s'ils manquent, l'auto-remplissage
  /// est impossible et l'employé doit contacter un administrateur.
  bool get isComplete =>
      (nom ?? '').trim().isNotEmpty &&
      (prenom ?? '').trim().isNotEmpty &&
      (matricule ?? '').trim().isNotEmpty &&
      (qualification ?? '').trim().isNotEmpty &&
      (departement ?? '').trim().isNotEmpty &&
      (service ?? '').trim().isNotEmpty;

  List<String> get missingFieldLabels => [
        if ((nom ?? '').trim().isEmpty) 'Nom',
        if ((prenom ?? '').trim().isEmpty) 'Prénom',
        if ((matricule ?? '').trim().isEmpty) 'Matricule',
        if ((qualification ?? '').trim().isEmpty) 'Qualification',
        if ((departement ?? '').trim().isEmpty) 'Département',
        if ((service ?? '').trim().isEmpty) 'Service',
      ];

  factory EmployeeProfileModel.fromJson(Map<String, dynamic> json) {
    return EmployeeProfileModel(
      userId: json['userId']?.toString(),
      nom: json['nom']?.toString(),
      prenom: json['prenom']?.toString(),
      matricule: json['matricule']?.toString(),
      qualification: json['qualification']?.toString(),
      departement: json['departement']?.toString(),
      service: json['service']?.toString(),
      email: json['email']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'nom': nom,
        'prenom': prenom,
        'matricule': matricule,
        'qualification': qualification,
        'departement': departement,
        'service': service,
      };
}
