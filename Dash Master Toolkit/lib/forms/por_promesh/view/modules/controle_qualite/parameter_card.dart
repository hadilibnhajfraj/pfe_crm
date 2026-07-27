// lib/forms/por_promesh/view/modules/controle_qualite/parameter_card.dart
//
// Carte "paramètre à choix" — icône + titre + [StatusSelector]. La carte
// elle-même prend la couleur de l'option sélectionnée (gris neutre avant
// sélection). Remplace l'ancien `_ChoiceCard` de `controle_qualite_screen.dart`.
//
// AUCUNE hauteur fixe : `constraints: BoxConstraints(minHeight: 110)` fixe
// un plancher (cartes visuellement homogènes) sans jamais plafonner le
// contenu — la carte grandit librement au-delà si besoin (ex. 3 options
// qui passent à la ligne sur un écran étroit). Jamais d'`IntrinsicHeight`
// ni de mesure intrinsèque (voir `MachineControlGrid`, qui utilise un
// simple `Wrap`) — le contenu (icône + titre + boutons) tient donc
// toujours sans RenderFlex overflow ni "RenderBox has no size", quelle que
// soit la largeur. Paddings/espacements réduits au minimum lisible.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

import 'cq_theme.dart';
import 'status_selector.dart';

class ParameterCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? value;
  final List<StatusOption> options;
  final ValueChanged<String> onSelect;

  const ParameterCard({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.options,
    required this.onSelect,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final selectedOption = value == null ? null : options.where((o) => o.value == value).firstOrNull;
    final accent = selectedOption?.color ?? kCrmTextSub;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      constraints: const BoxConstraints(minHeight: 110, maxWidth: double.infinity),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: selectedOption != null ? accent.withOpacity(0.06) : kCrmBg,
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        border: Border.all(color: selectedOption != null ? accent.withOpacity(0.5) : kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        CqCardHeader(icon: icon, title: title, subtitle: subtitle, color: kCrmTextSub, iconBoxSize: 22),
        const SizedBox(height: 6),
        StatusSelector(options: options, selected: value, onSelect: onSelect),
      ]),
    );
  }
}

extension FirstOrNullStatusOption on Iterable<StatusOption> {
  StatusOption? get firstOrNull => isEmpty ? null : first;
}
