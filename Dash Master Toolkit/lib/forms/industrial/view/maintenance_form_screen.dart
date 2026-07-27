// lib/forms/industrial/view/maintenance_form_screen.dart
//
// Demande MAINTENANCE — un seul écran-carte, équipement + type de panne +
// urgence (3 gros choix colorés) + description.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../theme/industrial_theme.dart';
import 'package:dash_master_toolkit/services/maintenance_request_service.dart';

const _equipements = [
  'PROMESH — Machine 1', 'PROMESH — Machine 2', 'PROMESH — Machine 3', 'PROMESH — Machine 4',
  'PROBAR — Machine 1', 'PROBAR — Machine 2', 'PROBAR — Machine 3', 'PROBAR — Machine 4',
  'Mélangeur', 'Autre équipement',
];

class MaintenanceFormScreen extends StatefulWidget {
  const MaintenanceFormScreen({super.key});

  @override
  State<MaintenanceFormScreen> createState() => _MaintenanceFormScreenState();
}

class _MaintenanceFormScreenState extends State<MaintenanceFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _date = TextEditingController(text: DateFormat('yyyy-MM-dd').format(DateTime.now()));
  final _typePanne = TextEditingController();
  final _description = TextEditingController();
  final _equipementCtrl = TextEditingController(text: _equipements.first);
  String _urgence = 'moyenne';
  bool _saving = false;

  @override
  void dispose() {
    _date.dispose();
    _typePanne.dispose();
    _description.dispose();
    _equipementCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date.text) ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date.text = DateFormat('yyyy-MM-dd').format(picked));
  }

  static const _authorizedRequesterEmail = 'responsable_logistique@cbi-tunisia.com';

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    // Seul responsable_logistique@cbi-tunisia.com peut créer une demande de
    // maintenance — vérifié avant tout appel API (le backend revalide aussi,
    // ne jamais faire confiance uniquement au frontend).
    final currentEmail = (AuthService().userEmail ?? '').toLowerCase().trim();
    if (currentEmail != _authorizedRequesterEmail) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context)
              .translate("Vous n'êtes pas autorisé à créer une demande de maintenance.")),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      // Écrit dans maintenance_requests (même table/API que ADMINISTRATION >
      // Demandes > Maintenance) — plus jamais dans industrial_records, pour
      // que les deux écrans restent une seule et même source de données.
      await MaintenanceRequestService.instance.create(
        equipement: _equipementCtrl.text.trim(),
        typePanne: _typePanne.text.trim(),
        urgence: _urgence,
        description: _description.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              AppLocalizations.of(context).translate('Demande de maintenance envoyée'))));
      context.go(MyRoute.maintenanceHistoriqueScreen);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'),
          backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Form(
              key: _formKey,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(AppLocalizations.of(context).translate('Nouvelle demande de maintenance'),
                    style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: kCrmSurface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: kCrmBorder),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const CrmSectionTitle(title: 'Équipement concerné', icon: Icons.build_outlined),
                    const SizedBox(height: 8),
                    CrmStringDropdown(
                      label: 'Équipement',
                      controller: _equipementCtrl,
                      options: _equipements.map((e) => {'value': e, 'label': e}).toList(),
                      hint: 'Choisir un équipement',
                      required: true,
                      defaultValue: _equipements.first,
                    ),
                    CrmTextField(
                        label: 'Type de panne',
                        controller: _typePanne,
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? AppLocalizations.of(context).translate('Champ obligatoire')
                            : null),
                    const SizedBox(height: 4),
                    CrmDateField(label: 'Date', controller: _date, onTap: _pickDate, required: true),
                    const SizedBox(height: 8),
                    Text(AppLocalizations.of(context).translate('Urgence'),
                        style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText)),
                    const SizedBox(height: 8),
                    Wrap(spacing: 10, runSpacing: 10, children: [
                      _UrgenceChoice(label: 'Faible', value: 'faible', selected: _urgence, color: kCrmSuccess, onTap: (v) => setState(() => _urgence = v)),
                      _UrgenceChoice(label: 'Moyenne', value: 'moyenne', selected: _urgence, color: kCrmWarning, onTap: (v) => setState(() => _urgence = v)),
                      _UrgenceChoice(label: 'Critique', value: 'critique', selected: _urgence, color: kCrmDanger, onTap: (v) => setState(() => _urgence = v)),
                    ]),
                    CrmTextField(label: 'Description', controller: _description, maxLines: 4),
                  ]),
                ),
                const SizedBox(height: 20),
                IndustrialBigButton(
                  label: AppLocalizations.of(context).translate(_saving ? 'Envoi…' : 'Envoyer la demande'),
                  icon: Icons.send_rounded,
                  color: kMaintenanceColor,
                  onTap: _saving ? null : _save,
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _UrgenceChoice extends StatelessWidget {
  final String label;
  final String value;
  final String selected;
  final Color color;
  final void Function(String) onTap;

  const _UrgenceChoice({
    required this.label,
    required this.value,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isSel = selected == value;
    return InkWell(
      onTap: () => onTap(value),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          color: isSel ? color.withOpacity(0.12) : kCrmBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSel ? color : kCrmBorder, width: isSel ? 1.6 : 1),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.warning_amber_rounded, size: 16, color: isSel ? color : kCrmTextSub),
          const SizedBox(width: 6),
          Text(AppLocalizations.of(context).translate(label),
              style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: isSel ? color : kCrmTextSub)),
        ]),
      ),
    );
  }
}
