// lib/forms/hr/view/widgets/profile_incomplete_banner.dart
//
// Bandeau d'information (non bloquant) affiché au-dessus du formulaire
// quand le profil RH de l'employé est incomplet. Le formulaire reste
// TOUJOURS accessible : les champs manquants deviennent simplement
// éditables (voir EmployeeFieldsSection) — ce bandeau ne fait qu'attirer
// l'attention, il ne remplace jamais le formulaire.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../theme/hr_theme.dart';

class ProfileIncompleteBanner extends StatelessWidget {
  const ProfileIncompleteBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: kHrPending.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kHrPending.withOpacity(0.35)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.info_outline_rounded, color: kHrPending, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            AppLocalizations.of(context).translate("Certaines informations RH sont absentes. Veuillez compléter les champs avant l'envoi."),
            style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmText),
          ),
        ),
      ]),
    );
  }
}
