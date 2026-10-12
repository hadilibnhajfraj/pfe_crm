// lib/forms/production/view/production_line_screen.dart
//
// Page d'une ligne de production (PROMESH ou PROBAR) : KPI, accès aux
// machines, filtres (période, machine, poste, utilisateur, statut) et tableau
// des fiches. KPI et liste viennent de GET /production/fiches et se
// recalculent ensemble à chaque changement de filtre.
//
// Les actions réutilisent l'existant sans le modifier : « Modifier » ouvre le
// parcours de saisie par modules, la suppression et l'export par fiche passent
// par PorPromeshService / IndustrialRecordService, dont le backend applique
// les permissions (suppression réservée aux administrateurs, fiche validée
// verrouillée).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/service/industrial_record_service.dart';
import 'package:dash_master_toolkit/forms/industrial/service/machine_catalog.dart';
import 'package:dash_master_toolkit/forms/por_promesh/service/por_promesh_excel_service.dart';
import 'package:dash_master_toolkit/forms/por_promesh/service/por_promesh_pdf_service.dart';
import 'package:dash_master_toolkit/forms/por_promesh/service/por_promesh_service.dart';

import '../model/production_models.dart';
import '../service/production_service.dart';
import 'widgets/production_machine_picker.dart';
import 'widgets/production_widgets.dart';

/// Route du parcours de saisie d'une fiche (inchangé) — null si la fiche n'a
/// pas encore de machine ou de poste.
String? productionEditRoute(ProductionRow row) {
  if (row.machine == null || row.poste == null) return null;
  final root = row.line == 'probar' ? MyRoute.productionProbarRoot : MyRoute.productionPromeshRoot;
  return '$root/machine/${row.machine!.numero}/poste/${row.poste}/modules?ficheId=${row.id}';
}

class ProductionLineScreen extends StatefulWidget {
  final String line; // promesh | probar
  final ProductionPeriod initialPeriod;

  const ProductionLineScreen({super.key, required this.line, this.initialPeriod = ProductionPeriod.month});

  @override
  State<ProductionLineScreen> createState() => _ProductionLineScreenState();
}

class _ProductionLineScreenState extends State<ProductionLineScreen> {
  static const _pageSize = 25;

  late ProductionPeriod _period = widget.initialPeriod;
  int? _machine;
  String? _poste;
  String? _user;
  String? _status;
  String _search = '';
  int _page = 1;

  final _searchCtrl = TextEditingController();
  ProductionListResult _result = const ProductionListResult();
  bool _loading = true;
  bool _exporting = false;
  String? _error;
  int _requestId = 0;

  bool get _isProbar => widget.line == 'probar';
  String get _label => _isProbar ? 'PROBAR' : 'PROMESH';
  Color get _color => prodLineColor(widget.line);
  String get _lineRoot => _isProbar ? MyRoute.productionProbarRoot : MyRoute.productionPromeshRoot;

  ProductionListFilters get _filters =>
      ProductionListFilters(machine: _machine, poste: _poste, user: _user, status: _status, search: _search);

