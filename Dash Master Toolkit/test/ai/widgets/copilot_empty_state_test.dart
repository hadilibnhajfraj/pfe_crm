import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_page_context.dart';
import 'package:dash_master_toolkit/ai/providers/copilot_context_controller.dart';
import 'package:dash_master_toolkit/ai/widgets/copilot_empty_state.dart';

void main() {
  testWidgets('sans contexte actif, affiche le titre et les suggestions génériques par défaut', (tester) async {
    final context = CopilotContextController();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Comment puis-je vous aider ?'), findsOneWidget);
    expect(find.text('Quels projets sont en retard ?'), findsOneWidget);
    expect(find.text('Conseille-moi sur mes priorités du jour'), findsOneWidget);
    expect(find.byType(InkWell), findsWidgets);
  });

  testWidgets('Smart Suggestions : contexte dashboard actif → questions KPI/critiques/ventes', (tester) async {
    final context = CopilotContextController();
    context.setContext(CopilotPageContext.dashboard(totalProjects: 10));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Quels sont mes KPI ?'), findsOneWidget);
    expect(find.text('Quels projets sont critiques ?'), findsOneWidget);
    expect(find.text('Montre les ventes.'), findsOneWidget);
    expect(find.text('Quels projets sont en retard ?'), findsNothing);
  });

  testWidgets('Smart Suggestions : contexte projet actif → résumé/risques/activité/rapport', (tester) async {
    final context = CopilotContextController();
    context.setContext(CopilotPageContext.project(name: 'Villa Sfax'));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Résume le projet.'), findsOneWidget);
    expect(find.text('Analyse les risques.'), findsOneWidget);
    expect(find.text('Créer une activité.'), findsOneWidget);
    expect(find.text('Créer un rapport.'), findsOneWidget);
  });

  testWidgets('Smart Suggestions : contexte client (commercial) actif → devis/relance/opportunité', (tester) async {
    final context = CopilotContextController();
    context.setContext(CopilotPageContext.client(name: 'Société ABC'));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CopilotEmptyState(context: context))));

    expect(find.text('Montre les devis.'), findsOneWidget);
    expect(find.text('Relance les clients.'), findsOneWidget);
    expect(find.text('Créer une opportunité.'), findsOneWidget);
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
    expect(find.text('Quels sont mes KPI ?'), findsNothing);

    context.setContext(CopilotPageContext.dashboard(totalProjects: 5));
    await tester.pump();

    expect(find.text('Quels sont mes KPI ?'), findsOneWidget);
    expect(find.text('Quels projets sont en retard ?'), findsNothing);
  });
}
