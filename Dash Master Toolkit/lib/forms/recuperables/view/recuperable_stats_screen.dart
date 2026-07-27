// lib/forms/recuperables/view/recuperable_stats_screen.dart
//
// Statistiques RÉCUPÉRABLES — Total récupérable groupé par machine / ligne /
// diamètre / poste (barres + camembert, dimension choisie via menu
// déroulant), et tendance par semaine / par mois (courbes). Agrégation
// client-side sur la liste complète des fiches, même convention que
// por_promesh_statistiques_screen.dart (pas d'endpoint d'agrégat dédié).

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../theme/recuperable_theme.dart';
import '../model/recuperable_models.dart';
import '../service/recuperable_service.dart';

const _kGroupings = [
  ('module', 'Module'),
  ('machine', 'Machine'),
  ('ligne', 'Ligne'),
  ('diametre', 'Diamètre'),
  ('poste', 'Poste'),
];

class RecuperableStatsScreen extends StatefulWidget {
  const RecuperableStatsScreen({super.key});

  @override
  State<RecuperableStatsScreen> createState() => _RecuperableStatsScreenState();
}

class _RecuperableStatsScreenState extends State<RecuperableStatsScreen> {
  bool _loading = true;
  String? _error;
  List<RecuperableFicheModel> _fiches = [];
  String _grouping = 'machine';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await RecuperableService.instance.fetchAll();
      if (!mounted) return;
      setState(() => _fiches = items);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  double get _totalRecuperable => _fiches.fold(0.0, (s, f) => s + f.totalDechetKg);
  int get _nombreFiches => _fiches.length;
  int get _nombreLignes => _fiches.fold(0, (s, f) => s + f.nombreLignes);

  String _keyFor(RecuperableFicheModel f, RecuperableItemModel i) {
    switch (_grouping) {
      case 'module':
        return f.module;
      case 'ligne':
        return f.ligne;
      case 'diametre':
        return 'Ø${i.diametre}';
      case 'poste':
        return f.posteLabel;
      default:
        return '${AppLocalizations.of(context).translate('Machine')} ${f.machine}';
    }
  }

  Map<String, double> get _groupedTotals {
    final map = <String, double>{};
    for (final f in _fiches) {
      for (final i in f.recuperables) {
        if (i.dechetKg <= 0) continue;
        final key = _keyFor(f, i);
        map[key] = (map[key] ?? 0) + i.dechetKg;
      }
    }
    final sorted = map.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return {for (final e in sorted) e.key: e.value};
  }

  List<_Bucket> _weeklyBuckets() {
    final now = DateTime.now();
    final buckets = List.generate(8, (i) {
      final start = now.subtract(Duration(days: now.weekday - 1 + 7 * (7 - i)));
      return _Bucket(DateTime(start.year, start.month, start.day), 'S${8 - (7 - i)}');
    });
    for (final f in _fiches) {
      final d = DateTime.tryParse(f.createdAt ?? '');
      if (d == null) continue;
      for (final bucket in buckets) {
        final end = bucket.start.add(const Duration(days: 7));
        if (!d.isBefore(bucket.start) && d.isBefore(end)) {
          bucket.value += f.totalDechetKg;
          break;
        }
      }
    }
    return buckets;
  }

