import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher.dart';

import '../model/profile_model.dart';
import '../../services/user_profile_service.dart';
import 'package:dash_master_toolkit/services/google_calendar_api.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
class UserProfileController extends GetxController {
  Rx<ProfileModel?> profile = Rx<ProfileModel?>(null);
  RxBool isEditing = false.obs;

  // ================= GOOGLE CALENDAR =================
  RxBool googleCalendarConnected = false.obs;
  RxString googleCalendarEmail = "".obs;
  RxBool googleCalendarLoading = false.obs;

  Future<void> loadGoogleCalendarStatus() async {
    try {
      final status = await GoogleCalendarApi.instance.getStatus();
      googleCalendarConnected.value = status.connected;
      googleCalendarEmail.value = status.googleEmail ?? "";
    } catch (_) {
      // best-effort — l'écran profil reste utilisable sans ce statut.
    }
  }

  Future<void> connectGoogleCalendar() async {
    googleCalendarLoading.value = true;
    try {
      final url = await GoogleCalendarApi.instance.getAuthUrl();
      if (url.isEmpty) return;
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      Get.snackbar("Error", "Impossible d'ouvrir la connexion Google");
    } finally {
      googleCalendarLoading.value = false;
    }
  }

  Future<void> disconnectGoogleCalendar() async {
    googleCalendarLoading.value = true;
    try {
      await GoogleCalendarApi.instance.disconnect();
      googleCalendarConnected.value = false;
      googleCalendarEmail.value = "";
      Get.snackbar("Success", "Google Calendar déconnecté");
    } catch (e) {
      Get.snackbar("Error", "Erreur lors de la déconnexion");
    } finally {
      googleCalendarLoading.value = false;
    }
  }
// ✅ avatar local
RxString avatarPath = "".obs;

// ✅ picker image
Future<void> pickImage() async {
  final picked = await ImagePicker().pickImage(source: ImageSource.gallery);

  if (picked != null) {
    avatarPath.value = picked.path;
  }
}
  // ================= CONTROLLERS =================
  final nameCtrl = TextEditingController();
  final designationCtrl = TextEditingController();
  final emailCtrl = TextEditingController();
  final birthdayCtrl = TextEditingController();
  final phoneCtrl = TextEditingController();
  final countryCtrl = TextEditingController();
  final stateCtrl = TextEditingController();
  final addressCtrl = TextEditingController();

  @override
  void onInit() {
    super.onInit();
    loadProfile();
    loadGoogleCalendarStatus();
  }

  // ================= LOAD PROFILE =================
  Future<void> loadProfile() async {
    try {
      final data = await UserProfileService.getMyProfile();
      debugPrint('LOAD_PROFILE — réponse API: $data');

      profile.value = ProfileModel(
        name: data["name"] ?? "",
        designation: data["designation"] ?? "",
        email: data["email"] ?? "",
        birthday: data["birthday"] ?? "",
        phone: data["phone"] ?? "",
        country: data["country"] ?? "",
        state: data["state"] ?? "",
        address: data["address"] ?? "",
        about: data["about"] ?? "",
        occupationType: const [],
        department: "",
        location: "",
        activities: const [],
        experiences: const [],

        // ✅ IMPORTANT (si backend envoie avatar)
        avatarUrl: data["avatarUrl"],
      );

      _fillControllers();

    } catch (e) {
      Get.snackbar("Error", "Failed to load profile");
      debugPrint('❌ LOAD PROFILE ERROR: $e');
    }
  }

  // ================= FILL INPUTS =================
  void _fillControllers() {
    final p = profile.value;
    if (p == null) return;

    nameCtrl.text = p.name;
    designationCtrl.text = p.designation;
    emailCtrl.text = p.email;
    birthdayCtrl.text = p.birthday;
    phoneCtrl.text = p.phone;
    countryCtrl.text = p.country;
    stateCtrl.text = p.state;
    addressCtrl.text = p.address;
  }

  // ================= EDIT =================
  void startEdit() => isEditing.value = true;

  void cancelEdit() {
    isEditing.value = false;
    _fillControllers();
  }

  // ================= SAVE =================
  // BUG CORRIGÉ : cette méthode faisait `updated["name"] ?? ""` (et pareil
  // pour chaque champ) AVANT d'appeler copyWith. copyWith est écrit
  // correctement (`name: name ?? this.name` — préserve la valeur existante
  // si l'argument est null), mais recevoir "" au lieu de null désactive
  // complètement cette protection : dès qu'un champ était absent de la
  // réponse (ex. "email", jamais renvoyé par l'ancienne route backend), il
  // était écrasé par une chaîne vide de façon définitive, et l'UI affichait
  // un profil vide alors que les données étaient toujours en base.
  // Correction : ne jamais reconstruire le modèle à la main depuis une
  // réponse partielle — recharger le profil complet via loadProfile(), qui
  // reflète exactement ce que /users/me/profile (GET) renvoie côté serveur.
  Future<void> saveEdit() async {
    try {
      final payload = {
        "name": nameCtrl.text.trim(),
        "designation": designationCtrl.text.trim(),
        "birthday": birthdayCtrl.text.trim(),
        "phone": phoneCtrl.text.trim(),
        "country": countryCtrl.text.trim(),
        "state": stateCtrl.text.trim(),
        "address": addressCtrl.text.trim(),
      };

      debugPrint('SAVE_PROFILE — currentUser avant update: ${profile.value}');
      debugPrint('SAVE_PROFILE — payload envoyé: $payload');

      final updated = await UserProfileService.updateMyProfile(payload);
      debugPrint('SAVE_PROFILE — updatedUser (réponse API): $updated');

      // Le profil affiché doit être celui renvoyé par le serveur — jamais
      // un modèle vide, jamais une reconstruction partielle côté client.
      await loadProfile();
      debugPrint('SAVE_PROFILE — profileController.user après refresh: ${profile.value}');

      // Garder le nom affiché dans la topbar/sidebar (AuthService) synchronisé
      // avec le profil — ces deux stores ne se mettent jamais à jour l'un
      // l'autre automatiquement.
      final savedName = profile.value?.name ?? '';
      if (savedName.isNotEmpty) {
        AuthService().setUserName(savedName);
      }

      isEditing.value = false;
      Get.snackbar("Success", "Profil mis à jour ✅");
    } catch (e) {
      Get.snackbar("Error", "Erreur lors de la mise à jour");
      debugPrint('❌ SAVE PROFILE ERROR: $e');
    }
  }

  @override
  void onClose() {
    nameCtrl.dispose();
    designationCtrl.dispose();
    emailCtrl.dispose();
    birthdayCtrl.dispose();
    phoneCtrl.dispose();
    countryCtrl.dispose();
    stateCtrl.dispose();
    addressCtrl.dispose();
    super.onClose();
  }
}