// Interface « produit » du Copilot : tableaux, cartes KPI, loading
// intelligent, aperçu des fichiers, confirmation, bulles (réponse riche,
// erreur + Réessayer). Même mise en place que copilot_message_bubble_test.dart
// (CopilotController réel, API/socket mockés).
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:mocktail/mocktail.dart';

import 'package:dash_master_toolkit/ai/animations/copilot_typing_dots.dart';
import 'package:dash_master_toolkit/ai/models/copilot_attachment.dart';
import 'package:dash_master_toolkit/ai/models/copilot_message.dart';
import 'package:dash_master_toolkit/ai/models/copilot_response.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_api_service.dart';
import 'package:dash_master_toolkit/ai/services/copilot_socket_service.dart';
import 'package:dash_master_toolkit/ai/utils/copilot_content_parser.dart';
import 'package:dash_master_toolkit/ai/utils/copilot_loading_phase.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_context_controller.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_attachment_preview.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_empty_state.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_input_bar.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_kpi_cards.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_loading_indicator.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_message_bubble.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_pending_action_card.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_table_view.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

class MockCopilotApiService extends Mock implements CopilotApiService {}

class MockCopilotSocketService extends Mock implements CopilotSocketService {}

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

CopilotMessage _assistant(String text, {CopilotResponse? response, CopilotMessageStatus status = CopilotMessageStatus.complete}) =>
    CopilotMessage(id: 'a-${text.hashCode}', role: CopilotMessageRole.assistant, text: text, createdAt: DateTime(2026, 9, 30, 14, 32), status: status, response: response);

CopilotPendingAction _plan(int steps) => CopilotPendingAction(
      id: 'p1',
      type: 'task_plan',
      goal: 'Relance pour vos projets « En cours »',
      steps: List.generate(steps, (i) => CopilotPendingStep(tool: 'create_project_action', input: const {}, reason: 'Relance — Projet $i')),
    );

