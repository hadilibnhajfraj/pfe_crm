// Teste CopilotController.send()/regenerate()/stopGenerating()/copyMessage()
// contre un CopilotApiService/CopilotSocketService MOCKÉS (mocktail) —
// jamais un vrai réseau ni une vraie connexion Socket.IO. Le socket mock
// annonce toujours isConnected=false pour forcer le chemin REST (le seul
// entièrement mockable ici, voir CopilotApiService.withDio) — le chemin
// WebSocket lui-même reste hors du périmètre de cette passe (voir
// lib/ai/README.md, section Tests, "Non testé dans cette passe").
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/models/copilot_attachment.dart';
import 'package:dash_master_toolkit/ai/models/copilot_message.dart';
import 'package:dash_master_toolkit/ai/models/copilot_page_context.dart';
import 'package:dash_master_toolkit/ai/models/copilot_response.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_context_controller.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/ai/utils/copilot_loading_phase.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

void main() {
  late MockCopilotApiService api;
  late MockCopilotSocketService socket;
  late CopilotContextController pageContext;
  late CopilotController controller;
  final methodCalls = <MethodCall>[];

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    registerFallbackValue(CancelToken());
    registerFallbackValue(Uint8List(0));

    // CopilotController construit AuthService() (singleton réel de l'app,
    // voir lib/providers/auth_service.dart), qui construit GetStorage(),
    // qui appelle path_provider en interne pour trouver un dossier de
    // stockage — jamais mocké nulle part ailleurs dans ce projet
    // aujourd'hui (aucun test existant ne touchait AuthService avant cette
    // passe). Sans ce handler, GetStorage._init() lève une
    // MissingPluginException de façon asynchrone et NON rattrapée, qui fait
    // échouer un test déjà terminé. On répond avec un vrai dossier
    // temporaire — AuthService n'a besoin d'aucune donnée réelle ici,
    // seulement que l'initialisation ne parte pas en erreur.
    final tempDir = Directory.systemTemp.createTempSync('copilot_controller_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );

    // Construit le singleton une seule fois ici et laisse son init
    // asynchrone se terminer AVANT le premier test — sans ça, l'erreur
    // (le cas échéant) remonterait de façon asynchrone et serait attribuée
    // à un test déjà terminé plutôt qu'à celui-ci.
    AuthService();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });

  setUp(() {
    api = MockCopilotApiService();
    socket = MockCopilotSocketService();
    when(() => socket.isConnected).thenReturn(false);
    // Instance FRAÎCHE à chaque test (jamais CopilotContextController.to) —
    // aucun état de contexte ne doit fuiter d'un test à l'autre.
    pageContext = CopilotContextController();
    controller = CopilotController(api: api, socket: socket, context: pageContext);

    methodCalls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      methodCalls.add(call);
      return null;
    });
    // copyMessage() déclenche aussi un toast (Fluttertoast) en plus de
    // Clipboard.setData — jamais attendu (fire-and-forget) côté contrôleur,
    // mais sans handler mocké ici l'appel de canal seul suffirait à faire
    // remonter une MissingPluginException non gérée dans la zone du test.
    const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler((call) async => null);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null);
    const MethodChannel('PonnamKarthik/fluttertoast').setMockMethodCallHandler(null);
  });

  CopilotResponse fakeResponse({String answer = 'Réponse.', String conversationId = 'c1', String mode = 'agent'}) =>
      CopilotResponse.fromJson({'conversationId': conversationId, 'mode': mode, 'answer': answer});

  // `mode: "error"` (ex. AI_PROVIDER_AUTH_ERROR/AI_PROVIDER_UNAVAILABLE/
  // AI_PROVIDER_TIMEOUT — voir errorClassifier.js côté backend) a TOUJOURS
  // `answer: null` (responseBuilder.js::buildErrorResponse) — le message
  // sûr à afficher vit dans `error.message`.
  CopilotResponse fakeErrorResponse({required String errorMessage, String conversationId = 'c1'}) =>
      CopilotResponse.fromJson({'conversationId': conversationId, 'mode': 'error', 'answer': null, 'error': {'message': errorMessage}});

  group('send() — chemin REST (socket non connecté)', () {
    test('ajoute le message utilisateur puis un placeholder assistant, avant même la réponse serveur', () async {
      final completer = Completer<CopilotResponse>();
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) => completer.future);

      final future = controller.send('Bonjour');
      await Future<void>.delayed(Duration.zero);

      expect(controller.messages, hasLength(2));
      expect(controller.messages[0].isUser, isTrue);
      expect(controller.messages[0].text, 'Bonjour');
      expect(controller.messages[1].isUser, isFalse);
      expect(controller.messages[1].isStreaming, isTrue);
      expect(controller.isSending.value, isTrue);

      completer.complete(fakeResponse());
      await future;
    });

    test('finalise le message assistant avec la réponse et mémorise le conversationId', () async {
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) async => fakeResponse(answer: 'Trois projets en retard.', conversationId: 'c42'));

      await controller.send('Quels projets sont en retard ?');

      expect(controller.isSending.value, isFalse);
      expect(controller.conversationId.value, 'c42');
      expect(controller.messages.last.text, 'Trois projets en retard.');
      expect(controller.messages.last.status, CopilotMessageStatus.complete);
    });

    test('une enveloppe mode:"error" (answer: null) affiche error.message dans la bulle, jamais une bulle vide', () async {
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) async => fakeErrorResponse(errorMessage: "OpenAI n'a pas répondu à temps. Réessayez."));

      await controller.send('Réponds simplement : Copilot opérationnel.');

      expect(controller.messages.last.text, "OpenAI n'a pas répondu à temps. Réessayez.");
      expect(controller.messages.last.status, CopilotMessageStatus.error);
    });

    test('un texte vide ne fait rien (aucun appel réseau)', () async {
      await controller.send('   ');
      expect(controller.messages, isEmpty);
      verifyNever(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')));
    });

    test('un échec réseau produit un message assistant en erreur, jamais une exception non gérée', () async {
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenThrow(Exception('Erreur réseau'));

      await controller.send('Bonjour');

      expect(controller.messages.last.status, CopilotMessageStatus.error);
      expect(controller.isSending.value, isFalse);
    });
  });

  group('stopGenerating()', () {
    test('arrête immédiatement isSending/isTyping et finalise le message en cours', () async {
      final completer = Completer<CopilotResponse>();
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) => completer.future);

      final future = controller.send('Bonjour');
      await Future<void>.delayed(Duration.zero);
      expect(controller.isSending.value, isTrue);

      controller.stopGenerating();

      expect(controller.isSending.value, isFalse);
      expect(controller.isTyping.value, isFalse);
      expect(controller.messages.last.status, CopilotMessageStatus.complete);
      expect(controller.messages.last.text, 'Génération interrompue.');

      completer.complete(fakeResponse(answer: 'Réponse arrivée trop tard.'));
      await future;
    });

    test('une réponse qui arrive APRÈS le stop est ignorée — jamais un remplacement tardif du texte', () async {
      final completer = Completer<CopilotResponse>();
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) => completer.future);

      final future = controller.send('Bonjour');
      await Future<void>.delayed(Duration.zero);
      controller.stopGenerating();

      completer.complete(fakeResponse(answer: 'Réponse arrivée trop tard.'));
      await future;

      expect(controller.messages.last.text, 'Génération interrompue.');
    });

    test('annule réellement la requête REST via le CancelToken transmis à sendMessage', () async {
      CancelToken? capturedToken;
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((invocation) {
        capturedToken = invocation.namedArguments[#cancelToken] as CancelToken?;
        return Completer<CopilotResponse>().future; // jamais résolu dans ce test
      });

      unawaited(controller.send('Bonjour'));
      await Future<void>.delayed(Duration.zero);
      controller.stopGenerating();

      expect(capturedToken, isNotNull);
      expect(capturedToken!.isCancelled, isTrue);
    });

    test('sans génération en cours, ne fait rien', () {
      controller.stopGenerating();
      expect(controller.messages, isEmpty);
      expect(controller.isSending.value, isFalse);
    });
  });

  group('regenerate()', () {
    test('renvoie le dernier message utilisateur et remplace la dernière réponse assistant', () async {
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) async => fakeResponse(answer: 'Première réponse.'));
      await controller.send('Quels projets sont en retard ?');
      expect(controller.messages, hasLength(2));

      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) async => fakeResponse(answer: 'Deuxième réponse (régénérée).'));
      await controller.regenerate();

      expect(controller.messages, hasLength(2), reason: 'le message assistant est remplacé, pas ajouté en plus');
      expect(controller.messages[0].text, 'Quels projets sont en retard ?', reason: 'le message utilisateur original reste affiché une seule fois');
      expect(controller.messages[1].text, 'Deuxième réponse (régénérée).');

      final captured = verify(() => api.sendMessage(
            message: captureAny(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
          )).captured;
      expect(captured.last, 'Quels projets sont en retard ?');
    });

    test('canRegenerate est faux sans conversation, ou pendant une génération en cours', () async {
      expect(controller.canRegenerate, isFalse);

      final completer = Completer<CopilotResponse>();
      when(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')))
          .thenAnswer((_) => completer.future);
      final future = controller.send('Bonjour');
      await Future<void>.delayed(Duration.zero);
      expect(controller.canRegenerate, isFalse);

      completer.complete(fakeResponse());
      await future;
      expect(controller.canRegenerate, isTrue);
    });

    test('sans aucun message, ne fait rien', () async {
      await controller.regenerate();
      expect(controller.messages, isEmpty);
      verifyNever(() => api.sendMessage(message: any(named: 'message'), conversationId: any(named: 'conversationId'), cancelToken: any(named: 'cancelToken'), pageContext: any(named: 'pageContext')));
    });
  });

  group('copyMessage()', () {
    test('copie le texte du message dans le presse-papiers', () async {
      final message = CopilotMessage.user('Bonjour Copilot');

      await controller.copyMessage(message);

      final setDataCall = methodCalls.firstWhere((c) => c.method == 'Clipboard.setData');
      expect((setDataCall.arguments as Map)['text'], 'Bonjour Copilot');
    });
  });

  group('fetchReportPdfBytes() — export PDF d\'un rapport', () {
    test('délègue à api.fetchReportPdfBytes avec le texte du message comme content', () async {
      final message = CopilotMessage(id: '1', role: CopilotMessageRole.assistant, text: '3 projets en retard.', createdAt: DateTime.now());
      when(() => api.fetchReportPdfBytes(content: any(named: 'content'))).thenAnswer((_) async => Uint8List.fromList([0x25, 0x50, 0x44, 0x46]));

      final bytes = await controller.fetchReportPdfBytes(message);

      expect(bytes, [0x25, 0x50, 0x44, 0x46]);
      verify(() => api.fetchReportPdfBytes(content: '3 projets en retard.')).called(1);
    });
  });

  group('Context Awareness — pageContext envoyé automatiquement', () {
    test('sans contexte actif, pageContext est null (comportement strictement identique à avant)', () async {
      when(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
          )).thenAnswer((_) async => fakeResponse());

      await controller.send('Bonjour');

      final captured = verify(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: captureAny(named: 'pageContext'),
          )).captured;
      expect(captured.single, isNull);
    });

    test('un contexte projet actif est automatiquement joint au message, sans que l\'appelant ait à le passer', () async {
      when(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
          )).thenAnswer((_) async => fakeResponse());

      pageContext.setContext(CopilotPageContext.project(name: 'Villa Sfax', client: 'Comptoir X', status: 'en_cours'));

      await controller.send('Quel est le statut ?');

      final captured = verify(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: captureAny(named: 'pageContext'),
          )).captured;
      expect(captured.single, {
        'screen': 'project',
        'label': 'Villa Sfax',
        'data': {'client': 'Comptoir X', 'statut': 'en_cours'},
        'entity': 'project', // Phase 1 : type d'entité canonique pour le backend
      });
    });

    test('changer de contexte entre deux tours envoie bien le NOUVEAU contexte au second tour', () async {
      when(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
          )).thenAnswer((_) async => fakeResponse());

      pageContext.setContext(CopilotPageContext.dashboard(totalProjects: 10));
      await controller.send('Résume la situation');

      pageContext.setContext(CopilotPageContext.client(name: 'Société ABC'));
      await controller.send('Et ce client ?');

      final captured = verify(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: captureAny(named: 'pageContext'),
          )).captured;
      expect(captured, hasLength(2));
      expect(captured[0]['screen'], 'dashboard');
      expect(captured[1]['screen'], 'client');
    });

    test('clearContext() efface le contexte — le tour suivant repart sans pageContext', () async {
      when(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
          )).thenAnswer((_) async => fakeResponse());

      pageContext.setContext(CopilotPageContext.dashboard(totalProjects: 10));
      pageContext.clearContext();

      await controller.send('Bonjour');

      final captured = verify(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: captureAny(named: 'pageContext'),
          )).captured;
      expect(captured.single, isNull);
    });
  });

  // Phase 2 — documents joints : envoi, états de la puce, documentIds dans le
  // message, nettoyage côté serveur.
  group('documents joints (Phase 2)', () {
    final pdfBytes = Uint8List.fromList('%PDF-1.4 contenu'.codeUnits);
    CopilotAttachment picked(String name, [int size = 16]) => CopilotAttachment(id: 'a-$name', fileName: name, sizeBytes: size);

    void stubChat() {
      when(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
            documentIds: any(named: 'documentIds'),
          )).thenAnswer((_) async => fakeResponse());
    }

    List<dynamic> capturedDocumentIds() => verify(() => api.sendMessage(
          message: any(named: 'message'),
          conversationId: any(named: 'conversationId'),
          cancelToken: any(named: 'cancelToken'),
          pageContext: any(named: 'pageContext'),
          documentIds: captureAny(named: 'documentIds'),
        )).captured;

    test('envoi réussi : la puce passe de « envoi » à « prêt » avec le documentId du backend', () async {
      final completer = Completer<CopilotUploadedDocument>();
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress'))).thenAnswer((_) => completer.future);

      final future = controller.uploadAttachment(picked('rapport.pdf'), pdfBytes);
      await Future<void>.delayed(Duration.zero);
      expect(controller.attachments.single.isUploading, isTrue);

      completer.complete(const CopilotUploadedDocument(documentId: 'doc-1', filename: 'rapport.pdf'));
      expect(await future, isNull);
      expect(controller.attachments.single.isReady, isTrue);
      expect(controller.attachments.single.documentId, 'doc-1');
    });

    test('le message part avec les documentIds des puces prêtes, puis les puces sont vidées', () async {
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress')))
          .thenAnswer((_) async => const CopilotUploadedDocument(documentId: 'doc-1', filename: 'rapport.pdf'));
      stubChat();

      await controller.uploadAttachment(picked('rapport.pdf'), pdfBytes);
      await controller.send('Résume ce fichier.');

      expect(capturedDocumentIds().single, ['doc-1']);
      expect(controller.attachments, isEmpty);
    });

    test('sans document : documentIds null (contrat d\'appel inchangé)', () async {
      stubChat();
      await controller.send('Bonjour');
      expect(capturedDocumentIds().single, isNull);
    });

    test('format refusé localement : puce en erreur, AUCUN envoi au backend', () async {
      final error = await controller.uploadAttachment(picked('outil.exe'), pdfBytes);

      expect(error, contains('Format non pris en charge'));
      expect(controller.attachments.single.isError, isTrue);
      verifyNever(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress')));
    });

    test('fichier > 10 Mo refusé localement', () async {
      final error = await controller.uploadAttachment(picked('gros.pdf'), Uint8List(10 * 1024 * 1024 + 1));
      expect(error, contains('10 Mo'));
      verifyNever(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress')));
    });

    test('refus du backend : message exact sur la puce, et la puce en erreur ne part pas avec le message', () async {
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress')))
          .thenThrow(Exception("Le contenu du fichier ne correspond pas à l'extension .pdf."));
      stubChat();

      final error = await controller.uploadAttachment(picked('faux.pdf'), pdfBytes);
      expect(error, "Le contenu du fichier ne correspond pas à l'extension .pdf.");
      expect(controller.attachments.single.errorMessage, error);

      await controller.send('Résume ce fichier.');
      expect(capturedDocumentIds().single, isNull);
    });

    test('envoi du message bloqué tant qu\'un document est en cours d\'analyse', () async {
      final completer = Completer<CopilotUploadedDocument>();
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress'))).thenAnswer((_) => completer.future);
      stubChat();

      final upload = controller.uploadAttachment(picked('rapport.pdf'), pdfBytes);
      await Future<void>.delayed(Duration.zero);
      await controller.send('Résume ce fichier.');

      expect(controller.messages, isEmpty);
      completer.complete(const CopilotUploadedDocument(documentId: 'doc-1', filename: 'rapport.pdf'));
      await upload;
    });

    test('retirer une puce prête supprime le document côté serveur', () async {
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress')))
          .thenAnswer((_) async => const CopilotUploadedDocument(documentId: 'doc-1', filename: 'rapport.pdf'));
      when(() => api.deleteDocument(any())).thenAnswer((_) async {});

      await controller.uploadAttachment(picked('rapport.pdf'), pdfBytes);
      controller.removeAttachment('a-rapport.pdf');

      expect(controller.attachments, isEmpty);
      verify(() => api.deleteDocument('doc-1')).called(1);
    });

    test('puce retirée PENDANT l\'envoi : le document indexé entre-temps est supprimé (jamais orphelin)', () async {
      final completer = Completer<CopilotUploadedDocument>();
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress'))).thenAnswer((_) => completer.future);
      when(() => api.deleteDocument(any())).thenAnswer((_) async {});

      final upload = controller.uploadAttachment(picked('rapport.pdf'), pdfBytes);
      await Future<void>.delayed(Duration.zero);
      controller.removeAttachment('a-rapport.pdf');
      verifyNever(() => api.deleteDocument(any()));

      completer.complete(const CopilotUploadedDocument(documentId: 'doc-9', filename: 'rapport.pdf'));
      await upload;

      expect(controller.attachments, isEmpty);
      verify(() => api.deleteDocument('doc-9')).called(1);
    });

    test('au plus 5 documents par message', () async {
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress')))
          .thenAnswer((_) async => const CopilotUploadedDocument(documentId: 'd', filename: 'x.txt'));
      for (var i = 0; i < 5; i++) {
        expect(await controller.uploadAttachment(picked('n$i.txt'), pdfBytes), isNull);
      }
      expect(await controller.uploadAttachment(picked('n5.txt'), pdfBytes), contains('Cinq documents'));
      expect(controller.attachments, hasLength(5));
    });

    test('progression RÉELLE de l\'envoi (onSendProgress de Dio) reflétée sur la puce', () async {
      final completer = Completer<CopilotUploadedDocument>();
      void Function(int, int)? progress;
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress'))).thenAnswer((invocation) {
        progress = invocation.namedArguments[#onSendProgress] as void Function(int, int)?;
        return completer.future;
      });

      final upload = controller.uploadAttachment(picked('rapport.pdf'), pdfBytes);
      await Future<void>.delayed(Duration.zero);
      expect(controller.attachments.single.progress, isNull);

      progress!(40, 100);
      expect(controller.attachments.single.progress, closeTo(0.4, 0.001));
      progress!(41, 100); // < 2 % : pas de reconstruction inutile
      expect(controller.attachments.single.progress, closeTo(0.4, 0.001));
      progress!(100, 100);
      expect(controller.attachments.single.progress, 1.0);
      expect(controller.attachments.single.isUploading, isTrue); // transmis, encore en analyse

      completer.complete(const CopilotUploadedDocument(documentId: 'doc-1', filename: 'rapport.pdf'));
      await upload;
      expect(controller.attachments.single.isReady, isTrue);
    });
  });

  // Loading intelligent — la phase affichée pendant l'attente est déduite du
  // message envoyé (aucun événement de phase inventé côté backend).
  group('loadingPhase', () {
    final pdfBytes = Uint8List.fromList('%PDF-1.4 contenu'.codeUnits);

    void stubChat() {
      when(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
            documentIds: any(named: 'documentIds'),
          )).thenAnswer((_) async => fakeResponse());
    }

    test('question de données → Recherche dans le CRM ; action → Préparation de l\'action', () async {
      stubChat();
      await controller.send('Quels projets sont en retard ?');
      expect(controller.loadingPhase.value, CopilotLoadingPhase.crm);
      await controller.send('Trouve mes projets en cours et prépare une relance pour chacun');
      expect(controller.loadingPhase.value, CopilotLoadingPhase.action);
      await controller.send('confirme');
      expect(controller.loadingPhase.value, CopilotLoadingPhase.action);
    });

    test('document joint → Analyse du document, y compris pour les questions suivantes sur ce texte ; remis à zéro par une nouvelle conversation', () async {
      stubChat();
      when(() => api.uploadDocument(bytes: any(named: 'bytes'), fileName: any(named: 'fileName'), onSendProgress: any(named: 'onSendProgress')))
          .thenAnswer((_) async => const CopilotUploadedDocument(documentId: 'doc-1', filename: 'r.pdf'));

      await controller.uploadAttachment(const CopilotAttachment(id: 'a', fileName: 'r.pdf', sizeBytes: 16), pdfBytes);
      await controller.send('Quels sont les problèmes ?');
      expect(controller.loadingPhase.value, CopilotLoadingPhase.document);
      await controller.send('Résume les points clés');
      expect(controller.loadingPhase.value, CopilotLoadingPhase.document);

      controller.startNewConversation();
      await controller.send('Résume les points clés');
      expect(controller.loadingPhase.value, CopilotLoadingPhase.crm);
    });
  });
}
