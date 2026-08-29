// lib/ai/animations/copilot_pulse_glow.dart
//
// Halo pulsant derrière l'avatar/le FAB — l'effet "premium" façon Copilot,
// construit avec uniquement les APIs d'animation natives de Flutter
// (AnimationController + Tween), aucun package d'animation ajouté (lottie/
// rive ne sont pas des dépendances du projet, voir l'audit de pubspec.yaml).
import 'package:flutter/material.dart';

import '../theme/copilot_colors.dart';

class CopilotPulseGlow extends StatefulWidget {
  const CopilotPulseGlow({
    super.key,
    required this.child,
    this.size = 56,
    this.active = true,
  });

  final Widget child;
  final double size;
  final bool active;

  @override
  State<CopilotPulseGlow> createState() => _CopilotPulseGlowState();
}

class _CopilotPulseGlowState extends State<CopilotPulseGlow> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat(reverse: true);

  late final Animation<double> _scale = Tween<double>(begin: 0.92, end: 1.12).animate(
    CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
  );
  late final Animation<double> _opacity = Tween<double>(begin: 0.35, end: 0.05).animate(
    CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Préférence système "réduire les animations" (accessibilité) : un halo
    // qui pulse en continu est exactement le genre de mouvement que cette
    // préférence demande de supprimer — jamais ignorée pour un simple
    // effet décoratif.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return SizedBox(
      width: widget.size * 1.6,
      height: widget.size * 1.6,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (widget.active && !reduceMotion)
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) => Opacity(
                opacity: _opacity.value,
                child: Transform.scale(
                  scale: _scale.value,
                  child: Container(
                    width: widget.size * 1.5,
                    height: widget.size * 1.5,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: CopilotColors.orbLinearGradient,
                    ),
                  ),
                ),
              ),
            ),
          widget.child,
        ],
      ),
    );
  }
}
