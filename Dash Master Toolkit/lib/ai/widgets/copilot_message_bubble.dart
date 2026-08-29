// lib/ai/widgets/copilot_message_bubble.dart
//
// Une bulle de conversation — utilisateur (à droite, texte simple) ou
// assistant (à gauche, avatar + markdown + citations/suggestions/action en
// attente/explicabilité, chacun affiché uniquement s'il existe réellement
// dans la réponse — jamais un panneau vide affiché par défaut).
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../animations/copilot_message_reveal.dart';
import '../animations/copilot_streaming_cursor.dart';
import '../animations/copilot_typing_dots.dart';
import '../models/copilot_message.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';
import '../utils/copilot_markup_sanitizer.dart';
import 'copilot_avatar.dart';
import 'copilot_citation_card.dart';
import 'copilot_code_block.dart';
import 'copilot_explainability_panel.dart';
import 'copilot_message_actions.dart';
import 'copilot_pending_action_card.dart';
import 'copilot_suggestion_chips.dart';

class CopilotMessageBubble extends StatelessWidget {
  const CopilotMessageBubble({super.key, required this.message, this.isLastAssistantMessage = false});

  final CopilotMessage message;

  /// Contrôle l'affichage du bouton "Régénérer" (uniquement sur le DERNIER
  /// message assistant, voir copilot_message_actions.dart) — calculé par
  /// l'appelant (CopilotPanelBody._ChatView), qui seul connaît la position
  /// dans la liste.
  final bool isLastAssistantMessage;

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final isUser = message.isUser;
    final response = message.response;
    final stillEmpty = message.isStreaming && message.text.isEmpty;

    // RepaintBoundary : isole le repaint de CHAQUE bulle — pendant le
    // streaming, seule la bulle assistant en cours de rédaction se repeint
    // à chaque chunk, jamais les bulles déjà complètes au-dessus dans la
    // liste (voir aussi la ValueKey posée par _ChatView).
    //
    // Semantics : un lecteur d'écran doit distinguer "vous avez dit" de "le
    // Copilot a répondu" — jamais juste le texte brut, sans contexte de
    // rôle. `liveRegion: true` UNIQUEMENT pendant le streaming : un lecteur
    // d'écran annonce les changements de ce nœud au fur et à mesure des
    // chunks, mais jamais pour un message déjà terminé (qui serait ré-
    // annoncé à chaque scroll sans raison).
    return Semantics(
      label: isUser ? 'Vous avez dit : ${message.text}' : 'Le Copilot a répondu : ${sanitizeCopilotMarkup(message.text)}',
      liveRegion: message.isStreaming,
      child: RepaintBoundary(
      child: CopilotMessageReveal(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isUser) ...[
                CopilotAvatar(size: 26, thinking: stillEmpty),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Column(
                  crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    Container(
                      constraints: const BoxConstraints(maxWidth: 640),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: isUser ? CopilotColors.userBubble(isDark) : CopilotColors.assistantBubble(isDark),
                        borderRadius: BorderRadius.only(
                          topLeft: const Radius.circular(16),
                          topRight: const Radius.circular(16),
                          bottomLeft: Radius.circular(isUser ? 16 : 4),
                          bottomRight: Radius.circular(isUser ? 4 : 16),
                        ),
                      ),
                      child: stillEmpty
                          ? CopilotTypingDots(isDark: isDark)
                          : _MessageContent(message: message, isUser: isUser, isDark: isDark),
                    ),
                    if (!isUser && response != null) ...[
                      if (response.citations.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Wrap(children: response.citations.map((c) => CopilotCitationCard(citation: c)).toList()),
                        ),
                      if (response.hasPendingAction) CopilotPendingActionCard(pendingAction: response.pendingAction!),
                      if (response.suggestions.isNotEmpty) CopilotSuggestionChips(suggestions: response.suggestions),
                      CopilotExplainabilityPanel(response: response),
                    ],
                    CopilotMessageActions(message: message, isLastAssistantMessage: isLastAssistantMessage),
                    const SizedBox(height: 3),
                    Text(DateFormat('HH:mm').format(message.createdAt), style: CopilotTextStyles.timestamp(isDark)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      ),
    );
  }
}

class _MessageContent extends StatelessWidget {
  const _MessageContent({required this.message, required this.isUser, required this.isDark});

  final CopilotMessage message;
  final bool isUser;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final textColor = isUser ? CopilotColors.userBubbleText(isDark) : CopilotColors.assistantBubbleText(isDark);

    final bodyStyle = CopilotTextStyles.messageBody(isDark).copyWith(color: textColor);

    // Tableaux/listes (ordonnées, non-ordonnées, cases à cocher)/barré/liens
    // automatiques fonctionnent déjà SANS configuration : flutter_markdown
    // utilise par défaut md.ExtensionSet.gitHubFlavored (vérifié contre le
    // vrai code de flutter_markdown — TableSyntax()/UnorderedListWithCheckboxSyntax()/
    // OrderedListWithCheckboxSyntax() y sont déjà). Seul le rendu des BLOCS
    // de code (```lang) est remplacé ici par CopilotCodeBlockBuilder (voir
    // copilot_code_block.dart) pour la coloration syntaxique + le bouton
    // copier — le code EN LIGNE (`x`) garde le style `code` ci-dessous.
    final content = isUser
        ? Text(message.text, style: bodyStyle)
        : MarkdownBody(
            data: message.text.isEmpty ? ' ' : sanitizeCopilotMarkup(message.text),
            selectable: true,
            builders: {'pre': CopilotCodeBlockBuilder(isDark: isDark)},
            styleSheet: MarkdownStyleSheet(
              p: bodyStyle,
              strong: bodyStyle.copyWith(fontWeight: FontWeight.w700),
              em: bodyStyle.copyWith(fontStyle: FontStyle.italic),
              listBullet: bodyStyle,
              del: bodyStyle.copyWith(decoration: TextDecoration.lineThrough),
              code: bodyStyle.copyWith(
                fontFamily: 'monospace',
                fontSize: 13,
                backgroundColor: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.06),
              ),
              tableHead: bodyStyle.copyWith(fontWeight: FontWeight.w700),
              tableBody: bodyStyle,
              tableBorder: TableBorder.all(color: CopilotColors.border(isDark), width: 1),
              tableCellsPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              tableColumnWidth: const IntrinsicColumnWidth(),
            ),
          );

    if (!message.isStreaming) return content;

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Flexible(child: content),
        CopilotStreamingCursor(isDark: isDark),
      ],
    );
  }
}
