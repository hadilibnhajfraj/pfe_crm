// lib/ai/widgets/copilot_message_bubble.dart
//
// Un message de la conversation.
//
// - Utilisateur : bulle à droite, couleur primaire, texte simple.
// - Assistant : avatar + en-tête « Copilot IA · heure », puis une carte :
//   cartes KPI (uniquement les chiffres présents dans la réponse), markdown,
//   tableaux (CopilotTableView), blocs de code (CopilotCodeBlockBuilder),
//   puis citations / confirmation / suggestions / explicabilité — chacun
//   affiché uniquement s'il existe réellement dans la réponse.
// - En attente : indicateur de phase (« Recherche dans le CRM… »…).
// - En erreur : carte d'erreur explicite + bouton « Réessayer ».
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../animations/copilot_message_reveal.dart';
import '../animations/copilot_streaming_cursor.dart';
import '../models/copilot_message.dart';
import '../providers/copilot_controller.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';
import '../utils/copilot_content_parser.dart';
import '../utils/copilot_markup_sanitizer.dart';
import 'copilot_avatar.dart';
import 'copilot_citation_card.dart';
import 'copilot_code_block.dart';
import 'copilot_explainability_panel.dart';
import 'copilot_kpi_cards.dart';
import 'copilot_loading_indicator.dart';
import 'copilot_message_actions.dart';
import 'copilot_pending_action_card.dart';
import 'copilot_suggestion_chips.dart';
import 'copilot_table_view.dart';

class CopilotMessageBubble extends StatelessWidget {
  const CopilotMessageBubble({super.key, required this.message, this.isLastAssistantMessage = false});

  final CopilotMessage message;

  /// Contrôle l'affichage du bouton "Régénérer" (uniquement sur le DERNIER
  /// message assistant, voir copilot_message_actions.dart), du bouton
  /// « Réessayer » d'une erreur et des boutons de confirmation — calculé par
  /// l'appelant (CopilotPanelBody._ChatView), qui seul connaît la position
  /// dans la liste.
  final bool isLastAssistantMessage;

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final isUser = message.isUser;

    // RepaintBoundary : isole le repaint de CHAQUE bulle — pendant le
    // streaming, seule la bulle en cours de rédaction se repeint.
    // Semantics : un lecteur d'écran distingue "vous avez dit" de "le
    // Copilot a répondu" ; `liveRegion` uniquement pendant le streaming.
    return Semantics(
      label: isUser ? 'Vous avez dit : ${message.text}' : 'Le Copilot a répondu : ${sanitizeCopilotMarkup(message.text)}',
      liveRegion: message.isStreaming,
      child: RepaintBoundary(
        child: CopilotMessageReveal(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: isUser ? _UserMessage(message: message, isDark: isDark) : _AssistantMessage(message: message, isDark: isDark, isLast: isLastAssistantMessage),
          ),
        ),
      ),
    );
  }
}

class _UserMessage extends StatelessWidget {
  const _UserMessage({required this.message, required this.isDark});

  final CopilotMessage message;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                constraints: const BoxConstraints(maxWidth: 560),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: CopilotColors.userBubble(isDark),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                    bottomLeft: Radius.circular(16),
                    bottomRight: Radius.circular(4),
                  ),
                ),
                child: Text(message.text, style: CopilotTextStyles.messageBody(isDark).copyWith(color: CopilotColors.userBubbleText(isDark))),
              ),
              CopilotMessageActions(message: message, isLastAssistantMessage: false),
              Text(DateFormat('HH:mm').format(message.createdAt), style: CopilotTextStyles.timestamp(isDark)),
            ],
          ),
        ),
      ],
    );
  }
}

class _AssistantMessage extends StatelessWidget {
  const _AssistantMessage({required this.message, required this.isDark, required this.isLast});

  final CopilotMessage message;
  final bool isDark;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final response = message.response;
    final waiting = message.isStreaming && message.text.isEmpty;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CopilotAvatar(size: 28, thinking: waiting),
        const SizedBox(width: 10),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 4, top: 2),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Copilot IA', style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 12.5, fontWeight: FontWeight.w700, color: isDark ? Colors.white : const Color(0xFF0D0D12))),
                    Text('  ·  ${DateFormat('HH:mm').format(message.createdAt)}', style: CopilotTextStyles.timestamp(isDark)),
                  ],
                ),
              ),
              Container(
                constraints: const BoxConstraints(maxWidth: 680),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: BoxDecoration(
                  color: message.isError ? CopilotColors.errorBackground(isDark) : CopilotColors.surface(isDark),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(4),
                    topRight: Radius.circular(16),
                    bottomLeft: Radius.circular(16),
                    bottomRight: Radius.circular(16),
                  ),
                  border: Border.all(color: message.isError ? CopilotColors.errorBorder(isDark) : CopilotColors.border(isDark)),
                ),
                child: waiting
                    ? Obx(() => CopilotLoadingIndicator(phase: CopilotController.to.loadingPhase.value, isDark: isDark))
                    : message.isError
                        ? _ErrorContent(message: message, isDark: isDark, canRetry: isLast && (message.response?.errorRetryable ?? true))
                        : _AssistantContent(message: message, isDark: isDark),
              ),
              if (response != null && !message.isError) ...[
                if (response.citations.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Wrap(children: response.citations.map((c) => CopilotCitationCard(citation: c)).toList()),
                  ),
                if (response.hasPendingAction) CopilotPendingActionCard(pendingAction: response.pendingAction!, isActive: isLast),
                if (response.suggestions.isNotEmpty) CopilotSuggestionChips(suggestions: response.suggestions),
                CopilotExplainabilityPanel(response: response),
              ],
              CopilotMessageActions(message: message, isLastAssistantMessage: isLast),
            ],
          ),
        ),
      ],
    );
  }
}

