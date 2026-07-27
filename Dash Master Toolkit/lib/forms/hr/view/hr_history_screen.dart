// lib/forms/hr/view/hr_history_screen.dart
//
// Historique des demandes RH — cartes (icône, type, date, statut, employé),
// jamais de tableau dense. Un employé standard ne voit que ses propres
// demandes (filtré côté backend) ; admin/superadmin voient tout.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/widgets/shimmer_box.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../theme/hr_theme.dart';
import '../model/hr_request_model.dart';
import '../service/hr_request_service.dart';

const _kStatutFilters = [
  ('all', 'Tous les statuts'),
  ('en_attente', 'En attente'),
  ('acceptee', 'Acceptée'),
  ('refusee', 'Refusée'),
];

class HrHistoryScreen extends StatefulWidget {
  const HrHistoryScreen({super.key});

  @override
  State<HrHistoryScreen> createState() => _HrHistoryScreenState();
}

class _HrHistoryScreenState extends State<HrHistoryScreen> {
  bool _loading = true;
  String? _error;
  List<HrRequestModel> _all = [];
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
      final items = await HrRequestService.instance.fetchAll();
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

  List<HrRequestModel> get _filtered =>
      _statutFilter == 'all' ? _all : _all.where((r) => r.statut == _statutFilter).toList();

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
                    child: Text(AppLocalizations.of(context).translate('Historique RH'), style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                  ),
                  IndustrialBigButton(
                    label: AppLocalizations.of(context).translate('Nouvelle demande'),
                    icon: Icons.add_rounded,
                    color: kHrColor,
                    onTap: () => context.go(MyRoute.hrRoot),
                  ),
                ]),
                const SizedBox(height: 20),
                Wrap(spacing: 10, runSpacing: 10, children: [
                  for (final f in _kStatutFilters)
                    _FilterChip(
                      label: f.$2,
                      selected: _statutFilter == f.$1,
                      onTap: () => setState(() => _statutFilter = f.$1),
                    ),
                ]),
                const SizedBox(height: 20),
                if (_loading)
                  const FicheCardSkeletonList()
                else if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 40),
                    child: Center(child: Text('${AppLocalizations.of(context).translate('Erreur')} : $_error', style: tInter(color: kHrRefused))),
                  )
                else if (_filtered.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 60),
                    child: Center(
                      child: Column(children: [
                        Icon(Icons.inbox_outlined, size: 48, color: kCrmTextSub.withOpacity(0.5)),
                        const SizedBox(height: 12),
                        Text(AppLocalizations.of(context).translate('Aucune demande pour le moment'), style: tInter(fontSize: 14, color: kCrmTextSub)),
                      ]),
                    ),
                  )
                else
                  ..._filtered.map((r) => _HrRequestCard(
                        request: r,
                        onTap: () => context.go('${MyRoute.hrDetailScreen}?id=${r.id}'),
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
          color: selected ? kHrColor.withOpacity(0.12) : kCrmSurface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? kHrColor : kCrmBorder),
        ),
        child: Text(AppLocalizations.of(context).translate(label),
            style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: selected ? kHrColor : kCrmTextSub)),
      ),
    );
  }
}

class _HrRequestCard extends StatelessWidget {
  final HrRequestModel request;
  final VoidCallback onTap;
  const _HrRequestCard({required this.request, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final statut = hrStatutInfo(request.statut);
    final isConge = request.isConge;
    final dateLabel = isConge
        ? '${_fmt(request.dateDebut)} → ${_fmt(request.dateFin)}'
        : _fmt(request.dateSortie);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kCrmBorder),
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
              decoration: BoxDecoration(color: kHrColor.withOpacity(0.12), borderRadius: BorderRadius.circular(14)),
              child: Text(isConge ? '🏖️' : '🚪', style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text(AppLocalizations.of(context).translate(isConge ? 'Demande de congé' : 'Autorisation de sortie'),
                        style: tInter(fontSize: 14.5, fontWeight: FontWeight.w800, color: kCrmText)),
                  ),
                  if (isConge && request.nombreJours != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                      decoration: BoxDecoration(color: kHrColor.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                      child: Text('${request.nombreJours} ${AppLocalizations.of(context).translate('j. ouvrable')}${request.nombreJours == 1 ? '' : 's'}',
                          style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: kHrColor)),
                    ),
                ]),
                const SizedBox(height: 3),
                Text(dateLabel, style: tInter(fontSize: 12.5, color: kCrmTextSub)),
                const SizedBox(height: 3),
                Text('${request.employeeNom ?? ''} ${request.employeePrenom ?? ''}'.trim(),
                    style: tInter(fontSize: 12, color: kCrmTextSub)),
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

  String _fmt(String? raw) {
    if (raw == null || raw.isEmpty) return '—';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy').format(d);
  }
}
