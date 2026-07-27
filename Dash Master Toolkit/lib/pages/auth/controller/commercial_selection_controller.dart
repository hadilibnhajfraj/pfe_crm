import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';
import '../../../providers/auth_service.dart';
import '../../../services/commercial_selection_api_service.dart';

class CommercialSelectionController extends GetxController {
  final _service = CommercialSelectionApiService.instance;

  // ── State ──────────────────────────────────────────────────────────────────
  final isLoading = true.obs;
  final hasError = false.obs;
  final users = <CommercialUserItem>[].obs;

  // Carte sélectionnée dans la liste API
  final selectedUser = Rxn<CommercialUserItem>();

  // Mode "Autre commercial" (champ texte libre)
  final isCustomMode = false.obs;
  final customNameController = TextEditingController();
  final customNameText = ''.obs; // mirror réactif du TextEditingController

  // Recherche dans la liste
  final searchQuery = ''.obs;
  final searchController = TextEditingController();

  // ── Getters ────────────────────────────────────────────────────────────────
  List<CommercialUserItem> get filtered {
    final q = searchQuery.value.toLowerCase().trim();
    if (q.isEmpty) return users;
    return users.where((u) => u.name.toLowerCase().contains(q)).toList();
  }

  String? get finalName {
    if (isCustomMode.value) {
      final t = customNameController.text.trim();
      return t.isEmpty ? null : t;
    }
    return selectedUser.value?.name;
  }

  bool get canConfirm => finalName != null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  @override
  void onInit() {
    super.onInit();
    _loadUsers();
    searchController.addListener(() => searchQuery.value = searchController.text);
    customNameController.addListener(() => customNameText.value = customNameController.text);
  }

  @override
  void onClose() {
    searchController.dispose();
    customNameController.dispose();
    super.onClose();
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  Future<void> reload() => _loadUsers();

  Future<void> _loadUsers() async {
    try {
      isLoading.value = true;
      hasError.value = false;
      final result = await _service.fetchCommercialUsers();
      users.assignAll(result);
      debugPrint('[CommercialCtrl] ${result.length} commerciaux chargés');
    } catch (e) {
      hasError.value = true;
      debugPrint('[CommercialCtrl] ERROR = $e');
    } finally {
      isLoading.value = false;
    }
  }

  void selectUser(CommercialUserItem user) {
    selectedUser.value = user;
    isCustomMode.value = false;
    customNameController.clear();
  }

  void toggleCustomMode() {
    isCustomMode.value = !isCustomMode.value;
    if (isCustomMode.value) {
      selectedUser.value = null;
    } else {
      customNameController.clear();
    }
  }

  /// Sauvegarde dans GetStorage — la navigation est gérée par l'écran.
  /// Retourne true si succès.
  bool confirm() {
    final name = finalName;
    if (name == null) return false;

    final id = isCustomMode.value
        ? name
        : (selectedUser.value?.id ?? name);

    final box = GetStorage();
    box.write('selectedCommercial', name);
    box.write('selectedCommercialId', id);

    // Compat. avec le système existant (user_nom pour les requêtes API)
    AuthService().setUserName(name.toLowerCase());

    print('COMMERCIAL CHOISI = $name');
    return true;
  }
}
