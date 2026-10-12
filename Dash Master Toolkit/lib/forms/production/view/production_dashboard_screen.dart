// lib/forms/production/view/production_dashboard_screen.dart
//
// « Dashboard Production » — page d'accueil du module Production : KPI,
// filtre période, cartes PROMESH / PROBAR (KPI + production par machine +
// tendance), graphiques, dernières productions, accès rapides.
//
// Toutes les valeurs viennent d'UNE requête GET /production/dashboard
// (ProductionService.fetchDashboard) recalculée à chaque changement de
// période — aucune statistique n'est codée en dur ni calculée ici.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';

import '../model/production_models.dart';
import '../service/production_service.dart';
import 'widgets/production_charts.dart';
import 'widgets/production_machine_picker.dart';
import 'widgets/production_widgets.dart';

class ProductionDashboardScreen extends StatefulWidget {
  const ProductionDashboardScreen({super.key});

  @override
  State<ProductionDashboardScreen> createState() => _ProductionDashboardScreenState();
}

class _ProductionDashboardScreenState extends State<ProductionDashboardScreen> {
  ProductionPeriod _period = ProductionPeriod.month;
  ProductionDashboardData _data = const ProductionDashboardData();
  bool _loading = true;
  bool _exporting = false;
  String? _error;
  // Ignore la réponse d'une requête dépassée (changements de période rapides).
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    final id = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ProductionService.instance.fetchDashboard(_period, refresh: refresh);
      if (!mounted || id != _requestId) return;
      setState(() => _data = data);
    } catch (e) {
      if (!mounted || id != _requestId) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted && id == _requestId) setState(() => _loading = false);
    }
  }

  void _setPeriod(ProductionPeriod period) {
    setState(() => _period = period);
    _load();
  }

  Future<void> _export(String format) async {
    setState(() => _exporting = true);
    try {
      await ProductionService.instance.export(format: format, period: _period);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Export impossible : ${e.toString().replaceFirst('Exception: ', '')}'),
        backgroundColor: kProdWasteColor,
      ));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  String _lineRoute(String line) {
    final root = line == 'probar' ? MyRoute.productionProbarRoot : MyRoute.productionPromeshRoot;
    return Uri(path: root, queryParameters: _period.toQuery()).toString();
  }

  String get _bucketWord => _data.granularity == 'month' ? 'mois' : 'jour';

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return ProdPage(
      onRefresh: () => _load(refresh: true),
      children: [
        ProdPageHeader(
          title: 'Dashboard Production',
          subtitle: 'Suivez les productions PROMESH et PROBAR, les quantités, les déchets, les fiches et les performances.',
          icon: Icons.factory_outlined,
          actions: [
            ProdExportButton(onExport: _export, busy: _exporting),
            ProdButton(
              label: 'Actualiser',
              icon: Icons.refresh_rounded,
              primary: true,
              busy: _loading,
              onTap: () => _load(refresh: true),
            ),
          ],
        ),
        const SizedBox(height: 18),
        ProdCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: ProdPeriodFilter(value: _period, onChanged: _setPeriod),
        ),
        const SizedBox(height: 16),
        if (_error != null)
          ProdErrorState(message: _error!, onRetry: () => _load(refresh: true))
        else ...[
          _buildGlobalKpis(d),
          const SizedBox(height: 16),
          _buildLineCards(d),
          const SizedBox(height: 24),
          const ProdSectionTitle(
            title: 'Analyse de la production',
            subtitle: 'Survolez un point ou une barre pour afficher le détail.',
          ),
          const SizedBox(height: 12),
          _buildCharts(d),
          const SizedBox(height: 24),
          _buildRecent(d),
          const SizedBox(height: 24),
          const ProdSectionTitle(title: 'Accès rapides'),
          const SizedBox(height: 12),
          _buildQuickAccess(),
        ],
        const SizedBox(height: 12),
      ],
    );
  }

  // ── KPI globaux ─────────────────────────────────────────────────────────

  Widget _buildGlobalKpis(ProductionDashboardData d) {
    return ProdGrid(children: [
      ProdKpiTile(
        icon: Icons.stacked_bar_chart_rounded,
        label: 'Production totale',
        value: prodNum(d.totalQuantity),
        unit: 'm²',
        caption: '${prodInt(d.totalFiches)} fiche${d.totalFiches > 1 ? 's' : ''} · PROMESH + PROBAR',
        loading: _loading,
      ),
      ProdKpiTile(
        icon: Icons.delete_outline_rounded,
        label: 'Déchets',
        value: prodNum(d.totalWasteKg),
        unit: 'kg',
        caption: d.totalWasteRate == null ? 'Taux indisponible (aucune production)' : '${prodRate(d.totalWasteRate)} kg pour 100 m² produits',
        color: kProdWasteColor,
        loading: _loading,
      ),
      ProdKpiTile(
        icon: Icons.precision_manufacturing_outlined,
        label: 'Machines actives',
        value: '${d.machinesActive}',
        unit: '/ ${d.machinesTotal}',
        caption: '${d.machinesWithProduction} avec production sur la période',
        color: kProdRecuperableColor,
        loading: _loading,
      ),
      ProdKpiTile(
        icon: Icons.today_outlined,
        label: "Productions aujourd'hui",
        value: prodInt(d.productionsToday),
        unit: d.productionsToday > 1 ? 'fiches' : 'fiche',
        caption: 'Toutes lignes confondues',
        loading: _loading,
      ),
    ]);
  }

  // ── Cartes PROMESH / PROBAR ─────────────────────────────────────────────

  Widget _buildLineCards(ProductionDashboardData d) {
    final promesh = _LineCard(
      line: 'promesh',
      label: 'PROMESH',
      summary: d.promesh,
      points: d.productionSeries,
      series: ProdSeries.promesh,
      bucketWord: _bucketWord,
      loading: _loading,
      onOpen: () => context.go(_lineRoute('promesh')),
    );
    final probar = _LineCard(
      line: 'probar',
      label: 'PROBAR',
      summary: d.probar,
      points: d.productionSeries,
      series: ProdSeries.probar,
      bucketWord: _bucketWord,
      loading: _loading,
      onOpen: () => context.go(_lineRoute('probar')),
    );
    return LayoutBuilder(builder: (context, c) {
      if (c.maxWidth < 1000) {
        return Column(children: [promesh, const SizedBox(height: 16), probar]);
      }
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: promesh),
        const SizedBox(width: 16),
        Expanded(child: probar),
      ]);
    });
  }

  // ── Graphiques ──────────────────────────────────────────────────────────

  Widget _buildCharts(ProductionDashboardData d) {
    final period = d.periodLabel.isEmpty ? '' : ' · ${d.periodLabel}';
    final lineLegend = [('PROMESH', kPromeshColor), ('PROBAR', kProbarColor)];
    return ProdGrid(desktop: 2, tablet: 1, gap: 16, children: [
      ProdChartCard(
        title: 'Production par $_bucketWord',
        subtitle: 'Quantité totale produite (m²)$period',
        loading: _loading,
        chart: ProdTrendChart(points: d.productionSeries, series: [ProdSeries.total], unit: 'm²'),
      ),
      ProdChartCard(
        title: 'Production PROMESH vs PROBAR',
        subtitle: 'Quantité produite par ligne (m²)$period',
        legend: lineLegend,
        loading: _loading,
        chart: ProdCompareChart(points: d.productionSeries),
      ),
      ProdChartCard(
        title: 'Évolution des déchets',
        subtitle: 'Déchets déclarés dans les fiches Récupérables (kg)$period',
        legend: lineLegend,
        loading: _loading,
        chart: ProdTrendChart(
          points: d.wasteSeries,
          series: [ProdSeries.promesh, ProdSeries.probar],
          unit: 'kg',
          emptyLabel: 'Aucun déchet déclaré sur la période',
        ),
      ),
      ProdChartCard(
        title: 'Production par machine',
        subtitle: 'Quantité produite par machine (m²)$period',
        legend: lineLegend,
        loading: _loading,
        chart: ProdMachineChart(machines: d.allMachines),
      ),
    ]);
  }

  // ── Dernières productions ───────────────────────────────────────────────

  Widget _buildRecent(ProductionDashboardData d) {
    return ProdCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
          child: ProdSectionTitle(
            title: 'Dernières productions',
            subtitle: d.periodLabel.isEmpty ? null : 'Les ${d.recent.length} plus récentes · ${d.periodLabel}',
          ),
        ),
        if (_loading)
          const Padding(padding: EdgeInsets.fromLTRB(18, 0, 18, 18), child: ProdSkeleton(height: 160))
        else
          ProdTable(
            columns: const [
              ProdColumn('Date', 104),
              ProdColumn('Référence', 190),
              ProdColumn('Ligne', 116),
              ProdColumn('Machine', 116),
              ProdColumn('Poste', 84),
              ProdColumn('Utilisateur', 200),
              ProdColumn('Quantité', 116, numeric: true),
              ProdColumn('Déchets', 104, numeric: true),
              ProdColumn('Statut', 128),
              ProdColumn('Action', 96),
            ],
            onRowTap: [for (final r in d.recent) () => context.go('${MyRoute.productionFicheRoot}/${r.line}/${r.id}')],
            rows: [
              for (final r in d.recent)
                [
                  ProdCell(prodDate(r.date)),
                  ProdCell(r.reference ?? '—', strong: true, mono: true),
                  ProdLineBadge(line: r.line, label: r.lineLabel),
                  ProdCell(r.machine?.code ?? '—'),
                  ProdCell(prodPoste(r.poste)),
                  ProdCell(r.user ?? '—'),
                  ProdCell('${prodNum(r.quantity)} ${r.unit}', strong: true),
                  ProdCell(r.wasteKg == null ? '—' : '${prodNum(r.wasteKg!)} kg'),
                  ProdStatusBadge(r.status),
                  TextButton.icon(
                    onPressed: () => context.go('${MyRoute.productionFicheRoot}/${r.line}/${r.id}'),
                    icon: const Icon(Icons.visibility_outlined, size: 15),
                    label: Text('Voir', style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700)),
                    style: TextButton.styleFrom(
                      foregroundColor: kCrmText,
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ],
            ],
          ),
      ]),
    );
  }

  // ── Accès rapides ───────────────────────────────────────────────────────

  Widget _buildQuickAccess() {
    return ProdGrid(desktop: 3, tablet: 2, children: [
      _QuickAccessCard(
        icon: Icons.add_rounded,
        title: 'Nouvelle fiche PROMESH',
        subtitle: 'Choisir une machine puis un poste',
        color: kPromeshColor,
        onTap: () => showProductionMachinePicker(context, line: 'promesh'),
      ),
      _QuickAccessCard(
        icon: Icons.add_rounded,
        title: 'Nouvelle fiche PROBAR',
        subtitle: 'Choisir une machine puis un poste',
        color: kProbarColor,
        onTap: () => showProductionMachinePicker(context, line: 'probar'),
      ),
      _QuickAccessCard(
        icon: Icons.history_rounded,
        title: 'Historique PROMESH',
        subtitle: 'Toutes les fiches de la ligne',
        color: kPromeshColor,
        onTap: () => context.go(
            Uri(path: MyRoute.productionPromeshRoot, queryParameters: ProductionPeriod.year.toQuery()).toString()),
      ),
      _QuickAccessCard(
        icon: Icons.history_rounded,
        title: 'Historique PROBAR',
        subtitle: 'Toutes les fiches de la ligne',
        color: kProbarColor,
        onTap: () => context.go(
            Uri(path: MyRoute.productionProbarRoot, queryParameters: ProductionPeriod.year.toQuery()).toString()),
      ),
      _QuickAccessCard(
        icon: Icons.today_outlined,
        title: 'Production du jour',
        subtitle: "Afficher le dashboard sur aujourd'hui",
        color: kProdNeutral,
        onTap: () => _setPeriod(ProductionPeriod.today),
      ),
      _QuickAccessCard(
        icon: Icons.summarize_outlined,
        title: 'Résumé Production',
        subtitle: 'Rapport PDF de la période affichée',
        color: kProdNeutral,
        onTap: _exporting ? null : () => _export('pdf'),
      ),
    ]);
  }
}

