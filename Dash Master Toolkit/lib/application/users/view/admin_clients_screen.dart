import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controller/admin_clients_controller.dart';
import '../model/client_model.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class AdminClientsScreen extends StatelessWidget {
  AdminClientsScreen({super.key});

  final AdminClientsController controller =
      Get.put(AdminClientsController());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFF1D4ED8),
        foregroundColor: Colors.white,
        title: Text(
          AppLocalizations.of(context).translate('Customer management'),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: Obx(() {
        if (controller.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }

        if (!controller.isAdmin.value) {
          return Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 650),
              padding: const EdgeInsets.all(24),
              margin: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 18,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Text(
                controller.errorMessage.value,
                style: const TextStyle(
                  color: Colors.red,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          );
        }

        if (controller.errorMessage.value.isNotEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                controller.errorMessage.value,
                style: const TextStyle(
                  color: Colors.red,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          );
        }

        return Padding(
  padding: const EdgeInsets.all(20),
  child: ListView(
    children: [
      _buildTopCards(context),
      const SizedBox(height: 18),
      _buildSearchField(context),
      const SizedBox(height: 18),
      SizedBox(
        height: 700,
        child: _buildClientsTable(context),
      ),
    ],
  ),
);
      }),
    );
  }

  Widget _buildTopCards(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF0F172A), Color(0xFF1E3A8A)],
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Obx(
              () => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    AppLocalizations.of(context).translate('Total customers'),
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    '${controller.filteredClients.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF0F766E), Color(0xFF14B8A6)],
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppLocalizations.of(context).translate('Access'),
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  AppLocalizations.of(context).translate('Admin / Superadmin'),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSearchField(BuildContext context) {
    return TextField(
      controller: controller.searchController,
      onChanged: (_) => controller.filterClients(),
      decoration: InputDecoration(
        hintText: AppLocalizations.of(context)
            .translate('Search by code, company name, region, registration number...'),
        prefixIcon: const Icon(Icons.search),
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
      ),
    );
  }

Widget _buildClientsTable(BuildContext context) {
  return Obx(() {
    if (controller.filteredClients.isEmpty) {
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 18,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Center(
          child: Text(
            AppLocalizations.of(context).translate('No customers found.'),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          ),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        return Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 18,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Theme(
              data: Theme.of(context).copyWith(
                cardColor: Colors.white,
                dividerColor: Colors.grey.shade200,
              ),
              child: SizedBox(
                width: constraints.maxWidth,
                child: PaginatedDataTable(
                  header: Text(
                    AppLocalizations.of(context).translate('Customer list'),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  rowsPerPage: 10,
                  availableRowsPerPage: const [10, 20, 50],
                  showFirstLastButtons: true,
                  columnSpacing: 18,
                  horizontalMargin: 12,
                  headingRowColor:
                      const WidgetStatePropertyAll(Color(0xFFF1F5F9)),
                  columns: [
                    const DataColumn(label: Text('#')),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('ID'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Code'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Company name'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Address'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Postal code'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Region'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Created on'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Last invoice'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Regime'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Tax identification number'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('unique identifier'))),
                    DataColumn(label: Text(AppLocalizations.of(context).translate('Contact'))),
                  ],
                  source: ClientsDataSource(
                    clients: controller.filteredClients,
                    controller: controller,
                    context: context,
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  });
}
}

class ClientsDataSource extends DataTableSource {
  final List<ClientModel> clients;
  final AdminClientsController controller;
  final BuildContext context;

  ClientsDataSource({
    required this.clients,
    required this.controller,
    required this.context,
  });

  Widget _cellText(String? value, {double? width}) {
    return SizedBox(
      width: width,
      child: Text(
        controller.formatText(value),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  @override
  DataRow? getRow(int index) {
    if (index >= clients.length) return null;

    final client = clients[index];

    return DataRow.byIndex(
      index: index,
      cells: [
        DataCell(Text('${index + 1}')),
        DataCell(Text(client.id?.toString() ?? '-')),
        DataCell(_cellText(client.code, width: 90)),
        DataCell(_cellText(client.raisonSociale, width: 180)),
        DataCell(_cellText(client.adresse, width: 220)),
        DataCell(Text(controller.formatText(client.codePostal))),
        DataCell(
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFFE0F2FE),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              controller.formatText(client.region),
              style: const TextStyle(
                color: Color(0xFF0369A1),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        DataCell(Text(controller.formatText(client.creeLe))),
DataCell(
  Row(
    children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: controller
              .getFactureColor(client.derniereFacturation)
              .withOpacity(0.15),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          controller.formatDate(client.derniereFacturation),
          style: TextStyle(
            color: controller.getFactureColor(client.derniereFacturation),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // 🔥 Badge INACTIVE
      if (controller.isInactive(client.derniereFacturation))
        Container(
          margin: const EdgeInsets.only(left: 8),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.red.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            AppLocalizations.of(context).translate('Inactive'),
            style: const TextStyle(
              color: Colors.red,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
    ],
  ),
),
        DataCell(_cellText(client.regime, width: 110)),
        DataCell(_cellText(client.matriculeFiscal, width: 130)),
        DataCell(_cellText(client.identifiantUnique, width: 130)),
        DataCell(_cellText(client.contact, width: 170)),
      ],
    );
  }

  @override
  bool get isRowCountApproximate => false;

  @override
  int get rowCount => clients.length;

  @override
  int get selectedRowCount => 0;
}