import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/utils/copilot_content_parser.dart';
import 'package:dash_master_toolkit/ai/utils/copilot_loading_phase.dart';

void main() {
  group('splitCopilotContent', () {
    test('un texte sans tableau reste un seul segment markdown (rendu inchangé)', () {
      final segments = splitCopilotContent('**Bonjour**\n- un\n- deux');
      expect(segments, hasLength(1));
      expect((segments.single as CopilotMarkdownSegment).markdown, '**Bonjour**\n- un\n- deux');
    });

    test('un tableau GFM devient un segment tableau, entouré du texte', () {
      const text = 'Voici vos projets :\n\n| Projet | Statut |\n|---|:---:|\n| **Sfax Port** | En cours |\n| Villa | Livraison |\n\nFin.';
      final segments = splitCopilotContent(text);
      expect(segments.map((s) => s.runtimeType.toString()), ['CopilotMarkdownSegment', 'CopilotTableSegment', 'CopilotMarkdownSegment']);
      final table = segments[1] as CopilotTableSegment;
      expect(table.headers, ['Projet', 'Statut']);
      expect(table.rows, [
        ['Sfax Port', 'En cours'],
        ['Villa', 'Livraison'],
      ]);
    });

    test('lignes irrégulières normalisées sur l\'en-tête ; pipe échappé conservé', () {
      final table = splitCopilotContent('a | b | c\n--- | --- | ---\n1 | x\\|y\n1|2|3|4').single as CopilotTableSegment;
      expect(table.rows, [
        ['1', 'x|y', ''],
        ['1', '2', '3'],
      ]);
    });

    test('un tableau dans un bloc de code n\'est pas interprété', () {
      final segments = splitCopilotContent('```\n| a | b |\n|---|---|\n```');
      expect(segments.single, isA<CopilotMarkdownSegment>());
    });
  });

  group('extractCopilotKpis — uniquement les chiffres présents dans la réponse', () {
    test('lignes « libellé : nombre » (emoji, gras, puces, unités)', () {
      const text = '📊 **Projets en cours** : 12\n- Taux de réussite : 72 %\n• CA signé : 1 250 000 TND\nStatut : En cours\nDernière relance : 12/07/2026';
      final kpis = extractCopilotKpis(text);
      expect(kpis.map((k) => k.label), ['Projets en cours', 'Taux de réussite', 'CA signé']);
      expect(kpis.map((k) => k.value), ['12', '72 %', '1 250 000 TND']);
      expect(kpis.first.emoji, '📊');
    });

    test('moins de deux indicateurs : aucune carte (jamais une carte isolée)', () {
      expect(extractCopilotKpis('Vous avez 3 projets.\nTotal : 3'), isEmpty);
    });

    test('ignore les tableaux et le code ; plafonne le nombre de cartes', () {
      final text = List.generate(10, (i) => 'Indicateur $i : $i').join('\n');
      expect(extractCopilotKpis(text), hasLength(6));
      expect(extractCopilotKpis('```\nA : 1\nB : 2\n```'), isEmpty);
    });
  });

  group('inferCopilotLoadingPhase', () {
    test('document joint ou cité → Analyse du document…', () {
      expect(inferCopilotLoadingPhase('Résume ce fichier.'), CopilotLoadingPhase.document);
      expect(inferCopilotLoadingPhase('Quels problèmes ?', hasDocuments: true), CopilotLoadingPhase.document);
      expect(CopilotLoadingPhase.document.label, 'Analyse du document…');
    });

    test('action ou confirmation → Préparation de l\'action…', () {
      expect(inferCopilotLoadingPhase('Trouve mes projets en cours et prépare une relance pour chacun'), CopilotLoadingPhase.action);
      expect(inferCopilotLoadingPhase('confirme'), CopilotLoadingPhase.action);
      expect(inferCopilotLoadingPhase('Oui, annule.'), CopilotLoadingPhase.action);
      expect(CopilotLoadingPhase.action.label, "Préparation de l'action…");
    });

    test('question de données → Recherche dans le CRM…', () {
      expect(inferCopilotLoadingPhase('Quels projets sont en retard ?'), CopilotLoadingPhase.crm);
      expect(CopilotLoadingPhase.crm.label, 'Recherche dans le CRM…');
    });
  });
}
