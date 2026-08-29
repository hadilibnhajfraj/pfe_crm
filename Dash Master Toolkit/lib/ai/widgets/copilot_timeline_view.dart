// lib/ai/widgets/copilot_timeline_view.dart
//
// "Timeline" — les mêmes éléments déjà comptés dans les AI Cards/Risk Cards
// (projets critiques, devis expirants, interventions urgentes, relances),
// regroupés par échéance (Aujourd'hui / Cette semaine / Plus tard) plutôt
// que par catégorie — voir dashboardBriefing.service.js::buildTimeline pour
// pourquoi les cartes de risque n'ont pas de date unique et sont donc
// toujours classées "Aujourd'hui".
import 'package:flutter/material.dart';

import '../models/copilot_dashboard_briefing.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

const List<String> _bucketOrder = ['today', 'week', 'later'];
const Map<String, String> _bucketLabels = {'today': "Aujourd'hui", 'week': 'Cette semaine', 'later': 'Plus tard'};

IconData _iconForType(String type) {
  switch (type) {
    case 'project':
      return Icons.warning_amber_rounded;
    case 'quote':
      return Icons.description_outlined;
    case 'intervention':
      return Icons.build_circle_outlined;
    case 'relance':
      return Icons.call_outlined;
    default:
      return Icons.circle_outlined;
  }
}

class CopilotTimelineView extends StatelessWidget {
  const CopilotTimelineView({super.key, required this.items, required this.isDark});

  final List<CopilotTimelineItem> items;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Text('Aucune échéance à venir.', style: CopilotTextStyles.emptyStateSubtitle(isDark));
    }

    final grouped = <String, List<CopilotTimelineItem>>{};
    for (final item in items) {
      grouped.putIfAbsent(item.bucket, () => []).add(item);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final bucket in _bucketOrder)
          if (grouped[bucket] != null) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 6, top: 4),
              child: Text(
                _bucketLabels[bucket] ?? bucket,
                style: CopilotTextStyles.suggestionChip(isDark).copyWith(color: CopilotColors.mutedText(isDark)),
              ),
            ),
            for (final item in grouped[bucket]!)
              Padding(
                padding: const EdgeInsets.only(bottom: 8, left: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(_iconForType(item.type), size: 16, color: CopilotColors.mutedText(isDark)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(item.label, style: CopilotTextStyles.messageBody(isDark).copyWith(fontSize: 13))),
                  ],
                ),
              ),
          ],
      ],
    );
  }
}
