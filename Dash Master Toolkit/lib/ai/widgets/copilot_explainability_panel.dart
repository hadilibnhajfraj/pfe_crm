// lib/ai/widgets/copilot_explainability_panel.dart
//
// "Pourquoi cette réponse ?" — dépliable, replié par défaut (jamais imposé
// dans le fil de conversation). Reflète `explanation`/`toolCalls` de
// CopilotResponse ; n'apparaît pas du tout si les deux sont vides (jamais un
// panneau vide affiché juste pour la forme).
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/copilot_response.dart';
import '../theme/copilot_colors.dart';

class CopilotExplainabilityPanel extends StatefulWidget {
  const CopilotExplainabilityPanel({super.key, required this.response});

  final CopilotResponse response;

  @override
  State<CopilotExplainabilityPanel> createState() => _CopilotExplainabilityPanelState();
}

class _CopilotExplainabilityPanelState extends State<CopilotExplainabilityPanel> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final response = widget.response;
    final hasExplanation = (response.explanation ?? '').trim().isNotEmpty;
    final hasToolCalls = response.toolCalls.isNotEmpty;
    if (!hasExplanation && !hasToolCalls) return const SizedBox.shrink();

    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.info_outline_rounded, size: 13, color: CopilotColors.mutedText(isDark)),
                  const SizedBox(width: 4),
                  Text(
                    'Pourquoi cette réponse ?',
                    style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 11.5, fontWeight: FontWeight.w600, color: CopilotColors.mutedText(isDark)),
                  ),
                  Icon(_expanded ? Icons.expand_less : Icons.expand_more, size: 16, color: CopilotColors.mutedText(isDark)),
                ],
              ),
            ),
          ),
          if (_expanded)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: CopilotColors.panelBackground(isDark),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: CopilotColors.border(isDark)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (hasExplanation)
                    Text(
                      response.explanation!,
                      style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 12, color: CopilotColors.mutedText(isDark)),
                    ),
                  if (hasExplanation && hasToolCalls) const SizedBox(height: 8),
                  if (hasToolCalls)
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: response.toolCalls
                          .map((t) => Chip(
                                label: Text(t.tool, style: const TextStyle(fontSize: 10.5)),
                                visualDensity: VisualDensity.compact,
                                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                backgroundColor: CopilotColors.surface(isDark),
                                side: BorderSide(color: CopilotColors.border(isDark)),
                              ))
                          .toList(),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
