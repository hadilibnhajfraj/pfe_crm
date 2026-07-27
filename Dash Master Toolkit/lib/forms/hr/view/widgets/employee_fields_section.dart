// lib/forms/hr/view/widgets/employee_fields_section.dart
//
// Bloc "Mes informations" des formulaires RH — chaque champ est préreempli
// et verrouillé (lecture seule) si le profil RH le connaît déjà, sinon
// affiché comme un champ normal éditable pour que l'utilisateur puisse le
// compléter lui-même. Le formulaire ne doit jamais être masqué à cause d'un
// profil RH incomplet — seuls les champs manquants deviennent éditables.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../theme/hr_theme.dart';

class EmployeeFieldsSection extends StatelessWidget {
  final TextEditingController nom;
  final TextEditingController prenom;
  final TextEditingController matricule;
  final TextEditingController qualification;
  final TextEditingController departement;
  final TextEditingController service;
  final String? email;
  final ValueChanged<String> onFieldChanged;

  // Verrou déterminé UNE SEULE FOIS au chargement du profil (valeur déjà
  // connue ou non) — ne doit jamais être recalculé depuis le contenu actuel
  // du controller, sinon un champ se verrouillerait tout seul dès que
  // l'utilisateur commence à le compléter.
  final bool nomLocked;
  final bool prenomLocked;
  final bool matriculeLocked;
  final bool qualificationLocked;
  final bool departementLocked;
  final bool serviceLocked;

  const EmployeeFieldsSection({
    super.key,
    required this.nom,
    required this.prenom,
    required this.matricule,
    required this.qualification,
    required this.departement,
    required this.service,
    required this.email,
    required this.onFieldChanged,
    required this.nomLocked,
    required this.prenomLocked,
    required this.matriculeLocked,
    required this.qualificationLocked,
    required this.departementLocked,
    required this.serviceLocked,
  });

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 700;

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
          Expanded(
            child: Text(AppLocalizations.of(context).translate('Mes informations'), style: tInter(fontSize: 15, fontWeight: FontWeight.w900, color: kCrmText)),
          ),
        ]),
        const SizedBox(height: 4),
        Text(AppLocalizations.of(context).translate('Les champs déjà connus sont verrouillés — complétez uniquement ceux qui sont vides.'),
            style: tInter(fontSize: 11.5, color: kCrmTextSub)),
        const SizedBox(height: 8),
        crmTwoCols(
          isMobile: isMobile,
          left: _field(context, 'Nom', nom, nomLocked),
          right: _field(context, 'Prénom', prenom, prenomLocked),
        ),
        crmTwoCols(
          isMobile: isMobile,
          left: _field(context, 'Matricule', matricule, matriculeLocked),
          right: _field(context, 'Qualification', qualification, qualificationLocked),
        ),
        crmTwoCols(
          isMobile: isMobile,
          left: _field(context, 'Département', departement, departementLocked),
          right: _field(context, 'Service', service, serviceLocked),
        ),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.email_outlined, size: 15, color: kCrmTextSub),
          const SizedBox(width: 6),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(AppLocalizations.of(context).translate('Email'), style: tInter(fontSize: 10, color: kCrmTextSub)),
              const SizedBox(height: 1),
              Text((email ?? '').trim().isEmpty ? '—' : email!.trim(),
                  style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText)),
            ]),
          ),
        ]),
      ]),
    );
  }

  Widget _field(BuildContext context, String label, TextEditingController controller, bool locked) {
    return CrmTextField(
      label: label,
      controller: controller,
      readOnly: locked,
      onChanged: locked ? null : onFieldChanged,
      suffixWidget: locked
          ? const Icon(Icons.lock_outline_rounded, size: 15, color: kCrmTextSub)
          : const Icon(Icons.edit_outlined, size: 15, color: kHrPending),
      validator: locked ? null : (v) => (v == null || v.trim().isEmpty) ? AppLocalizations.of(context).translate('Champ requis') : null,
    );
  }
}