// ── Carte d'une ligne de production ───────────────────────────────────────

class _LineCard extends StatelessWidget {
  final String line;
  final String label;
  final ProductionSummary summary;
  final List<ProductionSeriesPoint> points;
  final ProdSeries series;
  final String bucketWord;
  final bool loading;
  final VoidCallback onOpen;

  const _LineCard({
    required this.line,
    required this.label,
    required this.summary,
    required this.points,
    required this.series,
    required this.bucketWord,
    required this.loading,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    final color = prodLineColor(line);
    final s = summary;
    final average = s.fiches == 0 ? null : s.quantity / s.fiches;

    return ProdCard(
      accent: color,
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 12, 12),
          child: Row(children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(color: color.withOpacity(0.10), borderRadius: BorderRadius.circular(9)),
              child: Icon(Icons.factory_outlined, size: 18, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText, letterSpacing: 0.3)),
                Text('${s.validees} validée${s.validees > 1 ? 's' : ''} · ${s.brouillons} brouillon${s.brouillons > 1 ? 's' : ''}',
                    style: tInter(fontSize: 12, color: kCrmTextSub)),
              ]),
            ),
            TextButton.icon(
              onPressed: onOpen,
              iconAlignment: IconAlignment.end,
              icon: const Icon(Icons.arrow_forward_rounded, size: 15),
              label: Text('Voir les fiches', style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700)),
              style: TextButton.styleFrom(foregroundColor: kCrmText),
            ),
          ]),
        ),
        const Divider(height: 1, color: kCrmBorder),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
          child: loading
              ? const ProdSkeleton(height: 44)
              : Wrap(spacing: 28, runSpacing: 14, children: [
                  _metric('Fiches', prodInt(s.fiches)),
                  _metric('Quantité produite', '${prodNum(s.quantity)} m²'),
                  _metric('Moyenne par fiche', average == null ? '—' : '${prodNum(average)} m²'),
                  _metric('Déchets', '${prodNum(s.wasteKg)} kg'),
                  _metric('Taux de déchets', s.wasteRate == null ? '—' : '${prodRate(s.wasteRate)} kg/100 m²'),
                ]),
        ),
        const Divider(height: 1, color: kCrmBorder),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
          child: Text('PRODUCTION PAR MACHINE',
              style: tInter(fontSize: 10.5, fontWeight: FontWeight.w800, color: kCrmTextSub, letterSpacing: 0.6)),
        ),
        if (loading)
          const Padding(padding: EdgeInsets.fromLTRB(18, 0, 18, 14), child: ProdSkeleton(height: 150))
        else
          ProdTable(
            emptyLabel: 'Aucune machine sur cette ligne',
            columns: const [
              ProdColumn('Machine', 118),
              ProdColumn('Fiches', 64, numeric: true),
              ProdColumn('Quantité', 108, numeric: true),
              ProdColumn('Déchets', 88, numeric: true),
              ProdColumn('Dernière prod.', 112),
              ProdColumn('Statut', 132),
            ],
            rows: [
              for (final m in s.machines)
                [
                  ProdCell(m.code, strong: true),
                  ProdCell(prodInt(m.fiches)),
                  ProdCell('${prodNum(m.quantity)} m²', strong: true),
                  ProdCell('${prodNum(m.wasteKg)} kg'),
                  ProdCell(prodDate(m.lastProduction)),
                  ProdMachineStateBadge(m.state),
                ],
            ],
          ),
        const Divider(height: 1, color: kCrmBorder),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('PRODUCTION PAR ${bucketWord.toUpperCase()} (m²)',
                style: tInter(fontSize: 10.5, fontWeight: FontWeight.w800, color: kCrmTextSub, letterSpacing: 0.6)),
            const SizedBox(height: 12),
            SizedBox(
              height: 150,
              child: loading
                  ? const ProdSkeleton(height: 150)
                  : ProdTrendChart(points: points, series: [series], unit: 'm²'),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _metric(String label, String value) => ProdField(
        label: label,
        value: Text(value, style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
      );
}

class _QuickAccessCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback? onTap;

  const _QuickAccessCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: kCrmSurface,
      borderRadius: BorderRadius.circular(kProdRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(kProdRadius),
        hoverColor: color.withOpacity(0.04),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(kProdRadius),
            border: Border.all(color: kCrmBorder),
          ),
          child: Row(children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: color.withOpacity(0.10), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 19, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: tInter(fontSize: 13.5, fontWeight: FontWeight.w800, color: kCrmText)),
                const SizedBox(height: 2),
                Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: tInter(fontSize: 12, color: kCrmTextSub)),
              ]),
            ),
            const Icon(Icons.chevron_right_rounded, size: 20, color: kCrmTextSub),
          ]),
        ),
      ),
    );
  }
}
