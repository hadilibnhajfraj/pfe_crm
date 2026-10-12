// lib/ai/widgets/copilot_pending_action_card.dart
//
// Confirmation UI — une action PROPOSÉE, jamais exécutée : reflète
// CopilotResponse.pendingAction (AutomationAgent, MeetingAgent, et le plan
// multi-étapes du TaskPlannerAgent côté backend). Ce widget affiche l'objectif,
// chaque action préparée, rappelle que RIEN n'a encore été exécuté, et
// n'envoie que « confirme » / « annule » : l'exécution réelle reste
// entièrement côté backend, après confirmation explicite.
//
// Un seul clic : après « Confirmer » ou « Annuler », les deux boutons sont
// désactivés (jamais deux confirmations envoyées par un double-clic). Seule
// la proposition du DERNIER message assistant est actionnable.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/copilot_response.dart';
import '../providers/copilot_controller.dart';
import '../theme/copilot_colors.dart';

enum _Decision { none, confirmed, cancelled }

class CopilotPendingActionCard extends StatefulWidget {
  const CopilotPendingActionCard({super.key, required this.pendingAction, this.isActive = true});

  final CopilotPendingAction pendingAction;

  /// `false` pour une proposition affichée dans un message plus ancien.
  final bool isActive;

  static const int collapsedStepCount = 5;

  @override
  State<CopilotPendingActionCard> createState() => _CopilotPendingActionCardState();
}

class _CopilotPendingActionCardState extends State<CopilotPendingActionCard> {
  _Decision _decision = _Decision.none;
  bool _expanded = false;

  void _decide(_Decision decision) {
    if (_decision != _Decision.none) return;
    setState(() => _decision = decision);
    final controller = CopilotController.to;
    if (decision == _Decision.confirmed) {
      controller.confirmPendingAction();
    } else {
      controller.cancelPendingAction();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final action = widget.pendingAction;
    final steps = action.steps;
    final visible = _expanded ? steps : steps.take(CopilotPendingActionCard.collapsedStepCount).toList();
    final hidden = steps.length - visible.length;
    final strong = isDark ? Colors.white : const Color(0xFF0D0D12);
    final muted = CopilotColors.mutedText(isDark);
    TextStyle style(double size, {FontWeight weight = FontWeight.w400, Color? color}) =>
        TextStyle(fontFamily: Styles.fontFamily, fontSize: size, fontWeight: weight, color: color ?? muted);

    return Container(
      margin: const EdgeInsets.only(top: 10),
      constraints: const BoxConstraints(maxWidth: 640),
      decoration: BoxDecoration(
        color: CopilotColors.surface(isDark),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: CopilotColors.orbGradient.first.withValues(alpha: 0.35)),
        boxShadow: [BoxShadow(color: CopilotColors.orbGradient.first.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 3))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            decoration: BoxDecoration(
              color: CopilotColors.orbGradient.first.withValues(alpha: isDark ? 0.14 : 0.06),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
            ),
            child: Row(
              children: [
                Icon(Icons.verified_user_outlined, size: 18, color: CopilotColors.orbGradient.first),
                const SizedBox(width: 8),
                Expanded(child: Text('Confirmation requise', style: style(13.5, weight: FontWeight.w700, color: strong))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(gradient: CopilotColors.orbLinearGradient, borderRadius: BorderRadius.circular(20)),
                  child: Text('${steps.length} action${steps.length > 1 ? 's' : ''}', style: style(11, weight: FontWeight.w700, color: Colors.white)),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (action.goal != null && action.goal!.isNotEmpty) ...[
                  Text(action.goal!, style: style(12.5, weight: FontWeight.w600, color: strong)),
                  const SizedBox(height: 8),
                ],
                for (var i = 0; i < visible.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 20,
                          height: 20,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: CopilotColors.suggestionChipBackground(isDark), shape: BoxShape.circle),
                          child: Text('${i + 1}', style: style(10.5, weight: FontWeight.w700, color: CopilotColors.suggestionChipText(isDark))),
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: Text(visible[i].reason.isNotEmpty ? visible[i].reason : visible[i].tool, style: style(12.5, color: strong))),
                      ],
                    ),
                  ),
                if (hidden > 0 || _expanded && steps.length > CopilotPendingActionCard.collapsedStepCount)
                  TextButton(
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 28)),
                    onPressed: () => setState(() => _expanded = !_expanded),
                    child: Text(_expanded ? 'Réduire' : 'Voir les $hidden autre${hidden > 1 ? 's' : ''} action${hidden > 1 ? 's' : ''}', style: style(12, weight: FontWeight.w600, color: CopilotColors.orbGradient.first)),
                  ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.info_outline_rounded, size: 13, color: muted),
                    const SizedBox(width: 5),
                    Expanded(child: Text("Aucune action n'a encore été exécutée.", style: style(11.5))),
                  ],
                ),
                const SizedBox(height: 10),
                _footer(isDark, style),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _footer(bool isDark, TextStyle Function(double, {FontWeight weight, Color? color}) style) {
    if (_decision != _Decision.none) {
      final confirmed = _decision == _Decision.confirmed;
      return Row(
        children: [
          Icon(confirmed ? Icons.hourglass_top_rounded : Icons.block_rounded, size: 15, color: confirmed ? CopilotColors.orbGradient.first : CopilotColors.mutedText(isDark)),
          const SizedBox(width: 6),
          Text(confirmed ? 'Confirmation envoyée — exécution en cours…' : 'Annulation envoyée.', style: style(12, weight: FontWeight.w600)),
        ],
      );
    }
    if (!widget.isActive) {
      return Text('Proposition antérieure : répondez « confirme » si elle est toujours en attente.', style: style(11.5));
    }
    return Obx(() {
      final busy = CopilotController.to.isSending.value;
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          OutlinedButton.icon(
            onPressed: busy ? null : () => _decide(_Decision.cancelled),
            icon: const Icon(Icons.close_rounded, size: 16),
            label: const Text('Annuler'),
            style: OutlinedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
          ),
          ElevatedButton.icon(
            onPressed: busy ? null : () => _decide(_Decision.confirmed),
            icon: const Icon(Icons.check_rounded, size: 16),
            label: const Text('Confirmer et exécuter'),
            style: ElevatedButton.styleFrom(
              backgroundColor: CopilotColors.orbGradient.first,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ],
      );
    });
  }
}
