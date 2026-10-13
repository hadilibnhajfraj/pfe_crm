// Écran et service du rapport Power BI intégré. Tout est simulé : aucun réseau,
// aucun backend, aucun appel Microsoft.
import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/powerbi/powerbi_embed_host.dart';
import 'package:dash_master_toolkit/powerbi/powerbi_embed_screen.dart';
import 'package:dash_master_toolkit/powerbi/powerbi_embed_service.dart';

class MockDio extends Mock implements Dio {}

class FakeHost implements PowerBiEmbedHost {
  final List<String> events = [];
  bool supported = true;
  @override
  bool get isSupported => supported;
  @override
  Widget buildView() => const Text('RAPPORT', key: ValueKey('fake-report'));
  @override
  Future<void> load(PowerBiEmbedConfig config) async => events.add('load:${config.viewerEmail}');
  @override
  Future<void> updateToken(String embedToken) async => events.add('token:$embedToken');
  @override
  void reset() => events.add('reset');
}

class FakeService implements PowerBiEmbedService {
  FakeService(this.answers);
  final List<FutureOr<PowerBiEmbedConfig> Function()> answers;
  int calls = 0;
  @override
  Future<PowerBiEmbedConfig> fetchEmbedConfig() async => await answers[calls++ < answers.length ? calls - 1 : answers.length - 1]();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Map<String, dynamic> payload({String email = 'demo.commercial01@cbi_tunisia.com', String scope = 'commercial', String token = 't1', DateTime? expiresAt}) => {
      'reportId': 'rep',
      'embedUrl': 'https://app.powerbi.com/reportEmbed?reportId=rep',
      'embedToken': token,
      'expiresAt': (expiresAt ?? DateTime.now().toUtc().add(const Duration(minutes: 15))).toIso8601String(),
      'viewer': {
        'email': email,
        'scope': scope,
        'label': scope == 'global' ? 'Vue globale — Administrateur' : 'Utilisateur connecté : $email',
        'allowedPages': scope == 'global' ? null : ['01 — Executive Overview'],
      },
    };

PowerBiEmbedConfig cfg({String email = 'demo.commercial01@cbi_tunisia.com', String scope = 'commercial', String token = 't1', DateTime? expiresAt}) =>
    PowerBiEmbedConfig.fromJson(payload(email: email, scope: scope, token: token, expiresAt: expiresAt));

DioException dioError(int status, [Map<String, dynamic>? body]) {
  final req = RequestOptions(path: '/powerbi/embed-config');
  return DioException(requestOptions: req, response: Response(requestOptions: req, statusCode: status, data: body), type: DioExceptionType.badResponse);
}

Widget host(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  group('PowerBiEmbedService', () {
    late MockDio dio;
    setUp(() => dio = MockDio());

    test('appelle la route sans aucun paramètre d\'identité', () async {
      when(() => dio.get<dynamic>(any())).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), statusCode: 200, data: payload()));
      final c = await PowerBiEmbedService(dio: dio).fetchEmbedConfig();
      expect(c.viewerLabel, 'Utilisateur connecté : demo.commercial01@cbi_tunisia.com');
      expect(c.isGlobal, isFalse);
      verify(() => dio.get<dynamic>('/powerbi/embed-config')).called(1);
      verifyNoMoreInteractions(dio);
    });

    for (final c in <(int, PowerBiEmbedFailure)>[
      (401, PowerBiEmbedFailure.sessionExpired),
      (403, PowerBiEmbedFailure.forbidden),
      (503, PowerBiEmbedFailure.notConfigured),
      (502, PowerBiEmbedFailure.unavailable),
    ]) {
      test('statut ${c.$1} -> ${c.$2.name}', () async {
        when(() => dio.get<dynamic>(any())).thenThrow(dioError(c.$1, {'message': 'Ce rôle n\'a pas accès au rapport commercial.'}));
        expect(
          () => PowerBiEmbedService(dio: dio).fetchEmbedConfig(),
          throwsA(isA<PowerBiEmbedException>().having((e) => e.failure, 'failure', c.$2)),
        );
      });
    }

