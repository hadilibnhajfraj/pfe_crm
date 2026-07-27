// lib/forms/por_promesh/view/por_promesh_list_screen.dart
//
// Liste des fiches POR PROMESH — refonte visuelle complète alignée sur le
// design des écrans-module (mêmes tokens que `poste_dashboard_screen.dart` :
// KPI cards, filtres, recherche débattue, bascule Cartes/Tableau,
// pagination). Vue GLOBALE (toutes machines/tous postes), à la différence
// de `poste_dashboard_screen.dart` qui est scopée à un poste.
//
// STRICTEMENT visuel : réutilise `PorPromeshService.fetchDashboard()` et
// `.fetchPage()` déjà existants (aucune signature/route/contrôleur/modèle
// touché). Le backend (`porPromesh.service.js`) ne supporte que 3 tris
// (date_desc/date_asc/production_desc), 2 statuts réels (BROUILLON/VALIDE,
// + `isLocked` qui vaut toujours vrai exactement quand VALIDE — voir
// `validatePorPromesh`) et des dates par préréglage ou exactes — les
// filtres/tri ci-dessous restent strictement dans ce périmètre (voir
// `_kDateRanges`/`_kStatuts`/`_kSorts`).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';

import '../model/por_promesh_model.dart';
import '../model/poste_dashboard_stats.dart';
import '../service/por_promesh_service.dart';
import '../service/por_promesh_pdf_service.dart';
import '../service/por_promesh_excel_service.dart';
import 'widgets/shimmer_box.dart';

enum _ViewMode { cards, table }

const _kDateRanges = <(String?, String)>[
  (null, 'Toutes les dates'),
  ('today', "Aujourd'hui"),
  ('yesterday', 'Hier'),
  ('week', 'Cette semaine'),
  ('month', 'Ce mois'),
];

const _kMachines = <(String?, String)>[
  (null, 'Toutes les machines'),
  ('1', 'Machine 1'),
  ('2', 'Machine 2'),
  ('3', 'Machine 3'),
  ('4', 'Machine 4'),
];

const _kPostes = <(String?, String)>[
  (null, 'Tous les postes'),
  ('matin', 'Matin'),
  ('nuit', 'Soir'),
];

// Le backend n'a que 2 statuts réels (BROUILLON/VALIDE) — pas de filtre
// dédié "Verrouillée" (voir note d'en-tête : isLocked==status=='VALIDE').
const _kStatuts = <(String?, String)>[
  (null, 'Tous les statuts'),
  ('brouillon', 'Brouillon'),
  ('valide', 'Validée'),
];

const _kSorts = <(String, String)>[
  ('date_desc', 'Date décroissante'),
  ('date_asc', 'Date croissante'),
  ('production_desc', 'Production'),
];

const _kPageSizes = [10, 25, 50, 100];

// Badge "Verrouillée" — noir/gris foncé, distinct des couleurs de statut.
const Color _kLockedColor = Color(0xFF1F2937);

class PorPromeshListScreen extends StatefulWidget {
  const PorPromeshListScreen({super.key});

  @override
  State<PorPromeshListScreen> createState() => _PorPromeshListScreenState();
}

class _PorPromeshListScreenState extends State<PorPromeshListScreen> {
  bool _loadingStats = true;
  bool _loadingList = true;
  String? _error;

  String? _dateRange;
  String? _machineFilter;
  String? _posteFilter;
  String? _statusFilter;
  String _sort = 'date_desc';
  String _search = '';
  Timer? _searchDebounce;

  _ViewMode _viewMode = _ViewMode.cards;
  int _page = 1;
  int _pageSize = 10;

  // Tri client (page courante uniquement) pour les colonnes du tableau non
  // couvertes par un tri serveur — voir en-tête de fichier.
  int? _tableSortColumnIndex;
  bool _tableSortAscending = true;

