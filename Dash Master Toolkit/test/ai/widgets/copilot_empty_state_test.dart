import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_page_context.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_context_controller.dart';
import 'package:dash_master_toolkit/ai/services/copilot_suggestion_engine.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_empty_state.dart';

void main() {
  testWidgets('sans contexte actif : titre + les 8 suggestions de prompts, sans section « Pour cet écran »', (tester) async {
    final context = CopilotContextController();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Comment puis-je vous aider ?'), findsOneWidget);
    for (final label in ['Combien de projets sont enregistrés dans le CRM ?', 'Quels projets nécessitent une relance ?', "Résume l'activité commerciale sur la période disponible.", 'Quels dossiers nécessitent une attention particulière ?', 'Affiche les actions en retard.', 'Analyse le pipeline commercial.', 'Analyse un document', 'Que peux-tu faire ?']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.text('POUR CET ÉCRAN'), findsNothing);
    expect(find.byType(InkWell), findsWidgets);
  });

  testWidgets('une suggestion envoie la question formulée pour le bon Agent ; « Analyse un document » ouvre le sélecteur', (tester) async {
    final context = CopilotContextController();
    final triggered = <CopilotQuickPrompt>[];
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context, onQuickPrompt: triggered.add))));

    await tester.tap(find.text('Que peux-tu faire ?'));
    await tester.tap(find.text('Analyse un document'));
    await tester.tap(find.text('Quels projets nécessitent une relance ?'));

    expect(triggered.map((p) => p.message), ['Quelles sont mes capacités dans le Copilot ?', 'Résume ce document.', "Quels projets n'ont pas été relancés depuis 30 jours ?"]);
    expect(triggered.map((p) => p.action), [CopilotQuickPromptAction.send, CopilotQuickPromptAction.attachDocument, CopilotQuickPromptAction.send]);
  });

  testWidgets('Smart Suggestions : contexte dashboard actif → statuts/critiques/contacts', (tester) async {
    final context = CopilotContextController();
    context.setContext(CopilotPageContext.dashboard(totalProjects: 10));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Combien de projets par statut ?'), findsOneWidget);
    expect(find.text('Quels projets sont critiques ?'), findsOneWidget);
    expect(find.text('Analyse mes contacts commerciaux.'), findsOneWidget);
    expect(find.text('Quels projets sont en retard ?'), findsNothing);
  });

  testWidgets('Smart Suggestions : contexte projet actif → analyse/retards/sans relance', (tester) async {
    final context = CopilotContextController();
    context.setContext(CopilotPageContext.project(name: 'Villa Sfax'));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Analyse mes projets.'), findsOneWidget);
    expect(find.text('Quels projets sont en retard ?'), findsOneWidget);
    expect(find.text("Quels projets n'ont pas été relancés depuis 30 jours ?"), findsOneWidget);
  });

  testWidgets('Smart Suggestions : contexte client (commercial) actif → contacts/relances', (tester) async {
    final context = CopilotContextController();
    context.setContext(CopilotPageContext.client(name: 'Société ABC'));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Analyse mes contacts commerciaux.'), findsOneWidget);
    expect(find.text('Relance les clients.'), findsOneWidget);
    expect(find.text('Quels clients dois-je relancer cette semaine ?'), findsOneWidget);
  });

  testWidgets('Smart Suggestions : contexte industriel actif → fiche/conformité/diamètres', (tester) async {
    final context = CopilotContextController();
    context.setContext(CopilotPageContext.industrial(family: 'PROBAR'));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Résume la fiche.'), findsOneWidget);
    expect(find.text('Vérifie la conformité.'), findsOneWidget);
    expect(find.text('Analyse les diamètres.'), findsOneWidget);
  });

  testWidgets('les suggestions se mettent à jour dès que le contexte change, sans reconstruire le widget', (tester) async {
    final context = CopilotContextController();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));
    expect(find.text('Combien de projets par statut ?'), findsNothing);

    context.setContext(CopilotPageContext.dashboard(totalProjects: 5));
    await tester.pump();

    expect(find.text('Combien de projets par statut ?'), findsOneWidget);
    expect(find.text('Quels projets sont en retard ?'), findsNothing);
  });
}
