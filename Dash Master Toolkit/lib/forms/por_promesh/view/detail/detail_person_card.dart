// lib/forms/por_promesh/view/detail/detail_person_card.dart
//
// Avatar card pour la section "Personnel" de l'écran Détail — avatar cerclé
// (initiale du nom) + nom + fonction. `personnelActif` (PorPromeshModel) ne
// contient que nom + rôle par personne : pas de champ "Équipe"/"Responsable"
// distinct par personne dans le modèle, donc pas de 3e/4e ligne fabriquée
// (décision validée avec l'utilisateur).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class DetailPersonCard extends StatelessWidget {
  final IconData icon;
  final String fonction;
  final String name;

  const DetailPersonCard({
    super.key,
    required this.icon,
    required this.fonction,
    required this.name,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 200),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        boxShadow: cqCardShadow(Colors.black),
      ),
      child: Row(children: [
        CircleAvatar(
          radius: 20,
          backgroundColor: kPersonnelColor.withOpacity(0.15),
          child: Text(
            name.isNotEmpty ? name[0].toUpperCase() : '?',
            style: tInter(fontSize: 15, fontWeight: FontWeight.w900, color: kPersonnelColor),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: tInter(fontSize: 13, fontWeight: FontWeight.w800, color: kCrmText),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Row(children: [
              Icon(icon, size: 12, color: kCrmTextSub),
              const SizedBox(width: 4),
              Expanded(
                child: Text(AppLocalizations.of(context).translate(fonction), style: tInter(fontSize: 10.5, color: kCrmTextSub),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }
}
