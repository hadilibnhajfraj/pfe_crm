// lib/ai/widgets/copilot_risk_card.dart
//
// "Risk Card" — un projet classé "critique" par ProjectAttentionAnalyzer
// (voir riskCards dans dashboardBriefing.service.js) : jamais un nom seul,
// toujours accompagné de la vraie raison qui l'a déclenché (topReason, ex.
// "Relance en retard de 12 jour(s)") — jamais une raison générique inventée
// côté client.
import 'package:flutter/material.dart';

import '../models/copilot_dashboard_briefing.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

Color copilotPriorityColor(String priority) {
  switch (priority) {
    case 'critique':
      return const Color(0xFFEF4444);
    case 'elevee':
      return const Color(0xFFF97316);
    case 'moyenne':
      return const Color(0xFFF59E0B);
    default:
      return const Color(0xFF64748B);
  }
}

String copilotPriorityLabel(String priority) {
  switch (priority) {
    case 'critique':
      return 'Critique';
    case 'elevee':
      return 'Élevée';
    case 'moyenne':
      return 'Moyenne';
    default:
      return 'Faible';
  }
}

class CopilotRiskCardWidget extends StatelessWidget {
  const CopilotRiskCardWidget({super.key, required this.card, required this.isDark});

  final CopilotRiskCard card;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final color = copilotPriorityColor(card.priority);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: CopilotColors.surface(isDark),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: CopilotColors.border(isDark)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(width: 4, height: 40, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4))),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        card.projectName,
                        style: CopilotTextStyles.messageBody(isDark).copyWith(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                      child: Text(
                        copilotPriorityLabel(card.priority),
                        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: color),
                      ),
                    ),
                  ],
                ),
                if (card.topReason != null) ...[
                  const SizedBox(height: 4),
                  Text(card.topReason!, style: CopilotTextStyles.emptyStateSubtitle(isDark), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
