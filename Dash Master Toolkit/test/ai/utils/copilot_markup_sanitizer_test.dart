// test/ai/utils/copilot_markup_sanitizer_test.dart
//
// Mission "CORRIGER L'AFFICHAGE DES RÉPONSES DU COPILOT IA" — verrouille la
// conversion HTML brut -> Markdown équivalent, jamais une suppression
// destructrice, et jamais une altération du Markdown déjà correct.

import 'package:flutter_test/flutter_test.dart';
import 'package:dash_master_toolkit/ai/utils/copilot_markup_sanitizer.dart';

void main() {
  group('sanitizeCopilotMarkup', () {
    test('exemple RÉEL du rapport de mission — <br>/<strong> convertis, aucune donnée perdue', () {
      const raw =
          'Voici les données de la fiche POR PROMESH trouvée :\n'
          '<br><br><strong>ID :</strong>\n'
          '1840e3c7-de5a-48ea-851a-1a19411707d6<br>\n'
          '<strong>N° de séquence :</strong> 158<br>\n'
          '<strong>Date de production :</strong> 2026-08-27<br>\n'
          '<strong>Heure de début :</strong> 12:52:56<br>\n'
          '<strong>Heure de fin :</strong> 12:52:56<br>';

      final result = sanitizeCopilotMarkup(raw);

      expect(result, isNot(contains('<br>')));
      expect(result, isNot(contains('<strong>')));
      expect(result, isNot(contains('</strong>')));
      // Toutes les données réelles doivent survivre à la conversion.
      expect(result, contains('1840e3c7-de5a-48ea-851a-1a19411707d6'));
      expect(result, contains('158'));
      expect(result, contains('2026-08-27'));
      expect(result, contains('12:52:56'));
      expect(result, contains('**ID :**'));
      expect(result, contains('**N° de séquence :**'));
    });

    test('<br> -> saut de ligne', () {
      expect(sanitizeCopilotMarkup('A<br>B'), 'A\nB');
      expect(sanitizeCopilotMarkup('A<br/>B'), 'A\nB');
      expect(sanitizeCopilotMarkup('A<br />B'), 'A\nB');
    });

    test('<strong>/<b> -> **gras**, jamais perdu', () {
      expect(sanitizeCopilotMarkup('<strong>Champ :</strong> valeur'), '**Champ :** valeur');
      expect(sanitizeCopilotMarkup('<b>Champ :</b> valeur'), '**Champ :** valeur');
    });

    test('<em>/<i> -> *italique*', () {
      expect(sanitizeCopilotMarkup('<em>important</em>'), '*important*');
      expect(sanitizeCopilotMarkup('<i>important</i>'), '*important*');
    });

    test('<p>...</p> -> paragraphe (contenu préservé, séparé par une ligne vide)', () {
      final result = sanitizeCopilotMarkup('<p>Premier paragraphe</p><p>Second paragraphe</p>');
      expect(result, contains('Premier paragraphe'));
      expect(result, contains('Second paragraphe'));
      expect(result, isNot(contains('<p>')));
      expect(result, isNot(contains('</p>')));
    });

    test('<ul><li>...</li></ul> -> puces Markdown, rien perdu', () {
      final result = sanitizeCopilotMarkup('<ul><li>élément 1</li><li>élément 2</li></ul>');
      expect(result, contains('- élément 1'));
      expect(result, contains('- élément 2'));
      expect(result, isNot(contains('<li>')));
      expect(result, isNot(contains('<ul>')));
    });

    test('<ol><li>...</li></ol> -> liste NUMÉROTÉE (1. 2. ...), jamais des puces', () {
      final result = sanitizeCopilotMarkup('<ol><li>premier</li><li>deuxième</li></ol>');
      expect(result, contains('1. premier'));
      expect(result, contains('2. deuxième'));
      expect(result, isNot(contains('- premier')));
    });

    test('<div> -> saut de ligne (jamais affiché littéralement)', () {
      final result = sanitizeCopilotMarkup('<div>contenu</div>');
      expect(result, contains('contenu'));
      expect(result, isNot(contains('<div>')));
    });

    test('idempotence — appliquer deux fois donne le même résultat', () {
      const raw = '<strong>X :</strong> 1<br><ul><li>a</li><li>b</li></ul>';
      final once = sanitizeCopilotMarkup(raw);
      final twice = sanitizeCopilotMarkup(once);
      expect(twice, once);
    });

    test('le Markdown déjà correct traverse SANS altération', () {
      const raw = '**Titre**\n\n**ID :** valeur\n\n- élément 1\n- élément 2\n\n1. élément 1\n2. élément 2';
      expect(sanitizeCopilotMarkup(raw), raw);
    });

    test('texte vide reste vide', () {
      expect(sanitizeCopilotMarkup(''), '');
    });

    test('texte sans aucune balise reste inchangé', () {
      const raw = 'Réponse simple, sans mise en forme particulière.';
      expect(sanitizeCopilotMarkup(raw), raw);
    });

    test('ne compresse que les lignes vides EN EXCÈS introduites par la conversion, jamais le contenu réel', () {
      final result = sanitizeCopilotMarkup('A<br><br><br><br>B');
      expect(result, contains('A'));
      expect(result, contains('B'));
      expect(RegExp(r'\n{3,}').hasMatch(result), isFalse);
    });
  });
}
