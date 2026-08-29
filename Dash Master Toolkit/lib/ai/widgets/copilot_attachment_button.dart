// lib/ai/widgets/copilot_attachment_button.dart
//
// ARCHITECTURE partiellement réelle — voir services/copilot_attachment_service.dart :
// la sélection locale d'un fichier fonctionne vraiment (file_picker), son
// envoi au backend non (aucun endpoint). Le fichier choisi est ajouté à
// CopilotController.attachments pour être visible dans la barre de saisie
// (voir copilot_input_bar.dart), puis silencieusement vidé à l'envoi du
// message suivant plutôt que d'être réellement transmis.
import 'package:flutter/material.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../providers/copilot_controller.dart';
import '../services/copilot_attachment_service.dart';
import '../theme/copilot_colors.dart';

class CopilotAttachmentButton extends StatelessWidget {
  const CopilotAttachmentButton({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;

    return IconButton(
      tooltip: 'Joindre un fichier',
      icon: Icon(Icons.attach_file_rounded, color: CopilotColors.mutedText(isDark)),
      onPressed: () async {
        final attachment = await CopilotAttachmentService.instance.pickFile();
        if (attachment == null) return;
        CopilotController.to.addAttachment(attachment);
        Fluttertoast.showToast(msg: "${attachment.fileName} sera joint à titre indicatif — l'envoi de fichiers au Copilot n'est pas encore pris en charge.");
      },
    );
  }
}
