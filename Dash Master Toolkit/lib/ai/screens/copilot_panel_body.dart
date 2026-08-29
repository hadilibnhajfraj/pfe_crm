// lib/ai/screens/copilot_panel_body.dart
//
// Le contenu partagé entre le drawer desktop (copilot_chat_drawer.dart) et
// la bottom sheet mobile (copilot_chat_bottom_sheet.dart) — en-tête avec
// onglets (conversation / historique), fil de messages ou historique, barre
// de saisie. Une seule implémentation pour ne jamais laisser les deux
// présentations diverger.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/copilot_message.dart';
import '../providers/copilot_controller.dart';
import '../providers/copilot_ui_controller.dart';
import '../providers/proactive_alerts_controller.dart';
import 'copilot_dashboard_view.dart';
import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';
import '../widgets/copilot_avatar.dart';
import '../widgets/copilot_context_chip.dart';
import '../widgets/copilot_conversation_history_list.dart';
import '../widgets/copilot_empty_state.dart';
import '../widgets/copilot_input_bar.dart';
import '../widgets/copilot_message_bubble.dart';
import '../widgets/copilot_press_scale.dart';

class CopilotPanelBody extends StatelessWidget {
  const CopilotPanelBody({super.key, this.onClose, this.chatScrollController});

  final VoidCallback? onClose;

  /// Fourni par CopilotChatBottomSheet (DraggableScrollableSheet) pour que
  /// glisser dans la liste des messages redimensionne aussi la feuille —
  /// `null` sur desktop (le drawer n'a pas ce besoin), auquel cas
  /// `_ChatView` crée son propre ScrollController.
  final ScrollController? chatScrollController;

  @override
  Widget build(BuildContext context) {
    // Force la création des controllers avant le premier build de leurs
    // enfants (CopilotController.to/CopilotUiController.to sont des
    // singletons paresseux — voir leur propre doc). ProactiveAlertsController
    // aussi : le listener `proactive-ai-alert` doit être actif dès que le
    // panneau existe dans l'arbre (même fermé — voir CopilotChatDrawer),
    // jamais seulement quand l'utilisateur ouvre l'onglet Dashboard —
    // "surveiller" veut dire recevoir l'alerte même sans avoir ouvert le
    // Copilot pour la chercher.
    CopilotController.to;
    ProactiveAlertsController.to;
    final ui = CopilotUiController.to;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _Header(onClose: onClose),
        Expanded(child: _TabbedBody(chatScrollController: chatScrollController)),
        Obx(() => ui.activeTab.value == CopilotPanelTab.chat ? const CopilotInputBar() : const SizedBox.shrink()),
      ],
    );
  }
}

// Construit chaque onglet UNE SEULE FOIS, à sa PREMIÈRE visite, puis le
// garde vivant (IndexedStack) pour le reste de la session — jamais une
// reconstruction complète à chaque aller-retour vers un onglet déjà
// visité (position de scroll/état local préservés, la texture "premium"
// des apps à onglets — Gmail, Teams...). Volontairement PAS un
// IndexedStack qui construit les 3 onglets dès l'ouverture du panneau :
// CopilotConversationHistoryList déclenche CopilotHistoryController.to.load()
// dans son initState() (un vrai appel réseau, sans seam de test, voir sa
// propre doc) — le construire pour un utilisateur qui ne visite jamais
// "Historique" gaspillerait un appel, et dans les tests qui montent
// CopilotPanelBody sans jamais viser l'onglet historique, déclencherait un
// vrai appel Dio non mocké. Un onglet jamais visité reste un simple
// SizedBox.shrink() dans l'IndexedStack.
class _TabbedBody extends StatefulWidget {
  const _TabbedBody({this.chatScrollController});

  final ScrollController? chatScrollController;

  @override
  State<_TabbedBody> createState() => _TabbedBodyState();
}

class _TabbedBodyState extends State<_TabbedBody> {
  final Set<int> _visited = {};

  @override
  Widget build(BuildContext context) {
    final ui = CopilotUiController.to;

    return Obx(() {
      final index = switch (ui.activeTab.value) {
        CopilotPanelTab.dashboard => 0,
        CopilotPanelTab.chat => 1,
        CopilotPanelTab.history => 2,
      };
      _visited.add(index);

      return IndexedStack(
        index: index,
        sizing: StackFit.expand,
        children: [
          _visited.contains(0) ? CopilotDashboardView() : const SizedBox.shrink(),
          _visited.contains(1) ? _ChatView(externalScrollController: widget.chatScrollController) : const SizedBox.shrink(),
          _visited.contains(2) ? const CopilotConversationHistoryList() : const SizedBox.shrink(),
        ],
      );
    });
  }
}

