import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:url_launcher/url_launcher.dart';

import '../../services/devis_api.dart';
import '../../providers/api_client.dart';

class DevisFormSection extends StatefulWidget {
  final String projectId;
  final bool isEdit;

  /// Callback to ProjectFormScreen to fill the fiscal ID (matricule)
  final void Function(String fiscalId)? onMatriculeSaved;

  /// Callback to notify if Devis section is considered "valid"
  /// (here: at least 1 existing uploaded devis file)
  final void Function(bool isValid)? onDevisValidityChanged;
final VoidCallback? onUploaded;
  const DevisFormSection({
    super.key,
    required this.projectId,
    required this.isEdit,
    this.onMatriculeSaved,
    this.onDevisValidityChanged,
    this.onUploaded, // ✅ NEW
  });

  @override
  State<DevisFormSection> createState() => _DevisFormSectionState();
}

class _DevisFormSectionState extends State<DevisFormSection> {
  final _nameCtrl = TextEditingController();

  bool _loading = true;
  bool _saving = false;

  String? _existingFiscalId;

  // Dropdown section state
  bool _devisOpen = false;

  List<Map<String, dynamic>> _devisList = [];
  Map<String, dynamic>? _selectedDevis;

  // Multi files
  final List<Uint8List> _filesBytes = [];
  final List<String> _filesNames = [];

  @override
  void initState() {
    super.initState();
    _loadDevis();
  }
bool _isValidMatricule(String v) {
  final value = v.trim();

  // Format: digits/LETTER/LETTER/LETTER/0/0/0
  // Example: 1234567/A/B/C/0/0/0
  final reg = RegExp(r'^\d+\/[A-Za-z]\/[A-Za-z]\/[A-Za-z]\/0\/0\/0$');

  return reg.hasMatch(value);
}
  Future<void> _loadDevis() async {
    setState(() => _loading = true);
    try {
      final list = await DevisApi.instance.listDevis(projectId: widget.projectId);
      final project = await DevisApi.instance.getProject(projectId: widget.projectId);

      setState(() {
        _devisList = list;
        _selectedDevis = list.isNotEmpty ? list.first : null;

        _existingFiscalId = (project["matriculeFiscale"] ?? "").toString().trim();

        // Prefill devis name if exists
        if (_selectedDevis != null) {
          _nameCtrl.text = (_selectedDevis?["nomDevis"] ?? "").toString();
        }
      });

      // Notify parent if Devis is valid (at least one uploaded file exists)
      widget.onDevisValidityChanged?.call(list.isNotEmpty);
    } catch (_) {
      // ignore
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickFiles() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ["pdf", "png", "jpg", "jpeg"],
      withData: true,
      allowMultiple: true,
    );

    if (res == null || res.files.isEmpty) return;

    _filesBytes.clear();
    _filesNames.clear();

    for (final f in res.files) {
      if (f.bytes == null) continue;
      _filesBytes.add(f.bytes!);
      _filesNames.add(f.name);
    }

    if (_filesBytes.isEmpty) return;
    setState(() {});
  }

