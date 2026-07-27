// lib/forms/industrial/view/probar/probar_module_scaffold.dart
//
// Coquille partagée par tous les écrans-module PROBAR — identique au
// ModuleScaffold PROMESH mais utilise ProbarController. Header coloré +
// retour + chips Machine/Poste/Date/Heure/Opérateur + boutons fixes en bas
// (Précédent / Enregistrer / Suivant).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/industrial_context_header.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/widgets/shimmer_box.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';

class ProbarModuleScaffold extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final String machine;
  final String poste;
  final String backRoute;
  final bool loading;
  final bool saving;
  final VoidCallback onSave;
  final Widget child;
  final ProbarController controller;
  final VoidCallback onNext;
  final String nextLabel;
  final IconData nextIcon;
  final Color? nextColor;
  final bool nextBusy;
  final bool nextEnabled;
  final String? previousRoute;
  final String previousLabel;

  const ProbarModuleScaffold({
    super.key,
    required this.title,
    required this.icon,
    required this.color,
    required this.machine,
    required this.poste,
    required this.backRoute,
    required this.loading,
    required this.saving,
    required this.onSave,
    required this.onNext,
    required this.child,
    required this.controller,
    this.nextLabel = 'Suivant',
    this.nextIcon = Icons.arrow_forward_rounded,
    this.nextColor,
    this.nextBusy = false,
    this.nextEnabled = true,
    this.previousRoute,
    this.previousLabel = 'Précédent',
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: ProbarModuleHeaderSection(
                title: title,
                icon: icon,
                color: color,
                machine: machine,
                poste: poste,
                backRoute: backRoute,
                loading: loading,
                controller: controller,
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: loading ? const ModuleContentSkeleton() : child,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Row(children: [
                if (previousRoute != null) ...[
                  Expanded(
                    child: IndustrialBigButton(
                      label: AppLocalizations.of(context).translate(previousLabel),
                      icon: Icons.arrow_back_rounded,
                      color: kCrmTextSub,
                      outlined: true,
                      onTap: (loading || saving || nextBusy) ? null : () => context.go(previousRoute!),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: IndustrialBigButton(
                    label: AppLocalizations.of(context).translate(saving ? 'Enregistrement…' : 'Enregistrer'),
                    icon: Icons.save_outlined,
                    color: color,
                    outlined: true,
                    onTap: (loading || saving || nextBusy) ? null : onSave,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: IndustrialBigButton(
                    label: AppLocalizations.of(context).translate(nextBusy ? 'Enregistrement…' : nextLabel),
                    icon: nextIcon,
                    color: nextColor ?? color,
                    onTap: (loading || saving || nextBusy || !nextEnabled) ? null : onNext,
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class ProbarModuleHeaderSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final String machine;
  final String poste;
  final String backRoute;
  final bool loading;
  final ProbarController controller;

  const ProbarModuleHeaderSection({
    super.key,
    required this.title,
    required this.icon,
    required this.color,
    required this.machine,
    required this.poste,
    required this.backRoute,
    required this.loading,
    required this.controller,
  });

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        InkWell(
          onTap: () => context.go(backRoute),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
          ),
        ),
        const SizedBox(width: 12),
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: color, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(AppLocalizations.of(context).translate(title), style: tInter(fontSize: 18, fontWeight: FontWeight.w900, color: kCrmText)),
        ),
      ]),
      const SizedBox(height: 14),
      IndustrialContextHeader(machine: machine, poste: poste, color: color, lineLabel: 'PROBAR'),
      if (!loading) ...[
        const SizedBox(height: 12),
        ProbarFicheInfoRow(controller: controller, color: color),
      ],
    ]);
  }
}

class ProbarFicheInfoRow extends StatelessWidget {
  final ProbarController controller;
  final Color color;

  const ProbarFicheInfoRow({super.key, required this.controller, required this.color});

  Future<void> _pickAndSave(BuildContext context, Future<void> Function() pick) async {
    await pick();
    try {
      await controller.saveDraft();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  Future<void> _editOperateur(BuildContext context) async {
    final ctrl = TextEditingController(text: controller.operateur.text);
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(AppLocalizations.of(dialogContext).translate('Opérateur'), style: tInter(fontSize: 16, fontWeight: FontWeight.w800)),
        content: SizedBox(
          width: 320,
          child: TextField(
              controller: ctrl,
              autofocus: true,
              decoration: InputDecoration(hintText: AppLocalizations.of(dialogContext).translate("Nom de l'opérateur"))),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(AppLocalizations.of(dialogContext).translate('Annuler')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(ctrl.text.trim()),
            child: Text(AppLocalizations.of(dialogContext).translate('Valider')),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (result == null || result.isEmpty) return;
    controller.operateur.text = result;
  }

  Widget _editableChip(BuildContext context, IconData icon, Listenable listenable, String Function() text, VoidCallback onTap) {
    return AnimatedBuilder(
      animation: listenable,
      builder: (context, _) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: _chip(icon, text(), editable: true),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 14, runSpacing: 8, children: [
      _editableChip(context, Icons.event_outlined, controller.dateProduction, () => controller.dateProduction.text,
          () => _pickAndSave(context, () => controller.pickDateProduction(context))),
      _editableChip(context, Icons.schedule_outlined, controller.heureDebut, () => controller.heureDebut.text,
          () => _pickAndSave(context, () => controller.pickHeureDebut(context))),
      _editableChip(context, Icons.update_rounded, controller.heureFin, () => controller.heureFin.text,
          () => _pickAndSave(context, () => controller.pickHeureFin(context))),
      _editableChip(context, Icons.person_outline_rounded, controller.operateur, () => controller.operateur.text,
          () => _pickAndSave(context, () => _editOperateur(context))),
    ]);
  }

  Widget _chip(IconData icon, String label, {bool editable = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
        border: editable ? Border.all(color: color.withOpacity(0.4)) : null,
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 5),
        Text(label.isEmpty ? '-' : label, style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
        if (editable) ...[
          const SizedBox(width: 3),
          Icon(Icons.edit_outlined, size: 11, color: color),
        ],
      ]),
    );
  }
}
