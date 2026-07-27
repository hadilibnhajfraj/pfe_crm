import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';
import '../../../providers/auth_service.dart';
import '../../../services/commercial_profile_api_service.dart';

class CommercialProfileController extends GetxController {
  final _service = CommercialProfileApiService.instance;

  // ── State ──────────────────────────────────────────────────────────────────
  final isLoading = true.obs;
  final hasError = false.obs;

  final profiles = <CommercialProfile>[].obs;

  /// Sélection dans la liste API (null si aucune)
  final selected = Rxn<CommercialProfile>();

  /// Champ texte "Autre commercial" (nom libre)
  final newNameController = TextEditingController();
  final newNameText = ''.obs;

  // ── Computed ───────────────────────────────────────────────────────────────
  /// Nom final : champ texte prioritaire, sinon sélection liste.
  String? get finalName {
    final custom = newNameController.text.trim();
    if (custom.isNotEmpty) return custom;
    return selected.value?.name;
  }

  bool get canConfirm => finalName != null;

  /// Label affiché sur le bouton Confirmer.
  String get confirmLabel {
    final name = finalName;
    return name != null ? 'Confirmer : $name' : 'Confirmer';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  @override
  void onInit() {
    super.onInit();
    loadProfiles();
    newNameController.addListener(() => newNameText.value = newNameController.text);
  }

  @override
  void onClose() {
    newNameController.dispose();
    super.onClose();
  }

  // ── GET /commercial-contacts/user-names/list ──────────────────────────────
  Future<void> loadProfiles() async {
    try {
      isLoading.value = true;
      hasError.value = false;
      final result = await _service.getProfiles();
      profiles.assignAll(result);
      debugPrint('[CommercialProfileCtrl] ${result.length} profils chargés');
    } catch (e) {
      hasError.value = true;
      debugPrint('[CommercialProfileCtrl] loadProfiles ERROR = $e');
    } finally {
      isLoading.value = false;
    }
  }

  // ── Enregistrement dans GetStorage ────────────────────────────────────────
  /// Sauvegarde dans GetStorage et retourne le nom, ou null si rien choisi.
  String? confirm() {
    final name = finalName;
    if (name == null) return null;

    final box = GetStorage();
    box.write('selectedCommercial', name);
    box.write('selectedCommercialId', name); // pas d'id distinct pour une string

    // Compat. user_nom pour les requêtes API existantes
    AuthService().setUserName(name.toLowerCase());

    print('COMMERCIAL CHOISI = $name');
    return name;
  }
}