  PosteDashboardStats _stats = const PosteDashboardStats();
  int _machinesActives = 0;
  List<PorPromeshModel> _items = [];
  int _total = 0;

  @override
  void initState() {
    super.initState();
    _loadStats();
    _loadList();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }

  // KPI globaux (toutes machines/tous postes) — `fetchDashboard()` sans
  // machine/poste agrège déjà l'ensemble des fiches côté backend
  // (`buildWhere` ne filtre que si le paramètre est fourni). "Machines
  // actives" : 4 machines seulement, 4 appels légers supplémentaires en
  // parallèle plutôt qu'un nouvel endpoint backend.
  Future<void> _loadStats() async {
    setState(() => _loadingStats = true);
    try {
      final results = await Future.wait([
        PorPromeshService.instance.fetchDashboard(),
        for (final m in ['1', '2', '3', '4']) PorPromeshService.instance.fetchDashboard(machine: m),
      ]);
      if (!mounted) return;
      final perMachine = results.sublist(1);
      setState(() {
        _stats = results[0];
        _machinesActives = perMachine.where((s) => s.fichesCount > 0).length;
      });
    } catch (_) {
      // Best-effort : une erreur sur les KPI ne doit jamais bloquer la liste.
    } finally {
      if (mounted) setState(() => _loadingStats = false);
    }
  }

  Future<void> _loadList() async {
    setState(() {
      _loadingList = true;
      _error = null;
      _tableSortColumnIndex = null;
    });
    try {
      final page = await PorPromeshService.instance.fetchPage(
        machine: _machineFilter,
        poste: _posteFilter,
        dateRange: _dateRange,
        status: _statusFilter,
        search: _search,
        sort: _sort,
        page: _page,
        pageSize: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _items = page.items;
        _total = page.total;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loadingList = false);
    }
  }

  Future<void> _refreshAll() => Future.wait([_loadStats(), _loadList()]);

  void _onFilterChanged() {
    _page = 1;
    _loadList();
  }

