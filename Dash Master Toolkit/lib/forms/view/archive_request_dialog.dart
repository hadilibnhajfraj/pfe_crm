// lib/forms/view/archive_request_dialog.dart
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/providers/archive_request_provider.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

/// Shows the "Demande d'archivage" / "Demande de désarchivage" dialog for the
/// given project. [type] is 'ARCHIVAGE' or 'DESARCHIVAGE' (défaut, compat).
Future<void> showArchiveRequestDialog(
  BuildContext context, {
  required String projectId,
  required String projectName,
  String type = 'DESARCHIVAGE',
}) {
  return showDialog(
    context: context,
    barrierDismissible: false,
    builder: (_) => _ArchiveRequestDialog(
      projectId: projectId,
      projectName: projectName,
      type: type,
    ),
  );
}

class _ArchiveRequestDialog extends StatefulWidget {
  final String projectId;
  final String projectName;
  final String type;
  const _ArchiveRequestDialog({
    required this.projectId,
    required this.projectName,
    this.type = 'DESARCHIVAGE',
  });

  @override
  State<_ArchiveRequestDialog> createState() => _ArchiveRequestDialogState();
}

class _ArchiveRequestDialogState extends State<_ArchiveRequestDialog> {
  final _ctrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _sending = false;

  bool get _isArchivage => widget.type == 'ARCHIVAGE';
  String get _label => _isArchivage ? 'archivage' : 'désarchivage';
  String get _verb => _isArchivage ? 'archiver' : 'désarchiver';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final isValid = _formKey.currentState?.validate() ?? false;
    if (!isValid) return;
    setState(() => _sending = true);

    final provider = ArchiveRequestProvider.to;
    final ok = await provider.createRequest(
      projectId:   widget.projectId,
      projectName: widget.projectName,
      message:     _ctrl.text.trim(),
      type:        widget.type,
    );
    if (mounted) {
      Navigator.pop(context);
      if (ok) {
        // snackbar is shown inside the provider
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      backgroundColor: Colors.white,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Header ─────────────────────────────────────────────────────
            Container(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
              decoration: BoxDecoration(
                color: const Color(0xFFF8F9FA),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(20)),
                border:
                    Border(bottom: BorderSide(color: Colors.grey.shade200)),
              ),
              child: Row(children: [
                Container(
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                    color: kCrmPrimary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.forum_outlined,
                      size: 20, color: kCrmPrimary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Demande de $_label',
                            style: tInter(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: kCrmText)),
                        const SizedBox(height: 2),
                        Text(
                          widget.projectName,
                          style: tInter(fontSize: 12, color: kCrmTextSub),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ]),
                ),
              ]),
            ),

            // ── Body ───────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Info rows
                      _infoRow('Projet',  widget.projectName),
                      const SizedBox(height: 8),
                      _infoRow('Envoyer à', 'Administrateur CRM'),
                      const SizedBox(height: 8),
                      _infoRow('Objet', 'Demande de $_label'),
                      const SizedBox(height: 20),

                      // Reason field
                      Text(
                        'Pourquoi souhaitez-vous $_verb ce projet ?',
                        style: tInter(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: kCrmText),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _ctrl,
                        maxLines: 5,
                        minLines: 4,
                        decoration: InputDecoration(
                          hintText:
                              'Expliquez la raison de votre demande...',
                          hintStyle:
                              tInter(fontSize: 13, color: kCrmTextSub),
                          filled: true,
                          fillColor: const Color(0xFFF8F9FA),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide:
                                BorderSide(color: Colors.grey.shade200),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide:
                                BorderSide(color: Colors.grey.shade200),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                                color: kCrmPrimary, width: 1.5),
                          ),
                          errorBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide:
                                BorderSide(color: kCrmDanger),
                          ),
                          contentPadding: const EdgeInsets.all(14),
                        ),
                        style: tInter(fontSize: 13, color: kCrmText),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'Ce champ est obligatoire'
                            : null,
                      ),
                    ]),
              ),
            ),

            // ── Actions ────────────────────────────────────────────────────
            Divider(height: 1, color: Colors.grey.shade200),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed:
                        _sending ? null : () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: kCrmTextSub,
                      side: BorderSide(color: Colors.grey.shade300),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      padding:
                          const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text('Annuler',
                        style: tInter(
                            fontWeight: FontWeight.w600, fontSize: 13)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white))
                        : const Icon(Icons.send_rounded,
                            size: 16, color: Colors.white),
                    label: Text(
                      _sending ? 'Envoi...' : 'Envoyer',
                      style: tInter(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 13),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: kCrmPrimary,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      padding:
                          const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(
        width: 90,
        child: Text(label,
            style: tInter(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: kCrmTextSub)),
      ),
      Text(':  ', style: tInter(fontSize: 12, color: kCrmTextSub)),
      Expanded(
        child: Text(value,
            style: tInter(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: kCrmText)),
      ),
    ]);
  }
}
