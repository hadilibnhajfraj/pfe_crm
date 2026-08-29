// lib/ai/widgets/copilot_input_bar.dart
//
// La barre de saisie — champ texte + pièces jointes (architecture) + bouton
// vocal (architecture) + envoi. `isSending` désactive le bouton d'envoi
// plutôt que d'empiler des messages, la même discipline que le reste de
// l'app (voir ArchiveRequestProvider.sending).
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../providers/copilot_controller.dart';
import '../theme/copilot_colors.dart';
import 'copilot_attachment_button.dart';
import 'copilot_voice_button.dart';

class CopilotInputBar extends StatelessWidget {
  const CopilotInputBar({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final controller = CopilotController.to;

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
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
                padding: const EdgeInsets.only(bottom: 6),
                child: Wrap(
                  spacing: 6,
                  children: controller.attachments
                      .map((a) => InputChip(
                            label: Text(a.fileName, overflow: TextOverflow.ellipsis),
                            avatar: const Icon(Icons.insert_drive_file_outlined, size: 16),
                            onDeleted: () => controller.removeAttachment(a.id),
                          ))
                      .toList(),
                ),
              );
            }),
            Row(
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
                      decoration: const InputDecoration(
                        hintText: 'Posez une question au Copilot…',
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(vertical: 10),
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
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(shape: BoxShape.circle, color: CopilotColors.mutedText(isDark)),
                            child: const Icon(Icons.stop_rounded, size: 16, color: Colors.white),
                          )
                        : Container(
                            padding: const EdgeInsets.all(6),
                            decoration: const BoxDecoration(shape: BoxShape.circle, gradient: CopilotColors.orbLinearGradient),
                            child: const Icon(Icons.arrow_upward_rounded, size: 16, color: Colors.white),
                          ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