  bool get _hasFilters => _machine != null || _poste != null || _user != null || _status != null || _search.isNotEmpty;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final id = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ProductionService.instance.fetchList(
        line: widget.line,
        period: _period,
        filters: _filters,
        page: _page,
        pageSize: _pageSize,
      );
      if (!mounted || id != _requestId) return;
      setState(() => _result = result);
    } catch (e) {
      if (!mounted || id != _requestId) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted && id == _requestId) setState(() => _loading = false);
    }
  }

  // Tout changement de filtre revient à la première page.
  void _apply(VoidCallback change) {
    setState(() {
      change();
      _page = 1;
    });
    _load();
  }

  void _resetFilters() {
    _searchCtrl.clear();
    _apply(() {
      _machine = null;
      _poste = null;
      _user = null;
      _status = null;
      _search = '';
    });
  }

  void _toast(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message.replaceFirst('Exception: ', '')),
      backgroundColor: error ? kProdWasteColor : null,
    ));
  }

  Future<void> _export(String format) async {
    setState(() => _exporting = true);
    try {
      await ProductionService.instance.export(format: format, period: _period, line: widget.line, filters: _filters);
    } catch (e) {
      _toast('Export impossible : $e', error: true);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  // Export d'UNE fiche PROMESH : services PDF / Excel existants, alimentés
  // par la fiche complète.
  Future<void> _exportFiche(ProductionRow row, String format) async {
    try {
      final full = await PorPromeshService.instance.fetchById(row.id);
      if (format == 'pdf') {
        await PorPromeshPdfService.instance.exportPdf(full);
      } else {
        PorPromeshExcelService.instance.export(full);
      }
    } catch (e) {
      _toast('Export impossible : $e', error: true);
    }
  }

  Future<void> _confirmDelete(ProductionRow row) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: kCrmSurface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Supprimer la fiche', style: tInter(fontSize: 17, fontWeight: FontWeight.w800, color: kCrmText)),
        content: Text('La fiche ${row.reference ?? ''} sera définitivement supprimée.',
            style: tInter(fontSize: 13.5, color: kCrmTextSub)),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Annuler')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: kProdWasteColor, foregroundColor: Colors.white, elevation: 0),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      if (_isProbar) {
        await IndustrialRecordService.instance.delete(row.id);
      } else {
        await PorPromeshService.instance.delete(row.id);
      }
      _toast('Fiche supprimée');
      _load();
    } catch (e) {
      _toast('Suppression impossible : $e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalog = context.watch<MachineCatalog>();
    if (!catalog.isLoaded) {
      WidgetsBinding.instance.addPostFrameCallback((_) => catalog.ensureLoaded());
    }

    return ProdPage(
      onRefresh: _load,
      children: [
        ProdPageHeader(
          title: _label,
          subtitle: 'Suivi et gestion des productions $_label',
          icon: Icons.factory_outlined,
          color: _color,
          onBack: () => context.go(MyRoute.productionDashboardScreen),
          actions: [
            ProdExportButton(onExport: _export, busy: _exporting),
            ProdButton(label: 'Actualiser', icon: Icons.refresh_rounded, busy: _loading, onTap: _load),
            ProdButton(
              label: 'Nouvelle fiche',
              icon: Icons.add_rounded,
              primary: true,
              color: _color,
              onTap: () => showProductionMachinePicker(context, line: widget.line),
            ),
          ],
        ),
        const SizedBox(height: 18),
        _buildKpis(),
        const SizedBox(height: 16),
        _buildMachines(catalog),
        const SizedBox(height: 16),
        _buildFilters(),
        const SizedBox(height: 16),
        if (_error != null) ProdErrorState(message: _error!, onRetry: _load) else _buildTable(),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _buildKpis() {
    final k = _result.kpi;
    return ProdGrid(children: [
      ProdKpiTile(
        icon: Icons.description_outlined,
        label: 'Fiches',
        value: prodInt(k.fiches),
        caption: '${k.validees} validée${k.validees > 1 ? 's' : ''} · ${k.brouillons} brouillon${k.brouillons > 1 ? 's' : ''}',
        color: _color,
        loading: _loading,
      ),
      ProdKpiTile(
        icon: Icons.stacked_bar_chart_rounded,
        label: 'Quantité produite',
        value: prodNum(k.quantity),
        unit: 'm²',
        caption: k.fiches == 0 ? 'Aucune fiche sur la période' : '${prodNum(k.quantity / k.fiches)} m² par fiche en moyenne',
        color: _color,
        loading: _loading,
      ),
      ProdKpiTile(
        icon: Icons.delete_outline_rounded,
        label: 'Déchets',
        value: prodNum(k.wasteKg),
        unit: 'kg',
        caption: 'Déclarés dans les fiches Récupérables',
        color: kProdWasteColor,
        loading: _loading,
      ),
      ProdKpiTile(
        icon: Icons.percent_rounded,
        label: 'Taux de déchets',
        value: prodRate(k.wasteRate),
        unit: k.wasteRate == null ? null : 'kg / 100 m²',
        caption: k.wasteRate == null ? 'Indisponible : aucune production' : 'Déchets ÷ production × 100',
        color: kProdWasteColor,
        loading: _loading,
      ),
    ]);
  }

  // Accès direct à la page d'une machine (choix du poste, dashboard du poste,
  // nouvelle fiche) — remplace l'ancienne grille « Choisissez une machine ».
  Widget _buildMachines(MachineCatalog catalog) {
    final machines = catalog.ofType(_label, activeOnly: true);
    return ProdCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Padding(
          padding: const EdgeInsets.only(right: 4),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.precision_manufacturing_outlined, size: 16, color: kCrmTextSub),
            const SizedBox(width: 6),
            Text('Machines', style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmTextSub)),
          ]),
        ),
        if (machines.isEmpty)
          Text(
            catalog.error != null
                ? 'Machines indisponibles : ${catalog.error}'
                : (catalog.isLoaded ? 'Aucune machine active sur cette ligne.' : 'Chargement des machines…'),
            style: tInter(fontSize: 12.5, color: kCrmTextSub),
          ),
        for (final m in machines)
          Material(
            color: kCrmSurface,
            borderRadius: BorderRadius.circular(9),
            child: InkWell(
              borderRadius: BorderRadius.circular(9),
              onTap: () => context.go('$_lineRoot/machine/${m.numero}'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(9), border: Border.all(color: kCrmBorder)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(width: 7, height: 7, decoration: BoxDecoration(color: _color, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Text(m.code, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText)),
                  const SizedBox(width: 6),
                  const Icon(Icons.chevron_right_rounded, size: 16, color: kCrmTextSub),
                ]),
              ),
            ),
          ),
      ]),
    );
  }

  Widget _buildFilters() {
    return ProdCard(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ProdPeriodFilter(value: _period, onChanged: (p) => _apply(() => _period = p)),
        const SizedBox(height: 14),
        Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
          ProdFilterDropdown<int>(
            label: 'Machine',
            value: _machine,
            width: 170,
            items: [for (final m in _result.machines) (m.numero, m.active ? m.code : '${m.code} (inactive)')],
            onChanged: (v) => _apply(() => _machine = v),
          ),
          ProdFilterDropdown<String>(
            label: 'Poste',
            value: _poste,
            width: 140,
            items: const [('matin', 'Matin'), ('nuit', 'Nuit')],
            onChanged: (v) => _apply(() => _poste = v),
          ),
          ProdFilterDropdown<String>(
            label: 'Utilisateur',
            // Un utilisateur sélectionné reste proposé même s'il n'a plus de
            // fiche sur la nouvelle période (sinon la liste déroulante
            // recevrait une valeur absente de ses choix).
            value: _user,
            width: 230,
            items: [
              for (final u in {..._result.users, if (_user != null) _user!}) (u, u),
            ],
            onChanged: (v) => _apply(() => _user = v),
          ),
          ProdFilterDropdown<String>(
            label: 'Statut',
            value: _status,
            width: 150,
            items: const [('BROUILLON', 'Brouillon'), ('VALIDEE', 'Validée'), ('ARCHIVEE', 'Archivée')],
            onChanged: (v) => _apply(() => _status = v),
          ),
          SizedBox(
            width: 230,
            child: TextField(
              controller: _searchCtrl,
              textInputAction: TextInputAction.search,
              onSubmitted: (v) => _apply(() => _search = v.trim()),
              style: tInter(fontSize: 13, color: kCrmText),
              decoration: InputDecoration(
                hintText: 'Référence, utilisateur…',
                hintStyle: tInter(fontSize: 13, color: kCrmTextSub),
                prefixIcon: const Icon(Icons.search_rounded, size: 18, color: kCrmTextSub),
                isDense: true,
                filled: true,
                fillColor: kCrmSurface,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
                enabledBorder:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
              ),
            ),
          ),
          if (_hasFilters)
            TextButton.icon(
              onPressed: _resetFilters,
              icon: const Icon(Icons.filter_alt_off_outlined, size: 16),
              label: Text('Réinitialiser', style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700)),
              style: TextButton.styleFrom(foregroundColor: kCrmTextSub),
            ),
        ]),
      ]),
    );
  }

  Widget _buildTable() {
    final rows = _result.rows;
    final canDelete = AuthService().isAdmin;
    final first = rows.isEmpty ? 0 : (_page - 1) * _pageSize + 1;
    final last = (_page - 1) * _pageSize + rows.length;
    final hasNext = last < _result.count;

    return ProdCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
          child: ProdSectionTitle(
            title: 'Fiches $_label',
            subtitle: _loading ? 'Chargement…' : '${prodInt(_result.count)} fiche${_result.count > 1 ? 's' : ''}',
          ),
        ),
        if (_loading && rows.isEmpty)
          const Padding(padding: EdgeInsets.fromLTRB(18, 0, 18, 18), child: ProdSkeleton(height: 220))
        else
          ProdTable(
            emptyLabel: _hasFilters ? 'Aucune fiche ne correspond aux filtres' : 'Aucune fiche sur cette période',
            columns: const [
              ProdColumn('Date', 104),
              ProdColumn('Référence', 190),
              ProdColumn('Machine', 116),
              ProdColumn('Poste', 84),
              ProdColumn('Utilisateur', 210),
              ProdColumn('Quantité', 116, numeric: true),
              ProdColumn('Déchets', 104, numeric: true),
              ProdColumn('Statut', 128),
              ProdColumn('Actions', 168),
            ],
            onRowTap: [for (final r in rows) () => context.go('${MyRoute.productionFicheRoot}/${r.line}/${r.id}')],
            rows: [
              for (final r in rows)
                [
                  ProdCell(prodDate(r.date)),
                  ProdCell(r.reference ?? '—', strong: true, mono: true),
                  ProdCell(r.machine?.code ?? '—'),
                  ProdCell(prodPoste(r.poste)),
                  ProdCell(r.user ?? '—'),
                  ProdCell('${prodNum(r.quantity)} ${r.unit}', strong: true),
                  ProdCell(r.wasteKg == null ? '—' : '${prodNum(r.wasteKg!)} kg'),
                  ProdStatusBadge(r.status),
                  _rowActions(r, canDelete),
                ],
            ],
          ),
        if (_result.count > _pageSize) ...[
          const Divider(height: 1, color: kCrmBorder),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(children: [
              Text('$first–$last sur ${prodInt(_result.count)}', style: tInter(fontSize: 12.5, color: kCrmTextSub)),
              const Spacer(),
              IconButton(
                tooltip: 'Page précédente',
                onPressed: _page > 1 && !_loading
                    ? () {
                        setState(() => _page--);
                        _load();
                      }
                    : null,
                icon: const Icon(Icons.chevron_left_rounded, size: 20),
              ),
              Text('Page $_page', style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText)),
              IconButton(
                tooltip: 'Page suivante',
                onPressed: hasNext && !_loading
                    ? () {
                        setState(() => _page++);
                        _load();
                      }
                    : null,
                icon: const Icon(Icons.chevron_right_rounded, size: 20),
              ),
            ]),
          ),
        ],
      ]),
    );
  }

  Widget _rowActions(ProductionRow r, bool canDelete) {
    final editRoute = r.isLocked ? null : productionEditRoute(r);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      ProdRowAction(
        icon: Icons.visibility_outlined,
        tooltip: 'Voir',
        onTap: () => context.go('${MyRoute.productionFicheRoot}/${r.line}/${r.id}'),
      ),
      const SizedBox(width: 6),
      ProdRowAction(
        icon: Icons.edit_outlined,
        tooltip: r.isLocked ? 'Fiche validée : modification verrouillée' : 'Modifier',
        onTap: editRoute == null ? null : () => context.go(editRoute),
      ),
      const SizedBox(width: 6),
      // Export d'une fiche : services existants (PROMESH uniquement — les
      // fiches PROBAR s'exportent via le bouton « Exporter » de la page).
      if (!_isProbar) ...[
        PopupMenuButton<String>(
          tooltip: 'Exporter la fiche',
          position: PopupMenuPosition.under,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          onSelected: (format) => _exportFiche(r, format),
          itemBuilder: (_) => [
            PopupMenuItem(value: 'pdf', height: 38, child: Text('PDF', style: tInter(fontSize: 13, color: kCrmText))),
            PopupMenuItem(value: 'xlsx', height: 38, child: Text('Excel', style: tInter(fontSize: 13, color: kCrmText))),
          ],
          child: const IgnorePointer(
            child: ProdRowAction(icon: Icons.file_download_outlined, tooltip: '', onTap: _noop),
          ),
        ),
        const SizedBox(width: 6),
      ],
      if (canDelete)
        ProdRowAction(
          icon: Icons.delete_outline_rounded,
          tooltip: r.isLocked ? 'Fiche validée : suppression verrouillée' : 'Supprimer',
          color: kProdWasteColor,
          onTap: r.isLocked ? null : () => _confirmDelete(r),
        ),
    ]);
  }
}

void _noop() {}
