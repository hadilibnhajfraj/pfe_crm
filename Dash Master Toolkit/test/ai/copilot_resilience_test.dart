// Erreurs réseau, délais, indisponibilité du modèle, état de disponibilité
// affiché et envoi au clavier du Copilot. Tout est mocké (mocktail) : aucun
// réseau, aucune connexion Socket.IO, aucun backend.
import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart' hide Response;
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/copilot_message.dart';
import 'package:dash_master_toolkit/ai/models/copilot_response.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_context_controller.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_input_bar.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockDio extends Mock implements Dio {}

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

RequestOptions _req() => RequestOptions(path: '/ai-copilot/chat');

DioException _dioError(DioExceptionType type, {int? status, String? message}) => DioException(
      requestOptions: _req(),
      type: type,
      response: status == null ? null : Response(requestOptions: _req(), statusCode: status, data: message == null ? null : {'message': message}),
    );

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    registerFallbackValue(CancelToken());
    final tempDir = Directory.systemTemp.createTempSync('copilot_resilience_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );
    AuthService();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });

  group('CopilotApiService — une exception par cause', () {
    late MockDio dio;
    late CopilotApiService api;

    setUp(() {
      dio = MockDio();
      api = CopilotApiService.withDio(dio);
    });

    void failWith(DioException error) => when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenThrow(error);

    test('serveur injoignable → CopilotNetworkException', () async {
      failWith(_dioError(DioExceptionType.connectionError));
      await expectLater(api.sendMessage(message: 'Salut'), throwsA(isA<CopilotNetworkException>()));
    });

    test('aucune réponse et type inconnu → CopilotNetworkException', () async {
      failWith(_dioError(DioExceptionType.unknown));
      await expectLater(api.sendMessage(message: 'Salut'), throwsA(isA<CopilotNetworkException>()));
    });

    for (final type in [DioExceptionType.connectionTimeout, DioExceptionType.sendTimeout, DioExceptionType.receiveTimeout]) {
      test('${type.name} → CopilotTimeoutException', () async {
        failWith(_dioError(type));
        await expectLater(api.sendMessage(message: 'Salut'), throwsA(isA<CopilotTimeoutException>()));
      });
    }

    for (final status in [401, 429, 500, 502]) {
      test('réponse $status → CopilotServerException avec le code et le message du serveur', () async {
        failWith(_dioError(DioExceptionType.badResponse, status: status, message: 'message du serveur'));
        await expectLater(
          api.sendMessage(message: 'Salut'),
          throwsA(isA<CopilotServerException>().having((e) => e.statusCode, 'statusCode', status).having((e) => e.message, 'message', 'message du serveur')),
        );
      });
    }

    test('503 et 403 gardent leurs exceptions dédiées', () async {
      failWith(_dioError(DioExceptionType.badResponse, status: 503));
      await expectLater(api.sendMessage(message: 'Salut'), throwsA(isA<CopilotNotConfiguredException>()));
      failWith(_dioError(DioExceptionType.badResponse, status: 403));
      await expectLater(api.sendMessage(message: 'Salut'), throwsA(isA<CopilotForbiddenException>()));
    });

    test('une annulation volontaire reste une DioException (jamais traduite en erreur)', () async {
      failWith(_dioError(DioExceptionType.cancel));
      await expectLater(api.sendMessage(message: 'Salut'), throwsA(isA<DioException>()));
    });
  });

  group('CopilotController — message affiché et disponibilité constatée', () {
    late MockCopilotApiService api;
    late MockCopilotSocketService socket;
    late CopilotController controller;

    void stub(Future<CopilotResponse> Function() answer) {
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) => answer());
    }

    CopilotResponse ok() => CopilotResponse.fromJson({'conversationId': 'c1', 'mode': 'agent', 'answer': 'Il y a 14 projets.'});

    setUp(() {
      api = MockCopilotApiService();
      socket = MockCopilotSocketService();
      when(() => socket.isConnected).thenReturn(false);
      controller = CopilotController(api: api, socket: socket, context: CopilotContextController());
    });

    test('aucune disponibilité affirmée avant le premier échange', () {
      expect(controller.availability.value, CopilotAvailability.unknown);
    });

    test('réponse normale → ready', () async {
      stub(() async => ok());
      await controller.send('Combien de projets ?');
      expect(controller.availability.value, CopilotAvailability.ready);
      expect(controller.messages.last.status, CopilotMessageStatus.complete);
    });

    test('serveur injoignable → unreachable, message qui dit quoi vérifier', () async {
      stub(() async => throw const CopilotNetworkException('Connection refused'));
      await controller.send('Bonjour');
      expect(controller.availability.value, CopilotAvailability.unreachable);
      expect(controller.messages.last.status, CopilotMessageStatus.error);
      expect(controller.messages.last.text, contains('Serveur injoignable'));
      expect(controller.messages.last.text, isNot(contains('Connection refused')));
      expect(controller.isSending.value, isFalse);
    });

    test('délai dépassé → degraded, message sur le modèle', () async {
      stub(() async => throw const CopilotTimeoutException('timeout'));
      await controller.send('Bonjour');
      expect(controller.availability.value, CopilotAvailability.degraded);
      expect(controller.messages.last.text, contains("n'a pas répondu à temps"));
    });

    test('session expirée (401) → invitation à se reconnecter', () async {
      stub(() async => throw const CopilotServerException(401, 'Invalid or expired token'));
      await controller.send('Bonjour');
      expect(controller.messages.last.text, contains('Reconnectez-vous'));
      expect(controller.messages.last.text, isNot(contains('token')));
    });

    test('trop de demandes (429) → message dédié', () async {
      stub(() async => throw const CopilotServerException(429, 'rate limited'));
      await controller.send('Bonjour');
      expect(controller.messages.last.text, contains('Trop de demandes'));
    });

    test('erreur serveur (500) → message générique sûr, sans détail technique', () async {
      stub(() async => throw const CopilotServerException(500, 'TypeError: cannot read properties of undefined'));
      await controller.send('Bonjour');
      expect(controller.availability.value, CopilotAvailability.degraded);
      expect(controller.messages.last.text, contains('a rencontré une erreur'));
      expect(controller.messages.last.text, isNot(contains('TypeError')));
    });

    test('503 → notConfigured ; 403 → forbidden', () async {
      stub(() async => throw const CopilotNotConfiguredException('off'));
      await controller.send('Bonjour');
      expect(controller.availability.value, CopilotAvailability.notConfigured);

      stub(() async => throw const CopilotForbiddenException('non'));
      await controller.send('Bonjour');
      expect(controller.availability.value, CopilotAvailability.forbidden);
    });

    test('enveloppe mode:"error" (modèle indisponible) → degraded, message du serveur affiché tel quel', () async {
      stub(() async => CopilotResponse.fromJson({'conversationId': 'c1', 'mode': 'error', 'answer': null, 'error': {'message': 'Le modèle est momentanément indisponible.'}}));
      await controller.send('Bonjour');
      expect(controller.availability.value, CopilotAvailability.degraded);
      expect(controller.messages.last.text, 'Le modèle est momentanément indisponible.');
      expect(controller.messages.last.status, CopilotMessageStatus.error);
    });

    test('après un échec, une réponse normale ramène à ready', () async {
      stub(() async => throw const CopilotNetworkException('x'));
      await controller.send('Bonjour');
      stub(() async => ok());
      await controller.send('Bonjour');
      expect(controller.availability.value, CopilotAvailability.ready);
    });

    test('un second envoi pendant une génération est ignoré', () async {
      final completer = Completer<CopilotResponse>();
      stub(() => completer.future);
      final first = controller.send('Première question');
      await Future<void>.delayed(Duration.zero);
      await controller.send('Deuxième question');
      expect(controller.messages.where((m) => m.isUser), hasLength(1));
      completer.complete(ok());
      await first;
      verify(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext'))).called(1);
    });
  });

  group('CopilotInputBar — clavier', () {
    late MockCopilotApiService api;

    setUp(() {
      Get.reset();
      api = MockCopilotApiService();
      final socket = MockCopilotSocketService();
      when(() => socket.isConnected).thenReturn(false);
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) async => CopilotResponse.fromJson({'conversationId': 'c1', 'mode': 'agent', 'answer': 'ok'}));
      Get.put<CopilotController>(CopilotController(api: api, socket: socket, context: CopilotContextController()), permanent: true);
    });

    tearDown(() => Get.reset());

    Future<void> pumpBar(WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CopilotInputBar())));
      await tester.tap(find.byType(TextField));
      await tester.pump();
    }

    int sent() => verify(() => api.sendMessage(message: captureAny(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext'))).callCount;

    testWidgets('Entrée envoie la question saisie', (tester) async {
      await pumpBar(tester);
      await tester.enterText(find.byType(TextField), 'Combien de projets ?');
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();

      expect(sent(), 1);
      expect(CopilotController.to.messages.first.text, 'Combien de projets ?');
      expect(CopilotController.to.inputCtrl.text, isEmpty);
    });

    testWidgets('Maj+Entrée n\'envoie rien', (tester) async {
      await pumpBar(tester);
      await tester.enterText(find.byType(TextField), 'Première ligne');
      await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
      await tester.pump();

      verifyNever(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')));
      expect(CopilotController.to.messages, isEmpty);
      expect(CopilotController.to.inputCtrl.text, contains('Première ligne'));
    });

    testWidgets('Entrée sur un champ vide n\'envoie rien', (tester) async {
      await pumpBar(tester);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pump();
      expect(CopilotController.to.messages, isEmpty);
    });

    testWidgets('Entrée pendant une génération n\'empile pas un second envoi', (tester) async {
      await pumpBar(tester);
      CopilotController.to.isSending.value = true;
      await tester.enterText(find.byType(TextField), 'Encore');
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pump();
      expect(CopilotController.to.messages, isEmpty);
      CopilotController.to.isSending.value = false;
    });

    testWidgets('le champ annonce les raccourcis clavier', (tester) async {
      await pumpBar(tester);
      expect(find.textContaining('Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne'), findsOneWidget);
    });
  });
}
