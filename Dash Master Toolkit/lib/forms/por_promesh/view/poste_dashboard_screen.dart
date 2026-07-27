// lib/forms/por_promesh/view/poste_dashboard_screen.dart
//
// Dashboard du poste — nouvelle étape intermédiaire Machine → Poste →
// Dashboard (avant la saisie). KPI + graphiques + liste filtrable/triable/
// paginée des fiches du poste sélectionné. Tous les calculs (KPI,
// graphiques) sont faits côté backend (GET /por-promesh/dashboard et
// GET /por-promesh/stats) — cet écran ne fait jamais de somme/comptage lui-même.
// "+ Nouvelle fiche" est l'unique point d'entrée vers le parcours de saisie
// existant (Informations générales → Rendement → ... → Validation, inchangé).

import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

import '../controller/por_promesh_controller.dart';
import '../model/por_promesh_model.dart';
import '../model/poste_dashboard_stats.dart';
import '../model/poste_charts_data.dart';
import '../service/por_promesh_service.dart';
import '../service/por_promesh_pdf_service.dart';
import '../service/por_promesh_excel_service.dart';
import 'modules/industrial_context_header.dart';
import 'widgets/shimmer_box.dart';

enum _ViewMode { cards, table }

const _kDateRanges = [
  ('today', "Aujourd'hui"),
  ('yesterday', 'Hier'),
  ('week', 'Cette semaine'),
  ('month', 'Ce mois'),
];

const _kStatusFilters = [
  (null, 'Tous'),
  ('brouillon', 'Brouillon'),
  ('valide', 'Validé'),
  ('conforme', 'Conforme'),
  ('non_conforme', 'Non Conforme'),
];

const _kSorts = [
  ('date_desc', 'Date décroissante'),
  ('date_asc', 'Date croissante'),
  ('production_desc', 'Production'),
];

const _kPageSizes = [10, 20, 50, 100];

// La liste de ce Dashboard est chargée en mode "light" (sans les 6 tables
// enfants — voir fetchPage) pour rester rapide. Les actions PDF/Imprimer/
// Excel ont besoin de la fiche complète : on la re-récupère par id juste
// avant de générer le document, plutôt que d'alourdir la liste pour tout
// le monde.
Future<void> _viewFichePdf(BuildContext context, PorPromeshModel item, {required bool print}) async {
  try {
    final full = item.id == null ? item : await PorPromeshService.instance.fetchById(item.id!);
    if (print) {
      await PorPromeshPdfService.instance.printPdf(full);
    } else {
      await PorPromeshPdfService.instance.exportPdf(full);
    }
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
  }
}

Future<void> _viewFicheExcel(BuildContext context, PorPromeshModel item) async {
  try {
    final full = item.id == null ? item : await PorPromeshService.instance.fetchById(item.id!);
    PorPromeshExcelService.instance.export(full);
  } catch (e) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
  }
}

class PosteDashboardScreen extends StatefulWidget {
  final String machine;
  final String poste;

  const PosteDashboardScreen({super.key, required this.machine, required this.poste});

  @override
  State<PosteDashboardScreen> createState() => _PosteDashboardScreenState();
}

class _PosteDashboardScreenState extends State<PosteDashboardScreen> {
  bool _loading = true;
  String? _error;

  late String _machineFilter = widget.machine;
  String _dateRange = 'today';
  String? _statusFilter;
  String _sort = 'date_desc';
  String _search = '';
  Timer? _searchDebounce;

  _ViewMode _viewMode = _ViewMode.cards;
  int _page = 1;
  int _pageSize = 10;
  bool _creatingDraft = false;

