// lib/ai/widgets/copilot_proactive_alert_card.dart
//
// Une alerte "Proactive AI" reçue en direct (voir
// providers/proactive_alerts_controller.dart) — toujours une explication ET
// une suggestion, jamais juste un titre. Quand `alert.workflow` existe, un
// vrai bouton "Confirmer"/"Écarter" — TOUTE action nécessite une validation
// explicite de l'utilisateur, jamais rien exécuté automatiquement (voir
// PROACTIVE_AI.md).
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../models/proactive_alert.dart';
import '../providers/proactive_alerts_controller.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

Color _severityColor(String severity) {
  switch (severity) {
    case 'critique':
    case 'alerte':
      return const Color(0xFFEF4444);
    case 'elevee':
    case 'risque':
      return const Color(0xFFF97316);
    case 'anomalie':
      return const Color(0xFF8B5CF6);
    default:
      return const Color(0xFF64748B);
  }
}

String _severityLabel(String severity) {
  switch (severity) {
    case 'critique':
      return 'Critique';
    case 'elevee':
      return 'Élevée';
    case 'alerte':
      return 'Alerte';
    case 'risque':
      return 'Risque';
    case 'anomalie':
      return 'Anomalie';
    default:
      return severity;
  }
}

class CopilotProactiveAlertCard extends StatelessWidget {
  const CopilotProactiveAlertCard({super.key, required this.alert, required this.isDark});

  final ProactiveAlert alert;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final color = _severityColor(alert.severity);
    final controller = ProactiveAlertsController.to;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: CopilotColors.surface(isDark),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.sensors_rounded, size: 16, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(alert.subject, style: CopilotTextStyles.messageBody(isDark).copyWith(fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                child: Text(_severityLabel(alert.severity), style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: color)),
              ),
            ],
          ),
          if (alert.explanation.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(alert.explanation, style: CopilotTextStyles.messageBody(isDark).copyWith(fontSize: 13)),
          ],
          if (alert.suggestion.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(alert.suggestion, style: CopilotTextStyles.emptyStateSubtitle(isDark)),
          ],
          const SizedBox(height: 8),
          if (alert.workflow != null)
            Obx(() {
              final workflow = alert.workflow!;
              final busy = controller.isProcessing(workflow);
              return Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy ? null : () => controller.rejectWorkflow(alert),
                      child: const Text('Écarter'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: busy ? null : () => controller.confirmWorkflow(alert),
                      child: busy
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text('Confirmer : ${workflow.label}'),
                    ),
                  ),
                ],
              );
            })
          else
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: () => controller.dismiss(alert), child: const Text('Fermer')),
            ),
        ],
      ),
    );
  }
}
