import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../constant/app_color.dart';
import '../../theme/theme_controller.dart';
import '../dotted_line.dart';

// ✅ IMPORTANT: on utilise TON modèle (backend)
import 'package:dash_master_toolkit/app_shell_route/models/notification.dart';

class NotificationListWidget extends StatelessWidget {
  final NotificationData notification;

  const NotificationListWidget({super.key, required this.notification});
IconData _getIcon(String type) {
  switch (type) {
    case "FOLLOWUP":
      return Icons.alarm;
    case "FOLLOWUP_MISSING":
      return Icons.warning;
    case "PROJECT_RELANCE":
      return Icons.work;
    case "PROJECT_ERROR":
      return Icons.error;
    default:
      return Icons.notifications;
  }
}
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // ✅ Ne pas recréer le controller à chaque item
    final ThemeController themeController = Get.find<ThemeController>();

    final bool isUnread = !notification.isRead;

    return Padding(
      padding: const EdgeInsets.only(top: 15.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ✅ Pas de "icon" dans ton modèle -> on met un placeholder
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: themeController.isDarkMode ? colorGrey900 : colorGrey100,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
  _getIcon(notification.type),
  size: 20,
  color: themeController.isDarkMode ? colorWhite : colorGrey900,
),
              ),

              const SizedBox(width: 10),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      notification.title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: themeController.isDarkMode ? colorWhite : colorGrey900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      notification.message,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w400,
                        color: isUnread
                            ? (themeController.isDarkMode ? colorWhite : colorGrey900)
                            : colorGrey500,
                      ),
                    ),

                    // ✅ Pas de "timeAgo" -> on affiche juste un texte simple
                    const SizedBox(height: 3),
                    Text(
                      isUnread ? "Nouveau" : "Lu",
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w400,
                        color: themeController.isDarkMode ? colorGrey500 : colorGrey400,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 10),

              if (isUnread)
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colorError100,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          const DashedDivider(),
        ],
      ),
    );
  }
}
