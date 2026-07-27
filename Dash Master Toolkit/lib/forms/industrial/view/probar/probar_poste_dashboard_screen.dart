// lib/forms/industrial/view/probar/probar_poste_dashboard_screen.dart
//
// Dashboard poste PROBAR — KPI + liste des fiches + actions.
// Architecture identique au PosteDashboardScreen PROMESH mais utilise
// IndustrialRecordService (même service existant de PROBAR).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/industrial_context_header.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/widgets/shimmer_box.dart';

import '../../controller/probar_controller.dart';
import '../../model/industrial_record_model.dart';
import '../../service/industrial_record_service.dart';

const _kDateRanges = [
  ('today', "Aujourd'hui"),
  ('week', 'Cette semaine'),
  ('month', 'Ce mois'),
  ('all', 'Tout'),
];

const _kSorts = [
  ('date_desc', 'Date décroissante'),
  ('date_asc', 'Date croissante'),
];

const _kPageSizes = [10, 20, 50];

class ProbarPosteDashboardScreen extends StatefulWidget {
  final String machine;
  final String poste;

  const ProbarPosteDashboardScreen({super.key, required this.machine, required this.poste});

  @override
  State<ProbarPosteDashboardScreen> createState() => _ProbarPosteDashboardScreenState();
}

class _ProbarPosteDashboardScreenState extends State<ProbarPosteDashboardScreen> {
  bool _loading = true;
  String? _error;
  List<IndustrialRecordModel> _allItems = [];
  List<IndustrialRecordModel> _items = [];
  bool _creatingDraft = false;

  String _dateRange = 'today';
  String _sort = 'date_desc';
  String _search = '';
  Timer? _debounce;
  int _page = 1;
  int _pageSize = 10;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load({bool forceRefresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await IndustrialRecordService.instance.fetchAll(
        module: 'probar',
        machine: widget.machine,
        poste: widget.poste,
        forceRefresh: forceRefresh,
      );
      if (!mounted) return;
      setState(() => _allItems = items);
      _applyFilters();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _applyFilters() {
    final now = DateTime.now();
    final today = DateFormat('yyyy-MM-dd').format(now);
    var filtered = List<IndustrialRecordModel>.from(_allItems);

    if (_dateRange == 'today') {
      filtered = filtered.where((r) => r.dateFiche == today).toList();
    } else if (_dateRange == 'week') {
      final weekAgo = now.subtract(const Duration(days: 7));
      filtered = filtered.where((r) {
        final d = DateTime.tryParse(r.dateFiche ?? '');
        return d != null && !d.isBefore(weekAgo);
      }).toList();
    } else if (_dateRange == 'month') {
      final monthAgo = now.subtract(const Duration(days: 30));
      filtered = filtered.where((r) {
        final d = DateTime.tryParse(r.dateFiche ?? '');
        return d != null && !d.isBefore(monthAgo);
      }).toList();
    }

    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      filtered = filtered
          .where((r) =>
              (r.operateur ?? '').toLowerCase().contains(q) ||
              (r.dateFiche ?? '').contains(q) ||
              (r.machine ?? '').contains(q))
          .toList();
    }

    filtered.sort((a, b) {
      final da = a.dateFiche ?? '';
      final db = b.dateFiche ?? '';
      return _sort == 'date_asc' ? da.compareTo(db) : db.compareTo(da);
    });

    final start = (_page - 1) * _pageSize;
    setState(() => _items = filtered.skip(start).take(_pageSize).toList());
  }

  void _onFilterChanged() {
    _page = 1;
    _applyFilters();
  }

  void _onSearchChanged(String v) {
    _search = v;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _onFilterChanged);
  }

  String get _backRoute => '${MyRoute.productionProbarRoot}/machine/${widget.machine}';
  String get _base => '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}';
  String get _modulesRoute => '$_base/modules';

