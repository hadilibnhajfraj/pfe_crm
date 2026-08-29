// lib/ai/widgets/copilot_dashboard_chart.dart
//
// "Charts" — un graphique en barres des 4 mêmes compteurs déjà affichés en
// AI Cards (voir dashboardBriefing.service.js::chart) — aucune nouvelle
// donnée, juste une deuxième lecture visuelle. Utilise fl_chart, déjà la
// bibliothèque dominante de l'app pour ce genre de graphique compact (voir
// lib/dashboard/academic/widgets/bar_chart.dart::MiniBarChart) — jamais
// Syncfusion, à peine utilisé pour des graphiques ailleurs dans ce projet.
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../models/copilot_dashboard_briefing.dart';
import '../theme/copilot_colors.dart';

// Les libellés backend ("Projets critiques", "Interventions urgentes"...)
// sont trop longs pour tenir sous une barre de 22px — abrégés ici pour
// l'axe uniquement, jamais dans les données elles-mêmes (les AI Cards
// au-dessus du graphique affichent déjà le libellé complet).
const Map<String, String> _shortChartLabels = {
  'Projets critiques': 'Critiques',
  'Devis expirants': 'Devis',
  'Interventions urgentes': 'Interv.',
  'Clients à relancer': 'Relances',
};

String _shortLabel(String label) => _shortChartLabels[label] ?? (label.length > 9 ? '${label.substring(0, 8)}…' : label);

class CopilotDashboardChart extends StatelessWidget {
  const CopilotDashboardChart({super.key, required this.chart, required this.isDark});

  final CopilotChartData chart;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    if (chart.values.isEmpty || chart.values.every((v) => v == 0)) {
      return const SizedBox.shrink();
    }

    final maxValue = chart.values.reduce((a, b) => a > b ? a : b).toDouble();

    return SizedBox(
      height: 170,
      child: BarChart(
        BarChartData(
          maxY: maxValue <= 0 ? 1 : maxValue + 1,
          alignment: BarChartAlignment.spaceAround,
          barTouchData: BarTouchData(enabled: false),
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 34,
                getTitlesWidget: (value, meta) {
                  final index = value.toInt();
                  if (index < 0 || index >= chart.labels.length) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      _shortLabel(chart.labels[index]),
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 9, color: CopilotColors.mutedText(isDark)),
                    ),
                  );
                },
              ),
            ),
          ),
          barGroups: chart.values.asMap().entries.map((e) {
            return BarChartGroupData(
              x: e.key,
              barRods: [
                BarChartRodData(
                  toY: e.value.toDouble(),
                  color: CopilotColors.orbGradient[e.key % CopilotColors.orbGradient.length],
                  width: 22,
                  borderRadius: BorderRadius.circular(6),
                ),
              ],
            );
          }).toList(),
        ),
      ),
    );
  }
}
