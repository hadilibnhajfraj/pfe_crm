// lib/forms/industrial/view/probar/widgets/personnel_card.dart
//
// Card "Personnel" de l'écran Détail PROBAR — même principe que
// PorPromeshDetailScreen._personnelCard (une tuile par rôle renseigné).
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class PersonnelCard extends StatelessWidget {
  final Map<String, String?> personnel;
  const PersonnelCard({super.key, required this.personnel});

  static const _roles = [
    ('responsable1', 'Responsable 1', Icons.supervisor_account_rounded),
    ('responsable2', 'Responsable 2', Icons.supervisor_account_rounded),
    ('operateur1', 'Opérateur 1', Icons.engineering_rounded),
    ('operateur2', 'Opérateur 2', Icons.engineering_rounded),
    ('aideOperateur', 'Aide Opérateur', Icons.person_add_alt_1_rounded),
    ('manoeuvre', 'Manœuvre', Icons.handyman_rounded),
    ('stagiaire1', 'Stagiaire 1', Icons.school_rounded),
    ('stagiaire2', 'Stagiaire 2', Icons.school_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final cards = <Widget>[];
    for (final r in _roles) {
      final name = (personnel[r.$1] ?? '').trim();
      if (name.isNotEmpty) cards.add(_personTile(context, r.$3, r.$2, name));
    }
    return CqCardSurface(
      child: cards.isEmpty
          ? Text(AppLocalizations.of(context).translate('Aucun personnel renseigné'),
              style: tInter(fontSize: 12, color: kCrmTextSub))
          : Wrap(spacing: 10, runSpacing: 10, children: cards),
    );
  }

  Widget _personTile(BuildContext context, IconData icon, String label, String name) {
    final initial = name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: kPersonnelColor.withOpacity(0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kPersonnelColor.withOpacity(0.18)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        CircleAvatar(
          radius: 13,
          backgroundColor: kPersonnelColor.withOpacity(0.16),
          child: Text(initial, style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: kPersonnelColor)),
        ),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 9.5, color: kCrmTextSub)),
          Text(name, style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: kCrmText)),
        ]),
        const SizedBox(width: 4),
        Icon(icon, size: 13, color: kPersonnelColor.withOpacity(0.6)),
      ]),
    );
  }
}
