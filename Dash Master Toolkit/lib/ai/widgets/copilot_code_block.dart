// lib/ai/widgets/copilot_code_block.dart
//
// Rendu d'un bloc de code (```lang ... ``` dans une réponse markdown) —
// coloration syntaxique réelle via flutter_highlight/highlight (190
// langages déjà enregistrés par défaut, voir package:highlight/highlight.dart),
// en-tête avec le nom du langage détecté et un bouton "Copier" dédié
// (distinct du bouton "Copier" de la bulle entière, voir
// copilot_message_bubble.dart).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:flutter_highlight/themes/github.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:markdown/markdown.dart' as md;

import 'package:dash_master_toolkit/theme/styles.dart';

import '../theme/copilot_colors.dart';

/// Le seul point d'accroche entre le rendu markdown (flutter_markdown) et
/// CopilotCodeBlock — appelé UNIQUEMENT pour les balises `pre` (blocs de
/// code ```lang), jamais pour le code EN LIGNE (`x`, géré par le style
/// `code` de MarkdownStyleSheet à la place). La structure exacte
/// `pre > code[class="language-xxx"]` vient de fenced_code_block_syntax.dart
/// du package `markdown` — vérifiée contre le vrai code, pas supposée.
class CopilotCodeBlockBuilder extends MarkdownElementBuilder {
  CopilotCodeBlockBuilder({required this.isDark});

  final bool isDark;

  @override
  bool isBlockElement() => true;

  // Existe UNIQUEMENT pour compenser un piège interne de flutter_markdown
  // (vérifié en isolant le comportement contre le vrai package, pas
  // supposé) : dès qu'un builder est enregistré pour la balise `pre`,
  // MarkdownBuilder.visitText() redirige CHAQUE nœud texte de ce bloc vers
  // `builders['pre'].visitText(...)` au lieu de son propre rendu par
  // défaut — et MarkdownElementBuilder.visitText() renvoie `null` par
  // défaut. Un texte ignoré (`null`) casse le comptage interne
  // `_inlines`/`_addAnonymousBlockIfNeeded()` de flutter_markdown, qui ne
  // vide sa pile QUE si au moins un enfant non-nul a été ajouté — provoque
  // `Failed assertion: '_inlines.isEmpty'` au tout premier rendu du widget.
  // Le contenu réel est de toute façon entièrement reconstruit ci-dessous
  // depuis `element.textContent` (l'AST, indépendant de ce mécanisme) —
  // peu importe CE que ce widget affiche, seul le fait qu'il soit non-nul
  // compte ici.
  @override
  Widget? visitText(md.Text text, TextStyle? preferredStyle) => const SizedBox.shrink();

  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    final children = element.children;
    final codeElement = (children != null && children.isNotEmpty && children.first is md.Element) ? children.first as md.Element : null;
    final classAttr = codeElement?.attributes['class'];
    final language = (classAttr != null && classAttr.startsWith('language-')) ? classAttr.substring('language-'.length) : null;

    // element.textContent inclut le \n final ajouté par la syntaxe de bloc
    // de code — retiré pour ne pas laisser une ligne vide visible en bas du
    // bloc.
    final code = element.textContent.replaceAll(RegExp(r'\n$'), '');

    return CopilotCodeBlock(code: code, language: language, isDark: isDark);
  }
}

class CopilotCodeBlock extends StatelessWidget {
  const CopilotCodeBlock({super.key, required this.code, this.language, required this.isDark});

  final String code;
  final String? language;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final theme = isDark ? atomOneDarkTheme : githubTheme;
    final background = theme['root']?.backgroundColor ?? CopilotColors.panelBackground(isDark);
    // 'plaintext' explicite plutôt que `null` : `highlight.parse(source,
    // language: null)` déclenche une AUTO-DÉTECTION sur les 190 langages
    // enregistrés (voir highlight/languages/all.dart) — repéré comme la
    // cause d'un débordement de layout massif en pratique (vérifié :
    // remplacer par 'plaintext' le corrige). La doc de HighlightView
    // recommande de toute façon "de donner une valeur, pour la
    // performance" plutôt que de compter sur l'auto-détection.
    final effectiveLanguage = (language != null && language!.trim().isNotEmpty) ? language!.trim() : 'plaintext';

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: CopilotColors.border(isDark)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.06),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    effectiveLanguage == 'plaintext' ? 'texte' : effectiveLanguage,
                    style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 11.5, fontWeight: FontWeight.w600, color: CopilotColors.mutedText(isDark)),
                  ),
                ),
                InkWell(
                  borderRadius: BorderRadius.circular(6),
                  onTap: () => _copy(context),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.copy_rounded, size: 13, color: CopilotColors.mutedText(isDark)),
                        const SizedBox(width: 4),
                        Text('Copier', style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 11, color: CopilotColors.mutedText(isDark))),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            color: background,
            width: double.infinity,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: HighlightView(
                code,
                language: effectiveLanguage,
                theme: theme,
                padding: const EdgeInsets.all(12),
                textStyle: const TextStyle(fontFamily: 'monospace', fontSize: 12.5, height: 1.45),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: code));
    Fluttertoast.showToast(msg: 'Code copié.');
  }
}
