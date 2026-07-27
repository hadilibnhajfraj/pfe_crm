// lib/forms/por_promesh/view/por_promesh_dashboard_screen.dart
//
// "Dashboard Industriel" — landing page cross-module (PROBAR / PROMESH /
// MAINTENANCE) pour un opérateur qui ne maîtrise pas l'informatique :
// aucun tableau dense, aucun texte long — 6 grandes cartes chiffrées, des
// gros boutons d'accès rapide, et l'activité récente sous forme de cartes.
// Le nom de fichier/classe est conservé (référencé par le routeur et le
// menu latéral sous `MyRoute.porPromeshDashboardScreen`) mais le contenu
// n'est plus spécifique à PROMESH.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/model/industrial_record_model.dart';
import 'package:dash_master_toolkit/forms/industrial/service/industrial_record_service.dart';
import 'package:dash_master_toolkit/forms/recuperables/model/recuperable_models.dart';
import 'package:dash_master_toolkit/forms/recuperables/service/recuperable_service.dart';
import 'package:dash_master_toolkit/forms/recuperables/theme/recuperable_theme.dart';

import '../model/por_promesh_model.dart';
import '../service/por_promesh_service.dart';

// ── Palette dédiée à ce dashboard (demandée explicitement, indépendante des
// couleurs `kPromeshColor`/`kProbarColor` utilisées ailleurs dans l'app) ──
const _cProbar = Color(0xFFF97316); // Orange
const _cPromesh = Color(0xFF8B5CF6); // Violet
const _cMaintenance = Color(0xFFEF4444); // Rouge
const _cTotal = Color(0xFF2563EB); // Bleu
const _cMachines = Color(0xFF10B981); // Vert
const _cToday = Color(0xFF14B8A6); // Turquoise

class PorPromeshDashboardScreen extends StatefulWidget {
  const PorPromeshDashboardScreen({super.key});

  @override
  State<PorPromeshDashboardScreen> createState() => _PorPromeshDashboardScreenState();
}

class _PorPromeshDashboardScreenState extends State<PorPromeshDashboardScreen> {
  bool _loading = true;
  String? _error;

