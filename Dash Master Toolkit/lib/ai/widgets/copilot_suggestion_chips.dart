// lib/ai/widgets/copilot_suggestion_chips.dart
//
// Les actions suggérées après une réponse — un tap envoie le libellé comme
// nouveau message (voir CopilotController.sendSuggestion), jamais une
// exécution directe : le Copilot ne fait QUE proposer (voir
// models/copilot_suggestion.dart).
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/copilot_suggestion.dart';
import '../providers/copilot_controller.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

class CopilotSuggestionChips extends StatelessWidget {
  const CopilotSuggestionChips({super.key, required this.suggestions});

  final List<CopilotSuggestion> suggestions;

  @override
  Widget build(BuildContext context) {
    if (suggestions.isEmpty) return const SizedBox.shrink();
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: suggestions.map((s) {
          return Tooltip(
            message: s.reason,
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () => CopilotController.to.sendSuggestion(s),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: CopilotColors.suggestionChipBackground(isDark),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: CopilotColors.border(isDark)),
                ),
                child: Text(s.label, style: CopilotTextStyles.suggestionChip(isDark)),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
