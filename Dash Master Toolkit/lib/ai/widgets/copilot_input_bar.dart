// lib/ai/widgets/copilot_input_bar.dart
//
// La barre de saisie (« composer ») — aperçus des fichiers joints (Phase 2,
// copilot_attachment_preview.dart) au-dessus d'un champ arrondi qui regroupe
// pièce jointe, texte, voix et envoi. `isSending` remplace le bouton d'envoi
// par « Stop » plutôt que d'empiler des messages, la même discipline que le
// reste de l'app (voir ArchiveRequestProvider.sending).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/styles.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../providers/copilot_controller.dart';
import '../theme/copilot_colors.dart';
import 'copilot_attachment_button.dart';
import 'copilot_attachment_preview.dart';
import 'copilot_voice_button.dart';

class CopilotInputBar extends StatefulWidget {
  const CopilotInputBar({super.key});

  @override
  State<CopilotInputBar> createState() => _CopilotInputBarState();
}

class _CopilotInputBarState extends State<CopilotInputBar> {
  // Entrée envoie, Maj+Entrée insère un saut de ligne. L'événement est
  // intercepté sur le nœud de focus du champ, avant que la saisie ne
  // l'interprète comme un retour à la ligne. Rien n'est envoyé pendant une
  // composition IME, ni pendant une génération (CopilotController.send le
  // refuse déjà : un seul tour à la fois).
  late final FocusNode _focusNode = FocusNode(debugLabel: 'copilot-input', onKeyEvent: _onKey);
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_onFocusChange);
  }

  void _onFocusChange() {
    if (mounted && _focused != _focusNode.hasFocus) setState(() => _focused = _focusNode.hasFocus);
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    final isEnter = event.logicalKey == LogicalKeyboardKey.enter || event.logicalKey == LogicalKeyboardKey.numpadEnter;
    if (!isEnter || event is! KeyDownEvent) return KeyEventResult.ignored;
    if (HardwareKeyboard.instance.isShiftPressed) return KeyEventResult.ignored; // saut de ligne
    final controller = CopilotController.to;
    if (controller.inputCtrl.value.composing.isValid) return KeyEventResult.ignored;
    if (!controller.isSending.value) controller.send();
    return KeyEventResult.handled;
  }

  @override
  void dispose() {
    _focusNode.removeListener(_onFocusChange);
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final controller = CopilotController.to;
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: CopilotColors.surface(isDark),
        border: Border(top: BorderSide(color: CopilotColors.border(isDark))),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Obx(() {
              if (controller.attachments.isEmpty) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: controller.attachments
                      .map((a) => CopilotAttachmentPreview(attachment: a, isDark: isDark, onRemove: () => controller.removeAttachment(a.id)))
                      .toList(),
                ),
              );
            }),
            AnimatedContainer(
              duration: reduceMotion ? Duration.zero : const Duration(milliseconds: 160),
              padding: const EdgeInsets.fromLTRB(2, 2, 4, 2),
              decoration: BoxDecoration(
                color: CopilotColors.panelBackground(isDark),
                borderRadius: BorderRadius.circular(16),
                // Focus clavier visible : bordure renforcée et halo discret.
                border: Border.all(color: _focused ? CopilotColors.orbGradient.first : CopilotColors.border(isDark), width: _focused ? 1.5 : 1),
                boxShadow: _focused ? [BoxShadow(color: CopilotColors.orbGradient.first.withValues(alpha: 0.14), blurRadius: 8)] : const [],
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const CopilotAttachmentButton(),
                  Expanded(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 120),
                      child: TextField(
                        controller: controller.inputCtrl,
                        focusNode: _focusNode,
                        minLines: 1,
                        maxLines: 5,
                        keyboardType: TextInputType.multiline,
                        textInputAction: TextInputAction.newline,
                        style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 14),
                        decoration: const InputDecoration(
                          hintText: 'Posez une question au Copilot…',
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ),
                  const CopilotVoiceButton(),
                  // Pendant une génération : bouton "Stop" à la place du
                  // bouton d'envoi (voir CopilotController.stopGenerating) —
                  // jamais les deux affichés en même temps, jamais un simple
                  // indicateur de chargement sans action possible.
                  Obx(
                    () => IconButton(
                      tooltip: controller.isSending.value ? 'Arrêter la génération' : 'Envoyer',
                      onPressed: controller.isSending.value ? controller.stopGenerating : () => controller.send(),
                      icon: controller.isSending.value
                          ? Container(
                              padding: const EdgeInsets.all(7),
                              decoration: BoxDecoration(shape: BoxShape.circle, color: CopilotColors.mutedText(isDark)),
                              child: const Icon(Icons.stop_rounded, size: 16, color: Colors.white),
                            )
                          : Container(
                              padding: const EdgeInsets.all(7),
                              decoration: const BoxDecoration(shape: BoxShape.circle, gradient: CopilotColors.orbLinearGradient),
                              child: const Icon(Icons.arrow_upward_rounded, size: 16, color: Colors.white),
                            ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 4),
              child: Text(
                'Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne. Le Copilot répond avec vos données CRM, dans la limite de vos droits. Vérifiez les informations importantes.',
                style: TextStyle(fontFamily: Styles.fontFamily, fontSize: 10.5, color: CopilotColors.mutedText(isDark)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
