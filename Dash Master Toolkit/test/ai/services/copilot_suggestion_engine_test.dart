import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_page_context.dart';
import 'package:dash_master_toolkit/ai/services/copilot_suggestion_engine.dart';

void main() {
  group('starterSuggestionsFor — Smart Suggestions', () {
    test('dashboard : KPI / projets critiques / ventes', () {
      expect(starterSuggestionsFor(CopilotScreenType.dashboard), [
        'Quels sont mes KPI ?',
        'Quels projets sont critiques ?',
        'Montre les ventes.',
      ]);
    });

    test('project : résumé / risques / activité / rapport', () {
      expect(starterSuggestionsFor(CopilotScreenType.project), [
        'Résume le projet.',
        'Analyse les risques.',
        'Créer une activité.',
        'Créer un rapport.',
      ]);
    });

    test('client (commercial) : devis / relance / opportunité', () {
      expect(starterSuggestionsFor(CopilotScreenType.client), [
        'Montre les devis.',
        'Relance les clients.',
        'Créer une opportunité.',
      ]);
    });

    test('industrial : résumé fiche / conformité / diamètres', () {
      expect(starterSuggestionsFor(CopilotScreenType.industrial), [
        'Résume la fiche.',
        'Vérifie la conformité.',
        'Analyse les diamètres.',
      ]);
    });

    test('aucun contexte actif (null) retombe sur les suggestions génériques par défaut', () {
      expect(starterSuggestionsFor(null), kDefaultCopilotSuggestions);
    });

    test('chaque écran a une liste de suggestions distincte (pas de copier-coller entre écrans)', () {
      final all = CopilotScreenType.values.map(starterSuggestionsFor).toList();
      final unique = all.toSet();
      expect(unique.length, all.length);
    });

    test('aucune suggestion n\'est vide et chacune se termine par une ponctuation de phrase', () {
      for (final screenType in CopilotScreenType.values) {
        for (final prompt in starterSuggestionsFor(screenType)) {
          expect(prompt.trim(), isNotEmpty);
          expect(RegExp(r'[.?!]$').hasMatch(prompt), isTrue, reason: '"$prompt" devrait se terminer par . ? ou !');
        }
      }
    });
  });
}
