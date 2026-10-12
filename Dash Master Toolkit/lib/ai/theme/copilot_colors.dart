// lib/ai/theme/copilot_colors.dart
//
// Palette du Copilot — construite SUR la palette existante
// (lib/constant/app_color.dart), jamais un nouveau jeu de couleurs
// indépendant : le gradient signature (bleu -> violet, l'esthétique
// "orbe IA" façon Microsoft Copilot) utilise `colorPrimary100`/
// `colorPortgage100`, déjà dans app_color.dart, pas des hex inventés.
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/constant/app_color.dart';

abstract class CopilotColors {
  /// Le gradient signature de l'avatar/FAB/accents "IA" — bleu vers violet,
  /// identique en clair et en sombre (un halo qui se détache toujours du
  /// fond, quel que soit le thème).
  static const List<Color> orbGradient = [
    Color(0xFF1573FE), // colorPrimary100
    Color(0xFF936DFF), // colorPortgage100
  ];

  static const LinearGradient orbLinearGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: orbGradient,
  );

  static Color surface(bool isDark) => isDark ? colorGrey800 : colorWhite;
  static Color panelBackground(bool isDark) => isDark ? colorGrey900 : colorGrey25;

  static Color userBubble(bool isDark) => isDark ? colorPrimary200 : colorPrimary100;
  static Color userBubbleText(bool isDark) => colorWhite;

  static Color assistantBubble(bool isDark) => isDark ? colorGrey700 : colorGrey50;
  static Color assistantBubbleText(bool isDark) => isDark ? colorWhite : colorGrey900;

  static Color border(bool isDark) => isDark ? colorGrey700 : colorGrey100;
  static Color mutedText(bool isDark) => isDark ? colorGrey300 : colorGrey500;

  static Color suggestionChipBackground(bool isDark) => isDark ? colorGrey700 : colorPrimary0;
  static Color suggestionChipText(bool isDark) => isDark ? colorWhite : colorPrimary300;

  static Color errorText(bool isDark) => colorError100;

  // Interface « produit » (tableaux, cartes KPI, états d'erreur/succès,
  // aperçu de fichiers) — toujours sur la palette existante.
  static Color errorBackground(bool isDark) => isDark ? colorError300 : colorError0;
  static Color errorBorder(bool isDark) => isDark ? colorError200 : colorError25;
  static Color success(bool isDark) => isDark ? colorSuccess50 : colorSuccess200;
  static Color successBackground(bool isDark) => isDark ? colorSuccess300 : colorSuccess0;
  static Color warning(bool isDark) => isDark ? colorWarning100 : colorWarning200;
  static Color tableHeader(bool isDark) => isDark ? colorGrey700 : colorPrimary0;
  static Color tableStripe(bool isDark) => isDark ? colorGrey800 : colorGrey25;
  static Color citationBackground(bool isDark) => isDark ? colorGrey700 : colorOther0;
}
