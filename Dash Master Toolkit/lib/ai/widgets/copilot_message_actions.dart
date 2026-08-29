// lib/ai/widgets/copilot_message_actions.dart
//
// Les actions sous une bulle — copier (tous les messages, complets et non
// vides), régénérer (uniquement le DERNIER message assistant, jamais un
// message historique — voir CopilotController.canRegenerate) et, pour un
// rapport (`response.intent == 'reporting'`), télécharger le PDF (voir
// reportPdf.service.js côté backend — POST /ai-copilot/reports/pdf). Jamais
// affichées pendant qu'un message est encore en streaming (le texte n'est
// pas final, rien de sensé à copier/régénérer/exporter).
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:printing/printing.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/copilot_message.dart';
import '../providers/copilot_controller.dart';
import '../theme/copilot_colors.dart';

class CopilotMessageActions extends StatefulWidget {
  const CopilotMessageActions({super.key, required this.message, required this.isLastAssistantMessage});

  final CopilotMessage message;
  final bool isLastAssistantMessage;

  @override
  State<CopilotMessageActions> createState() => _CopilotMessageActionsState();
}

class _CopilotMessageActionsState extends State<CopilotMessageActions> {
  bool _exportingPdf = false;

  Future<void> _downloadReportPdf() async {
    setState(() => _exportingPdf = true);
    try {
      final bytes = await CopilotController.to.fetchReportPdfBytes(widget.message);
      await Printing.sharePdf(bytes: bytes, filename: 'rapport-copilot.pdf');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur export PDF : $e')));
    } finally {
      if (mounted) setState(() => _exportingPdf = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final message = widget.message;
    if (message.isStreaming || message.text.trim().isEmpty) return const SizedBox.shrink();
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final controller = CopilotController.to;
    final showRegenerate = !message.isUser && widget.isLastAssistantMessage && message.status != CopilotMessageStatus.error;
    final showDownloadPdf = !message.isUser && message.response?.intent == 'reporting' && message.status != CopilotMessageStatus.error;

    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ActionIcon(
            icon: Icons.copy_rounded,
            tooltip: 'Copier',
            isDark: isDark,
            onTap: () => controller.copyMessage(message),
          ),
          if (showRegenerate)
            Obx(
              () => _ActionIcon(
                icon: Icons.refresh_rounded,
                tooltip: 'Régénérer',
                isDark: isDark,
                onTap: controller.isSending.value ? null : controller.regenerate,
              ),
            ),
          if (showDownloadPdf)
            _exportingPdf
                ? Padding(
                    padding: const EdgeInsets.all(4),
                    child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: CopilotColors.mutedText(isDark))),
                  )
                : _ActionIcon(
                    icon: Icons.picture_as_pdf_rounded,
                    tooltip: 'Télécharger le rapport (PDF)',
                    isDark: isDark,
                    onTap: _downloadReportPdf,
                  ),
        ],
      ),
    );
  }
}

class _ActionIcon extends StatelessWidget {
  const _ActionIcon({required this.icon, required this.tooltip, required this.isDark, required this.onTap});

  final IconData icon;
  final String tooltip;
  final bool isDark;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Icon(icon, size: 14, color: onTap == null ? CopilotColors.border(isDark) : CopilotColors.mutedText(isDark)),
        ),
      ),
    );
  }
}
