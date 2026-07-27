// lib/forms/por_promesh/view/detail/detail_info_card.dart
//
// Carte d'information compacte pour l'écran Détail Fiche — icône colorée +
// titre gris + valeur en gras, carte blanche à coins arrondis et ombre
// légère. Réutilise les tokens de design déjà utilisés par les écrans-module
// (`cq_theme.dart` : kCqInnerRadius, cqCardShadow) pour rester visuellement
// homogène, sans en redéfinir de nouveaux.
//
// Utilisée par le header "Informations Générales" (10 cartes) et la section
// "Historique" du détail — jamais par les écrans de saisie.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class DetailInfoCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;
  final Color? accentColor;

  const DetailInfoCard({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
    this.accentColor,
  });

  @override
  Widget build(BuildContext context) {
    final accent = accentColor ?? kMaintenanceColor;
    return Container(
      constraints: const BoxConstraints(minWidth: 190),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        boxShadow: cqCardShadow(Colors.black),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: accent.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 17, color: accent),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 10.5, color: kCrmTextSub)),
            const SizedBox(height: 3),
            Text(
              value.isEmpty ? '—' : value,
              style: tInter(fontSize: 13.5, fontWeight: FontWeight.w800, color: valueColor ?? kCrmText),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ]),
        ),
      ]),
    );
  }
}

/// Statut → (libellé, couleur, icône) pour l'écran Détail.
///
/// Le backend n'émet aujourd'hui que BROUILLON/VALIDE (voir
/// `porPromesh.service.js`) — seuls "Brouillon" et "Terminée" sont donc
/// atteignables en pratique. Les 3 autres catégories (Soumise/En cours/
/// Refusée) sont prêtes par correspondance de sous-chaîne si le backend
/// venait à émettre d'autres statuts, sans rien inventer côté affichage
/// actuel (même principe que l'ancien `_statusInfo`, étendu).
({String label, Color color, IconData icon}) porPromeshStatusInfo(String status) {
  final s = status.toLowerCase();
  if (s.contains('valid')) {
    return (label: 'Terminée', color: kCrmSuccess, icon: Icons.check_circle_rounded);
  }
  if (s.contains('reject') || s.contains('refus')) {
    return (label: 'Refusée', color: kCrmDanger, icon: Icons.cancel_rounded);
  }
  if (s.contains('submit') || s.contains('soumis')) {
    return (label: 'Soumise', color: kCrmInfo, icon: Icons.send_rounded);
  }
  if (s.contains('cours') || s.contains('progress')) {
    return (label: 'En cours', color: kCrmWarning, icon: Icons.autorenew_rounded);
  }
  return (label: 'Brouillon', color: kCrmTextSub, icon: Icons.edit_note_rounded);
}
