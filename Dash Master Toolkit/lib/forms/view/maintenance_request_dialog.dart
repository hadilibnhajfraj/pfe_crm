// lib/forms/view/maintenance_request_dialog.dart
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/providers/maintenance_request_provider.dart';
import 'package:dash_master_toolkit/services/maintenance_request_service.dart';

const _equipements = [
  'PROMESH — Machine 1', 'PROMESH — Machine 2', 'PROMESH — Machine 3', 'PROMESH — Machine 4',
  'PROBAR — Machine 1', 'PROBAR — Machine 2', 'PROBAR — Machine 3', 'PROBAR — Machine 4',
  'Mélangeur', 'Autre équipement',
];

Future<void> showMaintenanceRequestDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (dialogContext) => const _MaintenanceRequestDialog(),
  );
}

class _MaintenanceRequestDialog extends StatefulWidget {
  const _MaintenanceRequestDialog();

  @override
  State<_MaintenanceRequestDialog> createState() => _MaintenanceRequestDialogState();
}

class _MaintenanceRequestDialogState extends State<_MaintenanceRequestDialog> {
  final _formKey = GlobalKey<FormState>();
  final _typePanne = TextEditingController();
  final _description = TextEditingController();
  String _equipement = _equipements.first;
  String _urgence = 'moyenne';
  final List<MaintenancePhotoFile> _photos = [];

  @override
  void dispose() {
    _typePanne.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickPhotos() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png'],
      withData: true,
      allowMultiple: true,
    );
    if (res == null || res.files.isEmpty) return;
    setState(() {
      for (final f in res.files) {
        if (f.bytes != null && _photos.length < 5) {
          _photos.add(MaintenancePhotoFile(bytes: f.bytes!, filename: f.name));
        }
      }
    });
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final ok = await MaintenanceRequestProvider.to.createRequest(
      equipement: _equipement,
      typePanne: _typePanne.text.trim(),
      urgence: _urgence,
      description: _description.text.trim(),
      photos: _photos,
    );
    if (ok && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Nouvelle demande de maintenance', style: tInter(fontSize: 17, fontWeight: FontWeight.w800, color: kCrmText)),
              const SizedBox(height: 20),

              Text('Équipement', style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText)),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                initialValue: _equipement,
                items: _equipements.map((e) => DropdownMenuItem(value: e, child: Text(e, style: tInter(fontSize: 13)))).toList(),
                onChanged: (v) => setState(() => _equipement = v ?? _equipement),
                decoration: InputDecoration(border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
              ),
              const SizedBox(height: 14),

              Text('Type de panne', style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText)),
              const SizedBox(height: 6),
              TextFormField(
                controller: _typePanne,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Champ obligatoire' : null,
                decoration: InputDecoration(border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10), hintText: 'Ex : bruit anormal, arrêt moteur...'),
              ),
              const SizedBox(height: 14),

              Text('Urgence', style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText)),
              const SizedBox(height: 8),
              Wrap(spacing: 10, runSpacing: 10, children: [
                _UrgenceChoice(label: 'Faible', value: 'faible', selected: _urgence, color: const Color(0xFF16A34A), onTap: (v) => setState(() => _urgence = v)),
                _UrgenceChoice(label: 'Moyenne', value: 'moyenne', selected: _urgence, color: const Color(0xFFD97706), onTap: (v) => setState(() => _urgence = v)),
                _UrgenceChoice(label: 'Critique', value: 'critique', selected: _urgence, color: const Color(0xFFB91C1C), onTap: (v) => setState(() => _urgence = v)),
              ]),
              const SizedBox(height: 14),

              Text('Description', style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText)),
              const SizedBox(height: 6),
              TextFormField(
                controller: _description,
                maxLines: 4,
                decoration: InputDecoration(border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)), hintText: 'Détaillez le problème rencontré...'),
              ),
              const SizedBox(height: 14),

              Text('Photos (facultatif, max 5)', style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                ..._photos.asMap().entries.map((e) => Chip(
                      label: Text(e.value.filename, style: tInter(fontSize: 11)),
                      onDeleted: () => setState(() => _photos.removeAt(e.key)),
                    )),
                if (_photos.length < 5)
                  ActionChip(
                    avatar: const Icon(Icons.add_photo_alternate_outlined, size: 16),
                    label: Text('Ajouter', style: tInter(fontSize: 12)),
                    onPressed: _pickPhotos,
                  ),
              ]),

              const SizedBox(height: 24),
              Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                TextButton(onPressed: () => Navigator.pop(context), child: Text('Annuler', style: tInter(color: kCrmTextSub))),
                const SizedBox(width: 8),
                Obx(() => ElevatedButton(
                      onPressed: MaintenanceRequestProvider.to.sending.value ? null : _save,
                      style: ElevatedButton.styleFrom(backgroundColor: kCrmPrimary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                      child: Text(MaintenanceRequestProvider.to.sending.value ? 'Envoi...' : 'Envoyer', style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
                    )),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

class _UrgenceChoice extends StatelessWidget {
  final String label;
  final String value;
  final String selected;
  final Color color;
  final void Function(String) onTap;

  const _UrgenceChoice({required this.label, required this.value, required this.selected, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isSel = selected == value;
    return InkWell(
      onTap: () => onTap(value),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          color: isSel ? color.withValues(alpha: 0.12) : Colors.grey.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSel ? color : Colors.grey.shade300, width: isSel ? 1.6 : 1),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.warning_amber_rounded, size: 16, color: isSel ? color : kCrmTextSub),
          const SizedBox(width: 6),
          Text(label, style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: isSel ? color : kCrmTextSub)),
        ]),
      ),
    );
  }
}