  List<IndustrialRecordModel> _probar = [];
  List<IndustrialRecordModel> _maintenance = [];
  List<IndustrialRecordModel> _melange = [];
  List<PorPromeshModel> _promesh = [];
  List<RecuperableFicheModel> _recuperables = [];

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
      final results = await Future.wait([
        IndustrialRecordService.instance.fetchAll(module: 'probar'),
        IndustrialRecordService.instance.fetchAll(module: 'maintenance'),
        IndustrialRecordService.instance.fetchAll(module: 'melange'),
        PorPromeshService.instance.fetchAll(limit: 1000),
        RecuperableService.instance.fetchAll(),
      ]);
      if (!mounted) return;
      setState(() {
        _probar = results[0] as List<IndustrialRecordModel>;
        _maintenance = results[1] as List<IndustrialRecordModel>;
        _melange = results[2] as List<IndustrialRecordModel>;
        _promesh = results[3] as List<PorPromeshModel>;
        _recuperables = results[4] as List<RecuperableFicheModel>;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _isToday(DateTime? d, DateTime now) => d != null && d.year == now.year && d.month == now.month && d.day == now.day;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final screenWidth = MediaQuery.of(context).size.width;
    final isMobile = screenWidth < 700;

    final probarCount = _probar.length;
    final promeshCount = _promesh.length;
    final maintenanceCount = _maintenance.length;
    final totalCount = probarCount + promeshCount;

    final machinesActives = <String>{};
    for (final r in _probar) {
      if (r.machine != null && _isToday(DateTime.tryParse(r.createdAt ?? ''), now)) machinesActives.add('PROBAR-${r.machine}');
    }
    for (final r in _maintenance) {
      if (r.machine != null && _isToday(DateTime.tryParse(r.createdAt ?? ''), now)) machinesActives.add('MAINTENANCE-${r.machine}');
    }
    for (final m in _promesh) {
      if (m.machine != null && _isToday(DateTime.tryParse(m.createdAt ?? ''), now)) machinesActives.add('PROMESH-${m.machine}');
    }

    final todayCount = _probar.where((r) => _isToday(DateTime.tryParse(r.createdAt ?? ''), now)).length +
        _maintenance.where((r) => _isToday(DateTime.tryParse(r.createdAt ?? ''), now)).length +
        _melange.where((r) => _isToday(DateTime.tryParse(r.createdAt ?? ''), now)).length +
        _promesh.where((m) => _isToday(DateTime.tryParse(m.createdAt ?? ''), now)).length;

    final activity = _buildActivity();

    final recuperablesOuvertes = _recuperables.where((f) => f.isOpen).length;
    final recuperablesCloturees = _recuperables.where((f) => !f.isOpen).length;
    final recuperablesPoidsTotal = _recuperables.fold(0.0, (s, f) => s + f.totalDechetKg);

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: IndustrialPageBody(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Text('Dashboard Industriel',
                        style: tInter(fontSize: 24, fontWeight: FontWeight.w900, color: kCrmText)),
                  ),
                  IconButton(
                    tooltip: 'Actualiser',
                    icon: _loading
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.refresh_rounded, size: 22, color: kCrmTextSub),
                    onPressed: _loading ? null : _load,
                  ),
                ]),
                const SizedBox(height: 20),

                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Text('Erreur de chargement : $_error', style: tInter(fontSize: 13, color: kCrmDanger)),
                  )
                else ...[
                  // ── SECTION 1 — Statistiques principales ────────────────
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: isMobile ? 2 : 3,
                    mainAxisSpacing: 16,
                    crossAxisSpacing: 16,
                    childAspectRatio: isMobile ? 1.05 : 1.3,
                    children: [
                      _BigStatCard(emoji: '📄', title: 'Fiches PROBAR', value: probarCount, color: _cProbar, loading: _loading),
                      _BigStatCard(emoji: '🧪', title: 'Fiches PROMESH', value: promeshCount, color: _cPromesh, loading: _loading),
                      _BigStatCard(emoji: '🔧', title: 'Demandes Maintenance', value: maintenanceCount, color: _cMaintenance, loading: _loading),
                      _BigStatCard(emoji: '📋', title: 'Total des fiches', value: totalCount, color: _cTotal, loading: _loading),
                      _BigStatCard(emoji: '🏭', title: 'Machines actives', value: machinesActives.length, color: _cMachines, loading: _loading),
                      _BigStatCard(emoji: '📅', title: "Fiches aujourd'hui", value: todayCount, color: _cToday, loading: _loading),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _RecuperableSummaryCard(
                    ouvertes: recuperablesOuvertes,
                    cloturees: recuperablesCloturees,
                    poidsTotal: recuperablesPoidsTotal,
                    loading: _loading,
                    isMobile: isMobile,
                  ),
                  const SizedBox(height: 32),

                  // ── SECTION 2 — Accès rapide ─────────────────────────────
                  Text('Accès rapide', style: tInter(fontSize: 18, fontWeight: FontWeight.w900, color: kCrmText)),
                  const SizedBox(height: 14),
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: isMobile ? 1 : 3,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: isMobile ? 3.6 : 2.6,
                    children: [
                      _QuickAccessButton(emoji: '➕', label: 'Nouvelle fiche PROBAR', color: _cProbar,
                          onTap: () => context.go(MyRoute.productionProbarRoot)),
                      _QuickAccessButton(emoji: '🧪', label: 'Nouvelle fiche PROMESH', color: _cPromesh,
                          onTap: () => context.go(MyRoute.productionPromeshRoot)),
                      _QuickAccessButton(emoji: '🔧', label: 'Nouvelle maintenance', color: _cMaintenance,
                          onTap: () => context.go(MyRoute.maintenanceFormScreen)),
                      _QuickAccessButton(emoji: '📚', label: 'Historique PROBAR', color: _cProbar,
                          onTap: () => context.go(MyRoute.productionProbarRoot)),
                      _QuickAccessButton(emoji: '📚', label: 'Historique PROMESH', color: _cPromesh,
                          onTap: () => context.go(MyRoute.porPromeshHistoriqueScreen)),
                      _QuickAccessButton(emoji: '📋', label: 'Historique Maintenance', color: _cMaintenance,
                          onTap: () => context.go(MyRoute.maintenanceHistoriqueScreen)),
                      _QuickAccessButton(emoji: '♻️', label: 'Nouvelle fiche Récupérables', color: kRecuperableColor,
                          onTap: () => context.go(MyRoute.recuperableFicheScreen)),
                    ],
                  ),
                  const SizedBox(height: 32),

                  // ── SECTION 3 — Activité récente ─────────────────────────
                  Text('Activité récente', style: tInter(fontSize: 18, fontWeight: FontWeight.w900, color: kCrmText)),
                  const SizedBox(height: 4),
                  Text('Les 10 dernières opérations, tous modules confondus',
                      style: tInter(fontSize: 12.5, color: kCrmTextSub)),
                  const SizedBox(height: 14),
                  if (_loading)
                    const Padding(padding: EdgeInsets.symmetric(vertical: 30), child: Center(child: CircularProgressIndicator()))
                  else if (activity.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Text('Aucune activité pour le moment', style: tInter(fontSize: 13, color: kCrmTextSub)),
                    )
                  else
                    Column(children: [for (final a in activity) _ActivityRow(entry: a)]),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }

  List<_ActivityEntry> _buildActivity() {
    final all = <_ActivityEntry>[
      for (final r in _probar) _ActivityEntry.fromIndustrial(r, 'PROBAR', _cProbar, Icons.fact_check_outlined),
      for (final r in _maintenance) _ActivityEntry.fromIndustrial(r, 'MAINTENANCE', _cMaintenance, Icons.build_outlined),
      for (final r in _melange) _ActivityEntry.fromIndustrial(r, 'MÉLANGE', kMelangeColor, Icons.science_outlined),
      for (final m in _promesh) _ActivityEntry.fromPromesh(m),
    ];
    all.sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
    return all.take(10).toList();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Carte résumé Récupérables — 3 chiffres (ouvertes/clôturées/poids total)
// dans une seule carte large, comme demandé.
// ─────────────────────────────────────────────────────────────────────────
class _RecuperableSummaryCard extends StatelessWidget {
  final int ouvertes;
  final int cloturees;
  final double poidsTotal;
  final bool loading;
  final bool isMobile;

  const _RecuperableSummaryCard({
    required this.ouvertes,
    required this.cloturees,
    required this.poidsTotal,
    required this.loading,
    required this.isMobile,
  });

  @override
  Widget build(BuildContext context) {
    final stats = [
      ('Fiches ouvertes', loading ? '—' : '$ouvertes', kRecuperableOpen),
      ('Fiches terminées', loading ? '—' : '$cloturees', kRecuperableClosed),
      ('Poids total récupéré', loading ? '—' : '${poidsTotal.toStringAsFixed(1)} kg', kRecuperableColor),
    ];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: kRecuperableColor.withOpacity(0.25), width: 1.2),
        boxShadow: [BoxShadow(color: kRecuperableColor.withOpacity(0.1), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: kRecuperableColor.withOpacity(0.14), borderRadius: BorderRadius.circular(14)),
            child: const Text('♻️', style: TextStyle(fontSize: 22)),
          ),
          const SizedBox(width: 12),
          Text('Récupérables', style: tInter(fontSize: 15, fontWeight: FontWeight.w900, color: kCrmText)),
        ]),
        const SizedBox(height: 16),
        isMobile
            ? Column(children: [for (final s in stats) _summaryStat(s.$1, s.$2, s.$3)])
            : Row(children: [for (final s in stats) Expanded(child: _summaryStat(s.$1, s.$2, s.$3))]),
      ]),
    );
  }

  Widget _summaryStat(String label, String value, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(value, style: tInter(fontSize: 26, fontWeight: FontWeight.w900, color: color)),
        Text(label, style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmTextSub)),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Carte statistique géante — chiffre énorme, icône emoji, très peu de texte.
