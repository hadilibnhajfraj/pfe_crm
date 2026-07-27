// lib/application/users/view/user_profile_screen.dart

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;
import 'dart:io';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/application/users/users_imports.dart';
import 'package:flutter/foundation.dart'; // IMPORTANT
// Si SvgPicture n'est pas déjà importé via users_imports.dart, ajoute :
// import 'package:flutter_svg/flutter_svg.dart';

class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({super.key});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  final UserProfileController controller = Get.put(UserProfileController());
  final ThemeController themeController = Get.put(ThemeController());

  @override
  Widget build(BuildContext context) {
    final AppLocalizations lang = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);
    final double screenWidth = MediaQuery.of(context).size.width;

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: SingleChildScrollView(
        padding: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: const [
              rf.Condition.between(start: 0, end: 340, value: 10),
              rf.Condition.between(start: 341, end: 992, value: 16),
            ],
            defaultValue: 24,
          ).value,
        ),
        child: Obx(() {
          final p = controller.profile.value;

          if (p == null) {
            return const Center(child: CircularProgressIndicator());
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ---------------- HEADER ----------------
              _commonBackgroundWidget(
                screenWidth: screenWidth,
                child: Row(
                  children: [
                    // ✅ Avatar (asset)
   ClipOval(
  child: GestureDetector(
    onTap: controller.isEditing.value
        ? controller.pickImage
        : null,
    child: Obx(() {
      final avatar = controller.avatarPath.value;
      final avatarUrl = controller.profile.value?.avatarUrl;

      // ✅ CAS WEB → PAS Image.file
      if (kIsWeb && avatar.isNotEmpty) {
        return Image.network(
          avatar,
          width: 60,
          height: 60,
          fit: BoxFit.cover,
        );
      }

      // ✅ CAS MOBILE
      if (!kIsWeb && avatar.isNotEmpty) {
        return Image.file(
          File(avatar),
          width: 60,
          height: 60,
          fit: BoxFit.cover,
        );
      }

      // ✅ IMAGE BACKEND
      if (avatarUrl != null && avatarUrl.isNotEmpty) {
        return Image.network(
          "${ApiConfig.baseUrl}$avatarUrl",
          width: 60,
          height: 60,
          fit: BoxFit.cover,
        );
      }

      // ✅ FALLBACK
      return Image.asset(
        profileIcon,
        width: 60,
        height: 60,
        fit: BoxFit.cover,
      );
    }),
  ),
),

                    const SizedBox(width: 12),

                    // ✅ Name + Designation (editable)
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Obx(() {
                            final editing = controller.isEditing.value;
                            return editing
                                ? TextFormField(
                                    controller: controller.nameCtrl,
                                    decoration: inputDecoration(
                                      context,
                                      hintText: "Name",
                                    ),
                                  )
                                : Text(
                                    p.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.titleMedium?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  );
                          }),
                          const SizedBox(height: 6),
                          Obx(() {
                            final editing = controller.isEditing.value;
                            return editing
                                ? TextFormField(
                                    controller: controller.designationCtrl,
                                    decoration: inputDecoration(
                                      context,
                                      hintText: "Designation",
                                    ),
                                  )
                                : Text(
                                    p.designation,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.bodyLarge?.copyWith(
                                      fontWeight: FontWeight.w400,
                                    ),
                                  );
                          }),
                        ],
                      ),
                    ),

                    const SizedBox(width: 12),

                    // ✅ Actions
                    Obx(() {
                      final editing = controller.isEditing.value;

                      if (!editing) {
                        return CommonButton(
                          onPressed: controller.startEdit,
                          text: "Edit",
                          width: 90,
                          height: 38,
                          borderRadius: 8,
                          fontSize: 14,
                        );
                      }

                      return Row(
                        children: [
                          CommonButton(
                            onPressed: () async {
                              await controller.saveEdit();
                              if (!mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text("Profil mis à jour ✅")),
                              );
                            },
                            text: "Save",
                            width: 90,
                            height: 38,
                            borderRadius: 8,
                            fontSize: 14,
                          ),
                          const SizedBox(width: 10),
                          CommonButton(
                            onPressed: controller.cancelEdit,
                            text: "Cancel",
                            width: 90,
                            height: 38,
                            borderRadius: 8,
                            fontSize: 14,
                          ),
                        ],
                      );
                    }),
                  ],
                ),
              ),

              const SizedBox(height: 15),

              _buildGoogleCalendarWidget(theme, screenWidth),

              const SizedBox(height: 15),

              // ✅ Only Section: Personal Information
              _buildPersonalInfoWidget(theme, lang, screenWidth),
            ],
          );
        }),
      ),
    );
  }

  Widget _buildGoogleCalendarWidget(ThemeData theme, double? screenWidth) {
    return _commonBackgroundWidget(
      screenWidth: screenWidth,
      child: Obx(() {
        final connected = controller.googleCalendarConnected.value;
        final email = controller.googleCalendarEmail.value;
        final loading = controller.googleCalendarLoading.value;

        return Row(
          children: [
            Icon(
              Icons.event_available_rounded,
              color: connected ? Colors.green.shade600 : colorGrey500,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Google Calendar",
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    connected
                        ? "Connecté${email.isNotEmpty ? ' ($email)' : ''}"
                        : "Non connecté — les Follow-up ne seront pas synchronisés",
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: connected ? Colors.green.shade700 : colorGrey500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            if (loading)
              const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            else if (connected)
              TextButton(
                onPressed: controller.disconnectGoogleCalendar,
                child: const Text("Déconnecter"),
              )
            else ...[
              CommonButton(
                onPressed: controller.connectGoogleCalendar,
                text: "Connecter",
                width: 120,
                height: 38,
                borderRadius: 8,
                fontSize: 14,
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: "Rafraîchir le statut",
                onPressed: controller.loadGoogleCalendarStatus,
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ],
        );
      }),
    );
  }

  // =====================================================
  // UI HELPERS
  // =====================================================
  Widget _commonBackgroundWidget({
    required Widget child,
    required double? screenWidth,
  }) {
    return Container(
      width: screenWidth,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorDark : colorWhite,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [BoxShadow(blurRadius: 6, color: Colors.black12)],
      ),
      child: child,
    );
  }

  Widget _editableRow({
    required ThemeData theme,
    required String iconAsset,
    required String label,
    required TextEditingController ctrl,
    TextInputType? keyboardType,
  }) {
    return Obx(() {
      final editing = controller.isEditing.value;

      return Padding(
        padding: const EdgeInsets.only(top: 10.0),
        child: Row(
          children: [
            SvgPicture.asset(
              iconAsset,
              width: 18,
              height: 18,
              colorFilter: ColorFilter.mode(
                themeController.isDarkMode ? colorGrey500 : colorGrey700,
                BlendMode.srcIn,
              ),
            ),
            const SizedBox(width: 5),
            SizedBox(
              width: 110,
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w400,
                  color: themeController.isDarkMode ? colorGrey500 : colorGrey700,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              ":",
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w400,
                color: themeController.isDarkMode ? colorGrey500 : colorGrey400,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: editing
                  ? TextFormField(
                      controller: ctrl,
                      keyboardType: keyboardType,
                      decoration: inputDecoration(context, hintText: label),
                    )
                  : Text(
                      ctrl.text,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
            ),
          ],
        ),
      );
    });
  }

  // =====================================================
  // Personal Information
  // =====================================================
  Widget _buildPersonalInfoWidget(
    ThemeData theme,
    AppLocalizations lang,
    double? screenWidth,
  ) {
    return _commonBackgroundWidget(
      screenWidth: screenWidth,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            lang.translate("personalInformation"),
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 5),

          _editableRow(theme: theme, iconAsset: userIcon, label: lang.translate("fullName"), ctrl: controller.nameCtrl),
          _editableRow(theme: theme, iconAsset: emailIcon, label: lang.translate("email"), ctrl: controller.emailCtrl, keyboardType: TextInputType.emailAddress),
          _editableRow(theme: theme, iconAsset: birthdayIcon, label: lang.translate("birthDay"), ctrl: controller.birthdayCtrl),
          _editableRow(theme: theme, iconAsset: phoneIcon, label: lang.translate("phone"), ctrl: controller.phoneCtrl, keyboardType: TextInputType.phone),
          _editableRow(theme: theme, iconAsset: countryIcon, label: lang.translate("country"), ctrl: controller.countryCtrl),
          _editableRow(theme: theme, iconAsset: regionIcon, label: lang.translate("stateRegion"), ctrl: controller.stateCtrl),
          _editableRow(theme: theme, iconAsset: addressIcon, label: lang.translate("address"), ctrl: controller.addressCtrl),
        ],
      ),
    );
  }
}
