// lib/ai/widgets/copilot_attachment_button.dart
//
// [📎 Ajouter un fichier] — Phase 2, assistant documentaire. Ouvre le
// sélecteur (PDF, DOCX, XLSX, CSV, TXT), puis confie l'envoi à
// CopilotController.uploadAttachment() : l'aperçu correspondant apparaît
// dans la barre de saisie (copilot_attachment_preview.dart) avec son état
// réel (progression / prêt / erreur). Le document ne part avec le message
// que lorsqu'il est prêt, et seulement sous forme d'identifiant.
import 'package:flutter/material.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../providers/copilot_controller.dart';
import '../services/copilot_attachment_service.dart';
import '../theme/copilot_colors.dart';

/// Sélection + envoi d'un document. `suggestedPrompt` : proposé dans le champ
/// de saisie (s'il est vide) une fois le document prêt — jamais envoyé
/// automatiquement, l'utilisateur garde la main sur sa question.
Future<void> pickAndUploadCopilotDocument({String? suggestedPrompt}) async {
  final picked = await CopilotAttachmentService.instance.pickFile();
  if (picked == null) return;
  final controller = CopilotController.to;
  final error = await controller.uploadAttachment(picked.attachment, picked.bytes);
  if (error != null) {
    Fluttertoast.showToast(msg: '${picked.attachment.fileName} : $error');
    return;
  }
  if (suggestedPrompt != null && controller.inputCtrl.text.trim().isEmpty) {
    controller.inputCtrl.text = suggestedPrompt;
  }
}

class CopilotAttachmentButton extends StatelessWidget {
  const CopilotAttachmentButton({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;

    return IconButton(
      tooltip: 'Ajouter un fichier (PDF, DOCX, XLSX, CSV, TXT — 10 Mo max.)',
      icon: Icon(Icons.attach_file_rounded, color: CopilotColors.mutedText(isDark)),
      onPressed: () => pickAndUploadCopilotDocument(),
    );
  }
}
