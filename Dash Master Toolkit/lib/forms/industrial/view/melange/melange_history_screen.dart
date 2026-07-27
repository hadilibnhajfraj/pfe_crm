// lib/forms/industrial/view/melange/melange_history_screen.dart
//
// Historique MÉLANGE — recherche + filtres (date / opérateur / statut) +
// tri décroissant (plus récentes en premier) + cartes MelangeHistoryCard.
// Remplace, pour ce module, l'ancien IndustrialHistoriqueScreen générique
// (liste plate sans recherche/filtre), aligné sur le pattern PROBAR
// (ProbarPosteDashboardScreen).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/widgets/shimmer_box.dart';
import 'package:dash_master_toolkit/forms/industrial/model/industrial_record_model.dart';
import 'package:dash_master_toolkit/forms/industrial/service/industrial_record_service.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import 'melange_history_card.dart';

// Attente avant d'appliquer la recherche tapée — évite de refiltrer/trier/
// reconstruire toute la liste à chaque frappe clavier.
const _kSearchDebounce = Duration(milliseconds: 300);

const _kStatutFiltres = [
  ('all', 'Tous les statuts'),
  ('ok', 'OK'),
  ('nok', 'NOK'),
  ('brouillon', 'Brouillon'),
  ('enregistree', 'Enregistrée'),
];

class MelangeHistoryScreen extends StatefulWidget {
  const MelangeHistoryScreen({super.key});

  @override
  State<MelangeHistoryScreen> createState() => _MelangeHistoryScreenState();
}

class _MelangeHistoryScreenState extends State<MelangeHistoryScreen> {
  bool _loading = true;
  String? _error;
  List<IndustrialRecordModel> _all = [];
  List<IndustrialRecordModel> _filtered = [];

  String _search = '';
  String _dateFilter = '';
  String _operateurFilter = 'all';
  String _statutFilter = 'all';
  Timer? _searchDebounce;

  late final Stopwatch _pageStopwatch = Stopwatch()..start();

