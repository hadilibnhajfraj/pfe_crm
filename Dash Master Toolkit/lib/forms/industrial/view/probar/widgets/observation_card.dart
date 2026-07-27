// lib/forms/industrial/view/probar/widgets/observation_card.dart
//
// Card "Observation" de l'écran Détail PROBAR — même composant
// (CqCardSurface + grand bloc de texte) que PorPromeshDetailScreen.
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class ObservationCard extends StatelessWidget {
  final String text;
  const ObservationCard({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    final t = text.trim();
    return CqCardSurface(
      child: Text(t.isEmpty ? AppLocalizations.of(context).translate('Aucune observation.') : t,
          style: tInter(fontSize: 12.5, color: kCrmText)),
    );
  }
}
