// lib/ai/animations/copilot_message_reveal.dart
//
// Fondu + léger glissement à l'apparition d'une nouvelle bulle — utilisé une
// seule fois par message (voir widgets/copilot_message_bubble.dart), pas à
// chaque chunk reçu pendant le streaming (ça déclencherait l'animation en
// boucle et donnerait un effet de scintillement, pas de révélation).
import 'package:flutter/material.dart';

class CopilotMessageReveal extends StatelessWidget {
  const CopilotMessageReveal({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, (1 - value) * 10),
            child: child,
          ),
        );
      },
      child: child,
    );
  }
}
