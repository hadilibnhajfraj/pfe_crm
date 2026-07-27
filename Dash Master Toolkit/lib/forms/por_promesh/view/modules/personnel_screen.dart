// lib/forms/por_promesh/view/modules/personnel_screen.dart
//
// Module Personnel — carte violette : badges utilisateurs (responsable,
// opérateur, aide opérateur, manœuvre, stagiaire). Tap = dialog d'édition
// rapide à un seul champ, jamais une grille de 8 champs visibles à la fois.

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../../controller/por_promesh_controller.dart';
import 'module_scaffold.dart';

class PersonnelScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;

  const PersonnelScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<PersonnelScreen> createState() => _PersonnelScreenState();
}

class _PersonnelScreenState extends State<PersonnelScreen> {
  late final PorPromeshController c;
  bool _loading = true;
  bool _saving = false;
  bool _nextBusy = false;

  @override
  void initState() {
    super.initState();
    // permanent: true — voir le commentaire dans rendement_screen.dart :
    // ce controller est partagé entre tous les écrans-module de la session
    // machine/poste et ne doit jamais être détruit par le dispose() d'un
    // écran particulier (course initState/dispose entre écrans successifs).
    c = Get.isRegistered<PorPromeshController>()
        ? Get.find<PorPromeshController>()
        : Get.put(PorPromeshController(), permanent: true);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await c.bootstrapWithId(widget.machine, widget.poste, widget.ficheId);
    if (!mounted) return;
    if (c.isLocked.value || c.status.value == 'submitted') {
      context.go(_fichePath);
      return;
    }
    setState(() => _loading = false);
  }

  String get _fichePath =>
      '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/dashboard';
  String get _modulesPath =>
      '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/modules?ficheId=${widget.ficheId}';

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Personnel enregistré')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editBadge(String role, TextEditingController controller) async {
    final result = await showDialog<String>(
      context: context,
      builder: (_) => _EditBadgeDialog(role: role, initialValue: controller.text),
    );
    if (result != null) setState(() => controller.text = result);
  }

  String get _backRoute => _modulesPath;

  Future<void> _saveAndNext() async {
    setState(() => _nextBusy = true);
    try {
      await c.saveDraft();
      if (!mounted) return;
      context.go(_modulesPath);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _nextBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ModuleScaffold(
      title: 'Personnel',
      icon: Icons.groups_outlined,
      color: kPersonnelColor,
      machine: widget.machine,
      poste: widget.poste,
      controller: c,
      backRoute: _backRoute,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndNext,
      nextBusy: _nextBusy,
      child: Wrap(
        spacing: 14,
        runSpacing: 14,
        children: [
          _PersonBadge(role: 'Responsable 1', controller: c.responsable1, onTap: () => _editBadge('Responsable 1', c.responsable1)),
          _PersonBadge(role: 'Responsable 2', controller: c.responsable2, onTap: () => _editBadge('Responsable 2', c.responsable2)),
          _PersonBadge(role: 'Opérateur 1', controller: c.operateur1, onTap: () => _editBadge('Opérateur 1', c.operateur1)),
          _PersonBadge(role: 'Opérateur 2', controller: c.operateur2, onTap: () => _editBadge('Opérateur 2', c.operateur2)),
          _PersonBadge(role: 'Aide Opérateur', controller: c.aideOperateur, onTap: () => _editBadge('Aide Opérateur', c.aideOperateur)),
          _PersonBadge(role: 'Manœuvre', controller: c.manoeuvre, onTap: () => _editBadge('Manœuvre', c.manoeuvre)),
          _PersonBadge(role: 'Stagiaire 1', controller: c.stagiaire1, onTap: () => _editBadge('Stagiaire 1', c.stagiaire1)),
          _PersonBadge(role: 'Stagiaire 2', controller: c.stagiaire2, onTap: () => _editBadge('Stagiaire 2', c.stagiaire2)),
        ],
      ),
    );
  }
}

class _PersonBadge extends StatelessWidget {
  final String role;
  final TextEditingController controller;
  final VoidCallback onTap;

  const _PersonBadge({required this.role, required this.controller, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final name = controller.text.trim();
        final hasName = name.isNotEmpty;
        return InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            width: 160,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: kCrmSurface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: hasName ? kPersonnelColor.withOpacity(0.4) : kCrmBorder),
            ),
            child: Column(children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: kPersonnelColor.withOpacity(0.12),
                child: Icon(Icons.person, color: kPersonnelColor, size: 26),
              ),
              const SizedBox(height: 10),
              Text(role, style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: kCrmTextSub)),
              const SizedBox(height: 4),
              Text(
                hasName ? name : 'Non assigné',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tInter(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: hasName ? kCrmText : kCrmTextSub.withOpacity(0.6),
                ),
              ),
            ]),
          ),
        );
      },
    );
  }
}

class _EditBadgeDialog extends StatefulWidget {
  final String role;
  final String initialValue;
  const _EditBadgeDialog({required this.role, required this.initialValue});

  @override
  State<_EditBadgeDialog> createState() => _EditBadgeDialogState();
}

class _EditBadgeDialogState extends State<_EditBadgeDialog> {
  late final TextEditingController _ctrl = TextEditingController(text: widget.initialValue);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.role, style: tInter(fontSize: 16, fontWeight: FontWeight.w800)),
      content: TextField(
        controller: _ctrl,
        autofocus: true,
        decoration: const InputDecoration(hintText: 'Nom complet'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Annuler')),
        IndustrialBigButton(
          label: 'Valider',
          icon: Icons.check_rounded,
          color: kPersonnelColor,
          onTap: () => Navigator.pop(context, _ctrl.text.trim()),
        ),
      ],
    );
  }
}
