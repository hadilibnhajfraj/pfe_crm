// lib/ai/widgets/copilot_context_chip.dart
//
// Indicateur de transparence — affiche à l'utilisateur QUEL contexte
// d'écran le Copilot voit actuellement (voir CopilotContextController),
// pour qu'il ne se demande jamais "sait-il de quel projet je parle ?" en
// silence. Rien à afficher si aucun contexte n'est actif : ce widget
// s'efface plutôt que de laisser un espace vide.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../providers/copilot_context_controller.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

class CopilotContextChip extends StatelessWidget {
  const CopilotContextChip({super.key, required this.isDark});

  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final pageContext = CopilotContextController.to.current.value;
      if (pageContext == null) return const SizedBox.shrink();

      return Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: CopilotColors.suggestionChipBackground(isDark),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.my_location_rounded, size: 12, color: CopilotColors.suggestionChipText(isDark)),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                pageContext.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: CopilotTextStyles.suggestionChip(isDark),
              ),
            ),
          ],
        ),
      );
    });
  }
}
