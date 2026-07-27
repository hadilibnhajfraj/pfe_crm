// lib/forms/industrial/view/probar/widgets/probar_value_chip.dart
//
// Chip coloré pour une valeur de Contrôle Machine — 3 niveaux comme demandé
// pour l'écran détail PROBAR : Bon/OK/Conforme → vert, Moyen → orange,
// Mauvais/NOK/Sale/Présence → rouge (au lieu du simple vert/rouge de l'écran
// de saisie), afin de mieux distinguer un état intermédiaire en lecture seule.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

Color probarValueColor(String value) {
  final v = value.trim().toLowerCase();
  if (v == 'moyen') return kCrmWarning;
  const good = {'bon', 'ok', 'propre', 'absence', 'conforme', '>= 6 bars'};
  if (good.contains(v)) return kCrmSuccess;
  return kCrmDanger;
}

class ProbarValueChip extends StatelessWidget {
  final String label;
  final String? value;

  const ProbarValueChip({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final v = (value ?? '').trim();
    final hasValue = v.isNotEmpty;
    final color = hasValue ? probarValueColor(v) : kCrmTextSub;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: hasValue ? color.withOpacity(0.1) : kCrmBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: hasValue ? color.withOpacity(0.4) : kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 10, color: kCrmTextSub)),
        const SizedBox(height: 2),
        Text(hasValue ? AppLocalizations.of(context).translate(v) : '—',
            style: tInter(fontSize: 12.5, fontWeight: FontWeight.w800, color: hasValue ? color : kCrmTextSub)),
      ]),
    );
  }
}
