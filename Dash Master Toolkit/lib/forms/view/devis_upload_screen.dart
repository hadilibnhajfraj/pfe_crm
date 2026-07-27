import 'dart:typed_data';
import 'package:dotted_border/dotted_border.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../services/devis_api.dart';

class DevisUploadScreen extends StatefulWidget {
  final String projectId;
  final bool isEdit;
  final void Function(String matricule)? onMatriculeSaved;
 const DevisUploadScreen({
  super.key,
  required this.projectId,
  this.isEdit = false,
  this.onMatriculeSaved,
});

 @override
  State<DevisUploadScreen> createState() => _DevisUploadScreenState();
}

class _DevisUploadScreenState extends State<DevisUploadScreen> {
  final devisNameCtrl = TextEditingController();

  bool uploading = false;
  bool loading = true;
  String? fileName;
  Uint8List? fileBytes;
final List<Uint8List> filesBytes = [];
final List<String> filenames = [];



  Map<String, dynamic>? project;
  Map<String, dynamic>? devis; // devis existant

  @override
  void initState() {
    super.initState();
    _loadData();
  }

Future<void> _loadData() async {
  setState(() => loading = true);
  try {
    // ✅ 1) Charger Project (même source que ProjectFormScreen)
    final p = await DevisApi.instance.getProject(projectId: widget.projectId);

    // ✅ 2) Extraire devis/fichier depuis le project (selon ton backend)
    // on cherche dans plusieurs clés possibles
    final dynamic maybeDevis =
        p["devis"] ??
        p["devisInfo"] ??
        p["devis_file"] ??
        p["devisFile"] ??
        p["document"] ??
        p["documents"];

    Map<String, dynamic>? d;
    if (maybeDevis is Map) {
      d = Map<String, dynamic>.from(maybeDevis);
    } else if (maybeDevis is List && maybeDevis.isNotEmpty) {
      // si backend renvoie une liste de docs
      final first = maybeDevis.first;
      if (first is Map) d = Map<String, dynamic>.from(first);
    }

    // ✅ 3) Si edit : pré-remplir le nom et le fichier affiché
    if (widget.isEdit && d != null) {
      final existingName = (d["devisName"] ?? d["name"] ?? d["title"] ?? "").toString();
      if (existingName.trim().isNotEmpty) devisNameCtrl.text = existingName;

      final existingFileName = (d["file_name"] ?? d["filename"] ?? d["fileName"] ?? d["file"] ?? d["path"]);
      if (existingFileName != null && existingFileName.toString().trim().isNotEmpty) {
        fileName = existingFileName.toString();
      }
    }

    setState(() {
      project = (p is Map<String, dynamic>) ? p : {"raw": p};
      devis = d; // ✅ maintenant Project card aura le fichier
    });
  } catch (e) {
    Get.snackbar("Erreur", e.toString());
  } finally {
    if (mounted) setState(() => loading = false);
  }
}

 Future<void> pickFile() async {
  final res = await FilePicker.platform.pickFiles(
    allowMultiple: true, // ✅ multi
    type: FileType.custom,
    allowedExtensions: ["pdf", "png", "jpg", "jpeg"],
    withData: true,
  );
  if (res == null || res.files.isEmpty) return;

  final newBytes = <Uint8List>[];
  final newNames = <String>[];

  for (final f in res.files) {
    if (f.bytes == null) continue;
    newBytes.add(f.bytes!);
    newNames.add(f.name);
  }

  if (newBytes.isEmpty) {
    Get.snackbar("Erreur", "Aucun fichier lisible");
    return;
  }

  setState(() {
    filesBytes
      ..clear()
      ..addAll(newBytes);
    filenames
      ..clear()
      ..addAll(newNames);
  });
}

 Future<void> submit() async {
  final nomDevis = devisNameCtrl.text.trim();
  if (nomDevis.isEmpty) {
    Get.snackbar("Validation", "Nom du devis est obligatoire");
    return;
  }

  if (!widget.isEdit && filesBytes.isEmpty) {
    Get.snackbar("Validation", "Choisis au moins 1 fichier (PDF/PNG/JPG)");
    return;
  }

  setState(() => uploading = true);
  try {
    if (widget.isEdit) {
      final devisId = (devis?["id"] ?? "").toString();
      if (devisId.isEmpty) {
        Get.snackbar("Erreur", "devisId introuvable (backend doit retourner la liste devis)");
        return;
      }

      // update: si l’utilisateur a choisi plusieurs fichiers -> on prend le 1er pour remplacer
      await DevisApi.instance.updateDevis(
        projectId: widget.projectId,
        devisId: devisId,
        nomDevis: nomDevis,
        bytes: filesBytes.isNotEmpty ? filesBytes.first : null,
        filename: filenames.isNotEmpty ? filenames.first : null,
      );

      Get.snackbar("Succès", "Devis mis à jour ✅");
      Get.back(result: true);
      return;
    }

    // ✅ Popup matricule obligatoire AVANT validation finale
    final matricule = await _askMatricule();
    if (matricule == null || matricule.trim().isEmpty) {
      Get.snackbar("Validation", "Matricule fiscale obligatoire pour publier");
      return;
    }

    // 1) upload multi
    await DevisApi.instance.uploadDevisMany(
      projectId: widget.projectId,
      nomDevis: nomDevis,
      filesBytes: filesBytes,
      filenames: filenames,
    );

    // 2) save matricule in project
    await DevisApi.instance.updateMatricule(
      projectId: widget.projectId,
      matriculeFiscale: matricule.trim(),
    );

    // 3) callback vers ProjectFormScreen
    widget.onMatriculeSaved?.call(matricule.trim());

    Get.snackbar("Succès", "Devis publié ✅ + Matricule enregistré ✅");
    Get.back(result: true);
  } catch (e) {
    Get.snackbar("Erreur", e.toString());
  } finally {
    if (mounted) setState(() => uploading = false);
  }
}

