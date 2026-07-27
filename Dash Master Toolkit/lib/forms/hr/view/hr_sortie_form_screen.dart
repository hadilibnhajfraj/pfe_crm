// lib/forms/hr/view/hr_sortie_form_screen.dart
//
// Formulaire "Autorisation de sortie" — TOUJOURS affiché, même si le profil
// RH de l'employé est incomplet : les champs déjà connus sont préremplis et
// verrouillés, les champs manquants deviennent éditables (voir
// EmployeeFieldsSection). Un bandeau d'information (non bloquant) prévient
// simplement l'utilisateur. Le bouton d'envoi reste désactivé tant que des
// champs obligatoires sont vides — jamais le formulaire n'est masqué.
// Statut, date de création et signature sont calculés automatiquement.

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/utils/common.dart' show formatTime24h;
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../theme/hr_theme.dart';
import '../model/employee_profile_model.dart';
import '../model/hr_request_model.dart';
import '../service/employee_profile_service.dart';
import '../service/hr_request_service.dart';
import 'widgets/employee_fields_section.dart';
import 'widgets/profile_incomplete_banner.dart';

class HrSortieFormScreen extends StatefulWidget {
  const HrSortieFormScreen({super.key});

  @override
  State<HrSortieFormScreen> createState() => _HrSortieFormScreenState();
}

class _HrSortieFormScreenState extends State<HrSortieFormScreen> {
  final _formKey = GlobalKey<FormState>();

  bool _loadingProfile = true;
  bool _saving = false;
  String? _loadError;
  EmployeeProfileModel _profile = const EmployeeProfileModel();

  // Verrou des champs employé — figé au chargement, ne change jamais après.
  bool _nomLocked = false;
  bool _prenomLocked = false;
  bool _matriculeLocked = false;
  bool _qualificationLocked = false;
  bool _departementLocked = false;
  bool _serviceLocked = false;

  final _nom = TextEditingController();
  final _prenom = TextEditingController();
  final _matricule = TextEditingController();
  final _qualification = TextEditingController();
  final _departement = TextEditingController();
  final _service = TextEditingController();

  DateTime? _date;
  TimeOfDay? _heureSortie;
  TimeOfDay? _heureRetour;
  String? _heureRetourError;

  final _motif = TextEditingController();
  final _commentaire = TextEditingController();
  final _dateCtrl = TextEditingController();
  final _heureSortieCtrl = TextEditingController();
  final _heureRetourCtrl = TextEditingController();
  final List<HrJustificatifFile> _justificatifs = [];

