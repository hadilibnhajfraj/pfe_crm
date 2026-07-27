// lib/forms/por_promesh/utils/por_promesh_safe_value.dart
//
// Fonction globale réutilisée par l'écran détail, l'export PDF, l'export
// Excel et l'impression de la fiche POR PROMESH — ne jamais afficher
// "null", "undefined" ou "NaN" à l'utilisateur, uniquement une chaîne vide.

String safeValue(dynamic value) {
  if (value == null) return '';
  if (value is double && value.isNaN) return '';
  final s = value.toString();
  if (s == 'null' || s == 'undefined' || s == 'NaN') return '';
  return s;
}
