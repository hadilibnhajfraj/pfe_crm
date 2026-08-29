// lib/ai/widgets/copilot_ai_card.dart
//
// "AI Card" — le style de carte de base du Dashboard AI (voir
// screens/copilot_dashboard_view.dart) : un compteur ou un score, avec une
// icône dans un halo coloré. Réutilisé pour les 4 compteurs "Aujourd'hui"
// et la carte "Qualité CRM" — jamais un widget distinct par compteur, une
// seule forme visuelle pour rester cohérent.
import 'package:flutter/material.dart';

import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

class CopilotAiCard extends StatelessWidget {
  const CopilotAiCard({
    super.key,
    required this.isDark,
    required this.icon,
    required this.label,
    required this.value,
    this.accentColor,
    this.onTap,
  });

  final bool isDark;
  final IconData icon;
  final String label;

  /// Texte déjà formaté par l'appelant (ex. "5", "96 %", "—" pour une
  /// donnée indisponible) — cette carte ne fait aucune interprétation du
  /// contenu.
  final String value;
  final Color? accentColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = accentColor ?? CopilotColors.orbGradient.first;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: CopilotColors.surface(isDark),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: CopilotColors.border(isDark)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(height: 10),
            Text(value, style: CopilotTextStyles.panelTitle(isDark).copyWith(fontSize: 20)),
            const SizedBox(height: 2),
            Text(label, style: CopilotTextStyles.emptyStateSubtitle(isDark), maxLines: 2, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}
