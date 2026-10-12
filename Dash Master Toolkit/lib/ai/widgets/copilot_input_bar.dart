// lib/ai/widgets/copilot_input_bar.dart
//
// La barre de saisie (« composer ») — aperçus des fichiers joints (Phase 2,
// copilot_attachment_preview.dart) au-dessus d'un champ arrondi qui regroupe
// pièce jointe, texte, voix et envoi. `isSending` remplace le bouton d'envoi
// par « Stop » plutôt que d'empiler des messages, la même discipline que le
// reste de l'app (voir ArchiveRequestProvider.sending).
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../providers/copilot_controller.dart';
import '../theme/copilot_colors.dart';
import 'copilot_attachment_button.dart';
import 'copilot_attachment_preview.dart';
import 'copilot_voice_button.dart';

class CopilotInputBar extends StatelessWidget {
  const CopilotInputBar({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final controller = CopilotController.to;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: CopilotColors.surface(isDark),
        border: Border(top: BorderSide(color: CopilotColors.border(isDark))),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Obx(() {
              if (controller.attachments.isEmpty) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: controller.attachments
                      .map((a) => CopilotAttachmentPreview(attachment: a, isDark: isDark, onRemove: () => controller.removeAttachment(a.id)))
                      .toList(),
                ),
              );
            }),
            Container(
              padding: const EdgeInsets.fromLTRB(2, 2, 4, 2),
              decoration: BoxDecoration(
                color: CopilotColors.panelBackground(isDark),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: CopilotColors.border(isDark)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const CopilotAttachmentButton(),
                  Expanded(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 120),
                      child: TextField(
                        controller: controller.inputCtrl,
                        minLines: 1,
                        maxLines: 5,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => controller.send(),
                        style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 14),
                        decoration: const InputDecoration(
                          hintText: 'Posez une question au Copilot…',
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ),
                  const CopilotVoiceButton(),
                  // Pendant une génération : bouton "Stop" à la place du
                  // bouton d'envoi (voir CopilotController.stopGenerating) —
                  // jamais les deux affichés en même temps, jamais un simple
                  // indicateur de chargement sans action possible.
                  Obx(
                    () => IconButton(
                      tooltip: controller.isSending.value ? 'Arrêter la génération' : 'Envoyer',
                      onPressed: controller.isSending.value ? controller.stopGenerating : () => controller.send(),
                      icon: controller.isSending.value
                          ? Container(
                              padding: const EdgeInsets.all(7),
                              decoration: BoxDecoration(shape: BoxShape.circle, color: CopilotColors.mutedText(isDark)),
                              child: const Icon(Icons.stop_rounded, size: 16, color: Colors.white),
                            )
                          : Container(
                              padding: const EdgeInsets.all(7),
                              decoration: const BoxDecoration(shape: BoxShape.circle, gradient: CopilotColors.orbLinearGradient),
                              child: const Icon(Icons.arrow_upward_rounded, size: 16, color: Colors.white),
                            ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 4),
              child: Text(
                'Le Copilot répond avec vos données CRM, dans la limite de vos droits. Vérifiez les informations importantes.',
                style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 10.5, color: CopilotColors.mutedText(isDark)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
