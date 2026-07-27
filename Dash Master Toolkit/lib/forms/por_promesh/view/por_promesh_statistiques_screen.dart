// lib/forms/por_promesh/view/por_promesh_statistiques_screen.dart
//
// "Statistiques" — monthly trend charts for POR PROMESH, separate from
// the Dashboard (which only shows KPI counts + latest entries). Charts
// are computed client-side over the last 6 months from the existing
// list endpoint — no new backend aggregate route needed.

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';

import '../model/por_promesh_model.dart';
import '../service/por_promesh_service.dart';

class PorPromeshStatistiquesScreen extends StatefulWidget {
  const PorPromeshStatistiquesScreen({super.key});

  @override
  State<PorPromeshStatistiquesScreen> createState() => _PorPromeshStatistiquesScreenState();
}

class _MonthBucket {
  final DateTime month;
  int ficheCount = 0;
  double production = 0;
  double dechets = 0;
  int nonConformes = 0;

  _MonthBucket(this.month);

  String get label => const [
        'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'
      ][month.month - 1];
}

class _PorPromeshStatistiquesScreenState extends State<PorPromeshStatistiquesScreen> {
  bool _loading = true;
  String? _error;
  List<_MonthBucket> _buckets = [];

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
      final items = await PorPromeshService.instance.fetchAll(limit: 1000);
      if (!mounted) return;
      setState(() => _buckets = _computeMonthlyBuckets(items));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<_MonthBucket> _computeMonthlyBuckets(List<PorPromeshModel> items) {
    final now = DateTime.now();
    final buckets = List.generate(6, (i) {
      final m = DateTime(now.year, now.month - (5 - i));
      return _MonthBucket(DateTime(m.year, m.month));
    });

    for (final item in items) {
      final d = DateTime.tryParse(item.createdAt ?? '');
      if (d == null) continue;
      final bucket = buckets.firstWhere(
        (b) => b.month.year == d.year && b.month.month == d.month,
        orElse: () => _MonthBucket(DateTime(1970)),
      );
      if (bucket.month.year == 1970) continue;
      bucket.ficheCount += 1;
      bucket.production += item.productionM2 ?? 0;
      bucket.dechets += (item.totalChuteBarres ?? 0) + (item.totalDechetGraine ?? 0);
      if (item.conformite == 'non_conforme') bucket.nonConformes += 1;
    }
    return buckets;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Statistiques POR PROMESH',
                  style: tInter(fontSize: 20, fontWeight: FontWeight.w800, color: kCrmText)),
              const SizedBox(height: 4),
              Text('Tendances mensuelles sur les 6 derniers mois',
                  style: tInter(fontSize: 12, color: kCrmTextSub)),
              const SizedBox(height: 20),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 60),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text('Erreur de chargement : $_error',
                      style: tInter(fontSize: 13, color: kCrmDanger)),
                )
              else ...[
                _ChartCard(
                  title: 'Fiches créées par mois',
                  icon: Icons.bar_chart_outlined,
                  color: kCrmPrimary,
                  maxY: _maxOf(_buckets.map((b) => b.ficheCount.toDouble())),
                  buckets: _buckets,
                  valueOf: (b) => b.ficheCount.toDouble(),
                ),
                const SizedBox(height: 20),
                _ChartCard(
                  title: 'Production ProMesh par mois',
                  icon: Icons.precision_manufacturing_outlined,
                  color: kCrmSecondary,
                  maxY: _maxOf(_buckets.map((b) => b.production)),
                  buckets: _buckets,
                  valueOf: (b) => b.production,
                ),
                const SizedBox(height: 20),
                _ChartCard(
                  title: 'Déchets par mois (chute barres + graine)',
                  icon: Icons.delete_sweep_outlined,
                  color: kCrmDanger,
                  maxY: _maxOf(_buckets.map((b) => b.dechets)),
                  buckets: _buckets,
                  valueOf: (b) => b.dechets,
                ),
                const SizedBox(height: 20),
                _ChartCard(
                  title: 'Non-conformités par mois',
                  icon: Icons.warning_amber_rounded,
                  color: kCrmDanger,
                  maxY: _maxOf(_buckets.map((b) => b.nonConformes.toDouble())),
                  buckets: _buckets,
                  valueOf: (b) => b.nonConformes.toDouble(),
                ),
              ],
            ]),
          ),
        ),
      ),
    );
  }

  double _maxOf(Iterable<double> values) {
    final list = values.toList();
    if (list.isEmpty) return 10;
    final max = list.reduce((a, b) => a > b ? a : b);
    return max <= 0 ? 10 : max * 1.2;
  }
}

class _ChartCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final double maxY;
  final List<_MonthBucket> buckets;
  final double Function(_MonthBucket) valueOf;

  const _ChartCard({
    required this.title,
    required this.icon,
    required this.color,
    required this.maxY,
    required this.buckets,
    required this.valueOf,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        CrmSectionTitle(title: title, icon: icon),
        const SizedBox(height: 16),
        SizedBox(
          height: 220,
          child: BarChart(
            BarChartData(
              maxY: maxY,
              alignment: BarChartAlignment.spaceAround,
              gridData: const FlGridData(show: true, drawVerticalLine: false),
              borderData: FlBorderData(show: false),
              titlesData: FlTitlesData(
                leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (value, meta) {
                      final i = value.toInt();
                      if (i < 0 || i >= buckets.length) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(buckets[i].label, style: tInter(fontSize: 11, color: kCrmTextSub)),
                      );
                    },
                  ),
                ),
              ),
              barGroups: List.generate(buckets.length, (i) {
                return BarChartGroupData(x: i, barRods: [
                  BarChartRodData(
                    toY: valueOf(buckets[i]),
                    color: color,
                    width: 22,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ]);
              }),
            ),
          ),
        ),
      ]),
    );
  }
}
