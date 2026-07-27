// lib/forms/por_promesh/view/detail/detail_kpi_card.dart
//
// Carte KPI (icône en pastille colorée + grande valeur + label) pour la
// section "Rendement" de l'écran Détail — mêmes tokens de design que
// DetailInfoCard (kCqInnerRadius/cqCardShadow), juste une mise en avant
// plus forte de la valeur (taille de police, disposition verticale).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import '../modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class DetailKpiCard extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color color;

  const DetailKpiCard({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 180),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        boxShadow: cqCardShadow(Colors.black),
        border: Border.all(color: color.withOpacity(0.18)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(height: 10),
        Text(value, style: tInter(fontSize: 20, fontWeight: FontWeight.w900, color: kCrmText)),
        const SizedBox(height: 2),
        Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 11, color: kCrmTextSub)),
      ]),
    );
  }
}
