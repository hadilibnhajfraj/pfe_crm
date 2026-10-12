import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/forms/production/view/widgets/production_widgets.dart';

import 'package:dash_master_toolkit/reports/report_service.dart';
import 'package:dash_master_toolkit/reports/reports_card.dart';

import 'me_dashboard_model.dart';
import 'me_dashboard_service.dart';

/// « Mon tableau de bord » : profil, indicateurs, modules et limites tels que
/// le serveur les renvoie (GET /dashboard/me). L'écran n'utilise pas le rôle
/// stocké dans l'application pour décider de ce qu'il affiche.
class MeDashboardScreen extends StatefulWidget {
  const MeDashboardScreen({super.key, this.dataSource, this.onNavigate, this.reportsSource});

  /// Source de données ; par défaut l'API du CRM.
  final MeDashboardDataSource? dataSource;

  /// Source des rapports PDF / Excel ; par défaut l'API du CRM.
  final ReportsDataSource? reportsSource;

  /// Navigation vers un module ; par défaut le routeur de l'application.
  final void Function(String route)? onNavigate;

  /// Route de l'application pour chaque module annoncé par le serveur.
  /// Un module sans route connue est affiché sans lien.
  static const Map<String, String> moduleRoutes = {
    'projects': '/users/user_project',
    'pipeline': '/kanban',
    'commercial_contacts': '/users/commercial-contacts',
    'contacts_kpi': '/users/commercial-contacts-kpi',
    'users_admin': '/users/user-list',
    'project_user_stats': '/accueil',
    'production': '/production/dashboard',
    'por_promesh': '/por-promesh/dashboard',
    'machines': '/production/machines',
    'maintenance': '/maintenance/historique',
    'hr_requests': '/rh/historique',
    'recuperables': '/recuperables/historique',
  };

  static const Map<String, IconData> _moduleIcons = {
    'projects': Icons.folder_copy_outlined,
    'pipeline': Icons.view_kanban_outlined,
    'commercial_contacts': Icons.contact_page_outlined,
    'contacts_kpi': Icons.analytics_outlined,
    'clients': Icons.business_outlined,
    'users_admin': Icons.group_outlined,
    'project_user_stats': Icons.table_chart_outlined,
    'production': Icons.precision_manufacturing_outlined,
    'por_promesh': Icons.grid_on_outlined,
    'industrial_records': Icons.description_outlined,
    'machines': Icons.settings_outlined,
    'maintenance': Icons.build_outlined,
    'hr_requests': Icons.badge_outlined,
    'recuperables': Icons.recycling_outlined,
  };

  @override
  State<MeDashboardScreen> createState() => _MeDashboardScreenState();
}

class _MeDashboardScreenState extends State<MeDashboardScreen> {
  late final MeDashboardDataSource _source = widget.dataSource ?? MeDashboardService();