class _Header extends StatelessWidget {
  const _Header({this.onClose});

  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final ui = CopilotUiController.to;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 6, 10),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: CopilotColors.border(isDark)))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const CopilotAvatar(size: 28),
              const SizedBox(width: 10),
              Expanded(child: Text('Copilot IA', style: CopilotTextStyles.panelTitle(isDark))),
              Obx(() => _TabIconButton(
                    tooltip: 'Dashboard',
                    icon: Icons.dashboard_rounded,
                    isActive: ui.activeTab.value == CopilotPanelTab.dashboard,
                    isDark: isDark,
                    onPressed: ui.showDashboard,
                  )),
              Obx(() => _TabIconButton(
                    tooltip: 'Conversation',
                    icon: Icons.chat_bubble_outline_rounded,
                    isActive: ui.activeTab.value == CopilotPanelTab.chat,
                    isDark: isDark,
                    onPressed: ui.showChat,
                  )),
              Obx(() => _TabIconButton(
                    tooltip: 'Historique',
                    icon: Icons.history_rounded,
                    isActive: ui.activeTab.value == CopilotPanelTab.history,
                    isDark: isDark,
                    onPressed: ui.showHistory,
                  )),
              IconButton(
                tooltip: 'Nouvelle conversation',
                icon: const Icon(Icons.add_comment_outlined),
                onPressed: () {
                  CopilotController.to.startNewConversation();
                  ui.showChat();
                },
              ),
              if (onClose != null)
                IconButton(tooltip: 'Fermer', icon: const Icon(Icons.close_rounded), onPressed: onClose),
            ],
          ),
          CopilotContextChip(isDark: isDark),
        ],
      ),
    );
  }
}

// Un des 3 boutons d'onglet du header (dashboard/conversation/historique) —
// mis en évidence (couleur) quand actif, jamais un simple bouton binaire
// comme avant l'ajout de l'onglet Dashboard AI.
class _TabIconButton extends StatelessWidget {
  const _TabIconButton({required this.tooltip, required this.icon, required this.isActive, required this.isDark, required this.onPressed});

  final String tooltip;
  final IconData icon;
  final bool isActive;
  final bool isDark;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        selected: isActive,
        label: tooltip,
        child: CopilotPressScale(
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Icon(icon, color: isActive ? CopilotColors.orbGradient.first : null),
          ),
        ),
      ),
    );
  }
}

class _ChatView extends StatefulWidget {
  const _ChatView({this.externalScrollController});

  final ScrollController? externalScrollController;

  @override
  State<_ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<_ChatView> {
  ScrollController? _ownedScrollController;
  int _lastMessageCount = 0;

  ScrollController get _scrollController => widget.externalScrollController ?? (_ownedScrollController ??= ScrollController());

  @override
  void dispose() {
    _ownedScrollController?.dispose();
    super.dispose();
  }

  void _scrollToBottomIfNeeded(int count) {
    if (count == _lastMessageCount) return;
    _lastMessageCount = count;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = CopilotController.to;

    return Obx(() {
      final messages = controller.messages;
      if (messages.isEmpty) return CopilotEmptyState();

      _scrollToBottomIfNeeded(messages.length);

      // findLastIndex (pas juste "le dernier de la liste") : le dernier
      // message n'est pas toujours l'assistant — pendant qu'un message
      // utilisateur vient d'être ajouté mais avant que le placeholder
      // assistant ne le suive (fenêtre très courte), il ne doit y avoir
      // AUCUN bouton "Régénérer" affiché par erreur sur un message
      // utilisateur.
      final lastAssistantIndex = messages.lastIndexWhere((m) => m.role == CopilotMessageRole.assistant);

      return ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        itemCount: messages.length,
        // ValueKey(message.id) : permet à Flutter de reconnaître un message
        // déjà rendu et de sauter son rebuild quand seule la LISTE change
        // de longueur (nouveau message ajouté) — sans clé, un ajout en fin
        // de liste peut réassocier des éléments plus haut à un nouvel
        // index et forcer des rebuilds inutiles.
        itemBuilder: (context, index) => CopilotMessageBubble(
          key: ValueKey(messages[index].id),
          message: messages[index],
          isLastAssistantMessage: index == lastAssistantIndex,
        ),
      );
    });
  }
}
