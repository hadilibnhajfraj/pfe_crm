// lib/forms/industrial/view/probar_form_screen.dart
//
// Fiche PROBAR — un seul écran-carte (pas de wizard), machine/poste
// préremplis depuis la page Machine (?machine=&poste=).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../theme/industrial_theme.dart';
import '../model/industrial_record_model.dart';
import '../service/industrial_record_service.dart';

class ProbarFormScreen extends StatefulWidget {
  const ProbarFormScreen({super.key});

  @override
  State<ProbarFormScreen> createState() => _ProbarFormScreenState();
}

class _ProbarFormScreenState extends State<ProbarFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _date = TextEditingController(text: DateFormat('yyyy-MM-dd').format(DateTime.now()));
  final _operateur = TextEditingController();
  final _quantite = TextEditingController();
  final _observations = TextEditingController();
  String? _statutQualite; // 'ok' | 'nok'
  String? _machine;
  String? _poste;
  bool _saving = false;
  bool _readQueryOnce = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_readQueryOnce) return;
    _readQueryOnce = true;
    final qp = GoRouterState.of(context).uri.queryParameters;
    _machine = qp['machine'];
    _poste = qp['poste'];
  }

  @override
  void dispose() {
    _date.dispose();
    _operateur.dispose();
    _quantite.dispose();
    _observations.dispose();
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

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      final model = IndustrialRecordModel(
        module: 'probar',
        machine: _machine,
        poste: _poste,
        dateFiche: _date.text.trim(),
        operateur: _operateur.text.trim(),
        quantiteProduite: double.tryParse(_quantite.text.replaceAll(',', '.')),
        statutQualite: _statutQualite,
        observations: _observations.text.trim(),
      );
      await IndustrialRecordService.instance.create(model);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context).translate('Fiche PROBAR enregistrée'))));
      context.go(_machine != null ? MyRoute.productionProbarRoot : MyRoute.probarFormScreen);
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
                Text(AppLocalizations.of(context).translate('Nouvelle fiche PROBAR'),
                    style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  if (_machine != null)
                    IndustrialInfoChip(
                        icon: Icons.precision_manufacturing_outlined,
                        label: '${AppLocalizations.of(context).translate('Machine')} $_machine',
                        color: kProbarColor),
                  if (_poste != null)
                    IndustrialInfoChip(
                      icon: _poste == 'matin' ? Icons.wb_sunny_rounded : Icons.nightlight_round,
                      label: AppLocalizations.of(context)
                          .translate(_poste == 'matin' ? 'Poste Matin' : 'Poste Nuit'),
                      color: kProbarColor,
                    ),
                ]),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: kCrmSurface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: kCrmBorder),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const CrmSectionTitle(title: 'Informations de production', icon: Icons.factory_outlined),
                    const SizedBox(height: 8),
                    crmTwoCols(
                      isMobile: false,
                      left: CrmDateField(label: 'Date', controller: _date, onTap: _pickDate, required: true),
                      right: CrmTextField(label: 'Opérateur', controller: _operateur),
                    ),
                    CrmTextField(
                      label: 'Quantité produite',
                      controller: _quantite,
                      keyboardType: TextInputType.number,
                    ),
                    const SizedBox(height: 8),
                    Text(AppLocalizations.of(context).translate('Statut qualité'),
                        style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText)),
                    const SizedBox(height: 8),
                    Wrap(spacing: 10, children: [
                      _QualiteChoice(label: 'OK', selected: _statutQualite == 'ok', color: kCrmSuccess, onTap: () => setState(() => _statutQualite = 'ok')),
                      _QualiteChoice(label: 'NOK', selected: _statutQualite == 'nok', color: kCrmDanger, onTap: () => setState(() => _statutQualite = 'nok')),
                    ]),
                    CrmTextField(label: 'Observations', controller: _observations, maxLines: 3),
                  ]),
                ),
                const SizedBox(height: 20),
                IndustrialBigButton(
                  label: AppLocalizations.of(context)
                      .translate(_saving ? 'Enregistrement…' : 'Enregistrer la fiche'),
                  icon: Icons.check_rounded,
                  color: kProbarColor,
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

class _QualiteChoice extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  const _QualiteChoice({required this.label, required this.selected, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? color.withOpacity(0.12) : kCrmBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? color : kCrmBorder, width: selected ? 1.6 : 1),
        ),
        child: Text(AppLocalizations.of(context).translate(label),
            style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: selected ? color : kCrmTextSub)),
      ),
    );
  }
}
