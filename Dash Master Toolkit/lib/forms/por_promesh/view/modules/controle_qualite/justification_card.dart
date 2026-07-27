// lib/forms/por_promesh/view/modules/controle_qualite/justification_card.dart
//
// Zone "Justification" — n'apparaît que si au moins un paramètre de la
// section associée est en anomalie (`controleProcessHasNegative` /
// `controleMachineHasNegative`, logique métier inchangée). Réutilisé deux
// fois (Contrôle Process / Contrôle Machine), chacune avec son propre champ
// texte partagé (`justificationControleProcess` / `justificationControleMachine`).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

import 'cq_theme.dart';

class JustificationCard extends StatelessWidget {
  final String title;
  final TextEditingController controller;
  final VoidCallback onChanged;

  const JustificationCard({super.key, required this.title, required this.controller, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: kCrmDanger.withOpacity(0.05),
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        border: Border.all(color: kCrmDanger.withOpacity(0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        CqCardHeader(icon: Icons.report_gmailerrorred_rounded, title: title, color: kCrmDanger),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          maxLines: 2,
          onChanged: (_) => onChanged(),
          style: tInter(fontSize: 12, color: kCrmText),
          decoration: InputDecoration(
            hintText: 'Expliquer le ou les écarts constatés…',
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            filled: true,
            fillColor: kCrmSurface,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
          ),
        ),
      ]),
    );
  }
}
