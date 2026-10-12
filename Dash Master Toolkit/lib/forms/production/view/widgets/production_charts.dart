// lib/forms/production/view/widgets/production_charts.dart
//
// Graphiques interactifs du module Production (fl_chart, déjà utilisé par les
// dashboards de poste) : survol / appui = infobulle avec la date et la valeur
// de chaque série. Les couleurs identifient la ligne (PROMESH bleu, PROBAR
// orange) ; une légende accompagne tout graphique à plusieurs séries.

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';

import '../../model/production_models.dart';
import 'production_widgets.dart';

const Color _kGrid = Color(0xFFEEF2F6);
const Color _kTooltipBg = Color(0xFF0F172A);
final NumberFormat _compact = NumberFormat.compact(locale: 'fr_FR');

/// Une série d'un graphique temporel.
class ProdSeries {
  final String label;
  final Color color;
  final double Function(ProductionSeriesPoint) valueOf;
  const ProdSeries(this.label, this.color, this.valueOf);

  static final total = ProdSeries('Production', kProdNeutral, (p) => p.total);
  static final promesh = ProdSeries('PROMESH', kPromeshColor, (p) => p.promesh);
  static final probar = ProdSeries('PROBAR', kProbarColor, (p) => p.probar);
}

// Libellé d'un point : jour `dd/MM` ou mois `MM/yy`.
String _axisLabel(String date) {
  final p = date.split('-');
  if (p.length == 2) return '${p[1]}/${p[0].substring(2)}';
  if (p.length >= 3) return '${p[2]}/${p[1]}';
  return date;
}

// Borne haute « ronde » de l'axe (1 / 2 / 5 × 10ⁿ) → 4 graduations lisibles.
double _niceMax(double max) {
  if (max <= 0) return 10;
  var magnitude = 1.0;
  while (magnitude * 10 <= max) {
    magnitude *= 10;
  }
  while (magnitude > max) {
    magnitude /= 10;
  }
  for (final step in [1.0, 2.0, 4.0, 5.0, 8.0, 10.0]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

FlGridData _grid(double maxY) => FlGridData(
      show: true,
      drawVerticalLine: false,
      horizontalInterval: maxY / 4,
      getDrawingHorizontalLine: (_) => const FlLine(color: _kGrid, strokeWidth: 1),
    );

AxisTitles _leftAxis(double maxY) => AxisTitles(
      sideTitles: SideTitles(
        showTitles: true,
        reservedSize: 42,
        interval: maxY / 4,
        getTitlesWidget: (value, meta) => Padding(
          padding: const EdgeInsets.only(right: 6),
          child: Text(_compact.format(value),
              textAlign: TextAlign.right, style: tInter(fontSize: 10, color: kCrmTextSub)),
        ),
      ),
    );

AxisTitles _bottomAxis(List<String> labels) {
  // Au plus ~8 libellés pour éviter tout chevauchement.
  final step = (labels.length / 8).ceil().clamp(1, 1000);
  return AxisTitles(
    sideTitles: SideTitles(
      showTitles: true,
      reservedSize: 24,
      interval: 1,
      getTitlesWidget: (value, meta) {
        final i = value.round();
        if (value != i.toDouble() || i < 0 || i >= labels.length || i % step != 0) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(labels[i], style: tInter(fontSize: 10, color: kCrmTextSub)),
        );
      },
    ),
  );
}

const _noTitles = AxisTitles(sideTitles: SideTitles(showTitles: false));

Widget _empty(String label) => Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.show_chart_rounded, size: 26, color: kCrmTextSub.withOpacity(0.45)),
        const SizedBox(height: 6),
        Text(label, style: tInter(fontSize: 12.5, color: kCrmTextSub)),
      ]),
    );

class ProdLegend extends StatelessWidget {
  final List<(String, Color)> items;
  const ProdLegend(this.items, {super.key});

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 14, runSpacing: 4, children: [
      for (final item in items)
        Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 9, height: 9, decoration: BoxDecoration(color: item.$2, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 6),
          Text(item.$1, style: tInter(fontSize: 11.5, fontWeight: FontWeight.w600, color: kCrmTextSub)),
        ]),
    ]);
  }
}