  void _onSearchChanged(String value) {
    _search = value;
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), _onFilterChanged);
  }

  void _resetFilters() {
    setState(() {
      _dateRange = null;
      _machineFilter = null;
      _posteFilter = null;
      _statusFilter = null;
      _sort = 'date_desc';
      _search = '';
      _page = 1;
    });
    _loadList();
  }

  String _editRoute(PorPromeshModel item) {
    if (item.machine == null || item.poste == null) return MyRoute.productionPromeshRoot;
    return '${MyRoute.productionPromeshRoot}/machine/${item.machine}/poste/${item.poste}';
  }

  Future<void> _confirmDelete(PorPromeshModel item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Supprimer'),
        content: Text('Voulez-vous vraiment supprimer la fiche ${item.numero ?? item.dateProduction ?? ''} ?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Annuler')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirm != true || item.id == null) return;
    try {
      await PorPromeshService.instance.delete(item.id!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Fiche supprimée')));
      _refreshAll();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  // Liste "light" (voir fetchPage) : les actions PDF/Excel ont besoin de la
  // fiche complète, re-récupérée par id juste avant génération.
  Future<void> _printPdf(PorPromeshModel item) async {
    try {
      final full = item.id == null ? item : await PorPromeshService.instance.fetchById(item.id!);
      await PorPromeshPdfService.instance.printPdf(full);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur impression : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  Future<void> _exportPdf(PorPromeshModel item) async {
    try {
      final full = item.id == null ? item : await PorPromeshService.instance.fetchById(item.id!);
      await PorPromeshPdfService.instance.exportPdf(full);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur export PDF : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  Future<void> _exportExcel(PorPromeshModel item) async {
    try {
      final full = item.id == null ? item : await PorPromeshService.instance.fetchById(item.id!);
      PorPromeshExcelService.instance.export(full);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur export Excel : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isMobile = screenWidth < 700;
    final crossAxisCount = screenWidth >= 1100 ? 4 : (screenWidth >= 700 ? 2 : 1);

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refreshAll,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _buildHeader(),
              const SizedBox(height: 20),
              _buildKpiRow(isMobile),
              const SizedBox(height: 24),
              _buildFilterBar(),
              const SizedBox(height: 18),
              _buildListHeader(),
              const SizedBox(height: 12),
              if (_error != null)
                _buildError()
              else ...[
                _buildList(crossAxisCount, isMobile),
                const SizedBox(height: 16),
                _buildPagination(),
              ],
            ]),
          ),
        ),
      ),
    );
  }

  // ── HEADER ────────────────────────────────────────────────────────────

  Widget _buildHeader() {
    return Row(children: [
      Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: kPromeshColor.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
        child: Icon(Icons.description_outlined, size: 22, color: kPromeshColor),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Text('Fiches POR PROMESH', style: tInter(fontSize: 20, fontWeight: FontWeight.w800, color: kCrmText)),
      ),
      GradientButton(
        label: 'Nouvelle fiche',
        icon: Icons.add_rounded,
        onTap: () => context.go(MyRoute.productionPromeshRoot),
      ),
    ]);
  }

  // ── KPI ───────────────────────────────────────────────────────────────

  Widget _buildKpiRow(bool isMobile) {
    final crossAxisCount = isMobile ? 2 : 4;
    if (_loadingStats) return KpiSkeletonGrid(count: 7, crossAxisCount: crossAxisCount);

    final production = _stats.fichesCount == 0 ? 0.0 : _stats.productionTotale / _stats.fichesCount;
    final cards = [
      KpiStatCard(icon: Icons.description_outlined, value: '${_stats.fichesCount}', label: 'Total fiches', color: kCrmPrimary),
      KpiStatCard(icon: Icons.edit_note_rounded, value: '${_stats.fichesBrouillon}', label: 'Brouillons', color: kCrmWarning),
      KpiStatCard(icon: Icons.check_circle_outline_rounded, value: '${_stats.fichesValidees}', label: 'Validées', color: kCrmInfo),
      // isLocked vaut toujours vrai exactement quand status == 'VALIDE'
      // (voir validatePorPromesh) — même valeur que "Validées", ce n'est
      // pas une coïncidence.
      KpiStatCard(icon: Icons.lock_outline_rounded, value: '${_stats.fichesValidees}', label: 'Verrouillées', color: _kLockedColor),
      KpiStatCard(
          icon: Icons.trending_up_rounded,
          value: '${_stats.productionTotale.toStringAsFixed(1)} m²',
          label: 'Production totale',
          color: kPromeshColor),
      KpiStatCard(
          icon: Icons.equalizer_rounded,
          value: '${production.toStringAsFixed(1)} m²',
          label: 'Production moyenne',
          color: kCrmSecondary),
      KpiStatCard(
          icon: Icons.precision_manufacturing_outlined,
          value: '$_machinesActives / 4',
          label: 'Machines actives',
          color: kCrmSuccess),
    ];
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: crossAxisCount,
      mainAxisSpacing: 14,
      crossAxisSpacing: 14,
      childAspectRatio: isMobile ? 1.3 : 1.5,
      children: cards,
    );
  }

  // ── RECHERCHE + FILTRES ───────────────────────────────────────────────

  Widget _buildFilterBar() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(
        onChanged: _onSearchChanged,
        decoration: InputDecoration(
          hintText: 'Rechercher par numéro, machine, opérateur, responsable, date...',
          prefixIcon: const Icon(Icons.search_rounded, size: 20),
          filled: true,
          fillColor: kCrmSurface,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
        ),
      ),
      const SizedBox(height: 12),
      Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
        _filterDropdown<String?>(
          label: 'Date',
          icon: Icons.event_outlined,
          value: _dateRange,
          items: _kDateRanges,
          onChanged: (v) => setState(() {
            _dateRange = v;
            _onFilterChanged();
          }),
        ),
        _filterDropdown<String?>(
          label: 'Machine',
          icon: Icons.precision_manufacturing_outlined,
          value: _machineFilter,
          items: _kMachines,
          onChanged: (v) => setState(() {
            _machineFilter = v;
            _onFilterChanged();
          }),
        ),
        _filterDropdown<String?>(
          label: 'Poste',
          icon: Icons.schedule_outlined,
          value: _posteFilter,
          items: _kPostes,
          onChanged: (v) => setState(() {
            _posteFilter = v;
            _onFilterChanged();
          }),
        ),
        _filterDropdown<String?>(
          label: 'Statut',
          icon: Icons.flag_outlined,
          value: _statusFilter,
          items: _kStatuts,
          onChanged: (v) => setState(() {
            _statusFilter = v;
            _onFilterChanged();
          }),
        ),
        _filterDropdown<String>(
          label: 'Trier',
          icon: Icons.sort_rounded,
          value: _sort,
          items: _kSorts,
          onChanged: (v) => setState(() {
            _sort = v!;
            _onFilterChanged();
          }),
        ),
        OutlinedButton.icon(
          onPressed: _resetFilters,
          icon: const Icon(Icons.refresh_rounded, size: 16, color: kCrmTextSub),
          label: Text('Réinitialiser', style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmTextSub)),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: kCrmBorder),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            backgroundColor: kCrmSurface,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
      ]),
    ]);
  }

  Widget _filterDropdown<T>({
    required String label,
    required IconData icon,
    required T value,
    required List<(T, String)> items,
    required ValueChanged<T?> onChanged,
  }) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
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
          hint: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 14, color: kCrmTextSub),
            const SizedBox(width: 6),
            Text(label, style: tInter(fontSize: 12.5, color: kCrmTextSub)),
          ]),
          selectedItemBuilder: (context) => [
            for (final item in items)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon, size: 14, color: kCrmTextSub),
                const SizedBox(width: 6),
                Text(item.$2, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmText)),
              ]),
          ],
          items: [
            for (final item in items) DropdownMenuItem<T>(value: item.$1, child: Text(item.$2)),
          ],
          onChanged: onChanged,
        ),
      ),
    );
  }

  // ── EN-TÊTE LISTE + BASCULE VUE ─────────────────────────────────────────

  Widget _buildListHeader() {
    return Row(children: [
      Expanded(
        child: Text('$_total fiche${_total > 1 ? 's' : ''}', style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
      ),
      IconButton(
        tooltip: 'Actualiser',
        icon: _loadingList
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.refresh_rounded, size: 18, color: kCrmTextSub),
        onPressed: _loadingList ? null : _refreshAll,
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
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
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

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline_rounded, color: kCrmDanger, size: 36),
          const SizedBox(height: 8),
          Text('Erreur de chargement : $_error', textAlign: TextAlign.center, style: tInter(fontSize: 13, color: kCrmTextSub)),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _loadList, child: const Text('Réessayer')),
        ]),
      ),
    );
  }

  // ── LISTE (CARTES / TABLEAU) ─────────────────────────────────────────────

  Widget _buildList(int crossAxisCount, bool isMobile) {
    if (_loadingList) return const FicheCardSkeletonList(count: 4);
    if (_items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 30),
        child: Center(child: Text('Aucune fiche pour ces filtres', style: tInter(fontSize: 13, color: kCrmTextSub))),
      );
    }
    if (_viewMode == _ViewMode.table && !isMobile) return _buildTable();

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        mainAxisExtent: 226,
        crossAxisSpacing: 14,
        mainAxisSpacing: 14,
      ),
      itemCount: _items.length,
      itemBuilder: (_, i) => _PorPromeshCard(
        item: _items[i],
        onView: () => context.go('${MyRoute.porPromeshDetailScreen}?id=${_items[i].id}'),
        onEdit: () => context.go(_editRoute(_items[i])),
        onDelete: () => _confirmDelete(_items[i]),
        onPrint: () => _printPdf(_items[i]),
        onExportPdf: () => _exportPdf(_items[i]),
        onExportExcel: () => _exportExcel(_items[i]),
      ),
    );
  }

  // Tri des colonnes du tableau : Date/Production déclenchent un vrai tri
  // serveur (mêmes clés que le filtre "Trier" ci-dessus, rechargent la
  // page). Les autres colonnes n'ont pas de tri serveur (le backend n'en
  // expose pas) — leur tri ne s'applique qu'à la page actuellement
  // affichée, jamais à l'ensemble des fiches.
  void _onSort(int columnIndex, bool ascending, Comparator<PorPromeshModel>? localComparator) {
    setState(() {
      _tableSortColumnIndex = columnIndex;
      _tableSortAscending = ascending;
      if (localComparator != null) {
        _items.sort((a, b) => ascending ? localComparator(a, b) : localComparator(b, a));
      }
    });
    if (localComparator == null) {
      // Colonne Date ou Production : bascule le vrai tri serveur.
      _sort = columnIndex == 2 ? (ascending ? 'date_asc' : 'date_desc') : 'production_desc';
      _loadList();
    }
  }

  int _cmp(String? a, String? b) => (a ?? '').compareTo(b ?? '');

  Widget _buildTable() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowColor: WidgetStateProperty.all(kCrmBg),
        sortColumnIndex: _tableSortColumnIndex,
        sortAscending: _tableSortAscending,
        columns: [
          const DataColumn(label: Text('N°')),
          DataColumn(label: const Text('Numéro'), onSort: (i, asc) => _onSort(i, asc, (a, b) => _cmp(a.numero, b.numero))),
          DataColumn(label: const Text('Date'), onSort: (i, asc) => _onSort(i, asc, null)),
          DataColumn(label: const Text('Machine'), onSort: (i, asc) => _onSort(i, asc, (a, b) => _cmp(a.machine, b.machine))),
          DataColumn(label: const Text('Poste'), onSort: (i, asc) => _onSort(i, asc, (a, b) => _cmp(a.poste, b.poste))),
          DataColumn(label: const Text('Opérateur'), onSort: (i, asc) => _onSort(i, asc, (a, b) => _cmp(a.operateur, b.operateur))),
          DataColumn(
            label: const Text('Production'),
            numeric: true,
            onSort: (i, asc) => _onSort(i, asc, null),
          ),
          DataColumn(label: const Text('Statut'), onSort: (i, asc) => _onSort(i, asc, (a, b) => _cmp(a.status, b.status))),
          DataColumn(label: const Text('Création'), onSort: (i, asc) => _onSort(i, asc, (a, b) => _cmp(a.createdAt, b.createdAt))),
          DataColumn(
              label: const Text('Validation'),
              onSort: (i, asc) => _onSort(i, asc, (a, b) => _cmp(a.dateValidationProcess, b.dateValidationProcess))),
          const DataColumn(label: Text('Actions')),
        ],
        rows: [
          for (int i = 0; i < _items.length; i++)
            DataRow(cells: [
              DataCell(Text('${(_page - 1) * _pageSize + i + 1}')),
              DataCell(Text(_items[i].numero ?? '—')),
              DataCell(Text(_items[i].dateProduction ?? '—')),
              DataCell(Text(_items[i].machine == null ? '—' : 'Machine ${_items[i].machine}')),
              DataCell(Text(_items[i].poste == 'matin' ? 'Matin' : (_items[i].poste == 'nuit' ? 'Soir' : '—'))),
              DataCell(Text(_items[i].operateur ?? '—')),
              DataCell(Text(_items[i].productionM2 == null ? '—' : '${_items[i].productionM2} m²')),
              DataCell(_statusBadges(_items[i])),
              DataCell(Text(_formatDate(_items[i].createdAt))),
              DataCell(Text(_items[i].dateValidationProcess ?? '—')),
              DataCell(_ActionsMenu(
                item: _items[i],
                onView: () => context.go('${MyRoute.porPromeshDetailScreen}?id=${_items[i].id}'),
                onEdit: () => context.go(_editRoute(_items[i])),
                onDelete: () => _confirmDelete(_items[i]),
                onPrint: () => _printPdf(_items[i]),
                onExportPdf: () => _exportPdf(_items[i]),
                onExportExcel: () => _exportExcel(_items[i]),
              )),
            ]),
        ],
      ),
    );
  }

  Widget _statusBadges(PorPromeshModel item) {
    final isDraft = item.status == 'draft' || item.status.toUpperCase() == 'BROUILLON';
    return Wrap(spacing: 6, runSpacing: 4, children: [
      _badge(isDraft ? 'Brouillon' : 'Validée', isDraft ? kCrmWarning : kCrmInfo),
      if (item.isLocked) _badge('Verrouillée', _kLockedColor, icon: Icons.lock_rounded),
    ]);
  }

  Widget _badge(String label, Color color, {IconData? icon}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 11, color: color), const SizedBox(width: 4)],
        Text(label, style: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    return d == null ? iso : DateFormat('dd/MM/yyyy').format(d);
  }

  // ── PAGINATION ────────────────────────────────────────────────────────

  Widget _buildPagination() {
    final totalPages = (_total / _pageSize).ceil().clamp(1, 999999);
    return Wrap(spacing: 12, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
      Text('Par page :', style: tInter(fontSize: 12.5, color: kCrmTextSub)),
      _filterDropdown<int>(
        label: '',
        icon: Icons.list_alt_rounded,
        value: _pageSize,
        items: [for (final s in _kPageSizes) (s, s.toString())],
        onChanged: (v) => setState(() {
          _pageSize = v!;
          _onFilterChanged();
        }),
      ),
      const SizedBox(width: 12),
      IconButton(
        icon: const Icon(Icons.chevron_left_rounded),
        onPressed: _page > 1 ? () => setState(() { _page--; _loadList(); }) : null,
      ),
      Text('Page $_page sur $totalPages', style: tInter(fontSize: 12.5, color: kCrmTextSub)),
      IconButton(
        icon: const Icon(Icons.chevron_right_rounded),
        onPressed: _page < totalPages ? () => setState(() { _page++; _loadList(); }) : null,
      ),
    ]);
  }
}

