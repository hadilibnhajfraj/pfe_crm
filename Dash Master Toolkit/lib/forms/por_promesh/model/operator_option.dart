// lib/forms/por_promesh/model/operator_option.dart
//
// Utilisateur sélectionnable pour le champ "Opérateur" (GET /por-promesh/operators).
// `name` est résolu côté backend via user_profiles, avec repli sur l'email.

class OperatorOption {
  final String id;
  final String email;
  final String name;

  const OperatorOption({required this.id, required this.email, required this.name});

  factory OperatorOption.fromJson(Map<String, dynamic> json) {
    final email = (json['email'] ?? '').toString();
    return OperatorOption(
      id: (json['id'] ?? '').toString(),
      email: email,
      name: (json['name'] ?? '').toString().trim().isEmpty ? email : json['name'].toString(),
    );
  }
}
