// lib/ai/widgets/copilot_loading_indicator.dart
//
// « Loading intelligent » — affiché dans la bulle assistant tant qu'aucun
// texte n'est arrivé : la phase en cours (« Recherche dans le CRM… »,
// « Analyse du document… », « Préparation de l'action… », voir
// utils/copilot_loading_phase.dart), les points animés existants
// (CopilotTypingDots), puis — si la réponse tarde — un message honnête
// plutôt qu'une attente muette.
import 'dart:async';

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/theme/styles.dart';

import '../animations/copilot_typing_dots.dart';
import '../theme/copilot_colors.dart';
import '../utils/copilot_loading_phase.dart';

class CopilotLoadingIndicator extends StatefulWidget {
  const CopilotLoadingIndicator({super.key, required this.phase, required this.isDark, this.slowAfter = const Duration(seconds: 12)});

  final CopilotLoadingPhase phase;
  final bool isDark;
  final Duration slowAfter;

  @override
  State<CopilotLoadingIndicator> createState() => _CopilotLoadingIndicatorState();
}

class _CopilotLoadingIndicatorState extends State<CopilotLoadingIndicator> {
  Timer? _slowTimer;
  bool _slow = false;

  @override
  void initState() {
    super.initState();
    _slowTimer = Timer(widget.slowAfter, () {
      if (mounted) setState(() => _slow = true);
    });
  }

  @override
  void dispose() {
    _slowTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final muted = CopilotColors.mutedText(widget.isDark);
    return Semantics(
      liveRegion: true,
      label: widget.phase.label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(widget.phase.icon, size: 15, color: CopilotColors.orbGradient.first),
              const SizedBox(width: 6),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                child: Text(
                  widget.phase.label,
                  key: ValueKey(widget.phase),
                  style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 13, fontWeight: FontWeight.w600, color: muted),
                ),
              ),
              const SizedBox(width: 8),
              CopilotTypingDots(isDark: widget.isDark),
            ],
          ),
          if (_slow)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                "Cela prend un peu plus de temps que d'habitude… vous pouvez arrêter la génération à tout moment.",
                style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 11.5, color: muted),
              ),
            ),
        ],
      ),
    );
  }
}
