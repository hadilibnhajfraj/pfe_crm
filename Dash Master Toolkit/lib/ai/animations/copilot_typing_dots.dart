// lib/ai/animations/copilot_typing_dots.dart
//
// Les 3 points qui rebondissent pendant que le Copilot "réfléchit" — avant
// que le premier chunk de réponse n'arrive (voir CopilotController.isTyping).
import 'package:flutter/material.dart';

import '../theme/copilot_colors.dart';

class CopilotTypingDots extends StatefulWidget {
  const CopilotTypingDots({super.key, this.isDark = false, this.dotSize = 6});

  final bool isDark;
  final double dotSize;

  @override
  State<CopilotTypingDots> createState() => _CopilotTypingDotsState();
}

class _CopilotTypingDotsState extends State<CopilotTypingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1000),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = CopilotColors.mutedText(widget.isDark);
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            final t = (_controller.value - (i * 0.2)) % 1.0;
            final bounce = (t < 0.5) ? t * 2 : (1 - t) * 2;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Transform.translate(
                offset: Offset(0, -4 * bounce),
                child: Container(
                  width: widget.dotSize,
                  height: widget.dotSize,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}