/// Carte de graphique : titre, sous-titre, légende, zone de tracé.
class ProdChartCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<(String, Color)> legend;
  final Widget chart;
  final double height;
  final bool loading;

  const ProdChartCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.chart,
    this.legend = const [],
    this.height = 220,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return ProdCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ProdSectionTitle(title: title, subtitle: subtitle),
        if (legend.length > 1) ...[
          const SizedBox(height: 10),
          ProdLegend(legend),
        ],
        const SizedBox(height: 14),
        SizedBox(height: height, child: loading ? const ProdSkeleton(height: double.infinity) : chart),
      ]),
    );
  }
}

/// Courbe(s) dans le temps — une série (avec aire) ou plusieurs.
class ProdTrendChart extends StatelessWidget {
  final List<ProductionSeriesPoint> points;
  final List<ProdSeries> series;
  final String unit;
  final String emptyLabel;

  const ProdTrendChart({
    super.key,
    required this.points,
    required this.series,
    required this.unit,
    this.emptyLabel = 'Aucune production sur la période',
  });

  @override
  Widget build(BuildContext context) {
    var max = 0.0;
    for (final p in points) {
      for (final s in series) {
        final v = s.valueOf(p);
        if (v > max) max = v;
      }
    }
    if (points.isEmpty || max <= 0) return _empty(emptyLabel);

    final maxY = _niceMax(max);
    final single = series.length == 1;
    final showDots = points.length <= 31;

    return LineChart(LineChartData(
      minY: 0,
      maxY: maxY,
      minX: 0,
      maxX: points.length > 1 ? (points.length - 1).toDouble() : 1,
      gridData: _grid(maxY),
      borderData: FlBorderData(show: false),
      titlesData: FlTitlesData(
        leftTitles: _leftAxis(maxY),
        topTitles: _noTitles,
        rightTitles: _noTitles,
        bottomTitles: _bottomAxis([for (final p in points) _axisLabel(p.date)]),
      ),
      lineTouchData: LineTouchData(
        handleBuiltInTouches: true,
        getTouchedSpotIndicator: (bar, indexes) => [
          for (final _ in indexes)
            TouchedSpotIndicatorData(
              const FlLine(color: Color(0xFFCBD5E1), strokeWidth: 1),
              FlDotData(
                getDotPainter: (spot, percent, bar, index) => FlDotCirclePainter(
                    radius: 4.5, color: bar.color ?? kProdNeutral, strokeWidth: 2, strokeColor: Colors.white),
              ),
            ),
        ],
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (_) => _kTooltipBg,
          tooltipRoundedRadius: 8,
          fitInsideHorizontally: true,
          fitInsideVertically: true,
          // Une entrée par point touché, dans l'ordre reçu (exigé par fl_chart).
          getTooltipItems: (spots) {
            return [
              for (final spot in spots)
                LineTooltipItem(
                  // La date n'apparaît qu'une fois, en tête de l'infobulle.
                  spot == spots.first ? '${prodDate(points[spot.x.round()].date)}\n' : '',
                  tInter(fontSize: 11, fontWeight: FontWeight.w600, color: const Color(0xFF94A3B8)),
                  textAlign: TextAlign.left,
                  children: [
                    TextSpan(
                      text: '${series[spot.barIndex].label} : ${prodNum(spot.y)} $unit',
                      style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                  ],
                ),
            ];
          },
        ),
      ),
      lineBarsData: [
        for (final s in series)
          LineChartBarData(
            spots: [for (int i = 0; i < points.length; i++) FlSpot(i.toDouble(), s.valueOf(points[i]))],
            isCurved: true,
            curveSmoothness: 0.22,
            preventCurveOverShooting: true,
            color: s.color,
            barWidth: 2,
            isStrokeCapRound: true,
            dotData: FlDotData(
              show: showDots,
              getDotPainter: (spot, percent, bar, index) =>
                  FlDotCirclePainter(radius: 2.6, color: s.color, strokeWidth: 1.5, strokeColor: Colors.white),
            ),
            belowBarData: BarAreaData(show: single, color: s.color.withOpacity(0.08)),
          ),
      ],
    ));
  }
}

/// Barres groupées PROMESH / PROBAR par jour (ou par mois).
class ProdCompareChart extends StatelessWidget {
  final List<ProductionSeriesPoint> points;
  final String unit;