  MeDashboard? _data;
  Object? _error;
  bool _loading = true;
  String? _period;

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
      final data = await _source.fetch(period: _period);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  void _open(String route) {
    final navigate = widget.onNavigate;
    if (navigate != null) {
      navigate(route);
    } else {
      GoRouter.of(context).go(route);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return ProdPage(
      onRefresh: _load,
      children: [
        ProdPageHeader(
          title: 'Mon tableau de bord',
          subtitle: data == null ? 'Vue adaptée à votre profil' : '${data.profile.title} · ${data.profile.roleLabel}',
          icon: Icons.space_dashboard_outlined,
          actions: [
            ProdButton(label: 'Actualiser', icon: Icons.refresh_rounded, onTap: _loading ? null : _load, busy: _loading),
          ],
        ),
        const SizedBox(height: 16),
        if (_loading && data == null)
          const _LoadingState()
        else if (_error != null && data == null)
          _ErrorState(onRetry: _load)
        else if (data != null) ...[
          if (_error != null) const _Notice(key: Key('me-dashboard-stale'), icon: Icons.cloud_off_outlined, text: 'Actualisation impossible : les dernières valeurs reçues restent affichées.'),
          ..._filters(data),
          ..._kpis(data),
          ..._modules(data),
          ReportsCard(dataSource: widget.reportsSource, period: _period),
          ..._limitations(data),
          _freshness(data),
        ],
      ],
    );
  }

  List<Widget> _filters(MeDashboard data) {
    if (data.filters.isEmpty) return const [];
    return [
      ProdCard(
        child: Wrap(
          spacing: 16,
          runSpacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final filter in data.filters)
              if (filter.options.isNotEmpty)
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Text('${filter.label} : '),
                  DropdownButton<String>(
                    key: Key('me-dashboard-filter-${filter.key}'),
                    value: filter.options.any((o) => o.value == (_period ?? filter.value)) ? (_period ?? filter.value) : null,
                    items: [for (final o in filter.options) DropdownMenuItem(value: o.value, child: Text(o.label))],
                    onChanged: _loading
                        ? null
                        : (value) {
                            if (value == null) return;
                            _period = value;
                            _load();
                          },
                  ),
                ]),
          ],
        ),
      ),
      const SizedBox(height: 16),
    ];
  }

  List<Widget> _kpis(MeDashboard data) {
    if (data.kpis.isEmpty) {
      return const [
        _Notice(key: Key('me-dashboard-empty'), icon: Icons.insights_outlined, text: 'Aucun indicateur n\'est disponible pour votre profil.'),
        SizedBox(height: 16),
      ];
    }
    final widgets = <Widget>[];
    data.kpisByGroup.forEach((group, kpis) {
      widgets
        ..add(ProdSectionTitle(title: group))
        ..add(const SizedBox(height: 10))
        ..add(ProdGrid(
          children: [
            for (final kpi in kpis)
              ProdKpiTile(
                key: Key('me-dashboard-kpi-${kpi.key}'),
                icon: _kpiIcon(kpi),
                label: kpi.label,
                value: kpi.displayValue,
                unit: kpi.value == null ? null : kpi.unit,
                loading: _loading,
              ),
          ],
        ))
        ..add(const SizedBox(height: 20));
    });
    return widgets;
  }

  IconData _kpiIcon(MeKpi kpi) {
    if (kpi.format == 'percent') return Icons.percent_rounded;
    if (kpi.unit == 'kg') return Icons.scale_outlined;
    if (kpi.unit == 'm²') return Icons.square_foot_outlined;
    return Icons.tag_rounded;
  }

  List<Widget> _modules(MeDashboard data) {
    if (data.modules.isEmpty) return const [];
    return [
      const ProdSectionTitle(title: 'Mes modules'),
      const SizedBox(height: 10),
      ProdCard(
        child: Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final module in data.modules)
              ActionChip(
                key: Key('me-dashboard-module-${module.key}'),
                avatar: Icon(MeDashboardScreen._moduleIcons[module.key] ?? Icons.apps_outlined, size: 18),
                label: Text(module.label),
                onPressed: MeDashboardScreen.moduleRoutes.containsKey(module.key)
                    ? () => _open(MeDashboardScreen.moduleRoutes[module.key]!)
                    : null,
              ),
          ],
        ),
      ),
      const SizedBox(height: 20),
    ];
  }

  List<Widget> _limitations(MeDashboard data) {
    if (data.limitations.isEmpty) return const [];
    return [
      const ProdSectionTitle(title: 'À savoir sur ces données'),
      const SizedBox(height: 10),
      ProdCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final text in data.limitations)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Padding(padding: EdgeInsets.only(top: 2, right: 8), child: Icon(Icons.info_outline, size: 16)),
                  Expanded(child: Text(text)),
                ]),
              ),
          ],
        ),
      ),
      const SizedBox(height: 16),
    ];
  }

  Widget _freshness(MeDashboard data) {
    final at = data.generatedAt;
    final when = at == null ? 'date inconnue' : DateFormat('dd/MM/yyyy à HH:mm').format(at);
    return Text(
      'Valeurs calculées en direct sur la base du CRM · mise à jour le $when',
      key: const Key('me-dashboard-freshness'),
      style: Theme.of(context).textTheme.bodySmall,
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) {
    return const Column(
      key: Key('me-dashboard-loading'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ProdSkeleton(width: 220, height: 18),
        SizedBox(height: 12),
        ProdGrid(children: [ProdSkeleton(height: 96), ProdSkeleton(height: 96), ProdSkeleton(height: 96), ProdSkeleton(height: 96)]),
      ],
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ProdCard(
      key: const Key('me-dashboard-error'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(children: [
            Icon(Icons.error_outline, color: Color(0xFFDC2626)),
            SizedBox(width: 8),
            Expanded(child: Text('Impossible de charger votre tableau de bord.', style: TextStyle(fontWeight: FontWeight.w600))),
          ]),
          const SizedBox(height: 6),
          const Text('Vérifiez votre connexion, puis réessayez. Si le problème persiste, reconnectez-vous.'),
          const SizedBox(height: 12),
          ProdButton(label: 'Réessayer', icon: Icons.refresh_rounded, onTap: onRetry, primary: true),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({super.key, required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return ProdCard(
      child: Row(children: [
        Icon(icon),
        const SizedBox(width: 10),
        Expanded(child: Text(text)),
      ]),
    );
  }
}
