// lib/forms/por_promesh/view/modules/controle_qualite/machine_control_grid.dart
//
// Grille responsive (Desktop / Web / Tablette) de cartes paramètre — 1
// colonne en mobile, jusqu'à 4 en desktop large (Full HD), densité "ERP".
// Remplace l'ancien `_ResponsiveCardGrid`.
//
// AUCUN `IntrinsicHeight`/`IntrinsicWidth` ici (ni nulle part dans le
// module Contrôle Machine) — une tentative précédente enveloppait chaque
// ligne dans `IntrinsicHeight` pour égaliser la hauteur des cartes, mais
// les cartes contiennent un `LayoutBuilder` (`StatusSelector`), qui ne
// supporte pas d'être mesuré en intrinsèque : ça provoquait
// "RenderIntrinsicHeight NEEDS-LAYOUT" puis "Cannot hit test a render box
// with no size". Remplacé par un simple `Wrap` — chaque carte reçoit une
// largeur calculée (1 à `maxColumnsCap` colonnes selon la largeur
// disponible) via `SizedBox`, et gère seule sa propre hauteur (voir
// `ParameterCard`/`NumericCard` : `constraints: BoxConstraints(minHeight:
// 110)`, jamais de hauteur fixe, jamais de mesure intrinsèque).
//
// Compromis assumé : `Wrap` ne redistribue pas la largeur d'une dernière
// ligne incomplète (ex. 7 cartes / 4 colonnes → ligne de 3 cartes de même
// largeur que les lignes de 4, espace libre à droite) — accepté au profit
// de la stabilité (plus aucun crash), conformément à la demande explicite
// d'abandonner l'architecture `Row`+`Expanded`+`IntrinsicHeight`.

import 'package:flutter/material.dart';

class MachineControlGrid extends StatelessWidget {
  final List<Widget> cards;
  final double minColumnWidth;
  final int maxColumnsCap;

  const MachineControlGrid({super.key, required this.cards, this.minColumnWidth = 220, this.maxColumnsCap = 4});

  static const double _spacing = 10;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      // Garde-fou : si ce widget se retrouve un jour dans un contexte à
      // largeur non bornée, `constraints.maxWidth` peut valoir
      // `double.infinity` — on retombe alors sur une largeur de secours
      // fixe plutôt que de propager l'infini dans un SizedBox enfant.
      final hasBoundedWidth = constraints.maxWidth.isFinite;
      final width = hasBoundedWidth ? constraints.maxWidth : 360.0;
      final columns = (width / minColumnWidth).floor().clamp(1, maxColumnsCap);
      final cardWidth = (width - _spacing * (columns - 1)) / columns;

      return Wrap(
        spacing: _spacing,
        runSpacing: _spacing,
        children: [
          for (final card in cards) SizedBox(width: cardWidth, child: card),
        ],
      );
    });
  }
}
