import 'package:flutter_test/flutter_test.dart';

import 'package:dash_master_toolkit/ai/models/copilot_page_context.dart';
import 'package:dash_master_toolkit/ai/services/copilot_suggestion_engine.dart';

void main() {
  group('starterSuggestionsFor — Smart Suggestions', () {
    test('dashboard : répartition par statut / projets critiques / contacts', () {
      expect(starterSuggestionsFor(CopilotScreenType.dashboard), [
        'Combien de projets par statut ?',
        'Quels projets sont critiques ?',
        'Analyse mes contacts commerciaux.',
      ]);
    });

    test('project : analyse / retards / projets sans relance', () {
      expect(starterSuggestionsFor(CopilotScreenType.project), [
        'Analyse mes projets.',
        'Quels projets sont en retard ?',
        "Quels projets n'ont pas été relancés depuis 30 jours ?",
      ]);
    });

    test('client (commercial) : analyse des contacts / relances', () {
      expect(starterSuggestionsFor(CopilotScreenType.client), [
        'Analyse mes contacts commerciaux.',
        'Relance les clients.',
        'Quels clients dois-je relancer cette semaine ?',
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

    // Questions écartées après essai sur le backend réel : aucun outil de
    // données appelé, contenu sans rapport avec le libellé, ou attente du
    // modèle seul pendant 60 à 160 secondes.
    test('aucune suggestion écartée après vérification ne revient', () {
      const rejected = [
        'Quels sont mes KPI ?',
        'Montre les ventes.',
        'Montre les devis.',
        'Créer une opportunité.',
        'Créer une activité.',
        'Créer un rapport.',
        'Fais-moi un rapport de synthèse sur les indicateurs clés',
      ];
      final offered = {
        ...kDefaultCopilotSuggestions,
        for (final type in CopilotScreenType.values) ...starterSuggestionsFor(type),
        for (final prompt in kCopilotQuickPrompts) prompt.message,
      };
      for (final question in rejected) {
        expect(offered.contains(question), isFalse, reason: question);
      }
    });

    test('accueil : les six questions demandées, chacune envoyant une formulation vérifiée', () {
      final byLabel = {for (final p in kCopilotQuickPrompts) p.label: p.message};
      expect(byLabel['Combien de projets sont enregistrés dans le CRM ?'], 'Combien de projets sont enregistrés dans le CRM ?');
      expect(byLabel['Quels projets nécessitent une relance ?'], "Quels projets n'ont pas été relancés depuis 30 jours ?");
      expect(byLabel["Résume l'activité commerciale sur la période disponible."], 'Analyse mes contacts commerciaux.');
      expect(byLabel['Quels dossiers nécessitent une attention particulière ?'], 'Quels dossiers nécessitent une attention particulière ?');
      expect(byLabel['Affiche les actions en retard.'], 'Quels projets sont en retard ?');
      expect(byLabel['Analyse le pipeline commercial.'], 'Combien de projets par statut ?');
    });

    test('accueil : aucun émoji dans les libellés (pictogrammes vectoriels à la place)', () {
      for (final prompt in kCopilotQuickPrompts) {
        expect(prompt.label.runes.every((r) => r < 0x2190), isTrue, reason: prompt.label);
      }
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
