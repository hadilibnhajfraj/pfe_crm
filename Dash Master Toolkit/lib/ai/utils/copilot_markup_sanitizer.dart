// lib/ai/utils/copilot_markup_sanitizer.dart
//
// Le backend vise le Markdown pur (voir Backend Master/src/ai/agents/
// porPromeshAgent.js, RÈGLE "INTERDICTION ABSOLUE DES BALISES HTML"), mais
// qwen3:8b (modèle local, voir AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md
// pour la même classe de non-fiabilité déjà documentée ailleurs) continue
// parfois de produire des balises HTML brutes (<br>, <strong>, <p>, <ul>,
// <li>...) que MarkdownBody (flutter_markdown) n'interprète pas — elles
// s'affichaient donc littéralement à l'utilisateur.
//
// Convertit — jamais ne supprime — ces balises vers leur équivalent
// Markdown AVANT le rendu, pour préserver la structure (titres, listes,
// sauts de ligne, champs/valeurs) plutôt que de la détruire par un strip
// aveugle. Le Markdown déjà correct (produit par le backend la plupart du
// temps) traverse cette fonction inchangé : elle ne reconnaît que des
// motifs `<tag>`/`</tag>` littéraux, jamais `**gras**`/`- élément`.
library;

final RegExp _olBlockRe = RegExp(r'<ol[^>]*>([\s\S]*?)<\/ol>', caseSensitive: false);
final RegExp _liRe = RegExp(r'<li[^>]*>([\s\S]*?)<\/li>', caseSensitive: false);
final RegExp _ulTagRe = RegExp(r'<\/?ul[^>]*>', caseSensitive: false);
final RegExp _strongRe = RegExp(r'<(strong|b)>([\s\S]*?)<\/\1>', caseSensitive: false);
final RegExp _emRe = RegExp(r'<(em|i)>([\s\S]*?)<\/\1>', caseSensitive: false);
final RegExp _brRe = RegExp(r'<br\s*\/?>', caseSensitive: false);
final RegExp _pRe = RegExp(r'<p[^>]*>([\s\S]*?)<\/p>', caseSensitive: false);
final RegExp _divTagRe = RegExp(r'<\/?div[^>]*>', caseSensitive: false);
final RegExp _extraBlankLinesRe = RegExp(r'\n{3,}');

/// Convertit les balises HTML brutes qu'un modèle peut encore produire
/// (malgré le prompt) en Markdown équivalent, sans jamais perdre
/// d'information. Idempotente : appliquer deux fois donne le même résultat
/// qu'une fois (aucune balise `<...>` ne survit à un premier passage pour
/// les motifs reconnus).
String sanitizeCopilotMarkup(String raw) {
  if (raw.isEmpty) return raw;
  var text = raw;

  // 1. Listes ORDONNÉES d'abord (avant le passage <li> générique ci-dessous,
  //    qui les traiterait sinon comme des puces non ordonnées).
  text = text.replaceAllMapped(_olBlockRe, (m) {
    final items = _liRe.allMatches(m.group(1) ?? '').map((im) => (im.group(1) ?? '').trim()).toList();
    if (items.isEmpty) return '\n';
    final buffer = StringBuffer('\n');
    for (var i = 0; i < items.length; i++) {
      buffer.writeln('${i + 1}. ${items[i]}');
    }
    return buffer.toString();
  });

  // 2. Listes NON ordonnées (tout <li> restant, jamais consommé par la
  //    passe <ol> ci-dessus) -> puce Markdown.
  text = text.replaceAll(_ulTagRe, '\n');
  text = text.replaceAllMapped(_liRe, (m) => '- ${(m.group(1) ?? '').trim()}\n');

  // 3. Emphase en ligne.
  text = text.replaceAllMapped(_strongRe, (m) => '**${m.group(2)}**');
  text = text.replaceAllMapped(_emRe, (m) => '*${m.group(2)}*');

  // 4. Paragraphes et sauts de ligne.
  text = text.replaceAll(_brRe, '\n');
  text = text.replaceAllMapped(_pRe, (m) => '${(m.group(1) ?? '').trim()}\n\n');
  text = text.replaceAll(_divTagRe, '\n');

  // 5. Ne compresse QUE les lignes vides en excès introduites par les
  //    conversions ci-dessus (jamais le contenu réel) — préserve un simple
  //    saut de paragraphe (\n\n), jamais plus de 2 sauts de ligne consécutifs.
  text = text.replaceAll(_extraBlankLinesRe, '\n\n');

  return text.trim();
}
