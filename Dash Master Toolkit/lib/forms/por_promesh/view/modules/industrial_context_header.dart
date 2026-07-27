// lib/forms/por_promesh/view/modules/industrial_context_header.dart
//
// Header minimal partagé par l'écran "Informations générales", la grille
// de modules et les 5 écrans-module : PROMESH / Machine N / Poste X.
// Ne contient plus aucune information générée automatiquement
// (date / heure / opérateur connecté) — ces données sont désormais saisies
// par l'utilisateur dans le formulaire "Informations générales".

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

class IndustrialContextHeader extends StatelessWidget {
  final String machine;
  final String poste; // 'matin' | 'nuit' (affiché "Soir")
  final Color color;
  final String lineLabel; // 'PROMESH'

  const IndustrialContextHeader({
    super.key,
    required this.machine,
    required this.poste,
    required this.color,
    this.lineLabel = 'PROMESH',
  });

  @override
  Widget build(BuildContext context) {
    final posteLabel = poste == 'matin' ? 'Matin' : 'Soir';

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(lineLabel,
          style: tInter(fontSize: 12.5, fontWeight: FontWeight.w800, color: color, letterSpacing: 1.2)),
      const SizedBox(height: 4),
      Text('Machine $machine', style: tInter(fontSize: 20, fontWeight: FontWeight.w900, color: kCrmText)),
      const SizedBox(height: 2),
      Text('Poste $posteLabel', style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: kCrmTextSub)),
    ]);
  }
}