  PosteDashboardStats _stats = const PosteDashboardStats();
  PosteChartsData _charts = const PosteChartsData();
  List<PorPromeshModel> _items = [];
  int _total = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        PorPromeshService.instance.fetchDashboard(
          machine: _machineFilter,
          poste: widget.poste,
          dateRange: _dateRange,
          status: _statusFilter,
        ),
        PorPromeshService.instance.fetchStats(
          machine: _machineFilter,
          poste: widget.poste,
          dateRange: _dateRange,
          status: _statusFilter,
        ),
        PorPromeshService.instance.fetchPage(
          machine: _machineFilter,
          poste: widget.poste,
          dateRange: _dateRange,
          status: _statusFilter,
          search: _search,
          sort: _sort,
          page: _page,
          pageSize: _pageSize,
        ),
      ]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as PosteDashboardStats;
        _charts = results[1] as PosteChartsData;
        final page = results[2] as ({List<PorPromeshModel> items, int total});
        _items = page.items;
        _total = page.total;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onFilterChanged() {
    _page = 1;
    _load();
  }

  void _onSearchChanged(String value) {
    _search = value;
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), _onFilterChanged);
  }

  String get _backRoute => '${MyRoute.productionPromeshRoot}/machine/${widget.machine}';

  // Un seul clic doit toujours amener directement sur la page Modules
  // (jamais un module spécifique — l'utilisateur choisit) :
  // - Cas 1 (aucun brouillon ouvert dans cette session) : POST /por-promesh/new
  //   crée une fiche neuve côté backend, qui renvoie son id immédiatement.
  // - Cas 2 (l'utilisateur est déjà revenu sur ce Dashboard sans avoir validé
  //   le brouillon en cours pour CE machine+poste — le contrôleur permanent
  //   le détient encore en mémoire) : on le rouvre directement, sans appel
  //   réseau ni recréation. Ne concerne que la session en cours, jamais une
  //   recherche en base — ça évite de retomber sur d'anciennes valeurs.
  // - Cas 3 (le brouillon en mémoire est déjà VALIDE/verrouillé, ou
  //   n'existe pas) : POST /por-promesh/new crée systématiquement une
  //   fiche neuve (le backend ne réutilise jamais une fiche verrouillée).
  // Dans tous les cas : id obtenu → navigation immédiate, jamais besoin
  // d'un second clic. Le Dashboard reste affiché pendant l'appel (jamais
  // d'écran vide) ; en cas d'erreur on reste ici avec un message.
  Future<void> _createOrOpenDraft() async {
    debugPrint('[PosteDashboard] CLICK Nouvelle fiche (machine=${widget.machine}, poste=${widget.poste})');
    if (_creatingDraft) return;
    setState(() => _creatingDraft = true);
    try {
      final existing = Get.isRegistered<PorPromeshController>() ? Get.find<PorPromeshController>() : null;
      final reusableId = existing != null &&
              existing.recordId != null &&
              !existing.isLocked.value &&
              existing.machine.value == widget.machine &&
              existing.poste.value == widget.poste
          ? existing.recordId
          : null;

      late final String id;
      if (reusableId != null) {
        debugPrint('[PosteDashboard] Brouillon de session déjà ouvert, réutilisation id=$reusableId (pas de POST)');
        id = reusableId;
      } else {
        final record =
            await PorPromeshService.instance.createOrOpenDraft(machine: widget.machine, poste: widget.poste);
        debugPrint('[PosteDashboard] POST terminé, ID reçu : ${record.id}');
        id = record.id;
      }

      // Navigation immédiate, jamais de refresh du Dashboard (KPI/liste)
      // entre le POST et la navigation : le brouillon créé ne doit jamais
      // apparaître ici — seul le retour sur ce Dashboard (nouvelle instance
      // de l'écran, voir initState/_load) le rechargera.
      //
      // Ouvre la page Modules (jamais un module spécifique) — l'utilisateur
      // choisit librement le premier module à remplir. Le ficheId est
      // conservé dans l'URL (query param) et retransmis à chaque écran
      // module ensuite, aucune re-création implicite n'est plus possible.
      if (!mounted) return;
      final path = '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/modules?ficheId=$id';
      debugPrint('[PosteDashboard] Navigation vers la fiche : $path');
      context.go(path);
    } catch (e) {
      debugPrint('[PosteDashboard] ERREUR pendant la création/ouverture : $e');
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _creatingDraft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isMobile = screenWidth < 700;

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: IndustrialPageBody(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _buildHeader(isMobile),
                const SizedBox(height: 20),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text('Erreur de chargement : $_error', style: tInter(fontSize: 13, color: kCrmDanger)),
                  )
                else ...[
                  _buildKpiGrid(isMobile),
                  const SizedBox(height: 24),
                  _buildCharts(isMobile),
                  const SizedBox(height: 24),
                  _buildSearchAndFilters(isMobile),
                  const SizedBox(height: 16),
                  _buildListHeader(),
                  const SizedBox(height: 12),
                  _buildList(isMobile),
                  const SizedBox(height: 16),
                  _buildPagination(),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }

  // ── HEADER ────────────────────────────────────────────────────────────

  Widget _buildHeader(bool isMobile) {
    final now = DateTime.now();
    final posteLabel = widget.poste == 'matin' ? 'Matin' : 'Soir';
    final posteColor = widget.poste == 'matin' ? kCrmWarning : kPersonnelColor;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      InkWell(
        onTap: () => context.go(_backRoute),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
          child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
        ),
      ),
      const SizedBox(height: 16),
      Wrap(
        spacing: 20,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          IndustrialContextHeader(machine: widget.machine, poste: widget.poste, color: kPromeshColor),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(color: posteColor.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
            child: Text('POSTE $posteLabel'.toUpperCase(),
                style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: posteColor)),
          ),
          IndustrialInfoChip(
              icon: Icons.event_outlined, label: DateFormat('dd/MM/yyyy').format(now), color: kCrmTextSub),
          IndustrialInfoChip(icon: Icons.schedule_outlined, label: DateFormat('HH:mm').format(now), color: kCrmTextSub),
          IndustrialInfoChip(
              icon: Icons.person_outline_rounded, label: AuthService().displayName, color: kCrmTextSub),
        ],
      ),
      const SizedBox(height: 20),
      SizedBox(
        width: isMobile ? double.infinity : 260,
        child: IndustrialBigButton(
          label: _creatingDraft ? 'Préparation…' : 'Nouvelle fiche',
          icon: Icons.add_rounded,
          color: kPromeshColor,
          onTap: _creatingDraft ? null : _createOrOpenDraft,
        ),
      ),
    ]);
  }

  // ── KPI ───────────────────────────────────────────────────────────────

  Widget _buildKpiGrid(bool isMobile) {
    if (_loading) {
      return KpiSkeletonGrid(crossAxisCount: isMobile ? 2 : 3);
    }
    final cards = [
      KpiStatCard(
          icon: Icons.description_outlined,
          value: _stats.fichesCount.toString(),
          label: 'Fiches créées',
          color: kCrmPrimary),
      KpiStatCard(
          icon: Icons.check_circle_outline_rounded,
          value: _stats.fichesValidees.toString(),
          label: 'Fiches validées',
          color: kCrmSuccess),
      KpiStatCard(
          icon: Icons.edit_note_rounded,
          value: _stats.fichesBrouillon.toString(),
          label: 'Brouillons',
          color: kCrmWarning),
      KpiStatCard(
          icon: Icons.trending_up_rounded,
          value: '${_stats.productionTotale.toStringAsFixed(1)} m²',
          label: 'Production totale',
          color: kCrmSecondary),
      KpiStatCard(
          icon: Icons.warning_amber_rounded,
          value: _stats.nonConformites.toString(),
          label: 'Non-conformités',
          color: kCrmDanger),
      KpiStatCard(
          icon: Icons.engineering_outlined,
          value: _stats.operateursPresents.toString(),
          label: 'Opérateurs présents',
          color: kPersonnelColor),
    ];
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: isMobile ? 2 : 3,
      mainAxisSpacing: 14,
      crossAxisSpacing: 14,
      childAspectRatio: isMobile ? 1.3 : 1.6,
      children: cards,
    );
  }

  // ── GRAPHIQUES ────────────────────────────────────────────────────────

  Widget _buildCharts(bool isMobile) {
    final charts = [
      _ChartContainer(
        title: 'Production par heure',
        icon: Icons.bar_chart_outlined,
        color: kCrmSecondary,
        child: _loading ? const ChartSkeleton() : _buildHourlyBarChart(),
      ),
      _ChartContainer(
        title: 'Conformité',
        icon: Icons.pie_chart_outline_rounded,
        color: kCrmSuccess,
        child: _loading ? const ChartSkeleton() : _buildConformitePieChart(),
      ),
      _ChartContainer(
        title: 'Production — 7 derniers jours',
        icon: Icons.show_chart_rounded,
        color: kPromeshColor,
        child: _loading ? const ChartSkeleton() : _buildTrendLineChart(),
      ),
    ];
    if (isMobile) {
      return Column(children: [for (final c in charts) Padding(padding: const EdgeInsets.only(bottom: 16), child: c)]);
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [for (final c in charts) Expanded(child: Padding(padding: const EdgeInsets.only(right: 12), child: c))],
    );
  }

  Widget _buildHourlyBarChart() {
    final maxY = _charts.parHeure.fold<double>(10, (m, h) => h.production > m ? h.production : m) * 1.2;
    return BarChart(BarChartData(
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
            interval: 3,
            getTitlesWidget: (value, meta) => Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(value.toInt().toString(), style: tInter(fontSize: 10, color: kCrmTextSub)),
            ),
          ),
        ),
      ),
      barGroups: [
        for (final h in _charts.parHeure)
          BarChartGroupData(x: h.hour, barRods: [
            BarChartRodData(toY: h.production, color: kCrmSecondary, width: 6, borderRadius: BorderRadius.circular(3)),
          ]),
      ],
    ));
  }

  Widget _buildConformitePieChart() {
    final total = _charts.conforme + _charts.nonConforme;
    if (total == 0) {
      return Center(child: Text('Aucune donnée', style: tInter(fontSize: 12.5, color: kCrmTextSub)));
    }
    return Row(children: [
      Expanded(
        child: PieChart(PieChartData(
          sectionsSpace: 2,
          centerSpaceRadius: 32,
          sections: [
            if (_charts.conforme > 0)
              PieChartSectionData(
                value: _charts.conforme.toDouble(),
                color: kCrmSuccess,
                title: '${(_charts.conforme / total * 100).round()}%',
                titleStyle: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white),
                radius: 50,
              ),
            if (_charts.nonConforme > 0)
              PieChartSectionData(
                value: _charts.nonConforme.toDouble(),
                color: kCrmDanger,
                title: '${(_charts.nonConforme / total * 100).round()}%',
                titleStyle: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white),
                radius: 50,
              ),
          ],
        )),
      ),
      const SizedBox(width: 12),
      Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
        _legendDot(kCrmSuccess, 'Conforme (${_charts.conforme})'),
        const SizedBox(height: 8),
        _legendDot(kCrmDanger, 'Non Conforme (${_charts.nonConforme})'),
      ]),
    ]);
  }

  Widget _legendDot(Color color, String label) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 9, height: 9, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 6),
      Text(label, style: tInter(fontSize: 11.5, color: kCrmText)),
    ]);
  }

  Widget _buildTrendLineChart() {
    final spots = [
      for (int i = 0; i < _charts.parJour.length; i++) FlSpot(i.toDouble(), _charts.parJour[i].production),
    ];
    final maxY = _charts.parJour.fold<double>(10, (m, d) => d.production > m ? d.production : m) * 1.2;
    return LineChart(LineChartData(
      minY: 0,
      maxY: maxY,
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
              if (i < 0 || i >= _charts.parJour.length) return const SizedBox.shrink();
              final d = DateTime.tryParse(_charts.parJour[i].date);
              final label = d == null ? '' : DateFormat('dd/MM').format(d);
              return Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(label, style: tInter(fontSize: 10, color: kCrmTextSub)),
              );
            },
          ),
        ),
      ),
      lineBarsData: [
        LineChartBarData(
          spots: spots,
          isCurved: true,
          color: kPromeshColor,
          barWidth: 3,
          dotData: const FlDotData(show: true),
          belowBarData: BarAreaData(show: true, color: kPromeshColor.withOpacity(0.12)),
        ),
      ],
    ));
  }

  // ── RECHERCHE + FILTRES ───────────────────────────────────────────────

  Widget _buildSearchAndFilters(bool isMobile) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(
        onChanged: _onSearchChanged,
        decoration: InputDecoration(
          hintText: 'Rechercher par opérateur, responsable, numéro de fiche, date...',
          prefixIcon: const Icon(Icons.search_rounded, size: 20),
          filled: true,
          fillColor: kCrmSurface,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
        ),
      ),
      const SizedBox(height: 12),
      Wrap(spacing: 10, runSpacing: 10, children: [
        _filterDropdown<String>(
          label: 'Date',
          value: _dateRange,
          items: _kDateRanges,
          onChanged: (v) => setState(() {
            _dateRange = v!;
            _onFilterChanged();
          }),
        ),
        _filterDropdown<String>(
          label: 'Machine',
          value: _machineFilter,
          items: [for (final m in ['1', '2', '3', '4']) (m, 'Machine $m')],
          onChanged: (v) => setState(() {
            _machineFilter = v!;
            _onFilterChanged();
          }),
        ),
        _filterDropdown<String?>(
          label: 'Statut',
          value: _statusFilter,
          items: _kStatusFilters,
          onChanged: (v) => setState(() {
            _statusFilter = v;
            _onFilterChanged();
          }),
        ),
        _filterDropdown<String>(
          label: 'Tri',
          value: _sort,
          items: _kSorts,
          onChanged: (v) => setState(() {
            _sort = v!;
            _onFilterChanged();
          }),
        ),
      ]),
    ]);
  }

  Widget _filterDropdown<T>({
    required String label,
    required T value,
    required List<(T, String)> items,
    required ValueChanged<T?> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kCrmBorder),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isDense: true,
          icon: const Icon(Icons.expand_more_rounded, size: 18, color: kCrmTextSub),
          style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmText),
          hint: Text(label, style: tInter(fontSize: 12.5, color: kCrmTextSub)),
          items: [
            for (final item in items) DropdownMenuItem<T>(value: item.$1, child: Text('$label : ${item.$2}')),
          ],
          onChanged: onChanged,
        ),
      ),
    );
  }

  // ── LISTE ─────────────────────────────────────────────────────────────

  Widget _buildListHeader() {
    return Row(children: [
      Expanded(
        child: Text('Fiches du poste ($_total)', style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
      ),
      IconButton(
        tooltip: 'Actualiser',
        icon: _loading
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.refresh_rounded, size: 18, color: kCrmTextSub),
        onPressed: _loading ? null : _load,
      ),
      const SizedBox(width: 6),
      _viewToggleButton(Icons.grid_view_rounded, _ViewMode.cards),
      const SizedBox(width: 6),
      _viewToggleButton(Icons.table_rows_outlined, _ViewMode.table),
    ]);
  }

  Widget _viewToggleButton(IconData icon, _ViewMode mode) {
    final active = _viewMode == mode;
    return InkWell(
      onTap: () => setState(() => _viewMode = mode),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: active ? kPromeshColor.withOpacity(0.12) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: active ? kPromeshColor : kCrmBorder),
        ),
        child: Icon(icon, size: 18, color: active ? kPromeshColor : kCrmTextSub),
      ),
    );
  }

  Widget _buildList(bool isMobile) {
    if (_loading) return const FicheCardSkeletonList();
    if (_items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 30),
        child: Center(child: Text('Aucune fiche pour ces filtres', style: tInter(fontSize: 13, color: kCrmTextSub))),
      );
    }
    if (_viewMode == _ViewMode.table && !isMobile) {
      return _buildTable();
    }
    return Column(children: [for (final item in _items) _FicheCard(item: item)]);
  }

  Widget _buildTable() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowColor: WidgetStateProperty.all(kCrmBg),
        columns: const [
          DataColumn(label: Text('Date')),
          DataColumn(label: Text('Machine')),
          DataColumn(label: Text('Poste')),
          DataColumn(label: Text('Opérateur')),
          DataColumn(label: Text('Production')),
          DataColumn(label: Text('Statut')),
          DataColumn(label: Text('Actions')),
        ],
        rows: [
          for (final item in _items)
            DataRow(cells: [
              DataCell(Text(item.dateProduction ?? '')),
              DataCell(Text('Machine ${item.machine ?? ''}')),
              DataCell(Text(item.poste == 'matin' ? 'Matin' : 'Soir')),
              DataCell(Text(item.operateur ?? '')),
              DataCell(Text(item.productionM2 == null ? '' : '${item.productionM2} m²')),
              DataCell(_statusBadge(item)),
              DataCell(_ficheActions(item)),
            ]),
        ],
      ),
    );
  }

  Widget _statusBadge(PorPromeshModel item) {
    final isDraft = item.status == 'draft';
    final color = isDraft ? kCrmWarning : kCrmSuccess;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(isDraft ? 'BROUILLON' : 'VALIDÉ', style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: color)),
    );
  }

  Widget _ficheActions(PorPromeshModel item) {
    return Wrap(spacing: 4, children: [
      IconButton(
        tooltip: 'Voir',
        icon: const Icon(Icons.visibility_outlined, size: 18, color: kCrmTextSub),
        onPressed: () => context.go('${MyRoute.porPromeshDetailScreen}?id=${item.id}'),
      ),
      IconButton(
        tooltip: 'Télécharger PDF',
        icon: const Icon(Icons.picture_as_pdf_outlined, size: 18, color: kCrmSecondary),
        onPressed: () => _viewFichePdf(context, item, print: false),
      ),
      IconButton(
        tooltip: 'Imprimer',
        icon: const Icon(Icons.print_outlined, size: 18, color: kCrmTextSub),
        onPressed: () => _viewFichePdf(context, item, print: true),
      ),
      IconButton(
        tooltip: 'Export Excel',
        icon: const Icon(Icons.grid_on_rounded, size: 18, color: kCrmSuccess),
        onPressed: () => _viewFicheExcel(context, item),
      ),
    ]);
  }

  // ── PAGINATION ────────────────────────────────────────────────────────

  Widget _buildPagination() {
    final totalPages = (_total / _pageSize).ceil().clamp(1, 999999);
    // `Wrap` ne supporte pas `Spacer` (pas de notion d'espace flexible entre
    // ses enfants, contrairement à `Row`/`Column`) — remplacé par un espace
    // fixe pour éviter un crash ParentDataWidget tout en gardant le retour
    // à la ligne responsive sur petits écrans.
    return Wrap(spacing: 12, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
      Text('Par page :', style: tInter(fontSize: 12.5, color: kCrmTextSub)),
      _filterDropdown<int>(
        label: '',
        value: _pageSize,
        items: [for (final s in _kPageSizes) (s, s.toString())],
        onChanged: (v) => setState(() {
          _pageSize = v!;
          _onFilterChanged();
        }),
      ),
      const SizedBox(width: 24),
      IconButton(
        icon: const Icon(Icons.chevron_left_rounded),
        onPressed: _page > 1 ? () => setState(() { _page--; _load(); }) : null,
      ),
      Text('Page $_page / $totalPages', style: tInter(fontSize: 12.5, color: kCrmTextSub)),
      IconButton(
        icon: const Icon(Icons.chevron_right_rounded),
        onPressed: _page < totalPages ? () => setState(() { _page++; _load(); }) : null,
      ),
    ]);
  }
}

