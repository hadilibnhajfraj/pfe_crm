// lib/utils/user_roles.dart
//
// Vocabulaire des rôles v2 — miroir de Backend Master/src/constants/roles.js
// (ENUM PostgreSQL enum_users_role). "user" n'est plus un rôle métier :
//   ancien "user"       → "commercial"            (commercial terrain)
//   ancien "commercial" → "commercial_sedentaire" (gestion des contacts)

/// Les 7 rôles réels, dans l'ordre de l'ENUM PostgreSQL.
const List<String> kUserRoles = [
  'commercial',
  'commercial_sedentaire',
  'accueil',
  'admin',
  'superadmin',
  'responsable_logistique_achat',
  'superadmin2',
];

const Map<String, String> _kRoleLabels = {
  'commercial': 'Commercial',
  'commercial_sedentaire': 'Commercial sédentaire',
  'accueil': 'Accueil',
  'admin': 'Administrateur',
  'superadmin': 'Super administrateur',
  'responsable_logistique_achat': 'Responsable Logistique & Achat',
  'superadmin2': 'Super administrateur 2',
};

/// Libellé lisible d'un rôle ; la valeur brute si elle est inconnue.
String userRoleLabel(String? role) {
  final r = (role ?? '').toLowerCase().trim();
  return _kRoleLabels[r] ?? r;
}
