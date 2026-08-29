// lib/ai/widgets/copilot_press_scale.dart
//
// Micro-interaction — un léger retrait (scale) au tap-down, un retour
// ressort au relâchement, la texture tactile "premium" que Microsoft
// Copilot applique à ses boutons. Enveloppe purement visuelle : ne
// remplace jamais le vrai widget cliquable (IconButton/InkWell) qui reste
// responsable du `onTap` réel — voir chaque appelant.
import 'package:flutter/material.dart';

class CopilotPressScale extends StatefulWidget {
  const CopilotPressScale({
    super.key,
    required this.child,
    this.onTap,
    this.scale = 0.92,
  });

  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<CopilotPressScale> createState() => _CopilotPressScaleState();
}

class _CopilotPressScaleState extends State<CopilotPressScale> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    // `MediaQuery.disableAnimations` (préférence système "réduire les
    // animations") : le tap reste immédiat, sans transition de scale — même
    // discipline que CopilotPulseGlow.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onTap,
      onTapDown: (_) => _setPressed(true),
      onTapCancel: () => _setPressed(false),
      onTapUp: (_) => _setPressed(false),
      child: AnimatedScale(
        scale: _pressed && !reduceMotion ? widget.scale : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