class _ChartContainer extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final Widget child;

  const _ChartContainer({required this.title, required this.icon, required this.color, required this.child});

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
        Row(children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 14, color: color),
          ),
          const SizedBox(width: 10),
          Text(title, style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmText)),
        ]),
        const SizedBox(height: 16),
        SizedBox(height: 200, child: child),
      ]),
    );
  }
}

class _FicheCard extends StatelessWidget {
  final PorPromeshModel item;
  const _FicheCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final isDraft = item.status == 'draft';
    final isNonConforme = item.conformite == 'non_conforme';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 16, runSpacing: 8, children: [
          _chip(Icons.event_outlined, item.dateProduction ?? ''),
          _chip(Icons.precision_manufacturing_outlined, 'Machine ${item.machine ?? ''}'),
          _chip(item.poste == 'matin' ? Icons.wb_sunny_rounded : Icons.nightlight_round,
              item.poste == 'matin' ? 'Matin' : 'Soir'),
          _chip(Icons.person_outline_rounded, item.operateur ?? ''),
          _chip(Icons.speed_rounded, item.productionM2 == null ? '' : '${item.productionM2} m²'),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _badge(isNonConforme ? '🔴 Non Conforme' : '🟢 Conforme', isNonConforme ? kCrmDanger : kCrmSuccess),
          _badge(isDraft ? 'BROUILLON' : 'VALIDÉ', isDraft ? kCrmWarning : kCrmSuccess),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 6, runSpacing: 6, children: [
          _actionButton('Voir', Icons.visibility_outlined, kCrmTextSub,
              () => context.go('${MyRoute.porPromeshDetailScreen}?id=${item.id}')),
          _actionButton('PDF', Icons.picture_as_pdf_outlined, kCrmSecondary,
              () => _viewFichePdf(context, item, print: false)),
          _actionButton('Imprimer', Icons.print_outlined, kCrmTextSub,
              () => _viewFichePdf(context, item, print: true)),
          _actionButton('Export Excel', Icons.grid_on_rounded, kCrmSuccess,
              () => _viewFicheExcel(context, item)),
        ]),
      ]),
    );
  }

  Widget _chip(IconData icon, String label) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: kCrmTextSub),
      const SizedBox(width: 4),
      Text(label, style: tInter(fontSize: 12, color: kCrmText)),
    ]);
  }

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    );
  }

  Widget _actionButton(String label, IconData icon, Color color, VoidCallback onTap) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 14, color: color),
      label: Text(label, style: tInter(fontSize: 11.5, fontWeight: FontWeight.w600, color: color)),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: color.withOpacity(0.4)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        backgroundColor: color.withOpacity(0.06),
      ),
    );
  }
}
