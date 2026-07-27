// lib/forms/por_promesh/view/detail/detail_machine_value_card.dart
//
// Carte "valeur Contrôle Machine" — icône/titre/valeur/couleur, pour la
// grille de la section Contrôle Machine de l'écran Détail. La couleur
// reprend EXACTEMENT la sémantique déjà définie par
// `PorPromeshController.controleMachineHasNegative` (aucune nouvelle règle
// métier — uniquement sa restitution visuelle) : Air "< 6 bars", Niveau
// Bain Eau "Mauvais"/"Moyen"/"Bien", Température Eau hors plage
// (machineTemperatureEauMin/Max), État Pistons "Sale", Fluide Visuel
// "Présence", État Disque Coupe "NOK".

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import '../modules/controle_qualite/cq_theme.dart';
import '../../controller/por_promesh_controller.dart' show PorPromeshController;
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class DetailMachineValueCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final Color color;

  const DetailMachineValueCard({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final hasValue = value.trim().isNotEmpty;
    return Container(
      constraints: const BoxConstraints(minWidth: 190),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: hasValue ? color.withOpacity(0.06) : kCrmSurface,
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        boxShadow: cqCardShadow(Colors.black),
        border: Border.all(color: hasValue ? color.withOpacity(0.35) : kCrmBorder),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: color.withOpacity(0.14), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 17, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(AppLocalizations.of(context).translate(title), style: tInter(fontSize: 10.5, color: kCrmTextSub)),
            const SizedBox(height: 3),
            Text(hasValue ? AppLocalizations.of(context).translate(value) : '—',
                style: tInter(fontSize: 13.5, fontWeight: FontWeight.w800, color: hasValue ? color : kCrmTextSub),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ]),
        ),
      ]),
    );
  }
}

// ── Coloration par champ (lecture seule de la sémantique déjà en place) ──

Color detailAirColor(String? v) => switch (v) {
      '< 6 bars' => kCrmDanger,
      String s when s.contains('6 bars') => kCrmSuccess,
      _ => kCrmTextSub,
    };

Color detailNiveauBainEauColor(String? v) => switch (v) {
      'Mauvais' => kCrmDanger,
      'Moyen' => kCrmWarning,
      'Bien' => kCrmSuccess,
      _ => kCrmTextSub,
    };

Color detailTemperatureEauColor(double? v) {
  if (v == null) return kCrmTextSub;
  final outOfRange =
      v < PorPromeshController.machineTemperatureEauMin || v > PorPromeshController.machineTemperatureEauMax;
  return outOfRange ? kCrmDanger : kCrmSuccess;
}

Color detailEtatPistonsColor(String? v) => switch (v) {
      'Propre' => kCrmSuccess,
      'Sale' => kCrmDanger,
      _ => kCrmTextSub,
    };

Color detailFluideVisuelColor(String? v) => switch (v) {
      'Absence' => kCrmSuccess,
      'Présence' => kCrmDanger,
      _ => kCrmTextSub,
    };

Color detailEtatDisqueCoupeColor(String? v) => switch (v) {
      'OK' => kCrmSuccess,
      'NOK' => kCrmDanger,
      _ => kCrmTextSub,
    };
