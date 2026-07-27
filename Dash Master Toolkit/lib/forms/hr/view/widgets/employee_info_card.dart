// lib/forms/hr/view/widgets/employee_info_card.dart
//
// Bloc "Informations employé" en lecture seule — utilisé par les deux
// formulaires (congé / sortie) et l'écran Détail. Jamais de champ
// modifiable : ces données viennent du profil RH (auto-remplies).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../theme/hr_theme.dart';

class EmployeeInfoCard extends StatelessWidget {
  final String? nom;
  final String? prenom;
  final String? matricule;
  final String? qualification;
  final String? departement;
  final String? service;
  final String? email;

  const EmployeeInfoCard({
    super.key,
    required this.nom,
    required this.prenom,
    required this.matricule,
    required this.qualification,
    required this.departement,
    required this.service,
    required this.email,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kHrColor.withOpacity(0.25)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: kHrColor.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.badge_outlined, color: kHrColor, size: 20),
          ),
          const SizedBox(width: 10),
          Text(AppLocalizations.of(context).translate('Mes informations'), style: tInter(fontSize: 15, fontWeight: FontWeight.w900, color: kCrmText)),
        ]),
        const SizedBox(height: 14),
        Wrap(spacing: 18, runSpacing: 12, children: [
          _tile(context, Icons.person_outline_rounded, 'Nom', nom),
          _tile(context, Icons.person_outline_rounded, 'Prénom', prenom),
          _tile(context, Icons.badge_outlined, 'Matricule', matricule),
          _tile(context, Icons.school_outlined, 'Qualification', qualification),
          _tile(context, Icons.apartment_outlined, 'Département', departement),
          _tile(context, Icons.groups_outlined, 'Service', service),
          _tile(context, Icons.email_outlined, 'Email', email),
        ]),
      ]),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String label, String? value) {
    return SizedBox(
      width: 190,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 15, color: kCrmTextSub),
        const SizedBox(width: 6),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 10, color: kCrmTextSub)),
            const SizedBox(height: 1),
            Text((value ?? '').trim().isEmpty ? '—' : value!.trim(),
                style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText),
                overflow: TextOverflow.ellipsis),
          ]),
        ),
      ]),
    );
  }
}