  const ProdCompareChart({super.key, required this.points, this.unit = 'm²'});

  @override
  Widget build(BuildContext context) {
    var max = 0.0;
    for (final p in points) {
      if (p.promesh > max) max = p.promesh;
      if (p.probar > max) max = p.probar;
    }
    if (points.isEmpty || max <= 0) return _empty('Aucune production sur la période');
    final maxY = _niceMax(max);
    final series = [ProdSeries.promesh, ProdSeries.probar];

    return LayoutBuilder(builder: (context, c) {
      final slot = (c.maxWidth - 50) / points.length;
      final rodWidth = (slot / 3).clamp(2.0, 14.0);
      return BarChart(BarChartData(
        minY: 0,
        maxY: maxY,
        alignment: BarChartAlignment.spaceAround,
        gridData: _grid(maxY),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          leftTitles: _leftAxis(maxY),
          topTitles: _noTitles,
          rightTitles: _noTitles,
          bottomTitles: _bottomAxis([for (final p in points) _axisLabel(p.date)]),
        ),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => _kTooltipBg,
            tooltipRoundedRadius: 8,
            fitInsideHorizontally: true,
            fitInsideVertically: true,
            getTooltipItem: (group, groupIndex, rod, rodIndex) => BarTooltipItem(
              '${prodDate(points[group.x].date)}\n',
              tInter(fontSize: 11, fontWeight: FontWeight.w600, color: const Color(0xFF94A3B8)),
              textAlign: TextAlign.left,
              children: [
                TextSpan(
                  text: '${series[rodIndex].label} : ${prodNum(rod.toY)} $unit',
                  style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white),
                ),
              ],
            ),
          ),
        ),
        barGroups: [
          for (int i = 0; i < points.length; i++)
            BarChartGroupData(x: i, barsSpace: 2, barRods: [
              for (final s in series)
                BarChartRodData(
                  toY: s.valueOf(points[i]),
                  color: s.color,
                  width: rodWidth,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                ),
            ]),
        ],
      ));
    });
  }
}

/// Une barre par machine, colorée selon sa ligne.
class ProdMachineChart extends StatelessWidget {
  final List<ProductionMachineStat> machines;
  final String unit;

  const ProdMachineChart({super.key, required this.machines, this.unit = 'm²'});

  @override
  Widget build(BuildContext context) {
    final max = machines.fold<double>(0, (m, x) => x.quantity > m ? x.quantity : m);
    if (machines.isEmpty || max <= 0) return _empty('Aucune production sur la période');
    final maxY = _niceMax(max);

    return LayoutBuilder(builder: (context, c) {
      final rodWidth = ((c.maxWidth - 50) / machines.length * 0.5).clamp(6.0, 26.0);
      return BarChart(BarChartData(
        minY: 0,
        maxY: maxY,
        alignment: BarChartAlignment.spaceAround,
        gridData: _grid(maxY),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          leftTitles: _leftAxis(maxY),
          topTitles: _noTitles,
          rightTitles: _noTitles,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 24,
              getTitlesWidget: (value, meta) {
                final i = value.round();
                if (i < 0 || i >= machines.length) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('M${machines[i].numero}', style: tInter(fontSize: 10, color: kCrmTextSub)),
                );
              },
            ),
          ),
        ),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => _kTooltipBg,
            tooltipRoundedRadius: 8,
            fitInsideHorizontally: true,
            fitInsideVertically: true,
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              final m = machines[group.x];
              return BarTooltipItem(
                '${m.code}\n',
                tInter(fontSize: 11, fontWeight: FontWeight.w600, color: const Color(0xFF94A3B8)),
                textAlign: TextAlign.left,
                children: [
                  TextSpan(
                    text: '${prodNum(m.quantity)} $unit · ${m.fiches} fiche${m.fiches > 1 ? 's' : ''}',
                    style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                ],
              );
            },
          ),
        ),
        barGroups: [
          for (int i = 0; i < machines.length; i++)
            BarChartGroupData(x: i, barRods: [
              BarChartRodData(
                toY: machines[i].quantity,
                color: prodLineColor(machines[i].line),
                width: rodWidth,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
              ),
            ]),
        ],
      ));
    });
  }
}
