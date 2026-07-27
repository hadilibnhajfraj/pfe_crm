// lib/forms/recuperables/view/recuperable_history_screen.dart
//
// Historique RÉCUPÉRABLES — cartes (machine, ligne, dates, statut, nombre
// de lignes, total récupérable). Vert = module, Orange = en cours,
// Gris = clôturée.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/widgets/shimmer_box.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../theme/recuperable_theme.dart';
import '../model/recuperable_models.dart';
import '../service/recuperable_service.dart';

const _kStatutFilters = [
  ('all', 'Tous les statuts'),
  ('en_cours', 'En cours'),
  ('cloturee', 'Terminée'),
];

class RecuperableHistoryScreen extends StatefulWidget {
  const RecuperableHistoryScreen({super.key});

  @override
  State<RecuperableHistoryScreen> createState() => _RecuperableHistoryScreenState();
}

class _RecuperableHistoryScreenState extends State<RecuperableHistoryScreen> {
  bool _loading = true;
  String? _error;
  List<RecuperableFicheModel> _all = [];
  String _statutFilter = 'all';

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
      items.sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
      if (!mounted) return;
      setState(() => _all = items);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<RecuperableFicheModel> get _filtered =>
      _statutFilter == 'all' ? _all : _all.where((f) => f.statut == _statutFilter).toList();

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
                Row(children: [
                  Expanded(
                    child: Text(AppLocalizations.of(context).translate('Historique Récupérables'),
                        style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                  ),
                  IndustrialBigButton(
                    label: AppLocalizations.of(context).translate('Nouvelle fiche'),
                    icon: Icons.add_rounded,
                    color: kRecuperableColor,
                    onTap: () => context.go(MyRoute.recuperableFicheScreen),
                  ),
                ]),
                const SizedBox(height: 20),
                Wrap(spacing: 10, runSpacing: 10, children: [
                  for (final f in _kStatutFilters)
                    _FilterChip(label: f.$2, selected: _statutFilter == f.$1, onTap: () => setState(() => _statutFilter = f.$1)),
                ]),
                const SizedBox(height: 20),
                if (_loading)
                  const FicheCardSkeletonList()
                else if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 40),
                    child: Center(child: Text('${AppLocalizations.of(context).translate('Erreur')} : $_error', style: tInter(color: kCrmDanger))),
                  )
                else if (_filtered.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 60),
                    child: Center(
                      child: Column(children: [
                        Icon(Icons.inbox_outlined, size: 48, color: kCrmTextSub.withOpacity(0.5)),
                        const SizedBox(height: 12),
                        Text(AppLocalizations.of(context).translate('Aucune fiche pour ces filtres'), style: tInter(fontSize: 14, color: kCrmTextSub)),
                      ]),
                    ),
                  )
                else
                  ..._filtered.map((f) => _FicheCard(
                        fiche: f,
                        onTap: () => context.go('${MyRoute.recuperableDetailScreen}?id=${f.id}'),
                      )),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? kRecuperableColor.withOpacity(0.12) : kCrmSurface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? kRecuperableColor : kCrmBorder),
        ),
        child: Text(AppLocalizations.of(context).translate(label),
            style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: selected ? kRecuperableColor : kCrmTextSub)),
      ),
    );
  }
}

class _FicheCard extends StatelessWidget {
  final RecuperableFicheModel fiche;
  final VoidCallback onTap;
  const _FicheCard({required this.fiche, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final statut = recuperableStatutInfo(fiche.statut);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: statut.color.withOpacity(0.3)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration:
                  BoxDecoration(color: kRecuperableColor.withOpacity(0.12), borderRadius: BorderRadius.circular(14)),
              child: const Text('♻️', style: TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${fiche.module} · ${AppLocalizations.of(context).translate('Machine')} ${fiche.machine} · ${fiche.ligne} · ${fiche.posteLabel}',
                    style: tInter(fontSize: 14.5, fontWeight: FontWeight.w800, color: kCrmText)),
                const SizedBox(height: 3),
                Text(
                    '${AppLocalizations.of(context).translate('Date')} : ${_fmt(fiche.date)}  →  ${AppLocalizations.of(context).translate('Clôture prévue')} : ${_fmt(fiche.dateCloture)}',
                    style: tInter(fontSize: 12, color: kCrmTextSub)),
                const SizedBox(height: 6),
                Wrap(spacing: 14, runSpacing: 4, children: [
                  _miniStat(context, Icons.list_alt_outlined,
                      '${fiche.nombreLignes} ${AppLocalizations.of(context).translate(fiche.nombreLignes == 1 ? 'ligne' : 'lignes')}'),
                  _miniStat(context, Icons.recycling_rounded,
                      '${fiche.totalDechetKg.toStringAsFixed(1)} ${AppLocalizations.of(context).translate('kg récupérable')}'),
                ]),
              ]),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: statut.color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(statut.emoji, style: const TextStyle(fontSize: 12)),
                const SizedBox(width: 5),
                Text(AppLocalizations.of(context).translate(statut.label), style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: statut.color)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _miniStat(BuildContext context, IconData icon, String label) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: kCrmTextSub),
      const SizedBox(width: 4),
      Text(label, style: tInter(fontSize: 12, color: kCrmText)),
    ]);
  }

  String _fmt(String? raw) {
    if (raw == null || raw.isEmpty) return '—';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy').format(d);
  }
}
