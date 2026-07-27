// lib/forms/por_promesh/view/modules/controle_qualite/numeric_card.dart
//
// Carte "paramètre numérique" — icône + titre + champ chiffré (+ suffixe
// d'unité), bascule en rouge avec un message si `outOfRange`. Remplace
// l'ancien `_NumericCard` de `controle_qualite_screen.dart`.
//
// AUCUNE hauteur fixe — voir le commentaire de [ParameterCard] :
// `constraints: BoxConstraints(minHeight: 110)` fixe un plancher sans
// jamais plafonner le contenu. Aucun `IntrinsicHeight`/mesure intrinsèque
// (voir `MachineControlGrid`, simple `Wrap`).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import 'cq_theme.dart';

class NumericCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final TextEditingController controller;
  final String? suffix;
  final VoidCallback onChanged;
  final bool outOfRange;
  final String? rangeHint;
  // Placeholder instructif optionnel (ex. "Saisir la température des
  // pistons") — distinct du hint "0" volontairement évité ci-dessous : un
  // texte d'instruction ne peut pas être confondu avec une valeur déjà
  // saisie.
  final String? hintText;

  const NumericCard({
    super.key,
    required this.icon,
    required this.title,
    required this.controller,
    required this.onChanged,
    this.subtitle,
    this.suffix,
    this.outOfRange = false,
    this.rangeHint,
    this.hintText,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      constraints: const BoxConstraints(minHeight: 110, maxWidth: double.infinity),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: outOfRange ? kCrmDanger.withOpacity(0.05) : kCrmBg,
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        border: Border.all(color: outOfRange ? kCrmDanger.withOpacity(0.5) : kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        CqCardHeader(
          icon: icon,
          title: title,
          subtitle: subtitle,
          color: outOfRange ? kCrmDanger : kCrmInfo,
          iconBoxSize: 22,
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => onChanged(),
          textAlign: TextAlign.center,
          style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText),
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            filled: true,
            fillColor: kCrmSurface,
            // Pas de hintText '0' par défaut : un placeholder ressemblant à
            // une valeur valide laissait croire le champ déjà rempli — un
            // texte d'instruction explicite (`hintText`) reste sûr.
            hintText: hintText == null ? null : AppLocalizations.of(context).translate(hintText!),
            hintStyle: tInter(fontSize: 11.5, color: kCrmTextSub),
            suffixText: suffix,
            suffixStyle: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: kCrmTextSub),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
          ),
        ),
        if (outOfRange && rangeHint != null) ...[
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.warning_amber_rounded, size: 12, color: kCrmDanger),
            const SizedBox(width: 4),
            Expanded(
                child: Text(
                    '${AppLocalizations.of(context).translate('Hors plage —')} $rangeHint',
                    style: tInter(fontSize: 9.5, color: kCrmDanger))),
          ]),
        ],
      ]),
    );
  }
}
