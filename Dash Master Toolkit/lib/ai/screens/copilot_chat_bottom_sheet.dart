// lib/ai/screens/copilot_chat_bottom_sheet.dart
//
// La présentation MOBILE — une feuille modale draggable, quasi plein écran,
// ouverte via showModalBottomSheet depuis CopilotFab. Le
// DraggableScrollableSheet partage son ScrollController avec la liste des
// messages (voir CopilotPanelBody.chatScrollController) pour que glisser
// dans la conversation redimensionne aussi la feuille, pas seulement la
// poignée en haut.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../theme/copilot_colors.dart';
import '../widgets/copilot_glass_surface.dart';
import 'copilot_panel_body.dart';

class CopilotChatBottomSheet extends StatelessWidget {
  const CopilotChatBottomSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      expand: false,
      builder: (context, scrollController) {
        return CopilotGlassSurface(
          isDark: isDark,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          child: SafeArea(
            top: false,
            child: Column(
              children: [
                const SizedBox(height: 8),
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: CopilotColors.border(isDark), borderRadius: BorderRadius.circular(2)),
                ),
                Expanded(
                  child: CopilotPanelBody(
                    onClose: () => Navigator.of(context).pop(),
                    chatScrollController: scrollController,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
