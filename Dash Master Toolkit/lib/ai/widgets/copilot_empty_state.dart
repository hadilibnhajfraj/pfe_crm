// lib/ai/widgets/copilot_empty_state.dart
//
// Affiché quand une conversation n'a encore aucun message — des questions
// de démarrage adaptées à l'écran actuellement affiché (Smart Suggestions,
// voir services/copilot_suggestion_engine.dart), jamais une liste statique
// identique quel que soit l'écran. Réagit en direct à un changement d'écran
// tant qu'aucun message n'a encore été envoyé (Obx sur
// CopilotContextController.current).
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../providers/copilot_context_controller.dart';
import '../providers/copilot_controller.dart';
import '../services/copilot_suggestion_engine.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';
import 'copilot_avatar.dart';

class CopilotEmptyState extends StatelessWidget {
  /// `context` par défaut reste le vrai singleton — seam de test (voir
  /// test/ai/widgets/copilot_empty_state_test.dart), même pattern que
  /// CopilotController(api:, socket:, context:).
  CopilotEmptyState({super.key, @visibleForTesting CopilotContextController? context}) : _context = context ?? CopilotContextController.to;

  final CopilotContextController _context;

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CopilotAvatar(size: 48),
          const SizedBox(height: 16),
          Text('Comment puis-je vous aider ?', style: CopilotTextStyles.emptyStateTitle(isDark)),
          const SizedBox(height: 6),
          Text(
            'Posez une question sur vos projets, vos ventes, vos priorités — je réponds avec vos vraies données.',
            textAlign: TextAlign.center,
            style: CopilotTextStyles.emptyStateSubtitle(isDark),
          ),
          const SizedBox(height: 20),
          Obx(() {
            final prompts = starterSuggestionsFor(_context.current.value?.screenType);
            return Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: prompts.map((prompt) {
                return InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () => CopilotController.to.send(prompt),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: CopilotColors.suggestionChipBackground(isDark),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: CopilotColors.border(isDark)),
                    ),
                    child: Text(prompt, style: CopilotTextStyles.suggestionChip(isDark)),
                  ),
                );
              }).toList(),
            );
          }),
        ],
      ),
    );
  }
}
