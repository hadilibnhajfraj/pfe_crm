// lib/ai/widgets/copilot_glass_surface.dart
//
// Glassmorphism — un fond dépoli translucide (flou de ce qu'il y a derrière
// + une teinte semi-transparente + une bordure fine claire), l'esthétique
// "Mica"/acrylique que Microsoft Copilot utilise dans Windows/Edge pour son
// panneau. Même technique (`BackdropFilter`/`ImageFilter.blur`) déjà
// utilisée ailleurs dans l'app (voir lib/pages/auth/widgets/auth_ui_kit.dart)
// — jamais un nouveau package de flou ajouté.
import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/copilot_colors.dart';

class CopilotGlassSurface extends StatelessWidget {
  const CopilotGlassSurface({
    super.key,
    required this.isDark,
    required this.child,
    this.borderRadius,
    this.sigma = 18,
    this.opacity = 0.82,
  });

  final bool isDark;
  final Widget child;
  final BorderRadius? borderRadius;

  /// Intensité du flou — 0 désactive tout flou (voir `MediaQuery.disableAnimations`
  /// dans les écrans appelants pour le cas "réduire les animations" : le
  /// flou reste statique donc n'est PAS concerné par cette préférence,
  /// contrairement aux animations de pulsation).
  final double sigma;

  /// Opacité de la teinte de surface posée par-dessus le flou — proche de 1
  /// (peu translucide) plutôt que proche de 0, pour que le texte reste
  /// lisible quel que soit ce qu'il y a derrière (jamais un flou pur sans
  /// teinte, qui casserait le contraste).
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: borderRadius ?? BorderRadius.zero,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
        child: Container(
          decoration: BoxDecoration(
            color: CopilotColors.surface(isDark).withValues(alpha: opacity),
            borderRadius: borderRadius,
            border: Border.all(color: Colors.white.withValues(alpha: isDark ? 0.06 : 0.5), width: 1),
          ),
          child: child,
        ),
      ),
    );
  }
}
