// lib/ai/widgets/copilot_avatar.dart
//
// L'avatar du Copilot — un orbe en gradient (voir CopilotColors.orbGradient),
// avec un halo pulsant optionnel pendant qu'il "réfléchit". Utilisé dans le
// FAB, l'en-tête du panneau, et à côté de chaque bulle assistant.
import 'package:flutter/material.dart';

import '../animations/copilot_pulse_glow.dart';
import '../theme/copilot_colors.dart';

class CopilotAvatar extends StatelessWidget {
  const CopilotAvatar({super.key, this.size = 32, this.thinking = false});

  final double size;
  final bool thinking;

  @override
  Widget build(BuildContext context) {
    final orb = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: CopilotColors.orbLinearGradient,
        boxShadow: [
          BoxShadow(
            color: CopilotColors.orbGradient.first.withValues(alpha: 0.35),
            blurRadius: 10,
            spreadRadius: 1,
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Icon(Icons.auto_awesome_rounded, color: Colors.white, size: size * 0.5),
    );

    if (!thinking) return orb;
    return CopilotPulseGlow(size: size, child: orb);
  }
}