    test('réponse incomplète refusée', () {
      expect(() => PowerBiEmbedConfig.fromJson({'reportId': 'rep'}), throwsA(isA<PowerBiEmbedException>()));
    });
  });

  group('PowerBiEmbedScreen', () {
    testWidgets('commercial : identité du serveur dans l\'en-tête, rapport chargé', (tester) async {
      final h = FakeHost();
      await tester.pumpWidget(host(PowerBiEmbedScreen(service: FakeService([() => cfg()]), host: h, currentUserId: () => 'u1')));
      await tester.pump();
      await tester.pump();
      expect(find.text('Utilisateur connecté : demo.commercial01@cbi_tunisia.com'), findsOneWidget);
      expect(find.byKey(const ValueKey('fake-report')), findsOneWidget);
      expect(h.events, containsAllInOrder(['reset', 'load:demo.commercial01@cbi_tunisia.com']));
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('administrateur : « Vue globale — Administrateur »', (tester) async {
      await tester.pumpWidget(host(PowerBiEmbedScreen(service: FakeService([() => cfg(email: 'demo.admin01@cbi_tunisia.com', scope: 'global')]), host: FakeHost(), currentUserId: () => 'a')));
      await tester.pump();
      await tester.pump();
      expect(find.text('Vue globale — Administrateur'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('non configuré : message dédié, aucun rapport', (tester) async {
      final h = FakeHost();
      await tester.pumpWidget(host(PowerBiEmbedScreen(
        service: FakeService([() => throw const PowerBiEmbedException(PowerBiEmbedFailure.notConfigured, "Le rapport Power BI n'est pas encore configuré.")]),
        host: h,
        currentUserId: () => 'u1',
      )));
      await tester.pump();
      await tester.pump();
      expect(find.text("Le rapport Power BI n'est pas encore configuré."), findsOneWidget);
      expect(find.byKey(const ValueKey('fake-report')), findsNothing);
      expect(find.text('Réessayer'), findsNothing);
      expect(h.events.where((e) => e.startsWith('load')), isEmpty);
    });

    testWidgets('accès refusé : message du serveur, aucun rapport', (tester) async {
      await tester.pumpWidget(host(PowerBiEmbedScreen(
        service: FakeService([() => throw const PowerBiEmbedException(PowerBiEmbedFailure.forbidden, "Ce rôle n'a pas accès au rapport commercial.")]),
        host: FakeHost(),
        currentUserId: () => 'log',
      )));
      await tester.pump();
      await tester.pump();
      expect(find.text("Ce rôle n'a pas accès au rapport commercial."), findsOneWidget);
      expect(find.byKey(const ValueKey('fake-report')), findsNothing);
    });

    testWidgets('changement de compte : contexte précédent détruit puis rechargé', (tester) async {
      final h = FakeHost();
      var user = 'u1';
      final service = FakeService([() => cfg(), () => cfg(email: 'demo.commercial02@cbi_tunisia.com')]);
      Widget build() => host(PowerBiEmbedScreen(service: service, host: h, currentUserId: () => user));
      await tester.pumpWidget(build());
      await tester.pump();
      await tester.pump();
      expect(find.textContaining('commercial01'), findsOneWidget);

      user = 'u2';
      h.events.clear();
      await tester.pumpWidget(build());
      await tester.pump();
      await tester.pump();
      expect(h.events.first, 'reset');
      expect(h.events, contains('load:demo.commercial02@cbi_tunisia.com'));
      expect(find.textContaining('commercial01'), findsNothing);
      expect(find.textContaining('commercial02'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('réponse arrivée après un changement de compte : ignorée', (tester) async {
      final h = FakeHost();
      var user = 'u1';
      final late1 = Completer<PowerBiEmbedConfig>();
      final service = FakeService([() => late1.future, () => cfg(email: 'demo.commercial02@cbi_tunisia.com')]);
      Widget build() => host(PowerBiEmbedScreen(service: service, host: h, currentUserId: () => user));
      await tester.pumpWidget(build());
      await tester.pump();
      user = 'u2';
      await tester.pumpWidget(build());
      await tester.pump();
      late1.complete(cfg());
      await tester.pump();
      await tester.pump();
      expect(h.events.where((e) => e == 'load:demo.commercial01@cbi_tunisia.com'), isEmpty);
      expect(find.textContaining('commercial02'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('renouvellement du jeton avant expiration, sans rechargement', (tester) async {
      final h = FakeHost();
      final service = FakeService([
        () => cfg(token: 't1', expiresAt: DateTime.now().toUtc().add(const Duration(minutes: 5))),
        () => cfg(token: 't2'),
      ]);
      await tester.pumpWidget(host(PowerBiEmbedScreen(service: service, host: h, currentUserId: () => 'u1', renewBefore: const Duration(minutes: 3))));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(minutes: 2, seconds: 5));
      await tester.pump();
      expect(h.events, contains('token:t2'));
      expect(h.events.where((e) => e.startsWith('load')).length, 1);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('cible non web : message, aucun appel au serveur', (tester) async {
      final h = FakeHost()..supported = false;
      final service = FakeService([() => cfg()]);
      await tester.pumpWidget(host(PowerBiEmbedScreen(service: service, host: h, currentUserId: () => 'u1')));
      await tester.pump();
      expect(find.textContaining('version web'), findsOneWidget);
      expect(service.calls, 0);
    });
  });
}