  static final _dateFmt = DateFormat('dd/MM/yyyy');

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _nom.dispose();
    _prenom.dispose();
    _matricule.dispose();
    _qualification.dispose();
    _departement.dispose();
    _service.dispose();
    _motif.dispose();
    _commentaire.dispose();
    _dateCtrl.dispose();
    _heureSortieCtrl.dispose();
    _heureRetourCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _loadingProfile = true;
      _loadError = null;
    });
    // Le formulaire doit rester utilisable même si le profil ne peut pas
    // être chargé — dans ce cas tous les champs employé deviennent
    // simplement éditables (comme un profil vide).
    var profile = const EmployeeProfileModel();
    try {
      profile = await EmployeeProfileService.instance.fetchMyProfile();
    } catch (e) {
      _loadError = e.toString();
    }

    _profile = profile;
    _nomLocked = (profile.nom ?? '').trim().isNotEmpty;
    _prenomLocked = (profile.prenom ?? '').trim().isNotEmpty;
    _matriculeLocked = (profile.matricule ?? '').trim().isNotEmpty;
    _qualificationLocked = (profile.qualification ?? '').trim().isNotEmpty;
    _departementLocked = (profile.departement ?? '').trim().isNotEmpty;
    _serviceLocked = (profile.service ?? '').trim().isNotEmpty;
    _nom.text = profile.nom ?? '';
    _prenom.text = profile.prenom ?? '';
    _matricule.text = profile.matricule ?? '';
    _qualification.text = profile.qualification ?? '';
    _departement.text = profile.departement ?? '';
    _service.text = profile.service ?? '';

    if (mounted) setState(() => _loadingProfile = false);
  }

  void _onAnyFieldChanged(String _) => setState(() {});

  bool get _canSubmit {
    return _motif.text.trim().isNotEmpty &&
        _date != null &&
        _heureSortie != null &&
        _heureRetour != null &&
        _heureRetourError == null &&
        _nom.text.trim().isNotEmpty &&
        _prenom.text.trim().isNotEmpty &&
        _matricule.text.trim().isNotEmpty &&
        _qualification.text.trim().isNotEmpty &&
        _departement.text.trim().isNotEmpty &&
        _service.text.trim().isNotEmpty;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null) return;
    setState(() {
      _date = picked;
      _dateCtrl.text = _dateFmt.format(picked);
    });
  }

  void _recomputeHeureError() {
    if (_heureSortie != null && _heureRetour != null) {
      final sortieMin = _heureSortie!.hour * 60 + _heureSortie!.minute;
      final retourMin = _heureRetour!.hour * 60 + _heureRetour!.minute;
      _heureRetourError = retourMin <= sortieMin ? AppLocalizations.of(context).translate("L'heure de retour doit être après l'heure de sortie") : null;
    } else {
      _heureRetourError = null;
    }
  }

  Future<void> _pickTime({required bool isSortie}) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: (isSortie ? _heureSortie : _heureRetour) ?? TimeOfDay.now(),
    );
    if (picked == null) return;
    setState(() {
      if (isSortie) {
        _heureSortie = picked;
        _heureSortieCtrl.text = formatTime24h(picked);
      } else {
        _heureRetour = picked;
        _heureRetourCtrl.text = formatTime24h(picked);
      }
      _recomputeHeureError();
    });
  }

  Future<void> _pickJustificatifs() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
      withData: true,
      allowMultiple: true,
    );
    if (res == null || res.files.isEmpty) return;
    setState(() {
      for (final f in res.files) {
        if (f.bytes != null && _justificatifs.length < 5) {
          _justificatifs.add(HrJustificatifFile(bytes: f.bytes!, filename: f.name));
        }
      }
    });
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _saving = true);
    try {
      final model = HrRequestModel(
        type: 'sortie',
        employeeNom: _nom.text.trim(),
        employeePrenom: _prenom.text.trim(),
        employeeMatricule: _matricule.text.trim(),
        employeeQualification: _qualification.text.trim(),
        employeeDepartement: _departement.text.trim(),
        employeeService: _service.text.trim(),
        motif: _motif.text.trim(),
        dateSortie: DateFormat('yyyy-MM-dd').format(_date!),
        heureSortie: formatTime24h(_heureSortie!),
        heureRetour: formatTime24h(_heureRetour!),
        commentaire: _commentaire.text.trim(),
      );
      final saved = await HrRequestService.instance.create(model, justificatifs: _justificatifs);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(AppLocalizations.of(context).translate('Autorisation de sortie envoyée avec succès')),
        backgroundColor: kHrAccepted,
      ));
      context.go('${MyRoute.hrDetailScreen}?id=${saved.id}');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kHrRefused));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileIncomplete = !_profile.isComplete;

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                InkWell(
                  onTap: () => context.go(MyRoute.hrRoot),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration:
                        BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: kHrAccepted.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                  child: const Text('🚪', style: TextStyle(fontSize: 20)),
                ),
                const SizedBox(width: 10),
                Text(AppLocalizations.of(context).translate('Autorisation de sortie'), style: tInter(fontSize: 18, fontWeight: FontWeight.w900, color: kCrmText)),
              ]),
              const SizedBox(height: 20),
              if (_loadingProfile)
                const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: CircularProgressIndicator()))
              else ...[
                if (_loadError != null) ...[
                  Text('${AppLocalizations.of(context).translate('Profil non chargé')} ($_loadError) — ${AppLocalizations.of(context).translate('vous pouvez tout de même compléter le formulaire.')}',
                      style: tInter(fontSize: 11.5, color: kHrRefused)),
                  const SizedBox(height: 10),
                ],
                if (profileIncomplete) ...[
                  const ProfileIncompleteBanner(),
                  const SizedBox(height: 16),
                ],

                EmployeeFieldsSection(
                  nom: _nom,
                  prenom: _prenom,
                  matricule: _matricule,
                  qualification: _qualification,
                  departement: _departement,
                  service: _service,
                  email: _profile.email,
                  onFieldChanged: _onAnyFieldChanged,
                  nomLocked: _nomLocked,
                  prenomLocked: _prenomLocked,
                  matriculeLocked: _matriculeLocked,
                  qualificationLocked: _qualificationLocked,
                  departementLocked: _departementLocked,
                  serviceLocked: _serviceLocked,
                ),
                const SizedBox(height: 20),
                Form(
                  key: _formKey,
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: kCrmSurface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: kCrmBorder),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))],
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      CrmTextField(
                        label: 'Motif',
                        controller: _motif,
                        onChanged: _onAnyFieldChanged,
                        validator: (v) => (v == null || v.trim().isEmpty) ? AppLocalizations.of(context).translate('Motif requis') : null,
                      ),
                      CrmDateField(label: 'Date', controller: _dateCtrl, required: true, onTap: _pickDate),
                      crmTwoCols(
                        isMobile: MediaQuery.of(context).size.width < 700,
                        left: CrmTextField(
                          label: 'Heure sortie',
                          controller: _heureSortieCtrl,
                          readOnly: true,
                          onTap: () => _pickTime(isSortie: true),
                          suffixWidget: const Icon(Icons.schedule_rounded, size: 18, color: kCrmTextSub),
                          validator: (v) => (v == null || v.trim().isEmpty) ? AppLocalizations.of(context).translate('Heure de sortie requise') : null,
                        ),
                        right: CrmTextField(
                          label: 'Heure retour',
                          controller: _heureRetourCtrl,
                          readOnly: true,
                          onTap: () => _pickTime(isSortie: false),
                          suffixWidget: const Icon(Icons.schedule_rounded, size: 18, color: kCrmTextSub),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return AppLocalizations.of(context).translate('Heure de retour requise');
                            return _heureRetourError;
                          },
                        ),
                      ),
                      if (_heureRetourError != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(_heureRetourError!, style: tInter(fontSize: 12, color: kHrRefused)),
                        ),
                      CrmTextField(label: 'Commentaire (optionnel)', controller: _commentaire, maxLines: 3),
                    ]),
                  ),
                ),
                const SizedBox(height: 16),

                // ── Justificatifs (facultatif) ──────────────────────────────
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: kCrmSurface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: kCrmBorder),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))],
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(AppLocalizations.of(context).translate('Justificatifs (facultatif, max 5)'),
                        style: tInter(fontSize: 14, fontWeight: FontWeight.w900, color: kCrmText)),
                    const SizedBox(height: 12),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      ..._justificatifs.asMap().entries.map((e) => Chip(
                            label: Text(e.value.filename, style: tInter(fontSize: 11)),
                            onDeleted: () => setState(() => _justificatifs.removeAt(e.key)),
                          )),
                      if (_justificatifs.length < 5)
                        ActionChip(
                          avatar: const Icon(Icons.add_rounded, size: 16),
                          label: Text(AppLocalizations.of(context).translate('Ajouter un fichier'), style: tInter(fontSize: 12)),
                          onPressed: _pickJustificatifs,
                        ),
                    ]),
                  ]),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: IndustrialBigButton(
                    label: AppLocalizations.of(context).translate(_saving ? 'Envoi en cours…' : 'Envoyer la demande'),
                    icon: Icons.send_rounded,
                    color: kHrAccepted,
                    onTap: (_saving || !_canSubmit) ? null : _submit,
                  ),
                ),
              ],
              const SizedBox(height: 20),
            ]),
          ),
        ),
      ),
    );
  }
}
