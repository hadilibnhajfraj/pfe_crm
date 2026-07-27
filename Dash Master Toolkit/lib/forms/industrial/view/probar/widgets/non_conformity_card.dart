// lib/forms/industrial/view/probar/widgets/non_conformity_card.dart
//
// Card "Non-Conformité" de l'écran Détail PROBAR — même composant
// (CqCardSurface + badge + tuiles) que PorPromeshDetailScreen._nonConformiteCard.
// PROBAR n'a pas de champ photo dédié (contrairement à PROMESH) — la section
// Photos ne s'affiche donc que si une valeur existe un jour côté backend.
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/utils/por_promesh_safe_value.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class NonConformityCard extends StatelessWidget {
  final String? statutQualite; // 'ok' | 'nok' | null
  final String? description;
  final String? actionsCorrectives;

  const NonConformityCard({super.key, this.statutQualite, this.description, this.actionsCorrectives});

  @override
  Widget build(BuildContext context) {
    final isNonConforme = statutQualite == 'nok';
    final hasStatus = statutQualite != null;

    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (hasStatus)
          _statusBadge(
            context,
            isNonConforme ? 'Non Conforme' : 'Conforme',
            isNonConforme ? kCrmDanger : kCrmSuccess,
            isNonConforme ? Icons.cancel_rounded : Icons.check_circle_rounded,
          )
        else
          Text(AppLocalizations.of(context).translate('Statut non renseigné'),
              style: tInter(fontSize: 12, color: kCrmTextSub)),
        if (isNonConforme) ...[
          const SizedBox(height: 12),
          _infoTile(context, Icons.notes_rounded, 'Description', safeValue(description)),
          const SizedBox(height: 10),
          _infoTile(context, Icons.build_circle_outlined, 'Actions Correctives', safeValue(actionsCorrectives)),
        ],
      ]),
    );
  }

  Widget _statusBadge(BuildContext context, String label, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 5),
        Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }

  Widget _infoTile(BuildContext context, IconData icon, String label, String value) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: kCrmDanger.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, size: 14, color: kCrmDanger),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 10, color: kCrmTextSub)),
          const SizedBox(height: 2),
          Text(value.isEmpty ? '—' : value, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText)),
        ]),
      ),
    ]);
  }
}
