// lib/forms/view/sections/action_section.dart
//
// Step 5 — Next action, file upload, Devis, Bon de Commande, summary.
//
// GetX rules:
//   • Obx reads c.selectedAction.value and c.fileBytes/c.fileName directly.
//   • No setState(). File state lives in the controller as Rxn.

import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/forms/controller/project_form_controller.dart';
import 'package:dash_master_toolkit/forms/view/bon_de_commande_form_section.dart';
import 'package:dash_master_toolkit/forms/view/devis_form_section.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class ActionSection extends StatelessWidget {
  final ProjectFormController c;
  final String? projectId;
  final Future<void> Function() onRefreshColors;

  const ActionSection({
    super.key,
    required this.c,
    required this.projectId,
    required this.onRefreshColors,
  });

  static const _actionLabels = <String, String>{
    'Visite'          : 'Site Visit',
    'Plan technique'  : 'Technical Plan',
    'Echantillonnage' : 'Sampling',
    'Devis envoyé'    : 'Quote Sent',
    'Negociation'     : 'Negotiation',
    'Relance'         : 'Follow-up',
    'Commande gagnée' : 'Won',
    'Commande perdue' : 'Lost',
  };

  // Aliases: API values that map to a canonical _actionLabels key
  static const _aliases = <String, String>{
    'Visite chantier'  : 'Visite',
    'Site Visit'       : 'Visite',
    'Technical Plan'   : 'Plan technique',
    'Sampling'         : 'Echantillonnage',
    'Quote Sent'       : 'Devis envoyé',
    'Devis envoye'     : 'Devis envoyé',
    'Devis Envoyé'     : 'Devis envoyé',
    'Negotiation'      : 'Negociation',
    'Follow-up'        : 'Relance',
    'Won'              : 'Commande gagnée',
    'Gagnée'           : 'Commande gagnée',
    'Gagnee'           : 'Commande gagnée',
    'Lost'             : 'Commande perdue',
    'Perdue'           : 'Commande perdue',
  };

  String? _validAction() {
    final v = c.selectedAction.value?.trim();
    if (v == null || v.isEmpty) return null;

    // 1) Exact match
    if (_actionLabels.containsKey(v)) return v;

    // 2) Alias lookup
    if (_aliases.containsKey(v)) return _aliases[v];

    // 3) Case-insensitive lookup
    final lower = v.toLowerCase();
    for (final key in _actionLabels.keys) {
      if (key.toLowerCase() == lower) return key;
    }

    debugPrint('NEXT ACTION not matched in labels: "$v"');
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── Next action dropdown ──────────────────────────────────────────
        CrmSectionTitle(
            title: AppLocalizations.of(context).translate('Next Action'), icon: Icons.send_rounded),
        const SizedBox(height: 12),
        Obx(() => DropdownButtonFormField<String>(
              value: _validAction(),
              validator: (v) =>
                  (v == null || v.isEmpty) ? AppLocalizations.of(context).translate('Next Action is required') : null,
              decoration: InputDecoration(
                  border: const OutlineInputBorder(),
                  labelText: AppLocalizations.of(context).translate('Next Action')),
              items: _actionLabels.entries
                  .map((e) => DropdownMenuItem(
                        value: e.key,
                        child: Row(children: [
                          Icon(kActionIcon(e.key),
                              size: 16, color: kActionColor(e.key)),
                          const SizedBox(width: 8),
                          Text(AppLocalizations.of(context).translate(e.value)),
                        ]),
                      ))
                  .toList(),
              onChanged: (v) => c.selectedAction.value = v,
            )),

        // ── File attachment ───────────────────────────────────────────────
        Obx(() {
          if (c.selectedAction.value == null) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(AppLocalizations.of(context).translate('Attachment (optional)'),
                      style: tInter(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: kCrmText)),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final result = await FilePicker.platform
                          .pickFiles(withData: true);
                      if (result != null) {
                        c.setFile(
                          result.files.single.bytes!,
                          result.files.single.name,
                        );
                      }
                    },
                    icon: const Icon(Icons.attach_file_rounded, size: 16),
                    // Obx reads c.fileName.value → correct.
                    label: Obx(() => Text(c.fileName.value ?? AppLocalizations.of(context).translate('Choose file'),
                        style: tInter(fontSize: 13))),
                    style: OutlinedButton.styleFrom(
                        foregroundColor: kCrmPrimary,
                        side: const BorderSide(
                            color: kCrmPrimary, width: 1.2)),
                  ),
                  // File confirmation chip
                  Obx(() {
                    if (c.fileName.value == null) {
                      return const SizedBox.shrink();
                    }
                    return Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(children: [
                        const Icon(Icons.check_circle_rounded,
                            size: 14, color: kCrmSuccess),
                        const SizedBox(width: 4),
                        Text(c.fileName.value!,
                            style: tInter(fontSize: 12, color: kCrmSuccess)),
                      ]),
                    );
                  }),
                ]),
          );
        }),

        // ── Devis + Bon de Commande (edit mode only) ──────────────────────
        if (projectId != null) ...[
          const SizedBox(height: 24),
          CrmSectionTitle(
              title: AppLocalizations.of(context).translate('Quotation'), icon: Icons.description_rounded),
          const SizedBox(height: 12),
          DevisFormSection(
            projectId: projectId!,
            isEdit: true,
            onMatriculeSaved: (m) => c.matriculeFiscale.text = m,
            onDevisValidityChanged: (ok) => c.devisIsValid.value = ok,
            onUploaded: onRefreshColors,
          ),
          const SizedBox(height: 16),
          CrmSectionTitle(
              title: AppLocalizations.of(context).translate('Purchase Order'), icon: Icons.shopping_cart_rounded),
          const SizedBox(height: 12),
          Obx(() => BonDeCommandeFormSection(
                projectId: projectId!,
                devisIsValid: c.devisIsValid.value,
                onUploaded: onRefreshColors,
              )),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => context
                .go('/forms/project-timeline?projectId=$projectId'),
            icon: const Icon(Icons.timeline_rounded, size: 16),
            label: Text(AppLocalizations.of(context).translate('View CRM Timeline'), style: tInter(fontSize: 13)),
            style: OutlinedButton.styleFrom(
                foregroundColor: kCrmPrimary,
                side: const BorderSide(color: kCrmPrimary)),
          ),
        ],

        const SizedBox(height: 32),

        // ── Summary card ──────────────────────────────────────────────────
        _SummaryCard(c: c, projectId: projectId),
      ]),
    );
  }
}

