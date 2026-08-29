// lib/ai/widgets/copilot_pending_action_card.dart
//
// Une automatisation PROPOSÉE, jamais exécutée — reflète
// CopilotResponse.pendingAction (AutomationAgent, voir
// AUTOMATION_WORKFLOWS.md côté backend : 2 tours, "confirme"/"annule" en
// langage naturel). Ce widget ne fait qu'afficher les étapes et déclencher
// l'envoi de ces deux mots — l'exécution réelle reste entièrement côté
// backend, après confirmation explicite de l'utilisateur.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/copilot_response.dart';
import '../providers/copilot_controller.dart';
import '../theme/copilot_colors.dart';

class CopilotPendingActionCard extends StatelessWidget {
  const CopilotPendingActionCard({super.key, required this.pendingAction});

  final CopilotPendingAction pendingAction;

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final controller = CopilotController.to;

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: CopilotColors.surface(isDark),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: CopilotColors.orbGradient.first.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.bolt_rounded, size: 16, color: CopilotColors.orbGradient.last),
              const SizedBox(width: 6),
              Text(
                'Action proposée',
                style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 12.5, fontWeight: FontWeight.w700, color: isDark ? Colors.white : const Color(0xFF0D0D12)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...pendingAction.steps.map(
            (step) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('•  ', style: TextStyle(color: CopilotColors.mutedText(isDark))),
                  Expanded(
                    child: Text(
                      step.reason.isNotEmpty ? step.reason : step.tool,
                      style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 12.5, color: CopilotColors.mutedText(isDark)),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextButton(
                onPressed: controller.cancelPendingAction,
                child: const Text('Annuler'),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: controller.confirmPendingAction,
                style: ElevatedButton.styleFrom(
                  backgroundColor: CopilotColors.orbGradient.first,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Confirmer'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
