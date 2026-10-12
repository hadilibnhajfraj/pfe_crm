// lib/ai/utils/copilot_content_parser.dart
//
// Découpe une réponse du Copilot en segments affichables : texte markdown
// ordinaire ET tableaux GFM (`| a | b |` + ligne `|---|---|`), rendus par
// CopilotTableView (défilement horizontal, en-tête, lignes alternées) au lieu
// du tableau brut de flutter_markdown qui déborde dans un panneau étroit.
//
// Extrait aussi les indicateurs chiffrés DÉJÀ présents dans la réponse
// (« Projets en cours : 12 ») pour les afficher en cartes KPI — jamais une
// valeur calculée ou inventée côté client : si la réponse ne contient pas au
// moins deux lignes « libellé : nombre », aucune carte n'est affichée.
//
// Fonctions pures, sans dépendance Flutter — testables isolément.

sealed class CopilotContentSegment {
  const CopilotContentSegment();
}

class CopilotMarkdownSegment extends CopilotContentSegment {
  const CopilotMarkdownSegment(this.markdown);
  final String markdown;
}

class CopilotTableSegment extends CopilotContentSegment {
  const CopilotTableSegment({required this.headers, required this.rows});
  final List<String> headers;
  final List<List<String>> rows;
}

final RegExp _separatorLine = RegExp(r'^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$');
const String _escapedPipe = '\u0000';

bool _looksLikeRow(String line) {
  final trimmed = line.trim();
  return trimmed.contains('|') && trimmed.replaceAll('|', '').trim().isNotEmpty;
}

String _stripInlineMarkup(String cell) => cell.replaceAll('**', '').replaceAll('__', '').replaceAll('`', '').trim();

List<String> _cells(String line) {
  var trimmed = line.trim().replaceAll(r'\|', _escapedPipe);
  if (trimmed.startsWith('|')) trimmed = trimmed.substring(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1);
  return trimmed.split('|').map((c) => _stripInlineMarkup(c.replaceAll(_escapedPipe, '|'))).toList();
}

/// Segments dans l'ordre du texte ; un texte sans tableau donne un seul
/// segment markdown (rendu strictement identique à avant).
List<CopilotContentSegment> splitCopilotContent(String text) {
  final lines = text.split('\n');
  final segments = <CopilotContentSegment>[];
  final buffer = <String>[];

  void flushMarkdown() {
    final markdown = buffer.join('\n');
    if (markdown.trim().isNotEmpty) segments.add(CopilotMarkdownSegment(markdown));
    buffer.clear();
  }

  var i = 0;
  var inCodeFence = false;
  while (i < lines.length) {
    final line = lines[i];
    if (line.trimLeft().startsWith('```')) inCodeFence = !inCodeFence;
    final startsTable = !inCodeFence && i + 1 < lines.length && _looksLikeRow(line) && _separatorLine.hasMatch(lines[i + 1]);
    if (!startsTable) {
      buffer.add(line);
      i++;
      continue;
    }

    flushMarkdown();
    final headers = _cells(line);
    final rows = <List<String>>[];
    i += 2;
    while (i < lines.length && _looksLikeRow(lines[i])) {
      final cells = _cells(lines[i]);
      // Lignes normalisées sur le nombre de colonnes de l'en-tête.
      rows.add(List.generate(headers.length, (c) => c < cells.length ? cells[c] : ''));
      i++;
    }
    segments.add(CopilotTableSegment(headers: headers, rows: rows));
  }
  flushMarkdown();
  return segments;
}

class CopilotKpi {
  const CopilotKpi({required this.label, required this.value, this.emoji});
  final String label;
  final String value;
  final String? emoji;
}

// « - 📊 **Projets en cours** : 12 », « Taux de réussite : 72 % »,
// « CA signé : 1 250 000 TND ». Une valeur non numérique (« Statut : En
// cours »), une date (« 12/07/2026 ») ou une phrase ne sont jamais des KPI.
// Préfixe emoji facultatif : tout ce qui n'est ni lettre (y compris accentuée),
// ni chiffre, ni ponctuation de la ligne.
final RegExp _kpiLine = RegExp(
  r'^\s*(?:[-*•]\s+)?(?:([^\s\wÀ-ÿ:.,]{1,4})\s*)?([A-Za-zÀ-ÿ][^:\n]{1,40}?)\s*:\s*([-+]?\d[\d\s\u00A0\u202F.,]*(?:\s?(?:%|TND|DT|€|k€|K|M|jours?|j|h))?)\s*$',
);

// Libellés qui désignent un identifiant, pas une mesure (« ID : 158 »).
final RegExp _identifierLabel = RegExp(r'^(id|identifiant|r[ée]f(?:[ée]rence)?|n°|no|num[ée]ro|t[ée]l(?:[ée]phone)?|code|ann[ée]e|version|cin|matricule)(?=\s|:|$)', caseSensitive: false);

/// Indicateurs lus dans la réponse ; vide s'il y en a moins de [min].
List<CopilotKpi> extractCopilotKpis(String text, {int min = 2, int max = 6}) {
  final kpis = <CopilotKpi>[];
  var inCodeFence = false;
  for (final raw in text.split('\n')) {
    if (raw.trimLeft().startsWith('```')) inCodeFence = !inCodeFence;
    if (inCodeFence || raw.contains('|')) continue;
    final match = _kpiLine.firstMatch(raw.replaceAll('**', '').replaceAll('__', ''));
    if (match == null || _identifierLabel.hasMatch(match.group(2)!.trim())) continue;
    kpis.add(CopilotKpi(emoji: match.group(1), label: match.group(2)!.trim(), value: match.group(3)!.trim()));
    if (kpis.length == max) break;
  }
  return kpis.length >= min ? kpis : const [];
}
