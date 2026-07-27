// lib/forms/industrial/view/machine_overview_screen.dart
//
// Vue "ligne de production" (PROMESH ou PROBAR) — 4 grosses cartes Machine
// 1..4. Réutilisée pour les 2 lignes via les paramètres [lineRoot]/[color].
// Pour PROMESH (fetchPromeshStats: true), chaque carte affiche en plus le
// nombre de fiches saisies aujourd'hui et l'état (Active / Arrêt).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/service/por_promesh_service.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../theme/industrial_theme.dart';

class MachineOverviewScreen extends StatefulWidget {
  final String title;
  final String lineRoot; // ex: '/production/promesh'
  final Color color;
  final IconData icon;
  final bool fetchPromeshStats;

  const MachineOverviewScreen({
    super.key,
    required this.title,
    required this.lineRoot,
    required this.color,
    this.icon = Icons.factory_outlined,
    this.fetchPromeshStats = false,
  });

  @override
  State<MachineOverviewScreen> createState() => _MachineOverviewScreenState();
}

class _MachineOverviewScreenState extends State<MachineOverviewScreen> {
  Map<String, int> _ficheCountByMachine = {};

  @override
  void initState() {
    super.initState();
    if (widget.fetchPromeshStats) _loadStats();
  }

  Future<void> _loadStats() async {
    try {
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final items = await PorPromeshService.instance.fetchAll(date: today, limit: 1000);
      final counts = <String, int>{};
      for (final m in items) {
        if (m.machine == null) continue;
        counts[m.machine!] = (counts[m.machine!] ?? 0) + 1;
      }
      if (mounted) setState(() => _ficheCountByMachine = counts);
    } catch (_) {
      // Pas de stats disponibles — les cartes restent affichées sans badge.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: widget.color.withOpacity(0.12), borderRadius: BorderRadius.circular(14)),
                  child: Icon(widget.icon, size: 28, color: widget.color),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(AppLocalizations.of(context).translate(widget.title),
                        style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                    const SizedBox(height: 2),
                    Text(AppLocalizations.of(context).translate('Choisissez une machine'),
                        style: tInter(fontSize: 13, color: kCrmTextSub)),
                  ]),
                ),
                if (widget.fetchPromeshStats)
                  IconButton(
                    tooltip: AppLocalizations.of(context).translate('Actualiser'),
                    icon: const Icon(Icons.refresh_rounded, size: 20, color: kCrmTextSub),
                    onPressed: _loadStats,
                  ),
              ]),
              const SizedBox(height: 24),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: 2.2,
                children: List.generate(4, (i) {
                  final num = i + 1;
                  final count = _ficheCountByMachine[num.toString()] ?? 0;
                  final active = widget.fetchPromeshStats && count > 0;
                  return BigActionCard(
                    icon: Icons.precision_manufacturing_outlined,
                    title: AppLocalizations.of(context).translate('Machine $num'),
                    subtitle: AppLocalizations.of(context).translate(widget.fetchPromeshStats
                        ? 'Poste Matin / Poste Soir'
                        : 'Poste Matin / Poste Nuit'),
                    color: widget.color,
                    onTap: () => context.go('${widget.lineRoot}/machine/$num'),
                    trailing: widget.fetchPromeshStats
                        ? Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: widget.color.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                  '$count ${AppLocalizations.of(context).translate(count == 1 ? 'fiche' : 'fiches')}',
                                  style: tInter(fontSize: 10.5, fontWeight: FontWeight.w800, color: widget.color)),
                            ),
                            const SizedBox(height: 6),
                            Row(mainAxisSize: MainAxisSize.min, children: [
                              Container(
                                width: 7,
                                height: 7,
                                decoration: BoxDecoration(
                                  color: active ? kCrmSuccess : kCrmTextSub.withOpacity(0.4),
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 5),
                              Text(
                                  AppLocalizations.of(context)
                                      .translate(active ? 'Active' : 'Arrêt'),
                                  style: tInter(
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.w700,
                                      color: active ? kCrmSuccess : kCrmTextSub)),
                            ]),
                          ])
                        : null,
                  );
                }),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
