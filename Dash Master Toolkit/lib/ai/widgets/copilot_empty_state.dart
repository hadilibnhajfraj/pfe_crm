// lib/ai/widgets/copilot_empty_state.dart
//
// Écran d'accueil d'une conversation vide :
// - les suggestions de prompts du Copilot (kCopilotQuickPrompts — six
//   questions vérifiées sur le backend réel, plus document et capacités) ;
// - si un écran compatible est ouvert, des questions adaptées à CET écran
//   (Smart Suggestions, services/copilot_suggestion_engine.dart), mises à
//   jour en direct tant qu'aucun message n'a été envoyé.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../providers/copilot_context_controller.dart';
import '../providers/copilot_controller.dart';
import '../services/copilot_suggestion_engine.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';
import 'copilot_attachment_button.dart';
import 'copilot_avatar.dart';

class CopilotEmptyState extends StatelessWidget {
  /// `context` par défaut reste le vrai singleton — seam de test (voir
  /// test/ai/widgets/copilot_empty_state_test.dart), même pattern que
  /// CopilotController(api:, socket:, context:).
  CopilotEmptyState({super.key, @visibleForTesting CopilotContextController? context, @visibleForTesting this.onQuickPrompt})
      : _context = context ?? CopilotContextController.to;

  final CopilotContextController _context;

  /// Seam de test : remplace l'action d'une suggestion (envoi / sélection
  /// de fichier) pour vérifier ce qui est déclenché sans réseau ni plugin.
  final void Function(CopilotQuickPrompt prompt)? onQuickPrompt;

  void _run(CopilotQuickPrompt prompt) {
    if (onQuickPrompt != null) return onQuickPrompt!(prompt);
    switch (prompt.action) {
      case CopilotQuickPromptAction.send:
        CopilotController.to.send(prompt.message);
      case CopilotQuickPromptAction.attachDocument:
        pickAndUploadCopilotDocument(suggestedPrompt: prompt.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
      child: Column(
        children: [
          const CopilotAvatar(size: 52),
          const SizedBox(height: 16),
          Text('Comment puis-je vous aider ?', style: CopilotTextStyles.emptyStateTitle(isDark)),
          const SizedBox(height: 6),
          Text(
            'Posez une question sur vos projets, vos contacts ou un document — je réponds avec vos vraies données CRM.',
            textAlign: TextAlign.center,
            style: CopilotTextStyles.emptyStateSubtitle(isDark),
          ),
          const SizedBox(height: 22),
          _SectionLabel(text: 'Suggestions', isDark: isDark),
          const SizedBox(height: 8),
          LayoutBuilder(builder: (context, constraints) {
            // Deux colonnes dès que la place le permet, une seule sur mobile.
            final twoColumns = constraints.maxWidth >= 420;
            final width = twoColumns ? (constraints.maxWidth - 8) / 2 : constraints.maxWidth;
            return Wrap(
              spacing: 8,
              runSpacing: 8,
              children: kCopilotQuickPrompts.map((p) => SizedBox(width: width, child: _QuickPromptCard(prompt: p, isDark: isDark, onTap: () => _run(p)))).toList(),
            );
          }),
          Obx(() {
            final screen = _context.current.value?.screenType;
            if (screen == null) return const SizedBox.shrink();
            final prompts = starterSuggestionsFor(screen);
            return Padding(
              padding: const EdgeInsets.only(top: 20),
              child: Column(
                children: [
                  _SectionLabel(text: 'Pour cet écran', isDark: isDark),
                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 8,
                    children: prompts.map((prompt) {
                      return Material(
                        color: CopilotColors.suggestionChipBackground(isDark),
                        shape: StadiumBorder(side: BorderSide(color: CopilotColors.border(isDark))),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () => CopilotController.to.send(prompt),
                          hoverColor: CopilotColors.orbGradient.first.withValues(alpha: 0.10),
                          focusColor: CopilotColors.orbGradient.first.withValues(alpha: 0.16),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            child: Text(prompt, style: CopilotTextStyles.suggestionChip(isDark)),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text, required this.isDark});

  final String text;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(text.toUpperCase(), style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 10.5, letterSpacing: 0.8, fontWeight: FontWeight.w700, color: CopilotColors.mutedText(isDark))),
        const SizedBox(width: 8),
        Expanded(child: Divider(color: CopilotColors.border(isDark), height: 1)),
      ],
    );
  }
}

// Carte de suggestion : états normal, survol, focus clavier et pression
// explicites. Transition de 180 ms, supprimée si l'utilisateur a demandé la
// réduction des animations (MediaQuery.disableAnimations).
class _QuickPromptCard extends StatefulWidget {
  const _QuickPromptCard({required this.prompt, required this.isDark, required this.onTap});

  final CopilotQuickPrompt prompt;
  final bool isDark;
  final VoidCallback onTap;

  @override
  State<_QuickPromptCard> createState() => _QuickPromptCardState();
}

class _QuickPromptCardState extends State<_QuickPromptCard> {
  bool _hovered = false;
  bool _focused = false;

  static IconData _iconFor(CopilotQuickPromptIcon icon) {
    switch (icon) {
      case CopilotQuickPromptIcon.projects:
        return Icons.folder_copy_outlined;
      case CopilotQuickPromptIcon.followUp:
        return Icons.notifications_active_outlined;
      case CopilotQuickPromptIcon.activity:
        return Icons.insights_outlined;
      case CopilotQuickPromptIcon.attention:
        return Icons.priority_high_rounded;
      case CopilotQuickPromptIcon.overdue:
        return Icons.schedule_outlined;
      case CopilotQuickPromptIcon.pipeline:
        return Icons.account_tree_outlined;
      case CopilotQuickPromptIcon.document:
        return Icons.description_outlined;
      case CopilotQuickPromptIcon.capabilities:
        return Icons.help_outline_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = widget.isDark;
    final accent = CopilotColors.orbGradient.first;
    final active = _hovered || _focused;
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final isAttach = widget.prompt.action == CopilotQuickPromptAction.attachDocument;

    return Semantics(
      button: true,
      label: widget.prompt.label,
      child: AnimatedContainer(
        duration: reduceMotion ? Duration.zero : const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          color: active ? accent.withValues(alpha: isDark ? 0.16 : 0.06) : CopilotColors.surface(isDark),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _focused ? accent : (_hovered ? accent.withValues(alpha: 0.55) : CopilotColors.border(isDark)), width: _focused ? 1.6 : 1),
          boxShadow: _hovered ? [BoxShadow(color: accent.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 3))] : const [],
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: widget.onTap,
            onHover: (value) => setState(() => _hovered = value),
            onFocusChange: (value) => setState(() => _focused = value),
            hoverColor: Colors.transparent,
            focusColor: Colors.transparent,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(color: accent.withValues(alpha: isDark ? 0.24 : 0.10), borderRadius: BorderRadius.circular(8)),
                    child: Icon(_iconFor(widget.prompt.icon), size: 16, color: accent),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      widget.prompt.label,
                      style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 13, height: 1.3, fontWeight: FontWeight.w600, color: isDark ? Colors.white : const Color(0xFF15161E)),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(
                    isAttach ? Icons.attach_file_rounded : Icons.arrow_forward_rounded,
                    size: 16,
                    color: active ? accent : CopilotColors.mutedText(isDark),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
