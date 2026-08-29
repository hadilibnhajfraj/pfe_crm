// lib/ai/widgets/copilot_voice_button.dart
//
// ARCHITECTURE UNIQUEMENT — voir services/copilot_voice_service.dart pour
// pourquoi aucune reconnaissance vocale réelle n'est câblée dans cette
// passe. Le bouton existe, réagit au tap, et explique clairement à
// l'utilisateur que la fonctionnalité arrive — jamais un bouton mort sans
// aucun retour.
import 'package:flutter/material.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../services/copilot_voice_service.dart';
import '../theme/copilot_colors.dart';

class CopilotVoiceButton extends StatelessWidget {
  const CopilotVoiceButton({super.key, this.voiceService});

  /// Injectable pour les tests — voir test/ai/widgets/copilot_voice_button_test.dart.
  final ICopilotVoiceService? voiceService;

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final service = voiceService ?? UnavailableCopilotVoiceService();

    return IconButton(
      tooltip: service.isAvailable ? 'Message vocal' : 'Message vocal (bientôt disponible)',
      icon: Icon(Icons.mic_none_rounded, color: CopilotColors.mutedText(isDark)),
      onPressed: () {
        if (service.isAvailable) {
          service.startListening(onResult: (_) {});
          return;
        }
        Fluttertoast.showToast(msg: 'La saisie vocale arrive bientôt.');
      },
    );
  }
}