  @override
  void initState() {
    super.initState();
    _load();
    // Premier frame affiché (barre de recherche/filtres visibles même si
    // le réseau n'a pas encore répondu) — mesure du temps d'ouverture réel.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      debugPrint('[melange] Historique — premier frame affiché en ${_pageStopwatch.elapsedMilliseconds}ms');
    });
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }

  Future<void> _load({bool forceRefresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await IndustrialRecordService.instance.fetchAll(module: 'melange', forceRefresh: forceRefresh);
      if (!mounted) return;
      setState(() => _all = items);
      _applyFilters();
      debugPrint('[melange] Historique — données affichées en ${_pageStopwatch.elapsedMilliseconds}ms (total)');
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onSearchChanged(String v) {
    _search = v;
    _searchDebounce?.cancel();
    _searchDebounce = Timer(_kSearchDebounce, _applyFilters);
  }

  List<String> get _operateurs {
    final set = <String>{};
    for (final r in _all) {
      final op = (r.operateur ?? '').trim();
      if (op.isNotEmpty) set.add(op);
    }
    return set.toList()..sort();
  }

  String _statutOf(IndustrialRecordModel m) {
    if (m.statutQualite == 'ok') return 'ok';
    if (m.statutQualite == 'nok') return 'nok';
    if (m.statut == 'brouillon') return 'brouillon';
    return 'enregistree';
  }

  void _applyFilters() {
    var list = List<IndustrialRecordModel>.from(_all);

    if (_dateFilter.isNotEmpty) {
      list = list.where((r) => r.dateFiche == _dateFilter).toList();
    }
    if (_operateurFilter != 'all') {
      list = list.where((r) => (r.operateur ?? '') == _operateurFilter).toList();
    }
    if (_statutFilter != 'all') {
      list = list.where((r) => _statutOf(r) == _statutFilter).toList();
    }
    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      list = list
          .where((r) => (r.operateur ?? '').toLowerCase().contains(q) || (r.dateFiche ?? '').contains(q))
          .toList();
    }

    // Fiches les plus récentes en premier — date de fiche puis date de
    // création en repli quand deux fiches partagent la même date.
    list.sort((a, b) {
      final cmp = (b.dateFiche ?? '').compareTo(a.dateFiche ?? '');
      if (cmp != 0) return cmp;
      return (b.createdAt ?? '').compareTo(a.createdAt ?? '');
    });

    setState(() => _filtered = list);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() => _dateFilter = DateFormat('yyyy-MM-dd').format(picked));
    _applyFilters();
  }

  Future<void> _delete(IndustrialRecordModel item) async {
    if (item.id == null) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(AppLocalizations.of(context).translate('Supprimer la fiche ?')),
        content: Text(
            '${AppLocalizations.of(context).translate('La fiche du')} ${item.dateFiche ?? '—'} ${AppLocalizations.of(context).translate('sera définitivement supprimée.')}'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(AppLocalizations.of(context).translate('Annuler'))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: kCrmDanger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(AppLocalizations.of(context).translate('Supprimer')),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await IndustrialRecordService.instance.delete(item.id!);
      if (!mounted) return;
      setState(() => _all.removeWhere((e) => e.id == item.id));
      _applyFilters();
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).translate('Fiche supprimée'))));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'),
          backgroundColor: kCrmDanger));
    }
  }

  void _exportPdf(IndustrialRecordModel item) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(AppLocalizations.of(context).translate('Export PDF — fonctionnalité à venir')),
      duration: const Duration(seconds: 2),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: RefreshIndicator(
            onRefresh: () => _load(forceRefresh: true),
            child: CustomScrollView(
              // AlwaysScrollable : le geste "tirer pour rafraîchir" doit
              // fonctionner même quand le contenu ne remplit pas l'écran
              // (ex. liste vide ou peu de fiches).
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                  sliver: SliverToBoxAdapter(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(
                          child: Text(AppLocalizations.of(context).translate('Historique MÉLANGE'),
                              style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                        ),
                        IndustrialBigButton(
                          label: 'Nouvelle fiche',
                          icon: Icons.add_rounded,
                          color: kMelangeColor,
                          onTap: () => context.go(MyRoute.melangeFormScreen),
                        ),
                      ]),
                      const SizedBox(height: 20),

                      // Recherche (filtrage différé de 300ms — voir _onSearchChanged)
                      TextField(
                        onChanged: _onSearchChanged,
                        decoration: InputDecoration(
                          hintText: AppLocalizations.of(context).translate('Rechercher par opérateur, date…'),
                          prefixIcon: const Icon(Icons.search_rounded, size: 20),
                          filled: true,
                          fillColor: kCrmSurface,
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Filtres
                      Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        _filterChipButton(
                          icon: Icons.event_outlined,
                          label: _dateFilter.isEmpty ? 'Filtrer par date' : _dateFilter,
                          onTap: _pickDate,
                          onClear: _dateFilter.isEmpty
                              ? null
                              : () {
                                  setState(() => _dateFilter = '');
                                  _applyFilters();
                                },
                        ),
                        _dropdown<String>(
                          value: _operateurFilter,
                          items: [('all', 'Tous les opérateurs'), for (final op in _operateurs) (op, op)],
                          onChanged: (v) {
                            setState(() => _operateurFilter = v!);
                            _applyFilters();
                          },
                        ),
                        _dropdown<String>(
                          value: _statutFilter,
                          items: _kStatutFiltres,
                          onChanged: (v) {
                            setState(() => _statutFilter = v!);
                            _applyFilters();
                          },
                        ),
                      ]),
                      const SizedBox(height: 20),

                      if (_loading)
                        const FicheCardSkeletonList()
                      else if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 40),
                          child: Center(
                              child: Text('${AppLocalizations.of(context).translate('Erreur')} : $_error',
                                  style: tInter(color: kCrmDanger))),
                        )
                      else if (_filtered.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 60),
                          child: Center(
                            child: Column(children: [
                              Icon(Icons.inbox_outlined, size: 48, color: kCrmTextSub.withOpacity(0.5)),
                              const SizedBox(height: 12),
                              Text(AppLocalizations.of(context).translate('Aucune fiche pour ces filtres'),
                                  style: tInter(fontSize: 14, color: kCrmTextSub)),
                            ]),
                          ),
                        ),
                    ]),
                  ),
                ),

                // Cartes construites paresseusement (une seule à la fois à
                // l'écran, pas toutes d'un coup comme avec ListView(children:)).
                if (!_loading && _error == null && _filtered.isNotEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                    sliver: SliverList.builder(
                      itemCount: _filtered.length,
                      itemBuilder: (context, i) {
                        final m = _filtered[i];
                        return RepaintBoundary(
                          key: ValueKey(m.id),
                          child: MelangeHistoryCard(
                            model: m,
                            onView: () => context.go('${MyRoute.melangeDetailScreen}?id=${m.id}'),
                            onEdit: () => context.go('${MyRoute.melangeFormScreen}?id=${m.id}'),
                            onDelete: () => _delete(m),
                            onExportPdf: () => _exportPdf(m),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _filterChipButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    VoidCallback? onClear,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration:
            BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(10), border: Border.all(color: kCrmBorder)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 16, color: kCrmTextSub),
          const SizedBox(width: 6),
          Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmText)),
          if (onClear != null) ...[
            const SizedBox(width: 6),
            InkWell(onTap: onClear, child: const Icon(Icons.close_rounded, size: 14, color: kCrmTextSub)),
          ],
        ]),
      ),
    );
  }

  Widget _dropdown<T>({
    required T value,
    required List<(T, String)> items,
    required ValueChanged<T?> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration:
          BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(10), border: Border.all(color: kCrmBorder)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isDense: true,
          icon: const Icon(Icons.expand_more_rounded, size: 18, color: kCrmTextSub),
          style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmText),
          items: [for (final item in items) DropdownMenuItem<T>(value: item.$1, child: Text(AppLocalizations.of(context).translate(item.$2)))],
          onChanged: onChanged,
        ),
      ),
    );
  }
}