void main() {
  late MockCopilotApiService api;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    registerFallbackValue(CancelToken());
    final tempDir = Directory.systemTemp.createTempSync('copilot_product_ui_test');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => tempDir.path,
    );
    AuthService();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });

  setUp(() {
    Get.reset();
    api = MockCopilotApiService();
    final socket = MockCopilotSocketService();
    when(() => socket.isConnected).thenReturn(false);
    Get.put<CopilotController>(CopilotController(api: api, socket: socket), permanent: true);
  });

  tearDown(() => Get.reset());

  group('Table renderer', () {
    testWidgets('en-tête, cellules et résumé lignes/colonnes, défilement horizontal', (tester) async {
      await tester.pumpWidget(_wrap(const CopilotTableView(headers: ['Projet', 'Statut'], rows: [['Sfax Port', 'En cours'], ['Villa', 'Livraison']], isDark: false)));
      expect(find.text('Projet'), findsOneWidget);
      expect(find.text('Sfax Port'), findsOneWidget);
      expect(find.text('2 lignes · 2 colonnes'), findsOneWidget);
      expect(find.byWidgetPredicate((w) => w is SingleChildScrollView && w.scrollDirection == Axis.horizontal), findsOneWidget);
    });

    testWidgets('une réponse avec tableau markdown est rendue par CopilotTableView, le texte autour par MarkdownBody', (tester) async {
      await tester.pumpWidget(_wrap(CopilotMessageBubble(message: _assistant('Vos projets :\n\n| Projet | Statut |\n|---|---|\n| Sfax Port | En cours |\n\nFin.'), isLastAssistantMessage: true)));
      expect(find.byType(CopilotTableView), findsOneWidget);
      expect(find.byType(MarkdownBody), findsNWidgets(2));
      expect(find.textContaining('| Projet |'), findsNothing);
    });
  });

  group('Cartes KPI', () {
    testWidgets('affichées pour une réponse chiffrée, avec les valeurs de la réponse', (tester) async {
      await tester.pumpWidget(_wrap(CopilotMessageBubble(message: _assistant('📊 Projets en cours : 12\n✅ Taux de réussite : 72 %\nBonne journée.'))));
      expect(find.byType(CopilotKpiCards), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('72 %'), findsOneWidget);
    });

    testWidgets('aucune carte pour une réponse sans indicateurs (ex. fiche avec ID)', (tester) async {
      await tester.pumpWidget(_wrap(CopilotMessageBubble(message: _assistant('**ID :** 158\n**Statut :** Négociation'))));
      final cards = tester.widgetList<CopilotKpiCards>(find.byType(CopilotKpiCards));
      expect(cards.every((c) => c.kpis.isEmpty), isTrue);
    });

    testWidgets('widget seul : libellé, emoji et valeur', (tester) async {
      await tester.pumpWidget(_wrap(const CopilotKpiCards(kpis: [CopilotKpi(label: 'CA signé', value: '1 250 000 TND', emoji: '💰')], isDark: true)));
      expect(find.text('CA signé'), findsOneWidget);
      expect(find.text('1 250 000 TND'), findsOneWidget);
      expect(find.text('💰'), findsOneWidget);
    });
  });

  group('Loading intelligent', () {
    testWidgets('bulle en attente : phase courante du contrôleur + points animés', (tester) async {
      CopilotController.to.loadingPhase.value = CopilotLoadingPhase.document;
      await tester.pumpWidget(_wrap(CopilotMessageBubble(message: CopilotMessage.pendingAssistant())));
      expect(find.text('Analyse du document…'), findsOneWidget);
      expect(find.byType(CopilotTypingDots), findsOneWidget);

      CopilotController.to.loadingPhase.value = CopilotLoadingPhase.action;
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text("Préparation de l'action…"), findsOneWidget);
    });

    testWidgets('au-delà du délai : message honnête « cela prend plus de temps »', (tester) async {
      await tester.pumpWidget(_wrap(const CopilotLoadingIndicator(phase: CopilotLoadingPhase.crm, isDark: false, slowAfter: Duration(seconds: 1))));
      expect(find.text('Recherche dans le CRM…'), findsOneWidget);
      expect(find.textContaining('plus de temps'), findsNothing);
      await tester.pump(const Duration(seconds: 2));
      expect(find.textContaining('plus de temps'), findsOneWidget);
    });
  });

  group('Aperçu des fichiers', () {
    Future<void> pumpPreview(WidgetTester tester, CopilotAttachment a, {VoidCallback? onRemove}) =>
        tester.pumpWidget(_wrap(CopilotAttachmentPreview(attachment: a, isDark: false, onRemove: onRemove ?? () {})));

    testWidgets('envoi : pourcentage réel et barre déterminée', (tester) async {
      await pumpPreview(tester, const CopilotAttachment(id: '1', fileName: 'rapport.pdf', sizeBytes: 2048, progress: 0.42));
      expect(find.text('PDF'), findsOneWidget);
      expect(find.textContaining('envoi 42 %'), findsOneWidget);
      expect(tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value, closeTo(0.42, 0.001));
    });

    testWidgets('fichier transmis, analyse serveur en cours : barre indéterminée', (tester) async {
      await pumpPreview(tester, const CopilotAttachment(id: '1', fileName: 'data.xlsx', sizeBytes: 2048, progress: 1));
      expect(find.text('Analyse du document…'), findsOneWidget);
      expect(tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value, isNull);
    });

    testWidgets('prêt : pas de barre ; erreur : message exact ; ✕ retire le fichier', (tester) async {
      await pumpPreview(tester, const CopilotAttachment(id: '1', fileName: 'cr.docx', sizeBytes: 500).asReady('doc-1'));
      expect(find.byType(LinearProgressIndicator), findsNothing);
      expect(find.textContaining('prêt à être analysé'), findsOneWidget);

      var removed = false;
      await pumpPreview(tester, const CopilotAttachment(id: '2', fileName: 'outil.exe', sizeBytes: 5).asError('Format non pris en charge.'), onRemove: () => removed = true);
      expect(find.text('Format non pris en charge.'), findsOneWidget);
      await tester.tap(find.byTooltip('Retirer le fichier'));
      expect(removed, isTrue);
    });
  });

  group('Confirmation UI', () {
    testWidgets('objectif, nombre d\'actions, rappel « rien n\'est exécuté », liste repliable', (tester) async {
      await tester.pumpWidget(_wrap(CopilotPendingActionCard(pendingAction: _plan(8))));
      expect(find.text('Confirmation requise'), findsOneWidget);
      expect(find.text('8 actions'), findsOneWidget);
      expect(find.text('Relance pour vos projets « En cours »'), findsOneWidget);
      expect(find.text("Aucune action n'a encore été exécutée."), findsOneWidget);
      expect(find.text('Relance — Projet 7'), findsNothing);
      await tester.tap(find.text('Voir les 3 autres actions'));
      await tester.pump();
      expect(find.text('Relance — Projet 7'), findsOneWidget);
    });

    testWidgets('« Confirmer et exécuter » envoie « confirme » une seule fois, puis les boutons disparaissent', (tester) async {
      when(() => api.sendMessage(
            message: any(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
            documentIds: any(named: 'documentIds'),
          )).thenAnswer((_) async => CopilotResponse.fromJson(const {'mode': 'agent', 'answer': 'ok'}));
      await tester.pumpWidget(_wrap(CopilotPendingActionCard(pendingAction: _plan(2))));

      await tester.tap(find.text('Confirmer et exécuter'));
      await tester.pump();
      expect(find.text('Confirmer et exécuter'), findsNothing);
      expect(find.textContaining('Confirmation envoyée'), findsOneWidget);
      final sent = verify(() => api.sendMessage(
            message: captureAny(named: 'message'),
            conversationId: any(named: 'conversationId'),
            cancelToken: any(named: 'cancelToken'),
            pageContext: any(named: 'pageContext'),
            documentIds: any(named: 'documentIds'),
          )).captured;
      expect(sent, ['confirme']);
    });

    testWidgets('proposition d\'un message antérieur : aucun bouton', (tester) async {
      await tester.pumpWidget(_wrap(CopilotPendingActionCard(pendingAction: _plan(1), isActive: false)));
      expect(find.text('Confirmer et exécuter'), findsNothing);
      expect(find.textContaining('Proposition antérieure'), findsOneWidget);
    });
  });

  group('Gestion des erreurs', () {
    testWidgets('dernière réponse en erreur : carte explicite et bouton « Réessayer »', (tester) async {
      final message = CopilotMessage.errorPlaceholder('Une erreur est survenue. Réessayez.');
      await tester.pumpWidget(_wrap(CopilotMessageBubble(message: message, isLastAssistantMessage: true)));
      expect(find.text('Réponse indisponible'), findsOneWidget);
      expect(find.text('Réessayer'), findsOneWidget);
    });

    testWidgets('erreur plus ancienne : pas de bouton « Réessayer »', (tester) async {
      await tester.pumpWidget(_wrap(CopilotMessageBubble(message: CopilotMessage.errorPlaceholder('Erreur.'))));
      expect(find.text('Réessayer'), findsNothing);
    });
  });

  testWidgets('en-tête de message assistant : « Copilot IA » et heure', (tester) async {
    await tester.pumpWidget(_wrap(CopilotMessageBubble(message: _assistant('Bonjour'))));
    expect(find.text('Copilot IA'), findsOneWidget);
    expect(find.text('  ·  14:32'), findsOneWidget);
  });

  // Largeur mobile (bottom sheet) : aucun débordement sur les nouveaux écrans.
  group('Largeur mobile (340 px)', () {
    Future<void> pumpNarrow(WidgetTester tester, Widget child) async {
      tester.view.physicalSize = const Size(340, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
      await tester.pump(const Duration(milliseconds: 400));
    }

    testWidgets('écran d''accueil avec suggestions', (tester) async {
      await pumpNarrow(tester, CopilotEmptyState(context: CopilotContextController()));
      expect(tester.takeException(), isNull);
    });

    testWidgets('barre de saisie avec deux aperçus de fichiers', (tester) async {
      CopilotController.to.attachments.addAll([
        const CopilotAttachment(id: '1', fileName: 'un_nom_de_fichier_particulierement_long_pour_le_test.pdf', sizeBytes: 4096, progress: 0.3),
        const CopilotAttachment(id: '2', fileName: 'donnees.csv', sizeBytes: 100).asError('Le contenu du fichier ne correspond pas à l''extension .csv.'),
      ]);
      await pumpNarrow(tester, const Align(alignment: Alignment.bottomCenter, child: CopilotInputBar()));
      expect(tester.takeException(), isNull);
    });

    testWidgets('réponse riche : KPI + tableau large + confirmation', (tester) async {
      const text = '📊 Projets en cours : 12\n💰 Montant total : 1 250 000 TND\n\n'
          '| Projet | Client | Statut | Montant | Dernière relance |\n|---|---|---|---|---|\n'
          '| Sfax Port | STE Delta | En cours | 450 000 TND | 12/07/2026 |';
      final response = CopilotResponse.fromJson({'mode': 'agent', 'answer': text, 'pendingAction': {'id': 'p', 'goal': 'Relance', 'steps': [{'tool': 'create_project_action', 'input': {}, 'reason': 'Relance — Sfax Port (le 01/10/2026)'}]}});
      await pumpNarrow(tester, SingleChildScrollView(child: CopilotMessageBubble(message: _assistant(text, response: response), isLastAssistantMessage: true)));
      expect(tester.takeException(), isNull);
    });
  });
}
