// Tableau de bord personnalisé (GET /dashboard/me) : lecture de la réponse du
// serveur et états de l'écran (chargement, erreur, absence de données,
// données). L'écran n'utilise jamais le rôle stocké localement : tout ce qui
// est affiché vient de la source de données injectée.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/dashboard/me/me_dashboard_model.dart';
import 'package:dash_master_toolkit/dashboard/me/me_dashboard_screen.dart';
import 'package:dash_master_toolkit/dashboard/me/me_dashboard_service.dart';
import 'package:dash_master_toolkit/reports/report_service.dart';

Map<String, dynamic> response({
  String role = 'commercial',
  String roleLabel = 'Commercial',
  List<Map<String, dynamic>>? kpis,
  List<Map<String, dynamic>>? modules,
  List<Map<String, dynamic>>? filters,
  List<String>? limitations,
}) =>
    {
      'success': true,
      'data': {
        'profile': {'id': 'u1', 'email': 'demo@test.local', 'displayName': 'Demo Test', 'role': role, 'roleLabel': roleLabel, 'key': role, 'source': 'database'},
        'modules': modules ??
            [
              {'key': 'projects', 'label': 'Projets', 'api': '/projects'},
              {'key': 'industrial_records', 'label': 'Fiches industrielles', 'api': '/industrial-records'},
            ],
        'kpis': kpis ??
            [
              {'key': 'my_projects', 'label': 'Projets actifs', 'value': 1234, 'unit': null, 'format': 'integer', 'group': 'Mes projets'},
              {'key': 'my_validation_rate', 'label': 'Taux de validation', 'value': 33.33, 'unit': '%', 'format': 'percent', 'group': 'Mes projets'},
              {'key': 'my_followups_late', 'label': 'Relances en retard', 'value': null, 'unit': null, 'format': 'integer', 'group': 'Mes relances'},
            ],
        'filters': filters ?? [],
        'freshness': {'generatedAt': '2026-10-10T20:15:00.000Z', 'mode': 'live'},
        'limitations': limitations ?? ['Périmètre : uniquement vos projets.'],
      },
    };

class FakeSource implements MeDashboardDataSource {
  FakeSource(this._answers);

  final List<FutureOr<MeDashboard> Function()> _answers;
  final List<String?> periods = [];

  @override
  Future<MeDashboard> fetch({String? period}) async {
    periods.add(period);
    final answer = _answers.length > 1 ? _answers.removeAt(0) : _answers.first;
    return answer();
  }
}

class FakeReports implements ReportsDataSource {
  FakeReports({this.reports = const [], this.failCatalog = false, this.failDownload});

  final List<ReportItem> reports;
  final bool failCatalog;
  final Object? failDownload;
  final List<String> downloads = [];

  @override
  Future<List<ReportItem>> fetchCatalog() async {
    if (failCatalog) throw Exception('catalogue');
    return reports;
  }

  @override
  Future<void> download(ReportItem report, String format, {String? period}) async {
    downloads.add('${report.type}:$format:${period ?? '-'}');
    final failure = failDownload;
    if (failure != null) throw failure;
  }
}

const projectsReport = ReportItem(type: 'projects', title: 'Rapport des projets', formats: ['xlsx', 'pdf'], filters: ['from', 'to']);

Future<void> pumpScreen(WidgetTester tester, MeDashboardDataSource source, {void Function(String)? onNavigate, ReportsDataSource? reports}) async {
  tester.view.physicalSize = const Size(1400, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: MeDashboardScreen(dataSource: source, onNavigate: onNavigate, reportsSource: reports ?? FakeReports()))));
}