// ── MENU D'ACTIONS GROUPÉES ────────────────────────────────────────────────

class _ActionsMenu extends StatelessWidget {
  final PorPromeshModel item;
  final VoidCallback onView;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onPrint;
  final VoidCallback onExportPdf;
  final VoidCallback onExportExcel;

  const _ActionsMenu({
    required this.item,
    required this.onView,
    required this.onEdit,
    required this.onDelete,
    required this.onPrint,
    required this.onExportPdf,
    required this.onExportExcel,
  });

  @override
  Widget build(BuildContext context) {
    final isLocked = item.isLocked;
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert_rounded, size: 20, color: kCrmTextSub),
      tooltip: 'Actions',
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      onSelected: (value) {
        switch (value) {
          case 'view':
            onView();
          case 'edit':
            onEdit();
          case 'print':
            onPrint();
          case 'pdf':
            onExportPdf();
          case 'excel':
            onExportExcel();
          case 'delete':
            onDelete();
        }
      },
      itemBuilder: (context) => [
        _item('view', Icons.visibility_outlined, 'Voir', kCrmTextSub),
        _item('edit', Icons.edit_outlined, 'Modifier', isLocked ? kCrmBorder : kCrmInfo, enabled: !isLocked),
        _item('print', Icons.print_outlined, 'Imprimer', kCrmTextSub),
        _item('pdf', Icons.picture_as_pdf_outlined, 'Exporter PDF', kCrmSecondary),
        _item('excel', Icons.grid_on_rounded, 'Exporter Excel', kCrmSuccess),
        _item('delete', Icons.delete_outline_rounded, 'Supprimer', isLocked ? kCrmBorder : kCrmDanger, enabled: !isLocked),
      ],
    );
  }

  PopupMenuItem<String> _item(String value, IconData icon, String label, Color color, {bool enabled = true}) {
    return PopupMenuItem<String>(
      value: value,
      enabled: enabled,
      child: Row(children: [
        Icon(icon, size: 17, color: color),
        const SizedBox(width: 10),
        Text(label, style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: enabled ? kCrmText : kCrmBorder)),
      ]),
    );
  }
}

