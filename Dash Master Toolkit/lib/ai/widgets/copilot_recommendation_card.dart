// lib/ai/widgets/copilot_recommendation_card.dart
//
// "Recommendation Card" — une action que SuggestionEngine autorise
// RÉELLEMENT l'utilisateur courant à réaliser (jamais montrée sinon, voir
// dashboardBriefing.service.js / suggestionEngine.js côté backend). Un tap
// l'envoie comme message au Copilot — même comportement que les
// suggestions post-réponse (voir CopilotController.sendSuggestion) — et
// bascule sur l'onglet conversation pour montrer la réponse.
import 'package:flutter/material.dart';

import '../models/copilot_suggestion.dart';
import '../providers/copilot_controller.dart';
import '../providers/copilot_ui_controller.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

class CopilotRecommendationCardWidget extends StatelessWidget {
  const CopilotRecommendationCardWidget({super.key, required this.suggestion, required this.isDark});

  final CopilotSuggestion suggestion;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        CopilotController.to.sendSuggestion(suggestion);
        CopilotUiController.to.showChat();
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: CopilotColors.suggestionChipBackground(isDark),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: CopilotColors.border(isDark)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 2),
              child: Icon(Icons.auto_awesome_rounded, size: 18, color: Color(0xFF936DFF)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(suggestion.label, style: CopilotTextStyles.suggestionChip(isDark)),
                  if (suggestion.reason.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(suggestion.reason, style: CopilotTextStyles.emptyStateSubtitle(isDark), maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, size: 18),
          ],
        ),
      ),
    );
  }
}