  List<_Bucket> _monthlyBuckets() {
    final now = DateTime.now();
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    final buckets = List.generate(6, (i) {
      final m = DateTime(now.year, now.month - (5 - i));
      return _Bucket(DateTime(m.year, m.month), AppLocalizations.of(context).translate(months[m.month - 1]));
    });
    for (final f in _fiches) {
      final d = DateTime.tryParse(f.createdAt ?? '');
      if (d == null) continue;
      for (final bucket in buckets) {
        if (bucket.start.year == d.year && bucket.start.month == d.month) {
          bucket.value += f.totalDechetKg;
          break;
        }
      }
    }
    return buckets;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(AppLocalizations.of(context).translate('Statistiques Récupérables'), style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                const SizedBox(height: 4),
                Text(AppLocalizations.of(context).translate('Vue d\'ensemble de la récupération sur toutes les fiches'),
                    style: tInter(fontSize: 12.5, color: kCrmTextSub)),
                const SizedBox(height: 20),
                if (_loading)
                  const Padding(padding: EdgeInsets.symmetric(vertical: 60), child: Center(child: CircularProgressIndicator()))
                else if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text('${AppLocalizations.of(context).translate('Erreur de chargement')} : $_error', style: tInter(fontSize: 13, color: kCrmDanger)),
                  )
                else ...[
                  Wrap(spacing: 12, runSpacing: 12, children: [
                    _kpiCard('Total récupérable', '${_totalRecuperable.toStringAsFixed(1)} kg', kRecuperableColor, Icons.recycling_rounded),
                    _kpiCard('Fiches', '$_nombreFiches', kCrmPrimary, Icons.description_outlined),
                    _kpiCard('Diamètres saisis', '$_nombreLignes', kCrmInfo, Icons.list_alt_outlined),
                  ]),
                  const SizedBox(height: 24),

                  Row(children: [
                    Expanded(
                      child: CrmSectionTitle(
                          title:
                              '${AppLocalizations.of(context).translate('Total récupérable par')} ${AppLocalizations.of(context).translate(_groupingLabel)}',
                          icon: Icons.bar_chart_outlined),
                    ),
                    _groupingDropdown(),
                  ]),
                  const SizedBox(height: 14),
                  _BarPieRow(data: _groupedTotals, color: kRecuperableColor),
                  const SizedBox(height: 24),

                  const CrmSectionTitle(title: 'Tendance par semaine (8 dernières semaines)', icon: Icons.show_chart_rounded),
                  const SizedBox(height: 14),
                  _LineChartCard(buckets: _weeklyBuckets(), color: kCrmInfo),
                  const SizedBox(height: 24),

                  const CrmSectionTitle(title: 'Tendance par mois (6 derniers mois)', icon: Icons.show_chart_rounded),
                  const SizedBox(height: 14),
                  _LineChartCard(buckets: _monthlyBuckets(), color: kCrmPrimary),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  String get _groupingLabel => _kGroupings.firstWhere((g) => g.$1 == _grouping).$2;

  Widget _groupingDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(10), border: Border.all(color: kCrmBorder)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _grouping,
          isDense: true,
          icon: const Icon(Icons.expand_more_rounded, size: 18, color: kCrmTextSub),
          items: [for (final g in _kGroupings) DropdownMenuItem(value: g.$1, child: Text(AppLocalizations.of(context).translate(g.$2)))],
          onChanged: (v) => setState(() => _grouping = v ?? _grouping),
        ),
      ),
    );
  }

  Widget _kpiCard(String label, String value, Color color, IconData icon) {
    return Container(
      width: 200,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: color.withOpacity(0.08), borderRadius: BorderRadius.circular(14), border: Border.all(color: color.withOpacity(0.25))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Icon(icon, size: 18, color: color), const SizedBox(width: 8), Expanded(child: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 11.5, color: kCrmTextSub)))]),
        const SizedBox(height: 8),
        Text(value, style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: color)),
      ]),
    );
  }
}

class _Bucket {
  final DateTime start;
  final String label;
  double value = 0;
  _Bucket(this.start, this.label);
}

class _BarPieRow extends StatelessWidget {
  final Map<String, double> data;
  final Color color;
  const _BarPieRow({required this.data, required this.color});

