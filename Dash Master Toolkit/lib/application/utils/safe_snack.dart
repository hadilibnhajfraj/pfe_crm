import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

void safeSnack(String title, String message) {
  try {
    Get.snackbar(title, message);
  } catch (_) {
    if (kDebugMode) debugPrint("[$title] $message");
  }
}
