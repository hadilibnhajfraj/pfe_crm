// lib/dashboard/industrial/view/industrial_super_admin_dashboard_screen.dart
//
// Dashboard consolidé PROMESH / PROBAR / Maintenance / RH / Mélange /
// Récupérables — réservé Super Admin / Admin (GET /admin-dashboard/stats).
// Même design que les écrans de détail industriels (cq_theme.dart :
// CqSectionHeading/CqCardSurface, mêmes couleurs/typographie/espacements).
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart';

import '../model/admin_dashboard_stats_model.dart';
import '../service/admin_dashboard_service.dart';

class IndustrialSuperAdminDashboardScreen extends StatefulWidget {
  const IndustrialSuperAdminDashboardScreen({super.key});

  @override
  State<IndustrialSuperAdminDashboardScreen> createState() => _IndustrialSuperAdminDashboardScreenState();
}

class _IndustrialSuperAdminDashboardScreenState extends State<IndustrialSuperAdminDashboardScreen> {
  bool _loading = true;
  String? _error;
  AdminDashboardStats? _stats;

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
      final stats = await AdminDashboardService.instance.fetchStats();
      if (!mounted) return;
      setState(() => _stats = stats);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: Row(children: [
              InkWell(
                onTap: () => context.go(MyRoute.dashboard),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.all(7),
                  decoration:
                      BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                ),
              ),
              const SizedBox(width: 12),
              Container(
                width: 38,
                height: 38,
                decoration:
                    BoxDecoration(color: kCrmPrimary.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.dashboard_customize_rounded, color: kCrmPrimary, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text('Dashboard Industriel — Super Admin',
                    style: tInter(fontSize: 17, fontWeight: FontWeight.w900, color: kCrmText)),
              ),
              IconButton(
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh_rounded, color: kCrmTextSub),
                tooltip: 'Rafraîchir',
              ),
            ]),
          ),
          Expanded(child: _buildBody()),
        ]),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text('Erreur : $_error', style: tInter(fontSize: 13, color: kCrmDanger)));
    }
    final s = _stats;
    if (s == null) return const SizedBox.shrink();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kIndustrialMaxContentWidth),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const CqSectionHeading(
            icon: Icons.layers_rounded,
            title: 'PROMESH',
            subtitle: 'Toutes machines, tous postes',
            color: kPromeshColor,
          ),
          const SizedBox(height: 10),
          _promeshCard(s.promesh),
          const SizedBox(height: kCqSectionGap),

          const CqSectionHeading(
            icon: Icons.fact_check_outlined,
            title: 'PROBAR',
            subtitle: 'Toutes machines, tous postes',
            color: kProbarColor,
          ),
          const SizedBox(height: 10),
          _probarCard(s.probar),
          const SizedBox(height: kCqSectionGap),

          const CqSectionHeading(
            icon: Icons.build_circle_outlined,
            title: 'Maintenance',
            subtitle: 'Demandes de maintenance',
            color: kMaintenanceColor,
          ),
          const SizedBox(height: 10),
          _maintenanceCard(s.maintenance),
          const SizedBox(height: kCqSectionGap),

          const CqSectionHeading(
            icon: Icons.badge_outlined,
            title: 'Ressources Humaines',
            subtitle: 'Congés et autorisations de sortie',
            color: kPersonnelColor,
          ),
          const SizedBox(height: 10),
          _rhCard(s.rh),
          const SizedBox(height: kCqSectionGap),

          const CqSectionHeading(
            icon: Icons.blender_outlined,
            title: 'Mélange',
            subtitle: 'Fiches de mélange',
            color: kMelangeColor,
          ),
          const SizedBox(height: 10),
          _melangeCard(s.melange),
          const SizedBox(height: kCqSectionGap),

          const CqSectionHeading(
            icon: Icons.recycling_rounded,
            title: 'Récupérables',
            subtitle: 'Déchets et produit fini récupérés',
            color: kCrmSuccess,
          ),
          const SizedBox(height: 10),
          _recuperablesCard(s.recuperables),
          const SizedBox(height: 12),
        ]),
      ),
    );
  }

  Widget _promeshCard(PromeshDashboardStats s) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [
          _kpiTile(Icons.description_outlined, 'Total Fiches', '${s.fichesCount}', kPromeshColor),
          _kpiTile(Icons.today_rounded, "Aujourd'hui", '${s.today}', kCrmInfo),
          _kpiTile(Icons.view_week_rounded, 'Cette semaine', '${s.week}', kCrmInfo),
          _kpiTile(Icons.calendar_month_rounded, 'Ce mois', '${s.month}', kCrmInfo),
          _kpiTile(Icons.precision_manufacturing_rounded, 'Machines Actives', '${s.machinesActives}', kPromeshColor),
        ]),
        const SizedBox(height: 12),
        _breakdownRow('Par machine', s.repartitionParMachine),
        const SizedBox(height: 8),
        _breakdownRow('Matin / Soir', s.repartitionParPoste),
        const SizedBox(height: 12),
        _latestList(s.dernieresFiches, (r) => 'Machine ${r['machine'] ?? '—'} · ${r['poste'] ?? '—'} · ${r['statut'] ?? '—'}'),
      ]),
    );
  }

  Widget _probarCard(ProbarDashboardStats s) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [
          _kpiTile(Icons.description_outlined, 'Total Fiches', '${s.fichesCount}', kProbarColor),
          _kpiTile(Icons.today_rounded, "Aujourd'hui", '${s.today}', kCrmInfo),
          _kpiTile(Icons.view_week_rounded, 'Cette semaine', '${s.week}', kCrmInfo),
          _kpiTile(Icons.calendar_month_rounded, 'Ce mois', '${s.month}', kCrmInfo),
          _kpiTile(Icons.precision_manufacturing_rounded, 'Machines Actives', '${s.machinesActives}', kProbarColor),
        ]),
        const SizedBox(height: 12),
        _breakdownRow('Par machine', s.repartitionParMachine),
        const SizedBox(height: 8),
        _breakdownRow('Matin / Soir', s.repartitionParPoste),
        const SizedBox(height: 12),
        _latestList(s.dernieresFiches, (r) => 'Machine ${r['machine'] ?? '—'} · ${r['poste'] ?? '—'} · ${r['statut'] ?? '—'}'),
      ]),
    );
  }

  Widget _maintenanceCard(MaintenanceDashboardStats s) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [
          _kpiTile(Icons.lock_open_rounded, 'Ouvertes', '${s.demandesOuvertes}', kCrmWarning),
          _kpiTile(Icons.task_alt_rounded, 'Terminées', '${s.demandesTerminees}', kCrmSuccess),
          _kpiTile(Icons.priority_high_rounded, 'Urgentes', '${s.urgentes}', kCrmDanger),
          _kpiTile(Icons.hourglass_empty_rounded, 'En attente', '${s.enAttente}', kCrmInfo),
        ]),
        const SizedBox(height: 12),
        _latestList(s.dernieresDemandes, (r) => 'Machine ${r['machine'] ?? '—'} · ${r['typePanne'] ?? '—'} · ${r['urgence'] ?? '—'}'),
      ]),
    );
  }

  Widget _rhCard(RhDashboardStats s) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [
          _kpiTile(Icons.beach_access_rounded, 'Demandes de congé', '${s.demandesConge}', kPersonnelColor),
          _kpiTile(Icons.logout_rounded, 'Autorisations de sortie', '${s.autorisationsSortie}', kPersonnelColor),
          _kpiTile(Icons.check_circle_outline_rounded, 'Acceptées', '${s.acceptees}', kCrmSuccess),
          _kpiTile(Icons.cancel_outlined, 'Refusées', '${s.refusees}', kCrmDanger),
          _kpiTile(Icons.hourglass_empty_rounded, 'En attente', '${s.enAttente}', kCrmInfo),
        ]),
        const SizedBox(height: 12),
        _latestList(s.dernieresDemandes, (r) => '${r['employe'] ?? '—'} · ${r['type'] ?? '—'} · ${r['statut'] ?? '—'}'),
      ]),
    );
  }

  Widget _melangeCard(MelangeDashboardStats s) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 12, runSpacing: 12, children: [
          _kpiTile(Icons.description_outlined, 'Nombre de fiches', '${s.fichesCount}', kMelangeColor),
          _kpiTile(Icons.speed_rounded, 'Production totale', _fmtNum(s.productionTotale), kMelangeColor),
        ]),
        const SizedBox(height: 12),
        _latestList(s.dernieresFiches, (r) => 'Machine ${r['machine'] ?? '—'} · ${r['quantiteProduite'] ?? '—'}'),
      ]),
    );
  }

  Widget _recuperablesCard(RecuperablesDashboardStats s) {
    return CqCardSurface(
      child: Wrap(spacing: 12, runSpacing: 12, children: [
        _kpiTile(Icons.description_outlined, 'Nombre de fiches', '${s.fichesCount}', kCrmSuccess),
        _kpiTile(Icons.delete_outline_rounded, 'Déchets (kg)', _fmtNum(s.dechetsKg), kCrmWarning),
        _kpiTile(Icons.inventory_2_outlined, 'Produit fini (kg)', _fmtNum(s.produitFiniKg), kCrmSuccess),
        _kpiTile(Icons.recycling_rounded, 'Total récupéré (kg)', _fmtNum(s.totalRecupereKg), kCrmSuccess),
      ]),
    );
  }

  Widget _breakdownRow(String label, Map<String, int> counts) {
    if (counts.isEmpty) {
      return Text('$label — aucune donnée', style: tInter(fontSize: 11.5, color: kCrmTextSub));
    }
    return Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
      Text('$label :', style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: kCrmTextSub)),
      for (final entry in counts.entries)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: kCrmBg, borderRadius: BorderRadius.circular(20), border: Border.all(color: kCrmBorder)),
          child: Text('${entry.key} : ${entry.value}', style: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: kCrmText)),
        ),
    ]);
  }

  Widget _latestList(List<Map<String, dynamic>> items, String Function(Map<String, dynamic>) label) {
    if (items.isEmpty) {
      return Text('Aucune fiche récente.', style: tInter(fontSize: 11.5, color: kCrmTextSub));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Dernières fiches', style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: kCrmTextSub)),
      const SizedBox(height: 6),
      for (final item in items)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text('• ${label(item)}', style: tInter(fontSize: 11.5, color: kCrmText)),
        ),
    ]);
  }

  Widget _kpiTile(IconData icon, String label, String value, Color color) {
    return Container(
      width: 170,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: kCrmBg, borderRadius: BorderRadius.circular(kCqInnerRadius), border: Border.all(color: kCrmBorder)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 15, color: color),
        ),
        const SizedBox(height: 8),
        Text(value, style: tInter(fontSize: 15, fontWeight: FontWeight.w800, color: kCrmText)),
        const SizedBox(height: 1),
        Text(label, style: tInter(fontSize: 10, color: kCrmTextSub)),
      ]),
    );
  }

  String _fmtNum(num v) {
    if (v == v.roundToDouble()) return v.toInt().toString();
    return v.toStringAsFixed(2);
  }
}