  static const _palette = [
    Color(0xFF16A34A), Color(0xFF6366F1), Color(0xFFF59E0B), Color(0xFF06B6D4),
    Color(0xFFEF4444), Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFF84CC16),
  ];

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(14), border: Border.all(color: kCrmBorder)),
        child: Center(child: Text(AppLocalizations.of(context).translate('Aucune donnée'), style: tInter(fontSize: 13, color: kCrmTextSub))),
      );
    }
    final entries = data.entries.toList();
    final maxY = (entries.map((e) => e.value).reduce((a, b) => a > b ? a : b)) * 1.2;
    final total = entries.fold(0.0, (s, e) => s + e.value);
    final isMobile = MediaQuery.of(context).size.width < 900;

    final barCard = Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(14), border: Border.all(color: kCrmBorder)),
      child: SizedBox(
        height: 240,
        child: BarChart(BarChartData(
          maxY: maxY <= 0 ? 10 : maxY,
          alignment: BarChartAlignment.spaceAround,
          gridData: const FlGridData(show: true, drawVerticalLine: false),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, getTitlesWidget: (value, meta) {
              final i = value.toInt();
              if (i < 0 || i >= entries.length) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(entries[i].key, style: tInter(fontSize: 10, color: kCrmTextSub), overflow: TextOverflow.ellipsis),
              );
            })),
          ),
          barGroups: List.generate(entries.length, (i) => BarChartGroupData(x: i, barRods: [
            BarChartRodData(toY: entries[i].value, color: _palette[i % _palette.length], width: 22, borderRadius: BorderRadius.circular(6)),
          ])),
        )),
      ),
    );

    final pieCard = Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(14), border: Border.all(color: kCrmBorder)),
      child: Column(children: [
        SizedBox(
          height: 180,
          child: PieChart(PieChartData(
            sectionsSpace: 2,
            centerSpaceRadius: 40,
            sections: List.generate(entries.length, (i) {
              final pct = total > 0 ? (entries[i].value / total * 100) : 0;
              return PieChartSectionData(
                value: entries[i].value,
                color: _palette[i % _palette.length],
                title: '${pct.toStringAsFixed(0)}%',
                radius: 50,
                titleStyle: tInter(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white),
              );
            }),
          )),
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 10, runSpacing: 6, alignment: WrapAlignment.center, children: [
          for (int i = 0; i < entries.length; i++)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: _palette[i % _palette.length], shape: BoxShape.circle)),
              const SizedBox(width: 4),
              Text(entries[i].key, style: tInter(fontSize: 10.5, color: kCrmTextSub)),
            ]),
        ]),
      ]),
    );

    if (isMobile) {
      return Column(children: [barCard, const SizedBox(height: 16), pieCard]);
    }
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(flex: 3, child: barCard),
      const SizedBox(width: 16),
      Expanded(flex: 2, child: pieCard),
    ]);
  }
}

class _LineChartCard extends StatelessWidget {
  final List<_Bucket> buckets;
  final Color color;
  const _LineChartCard({required this.buckets, required this.color});

  @override
  Widget build(BuildContext context) {
    final maxY = buckets.isEmpty ? 10.0 : (buckets.map((b) => b.value).reduce((a, b) => a > b ? a : b) * 1.2);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(14), border: Border.all(color: kCrmBorder)),
      child: SizedBox(
        height: 220,
        child: LineChart(LineChartData(
          maxY: maxY <= 0 ? 10 : maxY,
          minY: 0,
          gridData: const FlGridData(show: true, drawVerticalLine: false),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, getTitlesWidget: (value, meta) {
              final i = value.toInt();
              if (i < 0 || i >= buckets.length) return const SizedBox.shrink();
              return Padding(padding: const EdgeInsets.only(top: 6), child: Text(buckets[i].label, style: tInter(fontSize: 10, color: kCrmTextSub)));
            })),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: [for (int i = 0; i < buckets.length; i++) FlSpot(i.toDouble(), buckets[i].value)],
              isCurved: true,
              color: color,
              barWidth: 3,
              dotData: const FlDotData(show: true),
              belowBarData: BarAreaData(show: true, color: color.withOpacity(0.12)),
            ),
          ],
        )),
      ),
    );
  }
}