// ── CARTE FICHE ─────────────────────────────────────────────────────────────

class _PorPromeshCard extends StatefulWidget {
  final PorPromeshModel item;
  final VoidCallback onView;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onPrint;
  final VoidCallback onExportPdf;
  final VoidCallback onExportExcel;

  const _PorPromeshCard({
    required this.item,
    required this.onView,
    required this.onEdit,
    required this.onDelete,
    required this.onPrint,
    required this.onExportPdf,
    required this.onExportExcel,
  });

  @override
  State<_PorPromeshCard> createState() => _PorPromeshCardState();
}

class _PorPromeshCardState extends State<_PorPromeshCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final isDraft = item.status == 'draft' || item.status.toUpperCase() == 'BROUILLON';
    final statusColor = isDraft ? kCrmWarning : kCrmInfo;

    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedScale(
        scale: _hover ? 1.015 : 1.0,
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          decoration: BoxDecoration(
            color: kCrmSurface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _hover ? kPromeshColor.withOpacity(0.5) : kCrmBorder),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(_hover ? 0.06 : 0.03),
                blurRadius: _hover ? 14 : 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: widget.onView,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: kCrmPrimary.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.description_outlined, size: 18, color: kCrmPrimary),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(item.numero ?? (item.dateProduction ?? 'Fiche sans numéro'),
                        style: tInter(fontSize: 13.5, fontWeight: FontWeight.w800, color: kCrmText),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  _ActionsMenu(
                    item: item,
                    onView: widget.onView,
                    onEdit: widget.onEdit,
                    onDelete: widget.onDelete,
                    onPrint: widget.onPrint,
                    onExportPdf: widget.onExportPdf,
                    onExportExcel: widget.onExportExcel,
                  ),
                ]),
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 4, children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
                    child: Text(isDraft ? 'Brouillon' : 'Validée',
                        style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: statusColor)),
                  ),
                  if (item.isLocked)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: _kLockedColor.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.lock_rounded, size: 11, color: _kLockedColor),
                        const SizedBox(width: 4),
                        Text('Verrouillée', style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: _kLockedColor)),
                      ]),
                    ),
                ]),
                const SizedBox(height: 10),
                _row(Icons.event_outlined, item.dateProduction ?? '—'),
                _row(Icons.precision_manufacturing_outlined, item.machine == null ? '—' : 'Machine ${item.machine}'),
                _row(item.poste == 'matin' ? Icons.wb_sunny_rounded : Icons.nightlight_round,
                    item.poste == 'matin' ? 'Matin' : (item.poste == 'nuit' ? 'Soir' : '—')),
                _row(Icons.person_outline_rounded, item.operateur ?? '—'),
                const Spacer(),
                Row(children: [
                  Icon(Icons.speed_rounded, size: 13, color: kPromeshColor),
                  const SizedBox(width: 5),
                  Text(item.productionM2 == null ? 'Production : —' : 'Production : ${item.productionM2} m²',
                      style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: kCrmText)),
                ]),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(children: [
        Icon(icon, size: 12.5, color: kCrmTextSub),
        const SizedBox(width: 6),
        Expanded(child: Text(text, style: tInter(fontSize: 12, color: kCrmTextSub), maxLines: 1, overflow: TextOverflow.ellipsis)),
      ]),
    );
  }
}
