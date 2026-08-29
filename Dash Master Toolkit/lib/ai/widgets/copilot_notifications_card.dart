// lib/ai/widgets/copilot_notifications_card.dart
//
// "Notifications" — réutilise TEL QUEL le contrôleur et l'item de
// notification déjà réels de l'app (NotificationController +
// NotificationListWidget, voir lib/app_shell_route/components/topbar/ et
// lib/widgets/notification/) : mêmes données, même rendu par notification —
// jamais une deuxième implémentation du système de notifications à
// l'intérieur de lib/ai/.
//
// N'importe volontairement PAS notification_icon_button.dart : ce fichier
// tire (via `../common_imports.dart`) une chaîne d'imports `dart:html` non
// conditionnels (voir applicateur_projects_screen.dart,
// commercial_contact_list_getx_screen.dart, etc.) qui casse la compilation
// en cible VM/test (`flutter test`) — un problème pré-existant, non
// introduit ici, mais qu'il ne faut pas propager à lib/ai/, qui doit rester
// testable. NotificationController et NotificationListWidget, eux, n'ont
// aucune dépendance à `common_imports.dart`.
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/app_shell_route/components/topbar/NotificationController.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';
import 'package:dash_master_toolkit/widgets/notification/notification_list_widget.dart';

import '../theme/copilot_colors.dart';
import '../theme/copilot_text_styles.dart';

class CopilotNotificationsCard extends StatelessWidget {
  const CopilotNotificationsCard({super.key, required this.isDark});

  final bool isDark;

  @override
  Widget build(BuildContext context) {
    // ThemeController est lu directement par le champ (non tardif) de
    // NotificationController — doit déjà être enregistré (voir main.dart),
    // exactement comme NotificationIconButton le suppose déjà ailleurs.
    if (!Get.isRegistered<ThemeController>()) return const SizedBox.shrink();
    final ctrl = Get.isRegistered<NotificationController>() ? Get.find<NotificationController>() : Get.put(NotificationController(), permanent: true);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: CopilotColors.surface(isDark),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: CopilotColors.border(isDark)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Obx(() {
            final unread = ctrl.unreadCount.value;
            return Row(
              children: [
                Icon(Icons.notifications_rounded, size: 18, color: CopilotColors.orbGradient.first),
                const SizedBox(width: 8),
                Text('Notifications', style: CopilotTextStyles.messageBody(isDark).copyWith(fontWeight: FontWeight.w600)),
                if (unread > 0) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(color: const Color(0xFFEF4444), borderRadius: BorderRadius.circular(20)),
                    child: Text('$unread', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                  ),
                ],
              ],
            );
          }),
          Obx(() {
            final items = ctrl.listOfNotification.take(3).toList();
            if (items.isEmpty) {
              return Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Aucune notification.', style: CopilotTextStyles.emptyStateSubtitle(isDark)),
              );
            }
            return Column(children: [for (final n in items) NotificationListWidget(notification: n)]);
          }),
        ],
      ),
    );
  }
}
