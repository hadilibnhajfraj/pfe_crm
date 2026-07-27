import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';

import 'package:dash_master_toolkit/theme/theme_controller.dart';
import 'package:dash_master_toolkit/services/notification_api.dart';
import 'package:dash_master_toolkit/app_shell_route/models/notification.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
class NotificationController extends GetxController {
  final themeController = Get.find<ThemeController>();
  final box = GetStorage();
  final RxInt page = 1.obs;
final RxBool hasMore = true.obs;
  final RxList<NotificationData> listOfNotification = <NotificationData>[].obs;
  final RxInt unreadCount = 0.obs;

  final RxBool isLoading = false.obs;

  String get token => AuthService().accessToken ?? "";

 @override
void onInit() {
  super.onInit();
  print("🔥 NotificationController INIT");
  fetchNotifications();
}

  // =========================
  // 📥 FETCH
  // =========================
Future<void> fetchNotifications({bool silent = false}) async {
  if (token.isEmpty) {
    print("⚠️ NOTIF: token vide → fetch annulé");
    return;
  }

  try {
    print("IS LOADING = ${isLoading.value} (avant fetch)");
    if (!silent) isLoading.value = true;

    page.value = 1;

    final res = await NotificationApi.instance.getMyNotifications(
      token,
      page: page.value,
    );

    listOfNotification.assignAll(res.items);
    unreadCount.value = res.unreadCount;
    hasMore.value = res.items.length >= 10;

    print("NOTIFICATION COUNT STATE = ${listOfNotification.length}");
    print("IS LOADING = ${isLoading.value} (après assignAll, avant finally)");

  } catch (e, s) {
    print("NOTIFICATION ERROR = $e");
    print(s);
  } finally {
    isLoading.value = false;
    print("IS LOADING = ${isLoading.value}");
  }
}

  // =========================
  // 🔵 MARK ALL READ (OPTIMISÉ)
  // =========================
  Future<void> markAllRead() async {
    if (token.isEmpty) return;

    try {
      await NotificationApi.instance.markAllRead(token);

      // 🔥 update local (sans refetch)
      for (var n in listOfNotification) {
        n.isRead = true; // ⚠️ nécessite modèle modifiable
      }

      unreadCount.value = 0;

      listOfNotification.refresh();

    } catch (e) {
      print("❌ MARK ALL ERROR: $e");
    }
  }

  // =========================
  // 🔵 MARK ONE READ (OPTIMISÉ)
  // =========================
  Future<void> markOneRead(String id) async {
    if (token.isEmpty) return;

    try {
      await NotificationApi.instance.markRead(token, id);

      // 🔥 update local
      final index =
          listOfNotification.indexWhere((n) => n.id == id);

      if (index != -1 && !listOfNotification[index].isRead) {
        listOfNotification[index].isRead = true;

        unreadCount.value =
            (unreadCount.value > 0) ? unreadCount.value - 1 : 0;

        listOfNotification.refresh();
      }

    } catch (e) {
      print("❌ MARK ONE ERROR: $e");
    }
  }

  // =========================
  // 🗑 DELETE
  // =========================
  Future<void> deleteNotification(String id) async {
    if (token.isEmpty) return;

    try {
      await NotificationApi.instance.deleteNotification(token, id);

      listOfNotification.removeWhere((n) => n.id == id);

      // recalcul unread
      unreadCount.value =
          listOfNotification.where((n) => !n.isRead).length;

    } catch (e) {
      print("❌ DELETE ERROR: $e");
    }
  }
  Future<void> loadMore() async {
  if (!hasMore.value || isLoading.value) return;

  try {
    isLoading.value = true;
    page.value++;

    final res = await NotificationApi.instance.getMyNotifications(
      token,
      page: page.value,
    );

    if (res.items.isEmpty) {
      hasMore.value = false;
    } else {
      listOfNotification.addAll(res.items);
    }

  } catch (e) {
    print("❌ LOAD MORE ERROR: $e");
  } finally {
    isLoading.value = false;
  }
}
}