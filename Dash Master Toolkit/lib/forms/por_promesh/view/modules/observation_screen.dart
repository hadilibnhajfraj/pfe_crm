// lib/forms/por_promesh/view/modules/observation_screen.dart
//
// Module Observation — carte verte : zone commentaire (observationsGenerales)
// + photos / pièces jointes, upload réel via file_picker → endpoint existant
// POST /por-promesh/:id/attachments.

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../../controller/por_promesh_controller.dart';
import '../../service/por_promesh_service.dart';
import 'module_scaffold.dart';

const _imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

class ObservationScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;

  const ObservationScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ObservationScreen> createState() => _ObservationScreenState();
}

class _ObservationScreenState extends State<ObservationScreen> {
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Observation enregistrée')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickAndUpload() async {
    final result = await FilePicker.platform.pickFiles(withData: true);
    final file = (result == null || result.files.isEmpty) ? null : result.files.first;
    if (file == null || file.bytes == null) return;

    setState(() => _uploading = true);
    try {
      final fileUrl = await PorPromeshService.instance.uploadAttachment(
        c.recordId!,
        bytes: file.bytes!,
        filename: file.name,
      );
      c.attachments.add({'fileName': file.name, 'fileUrl': fileUrl, 'createdAt': DateTime.now().toIso8601String()});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Fichier ajouté')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur upload : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  bool _isImage(String fileUrl) => _imageExtensions.any((ext) => fileUrl.toLowerCase().endsWith(ext));

  String _fullUrl(String fileUrl) => '${ApiClient.instance.dio.options.baseUrl}$fileUrl';

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
      title: 'Observation',
      icon: Icons.chat_bubble_outline_rounded,
      color: kMelangeColor,
      machine: widget.machine,
      poste: widget.poste,
      controller: c,
      backRoute: _backRoute,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndNext,
      nextBusy: _nextBusy,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: kCrmSurface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: kCrmBorder),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Zone commentaire', style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmTextSub)),
            const SizedBox(height: 8),
            TextField(
              controller: c.observationsGenerales,
              maxLines: 5,
              style: tInter(fontSize: 14, color: kCrmText),
              decoration: InputDecoration(
                hintText: 'Écrire un commentaire sur ce poste…',
                filled: true,
                fillColor: kCrmBg,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 20),
        Row(children: [
          Expanded(
            child: Text('Photos & pièces jointes', style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
          ),
          IndustrialBigButton(
            label: _uploading ? 'Envoi…' : 'Ajouter',
            icon: Icons.add_a_photo_outlined,
            color: kMelangeColor,
            onTap: _uploading ? null : _pickAndUpload,
          ),
        ]),
        const SizedBox(height: 14),
        Obx(() {
          if (c.attachments.isEmpty) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Text('Aucune pièce jointe pour le moment', style: tInter(fontSize: 13, color: kCrmTextSub)),
            );
          }
          return Wrap(
            spacing: 12,
            runSpacing: 12,
            children: c.attachments.map((a) {
              final fileUrl = (a['fileUrl'] ?? '').toString();
              final fileName = (a['fileName'] ?? '').toString();
              return Container(
                width: 120,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: kCrmSurface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: kCrmBorder),
                ),
                child: Column(children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: _isImage(fileUrl)
                        ? Image.network(_fullUrl(fileUrl), height: 70, width: 100, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined, size: 40))
                        : Container(
                            height: 70,
                            width: 100,
                            color: kCrmBg,
                            child: const Icon(Icons.insert_drive_file_outlined, size: 32, color: kCrmTextSub),
                          ),
                  ),
                  const SizedBox(height: 6),
                  Text(fileName, maxLines: 1, overflow: TextOverflow.ellipsis, style: tInter(fontSize: 10, color: kCrmTextSub)),
                ]),
              );
            }).toList(),
          );
        }),
      ]),
    );
  }
}
