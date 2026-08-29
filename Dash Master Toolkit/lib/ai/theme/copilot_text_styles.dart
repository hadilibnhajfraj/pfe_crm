// lib/ai/theme/copilot_text_styles.dart
//
// Styles de texte du Copilot — même police bundlée que tout le reste de
// l'app (`Styles.fontFamily` = InterTight, voir lib/theme/styles.dart) ;
// jamais GoogleFonts en runtime (désactivé explicitement dans main.dart
// pour la compatibilité web).
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'copilot_colors.dart';

abstract class CopilotTextStyles {
  static TextStyle messageBody(bool isDark) => TextStyle(
        fontFamily: Styles.fontFamily,
        fontSize: 14.5,
        height: 1.45,
        color: isDark ? Colors.white : const Color(0xFF15161E),
      );

  static TextStyle timestamp(bool isDark) => TextStyle(
        fontFamily: Styles.fontFamily,
        fontSize: 11,
        color: CopilotColors.mutedText(isDark),
      );

  static TextStyle panelTitle(bool isDark) => TextStyle(
        fontFamily: Styles.fontFamily,
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: isDark ? Colors.white : const Color(0xFF0D0D12),
      );

  static TextStyle suggestionChip(bool isDark) => TextStyle(
        fontFamily: Styles.fontFamily,
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
        color: CopilotColors.suggestionChipText(isDark),
      );

  static TextStyle emptyStateTitle(bool isDark) => TextStyle(
        fontFamily: Styles.fontFamily,
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: isDark ? Colors.white : const Color(0xFF0D0D12),
      );

  static TextStyle emptyStateSubtitle(bool isDark) => TextStyle(
        fontFamily: Styles.fontFamily,
        fontSize: 13,
        color: CopilotColors.mutedText(isDark),
      );
}