  Future<String?> _askMatricule() async {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: const Text("Matricule fiscale"),
        content: TextField(
          controller: c,
          decoration: const InputDecoration(hintText: "Ex: 1234567/A/B/C"),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, null),
            child: const Text("Ignorer"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, c.text),
            child: const Text("Enregistrer"),
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(width: 110, child: Text(k, style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(child: Text(v)),
        ],
      ),
    );
  }

Widget _projectCard() {
  final p = project ?? {};
  final title = (p["nomProjet"] ?? p["name"] ?? "Projet").toString();

  // ✅ ICI EXACTEMENT (avant le return)
  final d = devis ?? {};
  final existingFile =
      (d["file_name"] ?? d["filename"] ?? d["fileName"] ?? d["file"] ?? d["path"])
          ?.toString();

  return Card(
    elevation: 0.5,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("Project", style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),

          _kv("ID", widget.projectId),
          _kv("Nom", title),

          // ✅ ET CETTE LIGNE ICI (dans children)
          _kv(
            "Devis (fichier)",
            (existingFile != null && existingFile.trim().isNotEmpty) ? existingFile : "-",
          ),
        ],
      ),
    ),
  );
}

  Widget _uploadBoxStyle() {
    // fichier existant (si edit)
    final d = devis ?? {};
    final existingFile = (d["file_name"] ?? d["filename"] ?? d["fileName"])?.toString();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // si edit et aucun nouveau fichier choisi => afficher ancien
        if (widget.isEdit &&
            (existingFile ?? "").trim().isNotEmpty &&
            fileBytes == null) ...[
          Row(
            children: [
              const Icon(Icons.insert_drive_file_outlined, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  "Fichier actuel : $existingFile",
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
        ],

        DottedBorder(
          color: const Color(0xFFD6B7FF),
          dashPattern: const [6, 4],
          strokeWidth: 2,
          borderType: BorderType.RRect,
          radius: const Radius.circular(16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: const [
                    Icon(Icons.folder_zip_outlined, size: 34, color: Color(0xFFB7B7B7)),
                    SizedBox(width: 18),
                    SizedBox(height: 28, child: VerticalDivider(thickness: 1, color: Color(0xFFE0E0E0))),
                    SizedBox(width: 18),
                    Icon(Icons.insert_drive_file_outlined, size: 34, color: Color(0xFFB7B7B7)),
                  ],
                ),
                const SizedBox(height: 14),
                const Text(
                  "Drag & drop zip or\nsingle file here",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFFB7B7B7),
                    fontSize: 14,
                    height: 1.35,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 16),

                // Upload file
                SizedBox(
                  height: 44,
                  child: ElevatedButton(
                    onPressed: uploading ? null : pickFile,
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 26),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                      backgroundColor: const Color(0xFF6A5CFF),
                      foregroundColor: Colors.white,
                      elevation: 0,
                    ),
                    child: const Text("Upload file", style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
                const SizedBox(height: 10),

                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text("or use an ", style: TextStyle(color: Color(0xFF9E9E9E), fontSize: 12)),
                    InkWell(
                      onTap: () {},
                      child: const Text(
                        "example",
                        style: TextStyle(
                          color: Color(0xFF6A5CFF),
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                Text(
                   filenames.isEmpty ? "Aucun fichier" : "${filenames.length} fichier(s) : ${filenames.take(2).join(", ")}${filenames.length > 2 ? "..." : ""}",
  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFF616161),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _devisCard() {
    return Card(
      elevation: 0.5,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Devis", style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),

            TextField(
              controller: devisNameCtrl,
              decoration: const InputDecoration(labelText: "Nom du devis *"),
            ),
            const SizedBox(height: 14),

            _uploadBoxStyle(),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    devisNameCtrl.dispose();
    super.dispose();
  }

  @override
Widget build(BuildContext context) {
  final title = widget.isEdit ? "Edit Devis" : "Uploader Devis";

  return Scaffold(
    appBar: AppBar(title: Text(title)),

    // ✅ Bouton collé en bas (plus d'overflow)
    bottomNavigationBar: Padding(
      padding: const EdgeInsets.all(16),
      child: SizedBox(
        width: double.infinity,
        height: 52,
        child: ElevatedButton(
          onPressed: uploading ? null : submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF1677FF),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: Text(
            uploading ? "PUBLISH..." : "PUBLISH",
            style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.6),
          ),
        ),
      ),
    ),

    body: loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _projectCard(),
              const SizedBox(height: 12),
              _devisCard(),
              const SizedBox(height: 16), // espace pour respirer
            ],
          ),
  );
}
}