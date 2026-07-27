// lib/forms/constants/product_family.dart
//
// Gammes de produit disponibles pour un projet (mode "Project" uniquement)
// et diamètres valides par gamme — donnée de référence statique, symétrique
// avec Backend Master/src/constants/productFamily.js. Aucun libellé
// concaténé ("Probar Ø12 mm") n'est jamais stocké — toujours recalculé ici
// à partir de productFamily + diameterMm.

const List<String> kProductFamilies = ['PROBAR', 'PROMESH'];

const Map<String, List<int>> kDiametersByFamily = {
  'PROBAR': [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32],
  'PROMESH': [4, 5, 6, 8, 10],
};

String productFamilyLabel(String? family) {
  switch (family) {
    case 'PROBAR':
      return 'Probar';
    case 'PROMESH':
      return 'Promesh';
    default:
      return '—';
  }
}

String diameterLabel(int? mm) => mm == null ? '—' : 'Ø$mm mm';

/// Libellé complet ("Probar Ø12 mm") — toujours calculé, jamais stocké.
String productFamilyDiameterLabel(String? family, int? mm) {
  if (family == null && mm == null) return '—';
  if (mm == null) return productFamilyLabel(family);
  return '${productFamilyLabel(family)} Ø$mm mm';
}
