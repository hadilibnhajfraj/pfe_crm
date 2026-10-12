// lib/ai/widgets/copilot_kpi_cards.dart
//
// Cartes KPI au-dessus d'une réponse chiffrée — uniquement les indicateurs
// DÉJÀ écrits dans la réponse (voir extractCopilotKpis) : aucune valeur
// recalculée, estimée ou complétée côté client. Le texte complet reste
// affiché en dessous ; les cartes n'en sont qu'un résumé visuel.
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/theme/styles.dart';

import '../theme/copilot_colors.dart';
import '../utils/copilot_content_parser.dart';

class CopilotKpiCards extends StatelessWidget {
  const CopilotKpiCards({super.key, required this.kpis, required this.isDark});

  final List<CopilotKpi> kpis;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    if (kpis.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: kpis.map((kpi) => _KpiCard(kpi: kpi, isDark: isDark)).toList(),
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.kpi, required this.isDark});

  final CopilotKpi kpi;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 120, maxWidth: 190),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: CopilotColors.surface(isDark),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: CopilotColors.border(isDark)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              if (kpi.emoji != null) ...[
                Text(kpi.emoji!, style: const TextStyle(fontSize: 13)),
                const SizedBox(width: 5),
              ],
              Flexible(
                child: Text(
                  kpi.label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 11.5, color: CopilotColors.mutedText(isDark)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ShaderMask(
            shaderCallback: (bounds) => CopilotColors.orbLinearGradient.createShader(bounds),
            child: Text(
              kpi.value,
              style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 19, fontWeight: FontWeight.w800, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