  // Nouveau workflow (ficheId explicite, conservé pendant toute la
  // navigation) :
  // 1. On retrouve un éventuel brouillon déjà existant pour aujourd'hui
  //    (même machine + poste) via bootstrapForMachinePoste — pour ne
  //    JAMAIS créer une deuxième fiche si une existe déjà.
  // 2. Si aucun brouillon n'existe, on crée IMMÉDIATEMENT la fiche en base
  //    (saveDraft) pour obtenir un ficheId stable dès l'ouverture.
  // 3. On navigue vers la page Modules avec ce ficheId en query param —
  //    c'est ce même id qui sera transmis à chaque écran module ensuite,
  //    aucune re-création implicite n'est plus possible.
  Future<void> _createOrOpenDraft() async {
    if (_creatingDraft) return;
    setState(() => _creatingDraft = true);
    try {
      final c = Get.isRegistered<ProbarController>()
          ? Get.find<ProbarController>()
          : Get.put(ProbarController(), permanent: true);

      await c.bootstrapForMachinePoste(widget.machine, widget.poste, forceRefresh: true);

      if (c.recordId == null) {
        await c.saveDraft();
      }
      final ficheId = c.recordId;
      if (ficheId == null) {
        throw Exception('Échec de la création de la fiche.');
      }

      if (!mounted) return;
      context.go('$_modulesRoute?ficheId=$ficheId');
    } catch (e, stack) {
      debugPrint('[ProbarDashboard] ERREUR : $e\n$stack');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'),
            backgroundColor: Colors.red.shade700),
      );
    } finally {
      if (mounted) setState(() => _creatingDraft = false);
    }
  }

  // ── KPI ────────────────────────────────────────────────────────────────
  int get _totalFiches => _allItems.length;
  int get _fichesValidees => _allItems.where((r) => r.statut == 'validee').length;
  int get _fichesBrouillon => _allItems.where((r) => r.statut != 'validee').length;
  int get _nonConformites => _allItems.where((r) => r.statutQualite == 'nok').length;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isMobile = screenWidth < 700;
    final now = DateTime.now();
    final posteLabel = widget.poste == 'matin' ? 'Matin' : 'Soir';
    final posteColor = widget.poste == 'matin' ? kCrmWarning : kPersonnelColor;
    final loc = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => _load(forceRefresh: true),
          child: IndustrialPageBody(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // Header
                InkWell(
                  onTap: () => context.go(_backRoute),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration:
                        BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(spacing: 20, runSpacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  IndustrialContextHeader(
                      machine: widget.machine,
                      poste: widget.poste,
                      color: kProbarColor,
                      lineLabel: loc.translate('PROBAR')),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                        color: posteColor.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
                    child: Text(
                        '${loc.translate('POSTE')} ${loc.translate(posteLabel)}'.toUpperCase(),
                        style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: posteColor)),
                  ),
                  IndustrialInfoChip(
                      icon: Icons.event_outlined, label: DateFormat('dd/MM/yyyy').format(now), color: kCrmTextSub),
                  IndustrialInfoChip(
                      icon: Icons.schedule_outlined, label: DateFormat('HH:mm').format(now), color: kCrmTextSub),
                  IndustrialInfoChip(
                      icon: Icons.person_outline_rounded, label: AuthService().displayName, color: kCrmTextSub),
                ]),
                const SizedBox(height: 20),
                SizedBox(
                  width: isMobile ? double.infinity : 260,
                  child: IndustrialBigButton(
                    label: _creatingDraft
                        ? loc.translate('Préparation…')
                        : loc.translate('Nouvelle fiche'),
                    icon: Icons.add_rounded,
                    color: kProbarColor,
                    onTap: _creatingDraft ? null : _createOrOpenDraft,
                  ),
                ),
                const SizedBox(height: 28),

                // KPI
                if (!_loading) ...[
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: isMobile ? 2 : 4,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: isMobile ? 1.3 : 1.5,
                    children: [
                      KpiStatCard(
                          icon: Icons.description_outlined,
                          value: _totalFiches.toString(),
                          label: loc.translate('Fiches créées'),
                          color: kProbarColor),
                      KpiStatCard(
                          icon: Icons.check_circle_outline_rounded,
                          value: _fichesValidees.toString(),
                          label: loc.translate('Fiches validées'),
                          color: kCrmSuccess),
                      KpiStatCard(
                          icon: Icons.edit_note_rounded,
                          value: _fichesBrouillon.toString(),
                          label: loc.translate('Brouillons'),
                          color: kCrmWarning),
                      KpiStatCard(
                          icon: Icons.warning_amber_rounded,
                          value: _nonConformites.toString(),
                          label: loc.translate('Non-conformités'),
                          color: kCrmDanger),
                    ],
                  ),
                  const SizedBox(height: 24),
                ] else ...[
                  KpiSkeletonGrid(crossAxisCount: isMobile ? 2 : 4),
                  const SizedBox(height: 24),
                ],

                // Filtres
                TextField(
                  onChanged: _onSearchChanged,
                  decoration: InputDecoration(
                    hintText: loc.translate('Rechercher par opérateur, date, machine…'),
                    prefixIcon: const Icon(Icons.search_rounded, size: 20),
                    filled: true,
                    fillColor: kCrmSurface,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(spacing: 10, runSpacing: 10, children: [
                  _dropdown<String>(
                    label: loc.translate('Date'),
                    value: _dateRange,
                    items: _kDateRanges,
                    onChanged: (v) => setState(() {
                      _dateRange = v!;
                      _onFilterChanged();
                    }),
                  ),
                  _dropdown<String>(
                    label: loc.translate('Tri'),
                    value: _sort,
                    items: _kSorts,
                    onChanged: (v) => setState(() {
                      _sort = v!;
                      _onFilterChanged();
                    }),
                  ),
                ]),
                const SizedBox(height: 16),

                // Liste
                Row(children: [
                  Expanded(
                    child: Text('${loc.translate('Fiches du poste')} (${_allItems.length})',
                        style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
                  ),
                  IconButton(
                    tooltip: loc.translate('Actualiser'),
                    icon: _loading
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.refresh_rounded, size: 18, color: kCrmTextSub),
                    onPressed: _loading ? null : _load,
                  ),
                ]),
                const SizedBox(height: 12),

                if (_error != null)
                  Text('${loc.translate('Erreur')} : $_error', style: tInter(color: kCrmDanger))
                else if (_loading)
                  const FicheCardSkeletonList()
                else if (_items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 30),
                    child: Center(
                        child: Text(loc.translate('Aucune fiche pour ces filtres'),
                            style: tInter(fontSize: 13, color: kCrmTextSub))),
                  )
                else
                  Column(children: [
                    for (final item in _items) _ProbarFicheCard(item: item, machine: widget.machine, poste: widget.poste),
                  ]),

                const SizedBox(height: 16),
                _buildPagination(),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _dropdown<T>({
    required String label,
    required T value,
    required List<(T, String)> items,
    required ValueChanged<T?> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
          color: kCrmSurface, borderRadius: BorderRadius.circular(10), border: Border.all(color: kCrmBorder)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isDense: true,
          icon: const Icon(Icons.expand_more_rounded, size: 18, color: kCrmTextSub),
          style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmText),
          items: [
            for (final item in items)
              DropdownMenuItem<T>(
                  value: item.$1,
                  child: Text('$label : ${AppLocalizations.of(context).translate(item.$2)}')),
          ],
          onChanged: onChanged,
        ),
      ),
    );
  }

  Widget _buildPagination() {
    final totalPages = (_allItems.length / _pageSize).ceil().clamp(1, 999999);
    return Row(children: [
      Text(AppLocalizations.of(context).translate('Par page :'),
          style: tInter(fontSize: 12.5, color: kCrmTextSub)),
      const SizedBox(width: 8),
      _dropdown<int>(
        label: '',
        value: _pageSize,
        items: [for (final s in _kPageSizes) (s, s.toString())],
        onChanged: (v) => setState(() {
          _pageSize = v!;
          _onFilterChanged();
        }),
      ),
      const Spacer(),
      IconButton(
        icon: const Icon(Icons.chevron_left_rounded),
        onPressed: _page > 1
            ? () => setState(() {
                  _page--;
                  _applyFilters();
                })
            : null,
      ),
      Text('${AppLocalizations.of(context).translate('Page')} $_page / $totalPages',
          style: tInter(fontSize: 12.5, color: kCrmTextSub)),
      IconButton(
        icon: const Icon(Icons.chevron_right_rounded),
        onPressed: _page < totalPages
            ? () => setState(() {
                  _page++;
                  _applyFilters();
                })
            : null,
      ),
    ]);
  }
}

