// lib/forms/industrial/view/melange/melange_summary.dart
//
// Aplatit le blob `melangeData` (JSON libre écrit par MelangeFormScreen._save)
// en champs typés + totaux calculés, pour l'affichage en lecture seule
// (carte historique) sans dupliquer la logique de sérialisation du formulaire.
//
// Depuis l'optimisation de performance de l'historique, le backend renvoie
// déjà ce résumé précalculé (`melangeSummary`, voir industrialRecord.dto.js)
// dans les réponses de LISTE — fromData() n'est donc plus appelée que pour
// les rares cas où melangeData complet est disponible localement.

const List<String> kMelangeLines = ['L1', 'L2', 'L3', 'L4'];
const List<String> kMelangeRapportKgGroups = ['a', 'b', 'c', 'gc', 'pc'];

// Mémoïsation par instance de `melangeData` : le même Map est réutilisé par
// le service (jamais recréé entre deux builds), donc ce cache évite de
// refaire les ~500 opérations `_toDouble` à chaque frappe de recherche/tri.
final Expando<MelangeSummary> _summaryCache = Expando<MelangeSummary>('MelangeSummary');

class MelangeSummary {
  final String? heureDebut;
  final String? heureFin;
  final String? remarqueGen;
  final String? zone;
  final String? remarques;
  final String? signature;
  final double totalMelangeKg;
  final int nbRavitaillements;
  final int nbConsommations;

  const MelangeSummary({
    this.heureDebut,
    this.heureFin,
    this.remarqueGen,
    this.zone,
    this.remarques,
    this.signature,
    this.totalMelangeKg = 0,
    this.nbRavitaillements = 0,
    this.nbConsommations = 0,
  });

  static double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString().replaceAll(',', '.')) ?? 0;
  }

  static bool _rowHasValue(dynamic raw) {
    if (raw is! Map) return false;
    return raw.values.any((v) => (v ?? '').toString().trim().isNotEmpty);
  }

  /// Construit un résumé directement depuis le `melangeSummary` léger déjà
  /// calculé par le backend (vues LISTE) — aucune ré-agrégation côté client.
  factory MelangeSummary.fromSummaryMap(Map<String, dynamic>? m) {
    if (m == null) return const MelangeSummary();
    return MelangeSummary(
      heureDebut: m['heureDebut']?.toString(),
      heureFin: m['heureFin']?.toString(),
      zone: m['zone']?.toString(),
      totalMelangeKg: _toDouble(m['totalMelangeKg']),
      nbRavitaillements: (m['nbRavitaillements'] as num?)?.toInt() ?? 0,
      nbConsommations: (m['nbConsommations'] as num?)?.toInt() ?? 0,
    );
  }

  factory MelangeSummary.fromData(Map<String, dynamic>? data) {
    if (data == null) return const MelangeSummary();
    final cached = _summaryCache[data];
    if (cached != null) return cached;

    final rav = (data['ravitaillement'] as Map?)?.cast<String, dynamic>();
    final ravLignes = (rav?['lignes'] as List?) ?? const [];

    final cso = (data['consommation'] as List?) ?? const [];

    final rapport = (data['rapport'] as Map?)?.cast<String, dynamic>();
    final rapLignes = (rapport?['lignes'] as List?) ?? const [];

    double totalKg = 0;
    for (final raw in rapLignes) {
      if (raw is! Map) continue;
      for (final g in kMelangeRapportKgGroups) {
        for (final l in kMelangeLines) {
          totalKg += _toDouble(raw['${g}_$l']);
        }
      }
    }

    final summary = MelangeSummary(
      heureDebut: (data['heureDebut'] ?? rapport?['heureDebut'])?.toString(),
      heureFin: (data['heureFin'] ?? rapport?['heureFin'])?.toString(),
      remarqueGen: data['remarqueGen']?.toString(),
      zone: rapport?['zone']?.toString(),
      remarques: data['remarques']?.toString(),
      signature: data['signature']?.toString(),
      totalMelangeKg: totalKg,
      nbRavitaillements: ravLignes.where(_rowHasValue).length,
      nbConsommations: cso.where(_rowHasValue).length,
    );
    _summaryCache[data] = summary;
    return summary;
  }
}