MarkdownBody _markdown(String data, bool isDark, TextStyle bodyStyle) {
  // Listes, barré, liens automatiques : GFM par défaut dans flutter_markdown.
  // Les BLOCS de code (```lang) passent par CopilotCodeBlockBuilder
  // (coloration + copier) ; les tableaux sont extraits en amont
  // (splitCopilotContent) et rendus par CopilotTableView.
  return MarkdownBody(
    data: data.isEmpty ? ' ' : data,
    selectable: true,
    // Sources Web de PROBAR ASSISTANT : liens http(s) ouverts dans le
    // navigateur ; tout autre schema est ignore.
    onTapLink: (text, href, title) {
      final uri = Uri.tryParse(href ?? '');
      if (uri == null || (uri.scheme != 'https' && uri.scheme != 'http')) return;
      launchUrl(uri, mode: LaunchMode.externalApplication);
    },
    builders: {'pre': CopilotCodeBlockBuilder(isDark: isDark)},
    styleSheet: MarkdownStyleSheet(
      p: bodyStyle,
      strong: bodyStyle.copyWith(fontWeight: FontWeight.w700),
      em: bodyStyle.copyWith(fontStyle: FontStyle.italic),
      h1: bodyStyle.copyWith(fontSize: 18, fontWeight: FontWeight.w800),
      h2: bodyStyle.copyWith(fontSize: 16.5, fontWeight: FontWeight.w700),
      h3: bodyStyle.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
      listBullet: bodyStyle,
      blockSpacing: 8,
      del: bodyStyle.copyWith(decoration: TextDecoration.lineThrough),
      a: bodyStyle.copyWith(color: CopilotColors.orbGradient.first, decoration: TextDecoration.underline),
      blockquote: bodyStyle.copyWith(color: CopilotColors.mutedText(isDark)),
      blockquoteDecoration: BoxDecoration(
        border: Border(left: BorderSide(color: CopilotColors.orbGradient.first.withValues(alpha: 0.5), width: 3)),
      ),
      blockquotePadding: const EdgeInsets.only(left: 10, top: 2, bottom: 2),
      horizontalRuleDecoration: BoxDecoration(border: Border(top: BorderSide(color: CopilotColors.border(isDark)))),
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
}

class _AssistantContent extends StatelessWidget {
  const _AssistantContent({required this.message, required this.isDark});

  final CopilotMessage message;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final bodyStyle = CopilotTextStyles.messageBody(isDark).copyWith(color: CopilotColors.assistantBubbleText(isDark));
    final text = sanitizeCopilotMarkup(message.text);
    final segments = splitCopilotContent(text);
    // Résumé visuel seulement une fois la réponse complète (jamais sur un
    // texte encore en cours d'arrivée).
    final kpis = message.isStreaming ? const <CopilotKpi>[] : extractCopilotKpis(text);

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (kpis.isNotEmpty) CopilotKpiCards(kpis: kpis, isDark: isDark),
        if (segments.isEmpty) _markdown(' ', isDark, bodyStyle),
        for (final segment in segments)
          switch (segment) {
            CopilotMarkdownSegment(:final markdown) => _markdown(markdown, isDark, bodyStyle),
            CopilotTableSegment(:final headers, :final rows) => CopilotTableView(headers: headers, rows: rows, isDark: isDark),
          },
      ],
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

class _ErrorContent extends StatelessWidget {
  const _ErrorContent({required this.message, required this.isDark, required this.canRetry});

  final CopilotMessage message;
  final bool isDark;
  final bool canRetry;

  @override
  Widget build(BuildContext context) {
    final errorColor = CopilotColors.errorText(isDark);
    final bodyStyle = CopilotTextStyles.messageBody(isDark).copyWith(color: CopilotColors.assistantBubbleText(isDark), fontSize: 13.5);
    final controller = CopilotController.to;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(Icons.error_outline_rounded, size: 16, color: errorColor),
            const SizedBox(width: 6),
            Text('Réponse indisponible', style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 12.5, fontWeight: FontWeight.w700, color: errorColor)),
          ],
        ),
        const SizedBox(height: 6),
        _markdown(sanitizeCopilotMarkup(message.text), isDark, bodyStyle),
        if (canRetry)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Obx(
              () => OutlinedButton.icon(
                onPressed: controller.isSending.value ? null : controller.regenerate,
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Réessayer'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: errorColor,
                  side: BorderSide(color: CopilotColors.errorBorder(isDark)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
