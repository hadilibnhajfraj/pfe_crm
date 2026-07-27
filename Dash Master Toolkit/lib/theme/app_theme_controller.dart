import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';

class AppThemeController extends GetxController {
  final box = GetStorage();

  var isDark = false.obs;

  @override
  void onInit() {
    super.onInit();
    isDark.value = box.read("isDark") ?? false;
  }

  void toggleTheme(bool value) {
    isDark.value = value;
    box.write("isDark", value);
    Get.changeThemeMode(value ? ThemeMode.dark : ThemeMode.light);
  }
}