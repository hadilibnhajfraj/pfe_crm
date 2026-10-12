// lib/ai/widgets/copilot_table_view.dart
//
// Rendu d'un tableau de réponse du Copilot (segment extrait par
// utils/copilot_content_parser.dart) : en-tête mis en évidence, lignes
// alternées, bordure arrondie, défilement HORIZONTAL quand les colonnes
// dépassent la largeur du panneau — jamais un débordement ni un texte coupé
// sans possibilité de le lire. Cellules sélectionnables (copier une valeur).
import 'package:flutter/material.dart';

import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

class CopilotTableView extends StatelessWidget {
  const CopilotTableView({super.key, required this.headers, required this.rows, required this.isDark});

  final List<String> headers;
  final List<List<String>> rows;
  final bool isDark;

  static const double _minColumnWidth = 90;
  static const double _maxColumnWidth = 240;

  @override
  Widget build(BuildContext context) {
    final body = CopilotTextStyles.messageBody(isDark).copyWith(fontSize: 13, height: 1.35);
    final head = body.copyWith(fontWeight: FontWeight.w700);
    final border = CopilotColors.border(isDark);

    Widget cell(String text, TextStyle style) => ConstrainedBox(
          constraints: const BoxConstraints(minWidth: _minColumnWidth, maxWidth: _maxColumnWidth),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: SelectableText(text, style: style),
          ),
        );

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Table(
              defaultColumnWidth: const IntrinsicColumnWidth(),
              border: TableBorder(horizontalInside: BorderSide(color: border, width: 0.8)),
              children: [
                TableRow(
                  decoration: BoxDecoration(color: CopilotColors.tableHeader(isDark)),
                  children: headers.map((h) => cell(h, head)).toList(),
                ),
                for (var i = 0; i < rows.length; i++)
                  TableRow(
                    decoration: BoxDecoration(color: i.isOdd ? CopilotColors.tableStripe(isDark) : CopilotColors.surface(isDark)),
                    children: rows[i].map((c) => cell(c, body)).toList(),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(border: Border(top: BorderSide(color: border, width: 0.8))),
            child: Text(
              '${rows.length} ligne${rows.length > 1 ? 's' : ''} · ${headers.length} colonne${headers.length > 1 ? 's' : ''}',
              style: CopilotTextStyles.timestamp(isDark),
            ),
          ),
        ],
      ),
    );
  }
}