// ── Summary card ──────────────────────────────────────────────────────────────

class _SummaryCard extends StatelessWidget {
  final ProjectFormController c;
  final String? projectId;

  const _SummaryCard({required this.c, required this.projectId});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            kCrmPrimary.withOpacity(0.06),
            kCrmSecondary.withOpacity(0.04),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmPrimary.withOpacity(0.2)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.summarize_rounded, size: 16, color: kCrmPrimary),
          const SizedBox(width: 8),
          Text(AppLocalizations.of(context).translate('Summary'),
              style: tInter(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: kCrmPrimary)),
        ]),
        const SizedBox(height: 10),
        // Obx reads c.nomProjet (via controller text + projectModele.value)
        // and c.selectedAction.value directly → correct.
        Obx(() {
          final nom = c.nomProjet.text.trim();
          final type = c.projectModele.value;
          final action = c.selectedAction.value ?? '—';
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _SummaryRow(label: 'Project',
                value: nom.isEmpty ? AppLocalizations.of(context).translate('(not set)') : nom),
            _SummaryRow(label: 'Type', value: type),
            _SummaryRow(label: 'Next Action', value: action),
            if (projectId != null)
              _SummaryRow(
                  label: 'Mode', value: AppLocalizations.of(context).translate('Editing existing project')),
          ]);
        }),
      ]),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(children: [
        SizedBox(
            width: 100,
            child: Text('${AppLocalizations.of(context).translate(label)}:', style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(
            child: Text(value,
                style: tInter(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: kCrmText))),
      ]),
    );
  }
}
