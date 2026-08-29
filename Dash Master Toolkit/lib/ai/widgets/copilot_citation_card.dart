// lib/ai/widgets/copilot_citation_card.dart
//
// Une source documentaire citée (RAG) — voir CopilotResponse.citations.
// Affichée sous une réponse "documentation_question", jamais inventée : si
// le backend ne renvoie aucune citation, ce widget n'apparaît simplement
// pas (voir copilot_message_bubble.dart).
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/copilot_citation.dart';
import '../theme/copilot_colors.dart';

class CopilotCitationCard extends StatelessWidget {
  const CopilotCitationCard({super.key, required this.citation});

  final CopilotCitation citation;

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;

    return Container(
      constraints: const BoxConstraints(maxWidth: 240),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      margin: const EdgeInsets.only(right: 8, top: 4),
      decoration: BoxDecoration(
        color: CopilotColors.citationBackground(isDark),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: CopilotColors.border(isDark)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.description_outlined, size: 13, color: CopilotColors.mutedText(isDark)),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  citation.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: Styles.fontFamily,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.white : const Color(0xFF15161E),
                  ),
                ),
              ),
            ],
          ),
          if (citation.excerpt.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              citation.excerpt,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 11, color: CopilotColors.mutedText(isDark)),
            ),
          ],
        ],
      ),
    );
  }
}
