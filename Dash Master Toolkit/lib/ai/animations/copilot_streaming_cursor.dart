// lib/ai/animations/copilot_streaming_cursor.dart
//
// Le curseur clignotant affiché à la fin du texte pendant que des chunks
// arrivent encore (voir CopilotMessage.isStreaming) — un signal visuel que
// la réponse n'est pas terminée, distinct des 3 points de
// copilot_typing_dots.dart (qui s'affichent AVANT le premier chunk, quand il
// n'y a encore aucun texte à montrer).
import 'package:flutter/material.dart';

import '../theme/copilot_colors.dart';

class CopilotStreamingCursor extends StatefulWidget {
  const CopilotStreamingCursor({super.key, this.isDark = false});

  final bool isDark;

  @override
  State<CopilotStreamingCursor> createState() => _CopilotStreamingCursorState();
}

class _CopilotStreamingCursorState extends State<CopilotStreamingCursor> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _controller,
      child: Container(
        width: 2,
        height: 14,
        margin: const EdgeInsets.only(left: 2),
        color: CopilotColors.mutedText(widget.isDark),
      ),
    );
  }
}
