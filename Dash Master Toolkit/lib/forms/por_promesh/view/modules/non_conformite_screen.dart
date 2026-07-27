// lib/forms/por_promesh/view/modules/non_conformite_screen.dart
//
// Module N/C — version opérateur simplifiée : un seul statut de conformité
// pour le poste (Conforme / Non Conforme). Les champs description / photo /
// actions correctives n'apparaissent que si "Non Conforme" est sélectionné.

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../../controller/por_promesh_controller.dart';
import '../../service/por_promesh_service.dart';
import 'module_scaffold.dart';

class NonConformiteScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;

  const NonConformiteScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<NonConformiteScreen> createState() => _NonConformiteScreenState();
}

class _NonConformiteScreenState extends State<NonConformiteScreen> {
  late final PorPromeshController c;
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Conformité enregistrée')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickPhoto() async {
    final result = await FilePicker.platform.pickFiles(withData: true, type: FileType.image);
    final file = (result == null || result.files.isEmpty) ? null : result.files.first;
    if (file == null || file.bytes == null || c.recordId == null) return;
    setState(() => _uploading = true);
    try {
      final fileUrl = await PorPromeshService.instance.uploadAttachment(
        c.recordId!,
        bytes: file.bytes!,
        filename: file.name,
      );
      c.photoNonConformite.value = fileUrl;
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur upload : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
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
      title: 'N/C',
      icon: Icons.warning_amber_rounded,
      color: kProbarColor,
      machine: widget.machine,
      poste: widget.poste,
      controller: c,
      backRoute: _backRoute,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndNext,
      nextBusy: _nextBusy,
      child: Obx(() {
        final selected = c.conformite.value;
        final isNonConforme = selected == 'non_conforme';
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Conformité', style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: _ConformiteOption(
                label: 'Conforme',
                emoji: '🟢',
                color: kCrmSuccess,
                selected: selected == 'conforme',
                onTap: () => c.conformite.value = 'conforme',
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: _ConformiteOption(
                label: 'Non Conforme',
                emoji: '🔴',
                color: kCrmDanger,
                selected: isNonConforme,
                onTap: () => c.conformite.value = 'non_conforme',
              ),
            ),
          ]),
          if (isNonConforme) ...[
            const SizedBox(height: 24),
            Text('Description de la non-conformité', style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmTextSub)),
            const SizedBox(height: 8),
            TextField(
              controller: c.descriptionNonConformite,
              maxLines: 4,
              style: tInter(fontSize: 14, color: kCrmText),
              decoration: InputDecoration(
                hintText: 'Décrire la non-conformité constatée…',
                filled: true,
                fillColor: kCrmBg,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 18),
            IndustrialBigButton(
              label: _uploading
                  ? 'Envoi…'
                  : (c.photoNonConformite.value != null ? 'Photo ajoutée ✓' : 'Ajouter photo'),
              icon: Icons.add_a_photo_outlined,
              color: kProbarColor,
              outlined: true,
              onTap: _uploading ? null : _pickPhoto,
            ),
            const SizedBox(height: 18),
            Text('Actions correctives', style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmTextSub)),
            const SizedBox(height: 8),
            TextField(
              controller: c.actionsCorrectives,
              maxLines: 4,
              style: tInter(fontSize: 14, color: kCrmText),
              decoration: InputDecoration(
                hintText: 'Décrire les actions correctives mises en place…',
                filled: true,
                fillColor: kCrmBg,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
          ],
        ]);
      }),
    );
  }
}

class _ConformiteOption extends StatelessWidget {
  final String label;
  final String emoji;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  const _ConformiteOption({
    required this.label,
    required this.emoji,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 22),
        decoration: BoxDecoration(
          color: selected ? color.withOpacity(0.12) : kCrmSurface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: selected ? color : kCrmBorder, width: selected ? 1.8 : 1),
        ),
        child: Column(children: [
          Text(emoji, style: const TextStyle(fontSize: 36)),
          const SizedBox(height: 10),
          Text(label, style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: selected ? color : kCrmText)),
        ]),
      ),
    );
  }
}
