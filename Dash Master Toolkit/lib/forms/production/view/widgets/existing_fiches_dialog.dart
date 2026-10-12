// lib/forms/production/view/widgets/existing_fiches_dialog.dart
//
// Avertissement affiché AVANT de créer une fiche de production (PROMESH ou
// PROBAR) quand il en existe déjà pour la même machine, la même date et le
// même poste (GET /por-promesh/existing, GET /industrial-records/existing).
//
// Plusieurs fiches pour un même poste sont un fonctionnement normal : la
// création n'est jamais interdite. L'utilisateur choisit, rien n'est fusionné,
// écrasé ni supprimé — ni ici, ni côté serveur.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/localization/app_localizations.dart';

/// Une fiche déjà présente pour la même machine, la même date et le même poste.
class ExistingFiche {
  final String id;
  final String? numero;
  final bool locked;
  final String? heureDebut;
  final String? heureFin;
  final String? quantite;
  final bool isEmptyDraft;

  const ExistingFiche({
    required this.id,
    this.numero,
    required this.locked,
    this.heureDebut,
    this.heureFin,
    this.quantite,
    required this.isEmptyDraft,
  });

  /// [quantiteKey] : `productionM2` (PROMESH) ou `quantiteProduite` (PROBAR).
  factory ExistingFiche.fromJson(Map<String, dynamic> j, {required String quantiteKey}) => ExistingFiche(
        id: (j['id'] ?? '').toString(),
        numero: j['sequenceNumber']?.toString(),
        locked: j['isLocked'] == true,
        heureDebut: j['heureDebut']?.toString(),
        heureFin: j['heureFin']?.toString(),
        quantite: j[quantiteKey]?.toString(),
        isEmptyDraft: j['isEmptyDraft'] == true,
      );
}

class ExistingFiches {
  final String? date;
  final List<ExistingFiche> fiches;
  final String? emptyDraftId;

  const ExistingFiches({this.date, this.fiches = const [], this.emptyDraftId});

  bool get isEmpty => fiches.isEmpty;

  /// Brouillons non verrouillés, du plus ancien au plus récent.
  List<ExistingFiche> get drafts => fiches.where((f) => !f.locked).toList();

  factory ExistingFiches.fromJson(Map<String, dynamic> j, {required String quantiteKey}) => ExistingFiches(
        date: j['date']?.toString(),
        emptyDraftId: j['emptyDraftId']?.toString(),
        fiches: ((j['fiches'] as List?) ?? const [])
            .whereType<Map>()
            .map((e) => ExistingFiche.fromJson(Map<String, dynamic>.from(e), quantiteKey: quantiteKey))
            .toList(),
      );
}

/// Décision de l'utilisateur. `resumeId` non nul = reprendre cette fiche ;
/// `createNew` = créer une fiche supplémentaire ; les deux absents = annuler.
class ExistingFichesChoice {
  final bool createNew;
  final String? resumeId;

  const ExistingFichesChoice.create()
      : createNew = true,
        resumeId = null;
  const ExistingFichesChoice.resume(String id)
      : createNew = false,
        resumeId = id;
}

String _hhmm(String? v) => (v == null || v.length < 5) ? '—' : v.substring(0, 5);

/// Affiche l'avertissement et retourne le choix, ou `null` si l'utilisateur
/// annule. [resumeId] : fiche proposée à la reprise (aucune proposition si
/// nul) ; [resumeIsEmpty] adapte le libellé du bouton. [unite] : « m² » pour
/// PROMESH, vide pour PROBAR.
Future<ExistingFichesChoice?> showExistingFichesDialog(
  BuildContext context, {
  required ExistingFiches existing,
  String? resumeId,
  bool resumeIsEmpty = true,
  String unite = '',
}) {
  final loc = AppLocalizations.of(context);
  final count = existing.fiches.length;
  return showDialog<ExistingFichesChoice>(
    context: context,
    builder: (ctx) => AlertDialog(
      icon: const Icon(Icons.info_outline_rounded, color: Color(0xFFD97706), size: 32),
      title: Text(loc.translate('Fiche déjà existante pour ce poste')),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$count ${loc.translate(count > 1 ? 'fiches existent déjà pour cette machine, ce poste et cette date.' : 'fiche existe déjà pour cette machine, ce poste et cette date.')}',
              ),
              const SizedBox(height: 12),
              for (final f in existing.fiches)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      Icon(f.locked ? Icons.lock_outline_rounded : Icons.edit_note_rounded,
                          size: 18, color: f.locked ? const Color(0xFF16A34A) : const Color(0xFF64748B)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          [
                            if (f.numero != null) 'N° ${f.numero}',
                            loc.translate(f.locked
                                ? 'Validée'
                                : (f.isEmptyDraft ? 'Brouillon vide' : 'Brouillon')),
                            '${_hhmm(f.heureDebut)} → ${_hhmm(f.heureFin)}',
                            if (f.quantite != null) '${f.quantite}${unite.isEmpty ? '' : ' $unite'}',
                          ].join(' · '),
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 12),
              Text(
                loc.translate('Vous pouvez créer une fiche supplémentaire. Aucune fiche existante ne sera modifiée.'),
                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
              ),
            ],
          ),
        ),
      ),
      actionsOverflowButtonSpacing: 4,
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: Text(loc.translate('Annuler')),
        ),
        if (resumeId != null)
          OutlinedButton(
            onPressed: () => Navigator.of(ctx).pop(ExistingFichesChoice.resume(resumeId)),
            child: Text(loc.translate(resumeIsEmpty ? 'Reprendre le brouillon vide' : 'Reprendre le brouillon en cours')),
          ),
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(const ExistingFichesChoice.create()),
          child: Text(loc.translate('Créer une nouvelle fiche')),
        ),
      ],
    ),
  );
}