void main() {
  group('MeDashboard.fromJson', () {
    test('lit profil, modules, indicateurs, filtres et limites', () {
      final d = MeDashboard.fromJson(response(filters: [
        {
          'key': 'period',
          'label': 'Période (production)',
          'type': 'enum',
          'value': 'week',
          'options': [
            {'value': 'week', 'label': 'Cette semaine'},
            {'value': 'month', 'label': 'Ce mois'},
          ],
        },
      ]));
      expect(d.profile.role, 'commercial');
      expect(d.profile.title, 'Demo Test');
      expect(d.modules.map((m) => m.key), ['projects', 'industrial_records']);
      expect(d.kpis.length, 3);
      expect(d.filters.single.value, 'week');
      expect(d.filters.single.options.length, 2);
      expect(d.limitations, ['Périmètre : uniquement vos projets.']);
      expect(d.generatedAt, isNotNull);
    });

    test('regroupe les indicateurs dans l\'ordre du serveur', () {
      final d = MeDashboard.fromJson(response());
      expect(d.kpisByGroup.keys.toList(), ['Mes projets', 'Mes relances']);
      expect(d.kpisByGroup['Mes projets']!.map((k) => k.key), ['my_projects', 'my_validation_rate']);
    });

    test('une valeur absente reste vide : « — », jamais 0', () {
      final d = MeDashboard.fromJson(response());
      final late = d.kpis.firstWhere((k) => k.key == 'my_followups_late');
      expect(late.value, isNull);
      expect(late.displayValue, '—');
    });

    test('formate entiers, pourcentages et décimaux', () {
      MeKpi kpi(num value, String format) => MeKpi(key: 'k', label: 'l', value: value, unit: null, format: format, group: 'g');
      expect(kpi(1234, 'integer').displayValue, '1 234');
      expect(kpi(33.33, 'percent').displayValue, '33,3');
      expect(kpi(12400.5, 'decimal').displayValue, '12 400,5');
      expect(kpi(9800, 'decimal').displayValue, '9 800');
    });

    test('réponse sans profil : erreur de format, pas de tableau de bord inventé', () {
      expect(() => MeDashboard.fromJson({'success': true, 'data': {'kpis': []}}), throwsFormatException);
    });

    test('champs manquants : listes vides plutôt qu\'une exception', () {
      final d = MeDashboard.fromJson({
        'data': {
          'profile': {'id': 'u1', 'email': 'a@b.c', 'role': 'accueil'},
        },
      });
      expect(d.kpis, isEmpty);
      expect(d.modules, isEmpty);
      expect(d.filters, isEmpty);
      expect(d.limitations, isEmpty);
      expect(d.profile.roleLabel, 'accueil');
      expect(d.profile.title, 'a@b.c');
    });
  });

  group('MeDashboardScreen', () {
    testWidgets('chargement : squelette affiché tant que le serveur n\'a pas répondu', (tester) async {
      final completer = Completer<MeDashboard>();
      await pumpScreen(tester, FakeSource([() => completer.future]));
      expect(find.byKey(const Key('me-dashboard-loading')), findsOneWidget);
      expect(find.byKey(const Key('me-dashboard-error')), findsNothing);
      completer.complete(MeDashboard.fromJson(response()));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('me-dashboard-loading')), findsNothing);
    });

    testWidgets('données : profil, indicateurs avec unité, modules, limites et date de mise à jour', (tester) async {
      await pumpScreen(tester, FakeSource([() => MeDashboard.fromJson(response())]));
      await tester.pumpAndSettle();
      expect(find.textContaining('Demo Test'), findsOneWidget);
      expect(find.textContaining('Commercial'), findsWidgets);
      expect(find.text('Mes projets'), findsOneWidget);
      expect(find.text('PROJETS ACTIFS'), findsOneWidget);
      expect(find.byKey(const Key('me-dashboard-kpi-my_followups_late')), findsOneWidget);
      expect(find.text('Projets'), findsOneWidget);
      expect(find.text('Périmètre : uniquement vos projets.'), findsOneWidget);
      expect(find.byKey(const Key('me-dashboard-freshness')), findsOneWidget);
      expect(find.textContaining('10/10/2026'), findsOneWidget);
    });

    testWidgets('erreur : message et bouton Réessayer, puis affichage après succès', (tester) async {
      final source = FakeSource([() => throw Exception('réseau'), () => MeDashboard.fromJson(response())]);
      await pumpScreen(tester, source);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('me-dashboard-error')), findsOneWidget);
      expect(find.textContaining('réseau'), findsNothing);
      await tester.tap(find.text('Réessayer'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('me-dashboard-error')), findsNothing);
      expect(find.text('PROJETS ACTIFS'), findsOneWidget);
      expect(source.periods.length, 2);
    });

    testWidgets('aucun indicateur (profil Accueil) : message dédié, modules toujours listés', (tester) async {
      final data = MeDashboard.fromJson(response(
        role: 'accueil',
        roleLabel: 'Accueil',
        kpis: [],
        modules: [
          {'key': 'project_user_stats', 'label': 'Projets par utilisateur', 'api': '/x'},
        ],
        limitations: ['Aucun indicateur n\'est défini pour le profil Accueil.'],
      ));
      await pumpScreen(tester, FakeSource([() => data]));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('me-dashboard-empty')), findsOneWidget);
      expect(find.text('Projets par utilisateur'), findsOneWidget);
    });

    testWidgets('un module connu ouvre sa route ; un module sans route n\'est pas cliquable', (tester) async {
      final opened = <String>[];
      await pumpScreen(tester, FakeSource([() => MeDashboard.fromJson(response())]), onNavigate: opened.add);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('me-dashboard-module-projects')));
      expect(opened, ['/users/user_project']);
      final unknown = tester.widget<ActionChip>(find.byKey(const Key('me-dashboard-module-industrial_records')));
      expect(unknown.onPressed, isNull);
    });

    testWidgets('filtre de période : le choix est envoyé au serveur, rien n\'est recalculé localement', (tester) async {
      final filters = [
        {
          'key': 'period',
          'label': 'Période (production)',
          'type': 'enum',
          'value': 'month',
          'options': [
            {'value': 'week', 'label': 'Cette semaine'},
            {'value': 'month', 'label': 'Ce mois'},
          ],
        },
      ];
      final source = FakeSource([() => MeDashboard.fromJson(response(filters: filters))]);
      await pumpScreen(tester, source);
      await tester.pumpAndSettle();
      expect(source.periods, [null]);
      await tester.tap(find.byKey(const Key('me-dashboard-filter-period')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cette semaine').last);
      await tester.pumpAndSettle();
      expect(source.periods, [null, 'week']);
    });

    testWidgets('actualisation en échec après un premier succès : les dernières valeurs restent affichées', (tester) async {
      final source = FakeSource([() => MeDashboard.fromJson(response()), () => throw Exception('coupure')]);
      await pumpScreen(tester, source);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Actualiser'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('me-dashboard-stale')), findsOneWidget);
      expect(find.text('PROJETS ACTIFS'), findsOneWidget);
      expect(find.byKey(const Key('me-dashboard-error')), findsNothing);
    });
  });

  group('Mes rapports', () {
    testWidgets('liste les rapports annoncés par le serveur et lance la génération demandée', (tester) async {
      final reports = FakeReports(reports: const [projectsReport]);
      await pumpScreen(tester, FakeSource([() => MeDashboard.fromJson(response())]), reports: reports);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('reports-card')), findsOneWidget);
      expect(find.text('Rapport des projets'), findsOneWidget);
      await tester.tap(find.byKey(const Key('report-projects-xlsx')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('report-projects-pdf')));
      await tester.pumpAndSettle();
      expect(reports.downloads, ['projects:xlsx:-', 'projects:pdf:-']);
      expect(find.byKey(const Key('reports-message')), findsOneWidget);
    });

    testWidgets('aucun rapport autorisé : la section n\'est pas affichée', (tester) async {
      await pumpScreen(tester, FakeSource([() => MeDashboard.fromJson(response())]), reports: FakeReports());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('reports-card')), findsNothing);
      expect(find.text('Mes rapports'), findsNothing);
    });

    testWidgets('échec de génération : message d\'erreur, sans détail technique', (tester) async {
      final reports = FakeReports(reports: const [projectsReport], failDownload: Exception('HTTP 500 relation projects'));
      await pumpScreen(tester, FakeSource([() => MeDashboard.fromJson(response())]), reports: reports);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('report-projects-pdf')));
      await tester.pumpAndSettle();
      expect(find.textContaining('n\'a pas pu être généré'), findsOneWidget);
      expect(find.textContaining('relation projects'), findsNothing);
    });

    testWidgets('catalogue indisponible : le tableau de bord reste affiché', (tester) async {
      await pumpScreen(tester, FakeSource([() => MeDashboard.fromJson(response())]), reports: FakeReports(failCatalog: true));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('reports-unavailable')), findsOneWidget);
      expect(find.text('PROJETS ACTIFS'), findsOneWidget);
    });

    test('nom de fichier : celui du serveur, sinon un nom par défaut', () {
      expect(ReportService.filenameFrom('attachment; filename="rapport-projects-20261010-2300.xlsx"', 'projects', 'xlsx'), 'rapport-projects-20261010-2300.xlsx');
      expect(ReportService.filenameFrom(null, 'projects', 'pdf'), 'rapport-projects.pdf');
    });

    test('catalogue : lecture de la réponse du serveur', () {
      final item = ReportItem.fromJson({'type': 'dashboard', 'title': 'Synthèse', 'formats': ['xlsx', 'pdf'], 'filters': ['period']});
      expect(item.type, 'dashboard');
      expect(item.formats, ['xlsx', 'pdf']);
      expect(item.filters, ['period']);
    });
  });

  test('toutes les routes de modules pointent vers un chemin absolu', () {
    for (final route in MeDashboardScreen.moduleRoutes.values) {
      expect(route.startsWith('/'), isTrue, reason: route);
    }
  });
}
