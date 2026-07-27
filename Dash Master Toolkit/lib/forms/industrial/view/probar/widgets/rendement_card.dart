// lib/forms/industrial/view/probar/widgets/rendement_card.dart
//
// Card "Rendement" de l'écran Détail PROBAR — même principe que
// PorPromeshDetailScreen._rendementCard (tuile KPI Production en m²).
// Seule donnée réellement enregistrée pour ce module (record.quantiteProduite),
// aucune valeur inventée.
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class RendementCard extends StatelessWidget {
  final num? productionM2;
  const RendementCard({super.key, this.productionM2});

  @override
  Widget build(BuildContext context) {
    return CqCardSurface(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: kProbarColor.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
          child: const Icon(Icons.speed_rounded, size: 14, color: kProbarColor),
        ),
        const SizedBox(width: 8),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(AppLocalizations.of(context).translate('Production'), style: tInter(fontSize: 10, color: kCrmTextSub)),
          const SizedBox(height: 2),
          Text(productionM2 == null ? '—' : '${_fmtNum(productionM2)} m²',
              style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText)),
        ]),
      ]),
    );
  }

  String _fmtNum(num? v) {
    if (v == null) return '';
    if (v == v.roundToDouble()) return v.toInt().toString();
    return v.toStringAsFixed(2);
  }
}
