// Teste CopilotApiService contre un Dio MOCKÉ (mocktail) — jamais un vrai
// appel réseau. Utilise le seam de test CopilotApiService.withDio(dio),
// voir lib/ai/services/copilot_api_service.dart.
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';

class MockDio extends Mock implements Dio {}

RequestOptions _reqOptions(String path) => RequestOptions(path: path);

void main() {
  late MockDio dio;
  late CopilotApiService api;

  setUp(() {
    dio = MockDio();
    api = CopilotApiService.withDio(dio);
  });

  group('sendMessage', () {
    test('posts {message, conversationId} and parses the envelope', () async {
      when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenAnswer(
        (_) async => Response(
          requestOptions: _reqOptions('/ai-copilot/chat'),
          statusCode: 200,
          data: {
            'success': true,
            'data': {'conversationId': 'c1', 'mode': 'agent', 'answer': 'Bonjour !'},
          },
        ),
      );

      final response = await api.sendMessage(message: 'Salut', conversationId: 'c1');

      expect(response.conversationId, 'c1');
      expect(response.answer, 'Bonjour !');
      final captured = verify(() => dio.post('/ai-copilot/chat', data: captureAny(named: 'data'))).captured.single as Map;
      expect(captured['message'], 'Salut');
      expect(captured['conversationId'], 'c1');
    });

    test('Context Awareness: includes pageContext in the body when provided', () async {
      when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/chat'), statusCode: 200, data: {'data': {'mode': 'agent'}}),
      );

      await api.sendMessage(message: 'Quel est le statut ?', pageContext: {
        'screen': 'project',
        'label': 'Villa Sfax',
        'data': {'statut': 'en_cours'},
      });

      final captured = verify(() => dio.post('/ai-copilot/chat', data: captureAny(named: 'data'))).captured.single as Map;
      expect(captured['pageContext'], {
        'screen': 'project',
        'label': 'Villa Sfax',
        'data': {'statut': 'en_cours'},
      });
    });

    test('omits pageContext from the body when not provided', () async {
      when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/chat'), statusCode: 200, data: {'data': {'mode': 'agent'}}),
      );

      await api.sendMessage(message: 'Bonjour');

      final captured = verify(() => dio.post('/ai-copilot/chat', data: captureAny(named: 'data'))).captured.single as Map;
      expect(captured.containsKey('pageContext'), isFalse);
    });

    test('omits conversationId from the body when null', () async {
      when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/chat'), statusCode: 200, data: {'data': {'mode': 'agent'}}),
      );

      await api.sendMessage(message: 'Salut', conversationId: null);

      final captured = verify(() => dio.post('/ai-copilot/chat', data: captureAny(named: 'data'))).captured.single as Map;
      expect(captured.containsKey('conversationId'), isFalse);
    });

    test('a 503 response is translated to CopilotNotConfiguredException', () async {
      when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenThrow(
        DioException(
          requestOptions: _reqOptions('/ai-copilot/chat'),
          response: Response(
            requestOptions: _reqOptions('/ai-copilot/chat'),
            statusCode: 503,
            data: {'success': false, 'message': "Le Copilot IA n'est pas encore configuré."},
          ),
        ),
      );

      expect(() => api.sendMessage(message: 'Salut'), throwsA(isA<CopilotNotConfiguredException>()));
    });

    test('a 403 response is translated to CopilotForbiddenException', () async {
      when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenThrow(
        DioException(
          requestOptions: _reqOptions('/ai-copilot/chat'),
          response: Response(requestOptions: _reqOptions('/ai-copilot/chat'), statusCode: 403, data: {'message': 'Interdit'}),
        ),
      );

      expect(() => api.sendMessage(message: 'Salut'), throwsA(isA<CopilotForbiddenException>()));
    });

    test('any other failure becomes a generic Exception, not a specific typed one', () async {
      when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenThrow(
        DioException(requestOptions: _reqOptions('/ai-copilot/chat'), response: Response(requestOptions: _reqOptions('/ai-copilot/chat'), statusCode: 500)),
      );

      await expectLater(
        api.sendMessage(message: 'Salut'),
        throwsA(allOf(isA<Exception>(), isNot(isA<CopilotNotConfiguredException>()), isNot(isA<CopilotForbiddenException>()))),
      );
    });
  });

  group('getDashboardBriefing — AI Dashboard', () {
    test('parses the {success, data} envelope into a CopilotDashboardBriefing', () async {
      when(() => dio.get('/ai-copilot/dashboard')).thenAnswer(
        (_) async => Response(
          requestOptions: _reqOptions('/ai-copilot/dashboard'),
          statusCode: 200,
          data: {
            'success': true,
            'data': {
              'greeting': {'firstName': 'Khalil', 'fullName': 'Khalil Ben Ali'},
              'today': {'criticalProjects': 5, 'expiringQuotes': 3, 'urgentInterventions': 2, 'clientsToFollowUp': 4},
              'crmQuality': {'score': 96},
              'riskCards': [],
              'recommendationCards': [],
              'timeline': [],
              'chart': {'labels': [], 'values': []},
            },
          },
        ),
      );

      final briefing = await api.getDashboardBriefing();

      expect(briefing.greeting.firstName, 'Khalil');
      expect(briefing.today.criticalProjects, 5);
      expect(briefing.crmQuality.score, 96);
    });

    test('a 503 response is translated to CopilotNotConfiguredException', () async {
      when(() => dio.get('/ai-copilot/dashboard')).thenThrow(
        DioException(
          requestOptions: _reqOptions('/ai-copilot/dashboard'),
          response: Response(requestOptions: _reqOptions('/ai-copilot/dashboard'), statusCode: 503, data: {'message': 'Le Copilot IA est désactivé.'}),
        ),
      );

      expect(() => api.getDashboardBriefing(), throwsA(isA<CopilotNotConfiguredException>()));
    });

    test('a 403 response is translated to CopilotForbiddenException', () async {
      when(() => dio.get('/ai-copilot/dashboard')).thenThrow(
        DioException(
          requestOptions: _reqOptions('/ai-copilot/dashboard'),
          response: Response(requestOptions: _reqOptions('/ai-copilot/dashboard'), statusCode: 403, data: {'message': 'Interdit'}),
        ),
      );

      expect(() => api.getDashboardBriefing(), throwsA(isA<CopilotForbiddenException>()));
    });
  });

  group('confirmProactiveWorkflow/rejectProactiveWorkflow — Proactive AI', () {
    test('confirmProactiveWorkflow posts to /ai-copilot/proactive/:id/confirm', () async {
      when(() => dio.post('/ai-copilot/proactive/w1/confirm')).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/proactive/w1/confirm'), statusCode: 200, data: {'success': true, 'data': {}}),
      );
      await api.confirmProactiveWorkflow('w1');
      verify(() => dio.post('/ai-copilot/proactive/w1/confirm')).called(1);
    });

    test('confirmProactiveWorkflow translates a 404 (unknown/expired/not-mine) to a generic Exception', () async {
      when(() => dio.post('/ai-copilot/proactive/w1/confirm')).thenThrow(
        DioException(
          requestOptions: _reqOptions('/ai-copilot/proactive/w1/confirm'),
          response: Response(requestOptions: _reqOptions('/ai-copilot/proactive/w1/confirm'), statusCode: 404, data: {'message': "Ce workflow n'existe plus."}),
        ),
      );
      expect(() => api.confirmProactiveWorkflow('w1'), throwsA(isA<Exception>()));
    });

    test('rejectProactiveWorkflow posts to /ai-copilot/proactive/:id/reject', () async {
      when(() => dio.post('/ai-copilot/proactive/w1/reject')).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/proactive/w1/reject'), statusCode: 200, data: {'success': true}),
      );
      await api.rejectProactiveWorkflow('w1');
      verify(() => dio.post('/ai-copilot/proactive/w1/reject')).called(1);
    });
  });

  group('listConversations', () {
    test('parses the {success, data: [...]} envelope into ConversationSummary list', () async {
      when(() => dio.get('/ai-copilot/conversations', queryParameters: any(named: 'queryParameters'))).thenAnswer(
        (_) async => Response(
          requestOptions: _reqOptions('/ai-copilot/conversations'),
          statusCode: 200,
          data: {
            'success': true,
            'data': [
              {'conversationId': 'c1', 'updatedAt': '2026-01-01T10:00:00.000Z', 'preview': 'x', 'intent': 'projects'},
            ],
          },
        ),
      );

      final list = await api.listConversations();

      expect(list, hasLength(1));
      expect(list.first.conversationId, 'c1');
    });

    test('forwards a provided limit as a query parameter', () async {
      when(() => dio.get('/ai-copilot/conversations', queryParameters: any(named: 'queryParameters'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/conversations'), statusCode: 200, data: {'data': []}),
      );

      await api.listConversations(limit: 5);

      verify(() => dio.get('/ai-copilot/conversations', queryParameters: {'limit': 5})).called(1);
    });

    test('a non-list "data" field resolves to an empty list rather than throwing', () async {
      when(() => dio.get('/ai-copilot/conversations', queryParameters: any(named: 'queryParameters'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/conversations'), statusCode: 200, data: {'data': 'not-a-list'}),
      );

      expect(await api.listConversations(), isEmpty);
    });
  });

  group('fetchReportPdfBytes — export PDF d\'un rapport', () {
    test('posts {content, title} and returns the raw bytes as ResponseType.bytes', () async {
      final fakePdf = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
      when(() => dio.post<List<int>>('/ai-copilot/reports/pdf', data: any(named: 'data'), options: any(named: 'options'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/reports/pdf'), statusCode: 200, data: fakePdf),
      );

      final bytes = await api.fetchReportPdfBytes(content: 'Synthèse du rapport.', title: 'Rapport KPI');

      expect(bytes, fakePdf);
      final captured = verify(() => dio.post<List<int>>('/ai-copilot/reports/pdf', data: captureAny(named: 'data'), options: any(named: 'options'))).captured.single as Map;
      expect(captured['content'], 'Synthèse du rapport.');
      expect(captured['title'], 'Rapport KPI');
    });

    test('omits title from the body when not provided', () async {
      when(() => dio.post<List<int>>('/ai-copilot/reports/pdf', data: any(named: 'data'), options: any(named: 'options'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/reports/pdf'), statusCode: 200, data: <int>[]),
      );

      await api.fetchReportPdfBytes(content: 'Contenu.');

      final captured = verify(() => dio.post<List<int>>('/ai-copilot/reports/pdf', data: captureAny(named: 'data'), options: any(named: 'options'))).captured.single as Map;
      expect(captured.containsKey('title'), isFalse);
    });

    test('a null response body resolves to an empty byte array rather than throwing', () async {
      when(() => dio.post<List<int>>('/ai-copilot/reports/pdf', data: any(named: 'data'), options: any(named: 'options'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/reports/pdf'), statusCode: 200, data: null),
      );

      expect(await api.fetchReportPdfBytes(content: 'x'), isEmpty);
    });

    test('a 400 (missing content) surfaces as a generic Exception', () async {
      when(() => dio.post<List<int>>('/ai-copilot/reports/pdf', data: any(named: 'data'), options: any(named: 'options'))).thenThrow(
        DioException(
          requestOptions: _reqOptions('/ai-copilot/reports/pdf'),
          response: Response(requestOptions: _reqOptions('/ai-copilot/reports/pdf'), statusCode: 400, data: {'message': "'content' is required"}),
        ),
      );

      expect(() => api.fetchReportPdfBytes(content: ''), throwsA(isA<Exception>()));
    });
  });

  group('getConversationHistory', () {
    test('returns the raw message list for an owned conversation', () async {
      when(() => dio.get('/ai-copilot/conversations/c1')).thenAnswer(
        (_) async => Response(
          requestOptions: _reqOptions('/ai-copilot/conversations/c1'),
          statusCode: 200,
          data: {
            'success': true,
            'data': {
              'conversationId': 'c1',
              'messages': [
                {'role': 'user', 'content': 'Bonjour'},
              ],
            },
          },
        ),
      );

      final history = await api.getConversationHistory('c1');

      expect(history, hasLength(1));
      expect(history.first['role'], 'user');
    });

    test('a 404 (conversation not owned) surfaces as a generic Exception with the backend message', () async {
      when(() => dio.get('/ai-copilot/conversations/not-mine')).thenThrow(
        DioException(
          requestOptions: _reqOptions('/ai-copilot/conversations/not-mine'),
          response: Response(requestOptions: _reqOptions('/ai-copilot/conversations/not-mine'), statusCode: 404, data: {'message': 'Conversation not found.'}),
        ),
      );

      await expectLater(
        api.getConversationHistory('not-mine'),
        throwsA(predicate((e) => e is Exception && e.toString().contains('Conversation not found.'))),
      );
    });
  });

  // Phase 2 — documents joints au Copilot.
  group('documents — POST/DELETE /ai-copilot/documents et documentIds', () {
    test('sendMessage : documentIds présents dans le corps quand fournis, absents sinon (contrat inchangé)', () async {
      when(() => dio.post('/ai-copilot/chat', data: any(named: 'data'))).thenAnswer(
        (_) async => Response(requestOptions: _reqOptions('/ai-copilot/chat'), statusCode: 200, data: {'data': {'mode': 'agent'}}),
      );

      await api.sendMessage(message: 'Résume ce fichier.', documentIds: ['d1', 'd2']);
      await api.sendMessage(message: 'Bonjour', documentIds: const []);

      final calls = verify(() => dio.post('/ai-copilot/chat', data: captureAny(named: 'data'))).captured;
      expect((calls[0] as Map)['documentIds'], ['d1', 'd2']);
      expect((calls[1] as Map).containsKey('documentIds'), isFalse);
    });

    test('uploadDocument : multipart champ « file » avec le nom du fichier ; renvoie les métadonnées', () async {
      when(() => dio.post('/ai-copilot/documents', data: any(named: 'data'))).thenAnswer(
        (_) async => Response(
          requestOptions: _reqOptions('/ai-copilot/documents'),
          statusCode: 201,
          data: {
            'success': true,
            'data': {'documentId': 'doc-1', 'filename': 'rapport.pdf', 'sourceType': 'pdf', 'pageCount': 3, 'chunkCount': 7},
          },
        ),
      );

      final uploaded = await api.uploadDocument(bytes: Uint8List.fromList([1, 2, 3]), fileName: 'rapport.pdf');

      expect(uploaded.documentId, 'doc-1');
      expect(uploaded.pageCount, 3);
      expect(uploaded.chunkCount, 7);
      final form = verify(() => dio.post('/ai-copilot/documents', data: captureAny(named: 'data'))).captured.single as FormData;
      expect(form.files, hasLength(1));
      expect(form.files.single.key, 'file');
      expect(form.files.single.value.filename, 'rapport.pdf');
      expect(form.files.single.value.length, 3);
    });

    test('uploadDocument : un refus du backend (400/413) remonte avec son message', () async {
      when(() => dio.post('/ai-copilot/documents', data: any(named: 'data'))).thenThrow(
        DioException(
          requestOptions: _reqOptions('/ai-copilot/documents'),
          response: Response(
            requestOptions: _reqOptions('/ai-copilot/documents'),
            statusCode: 413,
            data: {'success': false, 'reason': 'DOCUMENT_TOO_LARGE', 'message': 'Fichier trop volumineux (10 Mo maximum).'},
          ),
        ),
      );

      await expectLater(
        api.uploadDocument(bytes: Uint8List(1), fileName: 'gros.pdf'),
        throwsA(predicate((e) => e is Exception && e.toString().contains('10 Mo maximum'))),
      );
    });

    test('deleteDocument : DELETE avec identifiant encodé (jamais de chemin arbitraire)', () async {
      when(() => dio.delete(any())).thenAnswer((_) async => Response(requestOptions: _reqOptions('/'), statusCode: 200, data: {'success': true}));

      await api.deleteDocument('../x y');

      verify(() => dio.delete('/ai-copilot/documents/..%2Fx%20y')).called(1);
    });
  });
}
