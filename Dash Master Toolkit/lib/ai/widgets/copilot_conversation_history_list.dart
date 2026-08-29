// lib/ai/widgets/copilot_conversation_history_list.dart
//
// La liste "Historique des conversations" — un tap charge la conversation
// dans CopilotController et revient à l'onglet chat (voir
// CopilotUiController.showChat).
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';

import '../models/conversation_summary.dart';
import '../providers/copilot_controller.dart';
import '../providers/copilot_history_controller.dart';
import '../providers/copilot_ui_controller.dart';
import '../theme/copilot_colors.dart';

class CopilotConversationHistoryList extends StatefulWidget {
  const CopilotConversationHistoryList({super.key});

  @override
  State<CopilotConversationHistoryList> createState() => _CopilotConversationHistoryListState();
}

class _CopilotConversationHistoryListState extends State<CopilotConversationHistoryList> {
  @override
  void initState() {
    super.initState();
    CopilotHistoryController.to.load();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Get.isRegistered<ThemeController>() ? Get.find<ThemeController>().isDarkMode : false;
    final history = CopilotHistoryController.to;

    return Obx(() {
      if (history.loading.value) {
        return const Center(child: CircularProgressIndicator());
      }
      if (history.error.value != null) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(history.error.value!, style: TextStyle(color: CopilotColors.mutedText(isDark))),
          ),
        );
      }
      if (history.conversations.isEmpty) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Aucune conversation pour le moment.', style: TextStyle(color: CopilotColors.mutedText(isDark))),
          ),
        );
      }

      return RefreshIndicator(
        onRefresh: history.load,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: history.conversations.length,
          separatorBuilder: (_, __) => Divider(height: 1, color: CopilotColors.border(isDark)),
          itemBuilder: (context, index) => _HistoryTile(summary: history.conversations[index], isDark: isDark),
        ),
      );
    });
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.summary, required this.isDark});

  final ConversationSummary summary;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(Icons.chat_bubble_outline_rounded, color: CopilotColors.mutedText(isDark)),
      title: Text(
        summary.preview?.isNotEmpty == true ? summary.preview! : 'Conversation',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(DateFormat('dd/MM/yyyy HH:mm').format(summary.updatedAt)),
      onTap: () async {
        await CopilotController.to.loadConversation(summary.conversationId);
        CopilotUiController.to.showChat();
      },
    );
  }
}
