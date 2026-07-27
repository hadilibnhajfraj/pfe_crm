import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:dash_master_toolkit/application/users/model/client_model.dart';
import 'package:dash_master_toolkit/services/client_service.dart';

class AdminClientsController extends GetxController {
  final ClientService _service = ClientService();

  final RxBool isLoading = true.obs;
  final RxBool isAdmin = false.obs;
  final RxString errorMessage = ''.obs;

  final RxList<ClientModel> clients = <ClientModel>[].obs;
  final RxList<ClientModel> filteredClients = <ClientModel>[].obs;

  final TextEditingController searchController = TextEditingController();

  @override
  void onInit() {
    super.onInit();
    searchController.addListener(filterClients);
    loadClients();
  }
String formatDate(String? date) {
  if (date == null || date.isEmpty) return '-';

  try {
    final d = DateTime.parse(date);
    return "${d.day.toString().padLeft(2, '0')}/"
        "${d.month.toString().padLeft(2, '0')}/"
        "${d.year}";
  } catch (e) {
    return date;
  }
}
bool isInactive(String? date) {
  if (date == null || date.isEmpty) return true;

  try {
    final d = DateTime.parse(date);
    final now = DateTime.now();

    return now.difference(d).inDays > 90; // > 3 mois
  } catch (e) {
    return true;
  }
}
Color getFactureColor(String? date) {
  if (date == null || date.isEmpty) return Colors.grey;

  final d = DateTime.parse(date);
  final now = DateTime.now();
  final diff = now.difference(d).inDays;

  if (diff < 30) return Colors.green;
  if (diff < 90) return Colors.orange;
  return Colors.red;
}
  Future<void> loadClients() async {
    try {
      isLoading.value = true;
      errorMessage.value = '';

      final role = await _service.getRole();
      print('ROLE DANS CONTROLLER = $role');

      if (role != 'admin' && role != 'superadmin' && role != 'superadmin2' && role != 'commercial') {
        isAdmin.value = false;
        errorMessage.value =
            "Accès refusé. Seuls admin et superadmin peuvent consulter cette page.";
        return;
      }

      isAdmin.value = true;

      final data = await _service.getAllClients();
      clients.assignAll(data);
      filteredClients.assignAll(data);
    } catch (e) {
      errorMessage.value = e.toString();
      print('ERREUR LOAD CLIENTS = $e');
    } finally {
      isLoading.value = false;
    }
  }

  void filterClients() {
    final query = searchController.text.toLowerCase().trim();

    if (query.isEmpty) {
      filteredClients.assignAll(clients);
      return;
    }

   filteredClients.assignAll(
  clients.where((client) {
    return (client.code ?? '').toLowerCase().contains(query) ||
        (client.raisonSociale ?? '').toLowerCase().contains(query) ||
        (client.adresse ?? '').toLowerCase().contains(query) ||
        (client.region ?? '').toLowerCase().contains(query) ||
        (client.matriculeFiscal ?? '').toLowerCase().contains(query) ||
        (client.identifiantUnique ?? '').toLowerCase().contains(query) ||
        (client.contact ?? '').toLowerCase().contains(query) ||
        (client.derniereFacturation ?? '').toLowerCase().contains(query); // ✅ AJOUT
  }).toList(),
);
  }

  String formatText(String? value) {
    if (value == null || value.trim().isEmpty) return '-';
    return value;
  }

  @override
  void onClose() {
    searchController.dispose();
    super.onClose();
  }
}