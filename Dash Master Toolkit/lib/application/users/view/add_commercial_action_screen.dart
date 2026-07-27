import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:file_picker/file_picker.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dio/dio.dart' as dio;
import 'package:dash_master_toolkit/localization/app_localizations.dart';
class AddCommercialActionScreen extends StatefulWidget {
  final String contactId;
  final String? initialType;

  const AddCommercialActionScreen({
    super.key,
    required this.contactId,
    this.initialType,
  });

  @override
  State<AddCommercialActionScreen> createState() =>
      _AddCommercialActionScreenState();
}

class _AddCommercialActionScreenState
    extends State<AddCommercialActionScreen> {

  String type = "Visite";
  final commentaireCtrl = TextEditingController();
  DateTime? relanceDate;

  PlatformFile? selectedFile;

  @override
  void initState() {
    super.initState();
    if (widget.initialType != null) {
      type = widget.initialType!;
    }
  }

  /// PICK FILE
  Future pickFile() async {
    final result = await FilePicker.platform.pickFiles();

    if (result != null) {
      setState(() {
        selectedFile = result.files.first;
      });
    }
  }

  /// SAVE ACTION
  Future submit() async {

    try {

     final formData = dio.FormData.fromMap({
  "typeAction": type,
  "commentaire": commentaireCtrl.text.trim(),

  if (relanceDate != null)
    "dateRelance": relanceDate!.toIso8601String(),

  if (selectedFile != null)
    "file": dio.MultipartFile.fromBytes(
      selectedFile!.bytes!, // ✅ web safe
      filename: selectedFile!.name,
    ),
});

await ApiClient.instance.dio.post(
  "/commercial-contacts/${widget.contactId}/actions",
  data: formData,
);
      Get.snackbar(
        AppLocalizations.of(context).translate("Success"),
        AppLocalizations.of(context).translate("Action added"),
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      Navigator.pop(context, true);

    } catch (e) {

      Get.snackbar(
        AppLocalizations.of(context).translate("Error"),
        AppLocalizations.of(context).translate("Cannot add action"),
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  /// DATE PICKER
  Future pickDate() async {

    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 2)),
      firstDate: DateTime.now(),
      lastDate: DateTime(2100),
    );

    if (picked != null) {
      setState(() {
        relanceDate = picked;
      });
    }
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(

      appBar: AppBar(
        title: Text(AppLocalizations.of(context).translate("Add Commercial Action")),
      ),

      body: Padding(

        padding: const EdgeInsets.all(20),

        child: SingleChildScrollView(

          child: Column(

            crossAxisAlignment: CrossAxisAlignment.start,

            children: [

              /// TYPE ACTION
              DropdownButtonFormField(

                value: type,

                items: [
                  DropdownMenuItem(value: "Visite", child: Text(AppLocalizations.of(context).translate("Visite"))),
                  DropdownMenuItem(value: "Plan technique", child: Text(AppLocalizations.of(context).translate("Plan technique"))),
                  DropdownMenuItem(value: "Echantillonnage", child: Text(AppLocalizations.of(context).translate("Echantillonnage"))),
                  DropdownMenuItem(value: "Devis envoyé", child: Text(AppLocalizations.of(context).translate("Devis envoyé"))),
                  DropdownMenuItem(value: "Negociation", child: Text(AppLocalizations.of(context).translate("Negociation"))),
                  DropdownMenuItem(value: "Relance", child: Text(AppLocalizations.of(context).translate("Relance"))),
                  DropdownMenuItem(value: "Commande gagnée", child: Text(AppLocalizations.of(context).translate("Commande gagnée"))),
                  DropdownMenuItem(value: "Commande perdue", child: Text(AppLocalizations.of(context).translate("Commande perdue"))),
                ],

                onChanged: (v) {
                  setState(() => type = v.toString());
                },

                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context).translate("Action type"),
                ),
              ),

              const SizedBox(height: 20),

              /// COMMENTAIRE
              TextField(
                controller: commentaireCtrl,
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context).translate("Comment"),
                ),
              ),

              const SizedBox(height: 20),

              /// DATE RELANCE
              Row(
                children: [

                  Expanded(
                    child: Text(
                      relanceDate == null
                          ? AppLocalizations.of(context).translate("No follow-up date")
                          : relanceDate.toString().split(" ")[0],
                    ),
                  ),

                  ElevatedButton(
                    onPressed: pickDate,
                    child: Text(AppLocalizations.of(context).translate("Select date")),
                  ),
                ],
              ),

              const SizedBox(height: 20),

              /// FILE
              Row(
                children: [

                  Expanded(
                    child: Text(
                      selectedFile == null
                          ? AppLocalizations.of(context).translate("No file selected")
                          : selectedFile!.name,
                    ),
                  ),

                  ElevatedButton(
                    onPressed: pickFile,
                    child: Text(AppLocalizations.of(context).translate("Upload")),
                  ),
                ],
              ),

              const SizedBox(height: 30),

              /// SAVE
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(

                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),

                  onPressed: submit,

                  child: Text(AppLocalizations.of(context).translate("Save Action")),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}