// ─────────────────────────────────────────────────────────────────────────
class _BigStatCard extends StatelessWidget {
  final String emoji;
  final String title;
  final int value;
  final Color color;
  final bool loading;

  const _BigStatCard({
    required this.emoji,
    required this.title,
    required this.value,
    required this.color,
    required this.loading,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.25), width: 1.2),
        boxShadow: [BoxShadow(color: color.withOpacity(0.12), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 52,
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: color.withOpacity(0.14), borderRadius: BorderRadius.circular(16)),
          child: Text(emoji, style: const TextStyle(fontSize: 26)),
        ),
        const Spacer(),
        loading
            ? SizedBox(
                width: 48,
                height: 34,
                child: Align(alignment: Alignment.centerLeft, child: CircularProgressIndicator(strokeWidth: 2.5, color: color)),
              )
            : Text('$value', style: tInter(fontSize: 38, fontWeight: FontWeight.w900, color: kCrmText)),
        const SizedBox(height: 4),
        Text(title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmTextSub)),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Bouton d'accès rapide — gros bouton coloré, emoji + libellé unique.
// ─────────────────────────────────────────────────────────────────────────
class _QuickAccessButton extends StatelessWidget {
  final String emoji;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickAccessButton({required this.emoji, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withOpacity(0.08),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: color.withOpacity(0.3))),
          child: Row(children: [
            Text(emoji, style: const TextStyle(fontSize: 28)),
            const SizedBox(width: 14),
            Expanded(
              child: Text(label, style: tInter(fontSize: 15, fontWeight: FontWeight.w800, color: kCrmText)),
            ),
            Icon(Icons.chevron_right_rounded, color: color, size: 24),
          ]),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Activité récente — une entrée unifiée par fiche, quel que soit le module.
// ─────────────────────────────────────────────────────────────────────────
class _ActivityEntry {
  final String module;
  final Color color;
  final IconData icon;
  final String? machine;
  final String? date;
  final String? operateur;
  final String statusLabel;
  final Color statusColor;
  final String? createdAt;

