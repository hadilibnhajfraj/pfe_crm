import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:dash_master_toolkit/application/users/controller/commercial_contact_create_controller.dart';
import 'package:go_router/go_router.dart';
import '../../../widgets/user_name_dialog.dart';
import '../../../providers/auth_service.dart';
class CommercialContactCreateScreen extends StatelessWidget {
  CommercialContactCreateScreen({super.key});

  final c = Get.put(CommercialContactCreateController());

  static const Color kPrimary = Color(0xFF1976D2);
  static const Color kPageBg = Color(0xFFF3F6FF);
  static const Color kCardBg = Colors.white;
  static const Color kFieldBg = Color(0xFFEAF0FF);
  static const Color kTextDark = Color(0xFF111827);
  static const Color kMuted = Color(0xFF6B7280);

  InputDecoration _dec(String label, String hint, IconData icon) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(icon, color: kPrimary),
      filled: true,
      fillColor: kFieldBg,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: kPrimary.withOpacity(.18)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: kPrimary, width: 1.3),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }

  Widget _sectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: kPrimary.withOpacity(.10),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, size: 18, color: kPrimary),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: kTextDark,
          ),
        ),
      ],
    );
  }

Widget _tf(
  String label,
  String hint,
  TextEditingController ctrl, {
  int maxLines = 1,
  TextInputType keyboardType = TextInputType.text,
  IconData icon = Icons.edit_outlined,
  bool readOnly = false,
  VoidCallback? onTap,
  Function(String)? onChanged, // ✅ ADD
}) {
  return TextField(
    controller: ctrl,
    maxLines: maxLines,
    keyboardType: keyboardType,
    readOnly: readOnly,
    onTap: onTap,
    onChanged: onChanged, // ✅ ADD
    decoration: _dec(label, hint, icon),
  );
}
Widget _buildProjectRow(BuildContext context, int index) {
  final project = c.projects[index];

  return Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFF8FAFC),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: kPrimary.withOpacity(.10)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                onChanged: (v) => c.projects[index].nomProjet = v,
                decoration: _dec(
                  "Project Name",
                  "Villa, Building...",
                  Icons.home_work_outlined,
                ),
              ),
            ),
            IconButton(
              onPressed: () => c.removeProjectRow(index),
              icon: const Icon(Icons.delete, color: Colors.red),
            )
          ],
        ),

        // ✅ Created by
        Padding(
          padding: const EdgeInsets.only(top: 6, left: 4),
          child: Obx(() => Text(
                "👤 Created by: ${c.userNom.value}",
                style: const TextStyle(
                  color: Colors.grey,
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                ),
              )),
        ),

        const SizedBox(height: 10),

        _tf("Location", "Tunis...",
            TextEditingController(text: project.localisation ?? ""),
            onChanged: (v) => c.projects[index].localisation = v),

        const SizedBox(height: 10),

        _tf("Type", "Residential...",
            TextEditingController(text: project.typeProjet ?? ""),
            onChanged: (v) => c.projects[index].typeProjet = v),

        const SizedBox(height: 10),

        _tf("Description", "Details...",
            TextEditingController(text: project.description ?? ""),
            maxLines: 3,
            onChanged: (v) => c.projects[index].description = v),
      ],
    ),
  );
}
  Widget _buildProduitRow(BuildContext context, int index) {
    final produit = c.produits[index];

    final produitCtrl = TextEditingController(text: produit.produit);
    final qteCtrl = TextEditingController(
      text: produit.qte.toString().replaceAll(".0", ""),
    );

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kPrimary.withOpacity(.10)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 3,
            child: TextField(
              controller: produitCtrl,
              onChanged: (v) => c.produits[index].produit = v,
              decoration: _dec(
                "Product",
                "Example: PROBAR",
                Icons.inventory_2_outlined,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 1,
            child: TextField(
              controller: qteCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              onChanged: (v) {
                c.produits[index].qte = double.tryParse(v) ?? 1;
              },
              decoration: _dec(
                "Quantity",
                "1",
                Icons.numbers_outlined,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: IconButton(
              tooltip: "Delete",
              onPressed: c.loading.value
                  ? null
                  : () => c.removeProduitRow(index),
              icon: const Icon(Icons.delete_outline, color: Colors.red),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F172A), Color(0xFF1D4ED8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Create Commercial Contact",
            style: TextStyle(
              color: Colors.white,
              fontSize: 25,
              fontWeight: FontWeight.w800,
            ),
          ),
          SizedBox(height: 8),
          Text(
            "Add client information, products, contact status and optional follow-up scheduling.",
            style: TextStyle(
              color: Colors.white70,
              fontSize: 14,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMainForm(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: kCardBg,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(.05),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [

          _sectionTitle("Client Information", Icons.person_outline),
          const SizedBox(height: 18),

Row(
  children: [
  Expanded(
  child: Obx(() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
        decoration: BoxDecoration(
          color: kFieldBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: kPrimary.withOpacity(.18)),
        ),
        child: Row(
          children: [
            const Icon(Icons.person, color: kPrimary),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                c.userNom.value,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: kTextDark,
                ),
              ),
            ),

            // 🔥 BONUS bouton changer user
            IconButton(
              icon: const Icon(Icons.edit, size: 18),
              onPressed: () async {
                await showUserNameDialog(context);

                // 🔥 refresh après popup
                final auth = Get.find<AuthService>();
                final newUser = auth.getUserName();

                if (newUser != null) {
                  c.userNom.value = newUser;
                }
              },
            )
          ],
        ),
      )),
),

    const SizedBox(width: 14),

    Expanded(
       child: Obx(() => DropdownButtonFormField<String>(
        value: c.typeClient.value,
        items: const [
          DropdownMenuItem(value: "Tuteur", child: Text("Supervisor")),
          DropdownMenuItem(value: "Cloture", child: Text("Closure")),
          DropdownMenuItem(value: "Batiment", child: Text("Batiment")),
        ],
        onChanged: c.loading.value
            ? null
            : (v) => c.typeClient.value = v ?? "autre",
        decoration: _dec(
          "Client Type",
          "Select",
          Icons.category_outlined,
        ),
      )),
    ),

    const SizedBox(width: 14),

    Expanded(
      child: Obx(() => DropdownButtonFormField<String>(
        value: c.statut.value,
        items: const [
          DropdownMenuItem(value: "ok", child: Text("OK")),
          DropdownMenuItem(
            value: "rappeler_plus_tard",
            child: Text("Call Later"),
          ),
          DropdownMenuItem(
            value: "user_injoignable",
            child: Text("Not Reachable"),
          ),
          DropdownMenuItem(
            value: "client_refuse",
            child: Text("Client Refused"),
          ),
        ],
        onChanged: c.loading.value
            ? null
            : (v) => c.statut.value = v ?? "user_injoignable",
        decoration: _dec(
          "Contact Status",
          "Select",
          Icons.flag_outlined,
        ),
      )),
    ),
  ],
),
           const SizedBox(height: 14),
// ✅ NOUVELLE ROW (séparée)
Row(
  children: [
    Expanded(
      child: _tf(
        "Call Date",
        "Select date",
        c.dateAppelCtrl,
        readOnly: true,
        icon: Icons.calendar_today_outlined,
        onTap: () async {
          final d = await showDatePicker(
            context: context,
            initialDate: DateTime.now(),
            firstDate: DateTime(2020),
            lastDate: DateTime(2030),
          );

          if (d != null) {
            c.dateAppel = d;
            c.dateAppelCtrl.text = "${d.day}/${d.month}/${d.year}";
          }
        },
      ),
    ),

    const SizedBox(width: 14),

    Expanded(
      child: Obx(() => DropdownButtonFormField<String>(
        value: c.pipelineStage.value,
        items: const [
          DropdownMenuItem(value: "Prospect", child: Text("Prospect")),
          DropdownMenuItem(value: "Plan technique", child: Text("Plan technique")),
          DropdownMenuItem(value: "Echantillonnage", child: Text("Echantillonnage")),
          DropdownMenuItem(value: "Devis envoyé", child: Text("Devis envoyé")),
          DropdownMenuItem(value: "Negociation", child: Text("Négociation")),
          DropdownMenuItem(value: "Relance", child: Text("Relance")),
          DropdownMenuItem(value: "Gagné", child: Text("Commande gagnée")),
          DropdownMenuItem(value: "Perdu", child: Text("Commande perdue")),
        ],
        onChanged: (v) => c.pipelineStage.value = v ?? "Prospect",
        decoration: _dec("Next Action", "Select", Icons.timeline_outlined),
      )),
    ),
  ],
),
          const SizedBox(height: 14),

          Row(
            children: [
              Expanded(
                child: _tf(
                  "Last Name",
                  "Example: Ben Salah",
                  c.nomCtrl,
                  icon: Icons.badge_outlined,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: _tf(
                  "First Name",
                  "Example: Ali",
                  c.prenomCtrl,
                  icon: Icons.person_outline,
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          Row(
            children: [
              Expanded(
                child: _tf(
                  "Company",
                  "Example: CBI Tunisia",
                  c.nomSocieteCtrl,
                  icon: Icons.business_outlined,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: _tf(
                  "Phone",
                  "Example: 22123456",
                  c.telephoneCtrl,
                  keyboardType: TextInputType.phone,
                  icon: Icons.phone_outlined,
                ),
              ),
         SizedBox(
  width: 250,
  child: _tf(
    "Matricule Fiscale",
    "Ex: 1234567AAM000",
    c.matriculeFiscaleCtrl,
  ),
),
            ],
          ),

          const SizedBox(height: 14),
           _tf(
  "Email",
  "example@email.com",
  c.emailCtrl,
  keyboardType: TextInputType.emailAddress,
  icon: Icons.email_outlined,
),
          _tf(
            "Location",
            "Example: Tunis, Sousse...",
            c.localisationCtrl,
            icon: Icons.location_on_outlined,
          ),

          const SizedBox(height: 14),

          _tf(
            "Message / Notes",
            "Additional information",
            c.messageCtrl,
            maxLines: 4,
            icon: Icons.notes_outlined,
          ),

          const SizedBox(height: 28),
          _sectionTitle("Products", Icons.inventory_2_outlined),
          const SizedBox(height: 16),

          Obx(
            () => Column(
              children: List.generate(
                c.produits.length,
                (index) => _buildProduitRow(context, index),
              ),
            ),
          ),

          OutlinedButton.icon(
            onPressed: c.loading.value ? null : c.addProduitRow,
            icon: const Icon(Icons.add),
            label: const Text("Add Product"),
          ),
const SizedBox(height: 28),
_sectionTitle("Projects", Icons.home_work_outlined),
const SizedBox(height: 16),

Obx(
  () => Column(
    children: List.generate(
      c.projects.length,
      (index) => _buildProjectRow(context, index),
    ),
  ),
),

OutlinedButton.icon(
  onPressed: c.loading.value ? null : c.addProjectRow,
  icon: const Icon(Icons.add),
  label: const Text("Add Project"),
),
          const SizedBox(height: 30),

          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: () async {

  final success = await c.submit();

  if (!context.mounted) return;

  if (success == true) {

    context.go('/users/commercial-contacts');

  }
},
              style: ElevatedButton.styleFrom(
                backgroundColor: kPrimary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: const Icon(Icons.save_outlined),
              label: const Text(
                "Save Contact",
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kPageBg,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: kPrimary,
        foregroundColor: Colors.white,
        title: const Text(
          "New Commercial Contact",
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeaderCard(),
                  const SizedBox(height: 18),
                  _buildMainForm(context),
                  const SizedBox(height: 20),
                  const Center(
                    child: Text(
                      "Commercial Management • Contacts • Follow-ups",
                      style: TextStyle(
                        color: kMuted,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}