  Future<void> _submit() async {
    final devisName = _nameCtrl.text.trim();
    if (devisName.isEmpty) {
      _toast("Validation", "Devis name is required.");
      return;
    }

    if (_filesBytes.isEmpty || _filesNames.isEmpty) {
      _toast("Validation", "Please select at least 1 file (PDF/PNG/JPG).");
      return;
    }

    // Fiscal ID must exist BEFORE upload
    final alreadyHasFiscalId = (_existingFiscalId ?? "").isNotEmpty;

    final fiscalId = await _askFiscalIdRequired(
      initial: _existingFiscalId ?? "",
      readOnly: alreadyHasFiscalId,
    );

    if (fiscalId == null || fiscalId.trim().isEmpty) {
      _toast("Validation", "Fiscal ID is required.");
      return; // stop: no upload
    }
if (!_isValidMatricule(fiscalId.trim())) {
  _toast("Validation", "Matricule fiscal invalide. Exemple: 1234567/A/B/C/0/0/0");
  return;
}
    setState(() => _saving = true);
    try {
      // Save fiscal ID only if not already set
      if (!alreadyHasFiscalId) {
        await DevisApi.instance.updateMatricule(
          projectId: widget.projectId,
          matriculeFiscale: fiscalId.trim(),
        );
        _existingFiscalId = fiscalId.trim();
        widget.onMatriculeSaved?.call(fiscalId.trim());
      }

      // Upload devis only if fiscal ID OK
      await DevisApi.instance.uploadDevis(
        projectId: widget.projectId,
        nomDevis: devisName,
        filesBytes: _filesBytes,
        filenames: _filesNames,
      );
      widget.onUploaded?.call();

      _toast("Success", "Fiscal ID saved ✅ + Devis uploaded ✅");

      _filesBytes.clear();
      _filesNames.clear();

      await _loadDevis();
      setState(() {});
    } catch (e) {
      _toast("Error", e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

Future<String?> _askFiscalIdRequired({
  required String initial,
  required bool readOnly,
}) async {
  final ctrl = TextEditingController(text: initial);
  String? errorText;

  return showDialog<String?>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setStateDialog) {
        void validateNow() {
          if (readOnly) return;
          final v = ctrl.text.trim();
          if (v.isEmpty) {
            setStateDialog(() => errorText = "Matricule fiscal obligatoire.");
            return;
          }
          if (!_isValidMatricule(v)) {
            setStateDialog(() => errorText =
                "Format invalide. Exemple: 1234567/A/B/C/0/0/0");
            return;
          }
          setStateDialog(() => errorText = null);
        }

        return AlertDialog(
          title: const Text("Matricule fiscale"),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: ctrl,
                readOnly: readOnly,
                onChanged: (_) => validateNow(),
                decoration: InputDecoration(
                  hintText: "Ex: 1234567/A/B/C/0/0/0",
                  errorText: errorText,
                ),
              ),
              const SizedBox(height: 10),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  "Format requis: (chiffres)/A/B/C/0/0/0",
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ),
            ],
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepPurple,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                if (readOnly) {
                  // si readonly, on accepte directement (déjà validé avant)
                  Navigator.pop(ctx, ctrl.text.trim());
                  return;
                }

                final v = ctrl.text.trim();
                if (v.isEmpty || !_isValidMatricule(v)) {
                  validateNow(); // affiche l’erreur
                  return;
                }
                Navigator.pop(ctx, v);
              },
              child: const Text("Confirm"),
            ),
          ],
        );
      },
    ),
  );
}

  Future<bool?> _confirmDelete({required String filename}) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        title: const Text("Confirm deletion"),
        content: Text('Delete "$filename"?'),
        actions: [
          TextButton(
            style: TextButton.styleFrom(foregroundColor: Colors.blue),
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Delete"),
          ),
        ],
      ),
    );
  }

  Future<void> _previewFile(Map<String, dynamic> d) async {
    final url = (d["fileUrl"] ?? "").toString().trim();
    final mime = (d["mimeType"] ?? "").toString().toLowerCase();
    final name = (d["originalName"] ?? "File").toString();

    if (url.isEmpty) {
      _toast("Error", "File link not found.");
      return;
    }

    // Ensure absolute URL (if backend returns /uploads/...)
    final base = ApiClient.instance.dio.options.baseUrl.replaceAll(RegExp(r'/$'), '');
    final fullUrl = url.startsWith("http") ? url : "$base$url";

    final isImage = mime.contains("image/") ||
        url.toLowerCase().endsWith(".png") ||
        url.toLowerCase().endsWith(".jpg") ||
        url.toLowerCase().endsWith(".jpeg");

    final isPdf = mime.contains("pdf") || url.toLowerCase().endsWith(".pdf");

    if (isImage) {
      showDialog(
        context: context,
        builder: (ctx) => Dialog(
          insetPadding: const EdgeInsets.all(14),
          child: Container(
            padding: const EdgeInsets.all(12),
            constraints: const BoxConstraints(maxWidth: 900, maxHeight: 700),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: InteractiveViewer(
                    child: Image.network(fullUrl, fit: BoxFit.contain),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      return;
    }

    if (isPdf) {
      // Web + Mobile: open using url_launcher
      await _openUrl(fullUrl);
      return;
    }

    // Other file types
    await _openUrl(fullUrl);
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.parse(url);

    // Web: opens a new tab
    // Mobile: opens external browser
    final ok = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
      webOnlyWindowName: '_blank',
    );

    if (!ok) {
      _toast("Error", "Unable to open the file.");
    }
  }

  void _toast(String title, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("$title: $msg")),
    );
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(10),
        child: LinearProgressIndicator(),
      );
    }

    return Card(
      elevation: 0.6,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ✅ "Devis" dropdown tab
            InkWell(
              onTap: () => setState(() => _devisOpen = !_devisOpen),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.grey.withOpacity(0.35)),
                ),
                child: Row(
                  children: [
                    const Text(
                      "Quotation (Devis)",
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
                    AnimatedRotation(
                      turns: _devisOpen ? 0.5 : 0.0,
                      duration: const Duration(milliseconds: 180),
                      child: const Icon(Icons.keyboard_arrow_down, size: 22),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 12),

            // ✅ Expandable content
            AnimatedCrossFade(
              duration: const Duration(milliseconds: 200),
              crossFadeState: _devisOpen ? CrossFadeState.showFirst : CrossFadeState.showSecond,
              firstChild: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(labelText: "Quotation name *"),
                  ),
                  const SizedBox(height: 12),

                  // Existing files + delete action
                  if (_devisList.isNotEmpty) ...[
                    const Text("Existing files:", style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    for (final d in _devisList)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            const Icon(Icons.insert_drive_file, size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                (d["originalName"] ?? d["fileUrl"] ?? "").toString(),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),

                            // 👁️ Preview
                            IconButton(
                              tooltip: "Preview",
                              icon: const Icon(Icons.remove_red_eye_outlined, color: Colors.deepPurple),
                              onPressed: () => _previewFile(d),
                            ),

                            // 🗑 Delete
                            IconButton(
                              tooltip: "Delete",
                              icon: const Icon(Icons.delete_outline, color: Colors.red),
                              onPressed: _saving
                                  ? null
                                  : () async {
                                      final ok = await _confirmDelete(
                                        filename: (d["originalName"] ?? "this file").toString(),
                                      );
                                      if (ok != true) return;

                                      setState(() => _saving = true);
                                      try {
                                        await DevisApi.instance.deleteDevis(
                                          projectId: widget.projectId,
                                          devisId: d["id"].toString(),
                                        );
                                        _toast("Success", "File deleted ✅");
                                        await _loadDevis();
                                      } catch (e) {
                                        _toast("Error", e.toString());
                                      } finally {
                                        if (mounted) setState(() => _saving = false);
                                      }
                                    },
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 10),
                  ],

                  // Multi file picker
                  InkWell(
                    onTap: _saving ? null : _pickFiles,
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.deepPurple.withOpacity(0.35), width: 2),
                      ),
                      child: Column(
                        children: [
                          const Icon(Icons.cloud_upload_outlined, size: 44, color: Colors.deepPurple),
                          const SizedBox(height: 10),
                          Text(
                            "Select multiple files (PDF/PNG/JPG)",
                            style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.w600),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 10),
                          ElevatedButton(
                            onPressed: _saving ? null : _pickFiles,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.deepPurple,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                            ),
                            child: _saving
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                    ),
                                  )
                                : Text(_filesNames.isEmpty ? "Choose files" : "Change files"),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            _filesNames.isEmpty
                                ? "No files selected"
                                : "${_filesNames.length} file(s) selected",
                            style: TextStyle(color: Colors.grey.shade700),
                          ),
                          if (_filesNames.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            for (final name in _filesNames.take(5))
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Row(
                                  children: [
                                    const Icon(Icons.attach_file, size: 16, color: Colors.deepPurple),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(
                                        name,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(color: Colors.grey.shade700),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            if (_filesNames.length > 5)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  "+ ${_filesNames.length - 5} more file(s)",
                                  style: TextStyle(
                                    color: Colors.grey.shade600,
                                    fontStyle: FontStyle.italic,
                                  ),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 14),

                  // Publish button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.deepPurple,
                        foregroundColor: Colors.white,
                      ),
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Text("PUBLISH"),
                    ),
                  ),
                ],
              ),
              secondChild: const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }
}