  const _ActivityEntry({
    required this.module,
    required this.color,
    required this.icon,
    required this.machine,
    required this.date,
    required this.operateur,
    required this.statusLabel,
    required this.statusColor,
    required this.createdAt,
  });

  factory _ActivityEntry.fromIndustrial(IndustrialRecordModel r, String module, Color color, IconData icon) {
    final status = _statusFor(r);
    return _ActivityEntry(
      module: module,
      color: color,
      icon: icon,
      machine: r.machine == null ? null : 'Machine ${r.machine}',
      date: r.dateFiche,
      operateur: r.operateur,
      statusLabel: status.$1,
      statusColor: status.$2,
      createdAt: r.createdAt,
    );
  }

  factory _ActivityEntry.fromPromesh(PorPromeshModel m) {
    final isDraft = m.status == 'draft';
    return _ActivityEntry(
      module: 'PROMESH',
      color: _cPromesh,
      icon: Icons.description_outlined,
      machine: m.machine == null ? null : 'Machine ${m.machine}',
      date: m.dateProduction,
      operateur: m.operateur,
      statusLabel: isDraft ? 'Brouillon' : 'Soumise',
      statusColor: isDraft ? kCrmWarning : kCrmSuccess,
      createdAt: m.createdAt,
    );
  }

  static (String, Color) _statusFor(IndustrialRecordModel r) {
    if (r.statutQualite == 'ok') return ('Conforme', kCrmSuccess);
    if (r.statutQualite == 'nok') return ('Non Conforme', kCrmDanger);
    if (r.urgence != null) {
      switch (r.urgence) {
        case 'critique':
          return ('Critique', kCrmDanger);
        case 'moyenne':
          return ('Moyenne', kCrmWarning);
        default:
          return ('Faible', kCrmSuccess);
      }
    }
    if (r.statut == 'validee') return ('Validé', kCrmSuccess);
    return ('Brouillon', kCrmTextSub);
  }
}

class _ActivityRow extends StatelessWidget {
  final _ActivityEntry entry;
  const _ActivityRow({required this.entry});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmBorder),
      ),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: entry.color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
          child: Icon(entry.icon, color: entry.color, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(entry.module, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w900, color: entry.color)),
              if ((entry.machine ?? '').isNotEmpty) ...[
                Text(' · ', style: tInter(fontSize: 12.5, color: kCrmTextSub)),
                Text(entry.machine!, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w600, color: kCrmText)),
              ],
            ]),
            const SizedBox(height: 2),
            Text(
              [
                if ((entry.date ?? '').isNotEmpty) entry.date!,
                if ((entry.operateur ?? '').isNotEmpty) entry.operateur!,
              ].join(' · '),
              style: tInter(fontSize: 11.5, color: kCrmTextSub),
              overflow: TextOverflow.ellipsis,
            ),
          ]),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: entry.statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
          child: Text(entry.statusLabel, style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: entry.statusColor)),
        ),
      ]),
    );
  }
}