class _ProbarFicheCard extends StatelessWidget {
  final IndustrialRecordModel item;
  final String machine;
  final String poste;

  const _ProbarFicheCard({required this.item, required this.machine, required this.poste});

  @override
  Widget build(BuildContext context) {
    final isValidee = item.statut == 'validee';
    final isNok = item.statutQualite == 'nok';

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
          _chip(context, Icons.event_outlined, item.dateFiche ?? ''),
          _chip(context, Icons.precision_manufacturing_outlined,
              '${AppLocalizations.of(context).translate('Machine')} ${item.machine ?? ''}'),
          _chip(
              context,
              item.poste == 'matin' ? Icons.wb_sunny_rounded : Icons.nightlight_round,
              AppLocalizations.of(context).translate(item.poste == 'matin' ? 'Matin' : 'Soir')),
          _chip(context, Icons.person_outline_rounded, item.operateur ?? ''),
          if (item.quantiteProduite != null)
            _chip(context, Icons.speed_rounded, '${item.quantiteProduite} m²'),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (item.statutQualite != null)
            _badge(
                context,
                isNok
                    ? '🔴 ${AppLocalizations.of(context).translate('Non Conforme')}'
                    : '🟢 ${AppLocalizations.of(context).translate('Conforme')}',
                isNok ? kCrmDanger : kCrmSuccess),
          _badge(
              context,
              AppLocalizations.of(context).translate(isValidee ? 'VALIDÉ' : 'BROUILLON'),
              isValidee ? kCrmSuccess : kCrmWarning),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 6, runSpacing: 6, children: [
          _actionButton(
            context,
            AppLocalizations.of(context).translate('Voir'),
            Icons.visibility_outlined,
            kCrmTextSub,
            () => context.go(
                '${MyRoute.productionProbarRoot}/machine/${item.machine ?? machine}/poste/${item.poste ?? poste}/detail?id=${item.id}'),
          ),
        ]),
      ]),
    );
  }

  Widget _chip(BuildContext context, IconData icon, String label) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: kCrmTextSub),
      const SizedBox(width: 4),
      Text(label, style: tInter(fontSize: 12, color: kCrmText)),
    ]);
  }

  Widget _badge(BuildContext context, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(label, style: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    );
  }

  Widget _actionButton(
      BuildContext context, String label, IconData icon, Color color, VoidCallback onTap) {
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
