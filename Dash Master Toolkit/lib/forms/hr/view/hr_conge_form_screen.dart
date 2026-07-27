// lib/forms/hr/view/hr_conge_form_screen.dart
//
// Formulaire "Demande de congé" — TOUJOURS affiché, même si le profil RH de
// l'employé est incomplet : les champs déjà connus sont préremplis et
// verrouillés, les champs manquants deviennent éditables pour que
// l'utilisateur les complète lui-même (voir EmployeeFieldsSection). Un
// bandeau d'information (non bloquant) prévient simplement l'utilisateur.
// Le bouton d'envoi reste désactivé tant que des champs obligatoires sont
// vides — jamais le formulaire entier n'est masqué.
//
// Le nombre de jours OUVRABLES (lundi-vendredi), l'année, la date de la
// demande, le statut et la signature sont calculés automatiquement — jamais
// saisis. La partie "Titre de congé" du document officiel (Accord / Refus /
// Signature du supérieur) n'est jamais montrée ni demandée ici.

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../theme/hr_theme.dart';
import '../model/employee_profile_model.dart';
import '../model/hr_request_model.dart';
import '../service/employee_profile_service.dart';
import '../service/hr_request_service.dart';
import 'widgets/employee_fields_section.dart';
import 'widgets/profile_incomplete_banner.dart';

const _kPhonePattern = r'^[0-9+\-() .]{6,20}$';

class HrCongeFormScreen extends StatefulWidget {
  const HrCongeFormScreen({super.key});

  @override
  State<HrCongeFormScreen> createState() => _HrCongeFormScreenState();
}

class _HrCongeFormScreenState extends State<HrCongeFormScreen> {
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

  String? _typeConge; // 'ordinaire' | 'maladie'
  bool _typeError = false;
  DateTime? _dateDebut;
  DateTime? _dateFin;
  String? _dateFinError;

  final _adresse = TextEditingController();
  final _telephone = TextEditingController();
  final _commentaire = TextEditingController();
  final _dateDebutCtrl = TextEditingController();
  final _dateFinCtrl = TextEditingController();
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
    _adresse.dispose();
    _telephone.dispose();
    _commentaire.dispose();
    _dateDebutCtrl.dispose();
    _dateFinCtrl.dispose();
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

  /// Jours ouvrables (lundi-vendredi), bornes incluses — même méthode de
  /// calcul que le backend (`countBusinessDays`), aucun jour férié exclu.
  int? get _joursOuvrables {
    if (_dateDebut == null || _dateFin == null) return null;
    if (_dateFin!.isBefore(_dateDebut!)) return null;
    var count = 0;
    var d = DateTime(_dateDebut!.year, _dateDebut!.month, _dateDebut!.day);
    final end = DateTime(_dateFin!.year, _dateFin!.month, _dateFin!.day);
    while (!d.isAfter(end)) {
      if (d.weekday != DateTime.saturday && d.weekday != DateTime.sunday) count++;
      d = d.add(const Duration(days: 1));
    }
    return count;
  }

  bool get _phoneValid => RegExp(_kPhonePattern).hasMatch(_telephone.text.trim());

  /// Le bouton "Envoyer la demande" reste désactivé tant qu'un champ
  /// obligatoire est vide — jamais le formulaire n'est masqué pour autant.
  bool get _canSubmit {
    return _typeConge != null &&
        _dateDebut != null &&
        _dateFin != null &&
        !_dateFin!.isBefore(_dateDebut!) &&
        _nom.text.trim().isNotEmpty &&
        _prenom.text.trim().isNotEmpty &&
        _matricule.text.trim().isNotEmpty &&
        _qualification.text.trim().isNotEmpty &&
        _departement.text.trim().isNotEmpty &&
        _service.text.trim().isNotEmpty &&
        _adresse.text.trim().isNotEmpty &&
        _telephone.text.trim().isNotEmpty &&
        _phoneValid;
  }

  void _onAnyFieldChanged(String _) => setState(() {});

  Future<void> _pickDate({required bool isDebut}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: (isDebut ? _dateDebut : _dateFin) ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (picked == null) return;
    setState(() {
      if (isDebut) {
        _dateDebut = picked;
        _dateDebutCtrl.text = _dateFmt.format(picked);
      } else {
        _dateFin = picked;
        _dateFinCtrl.text = _dateFmt.format(picked);
      }
      _dateFinError = (_dateDebut != null && _dateFin != null && _dateFin!.isBefore(_dateDebut!))
          ? AppLocalizations.of(context).translate('La date de fin doit être postérieure ou égale à la date de début')
          : null;
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
    setState(() => _typeError = _typeConge == null);
    if (!_canSubmit) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _saving = true);
    try {
      final model = HrRequestModel(
        type: 'conge',
        employeeNom: _nom.text.trim(),
        employeePrenom: _prenom.text.trim(),
        employeeMatricule: _matricule.text.trim(),
        employeeQualification: _qualification.text.trim(),
        employeeDepartement: _departement.text.trim(),
        employeeService: _service.text.trim(),
        typeConge: _typeConge,
        dateDebut: DateFormat('yyyy-MM-dd').format(_dateDebut!),
        dateFin: DateFormat('yyyy-MM-dd').format(_dateFin!),
        adresse: _adresse.text.trim(),
        telephone: _telephone.text.trim(),
        commentaire: _commentaire.text.trim(),
      );
      final saved = await HrRequestService.instance.create(model, justificatifs: _justificatifs);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(AppLocalizations.of(context).translate('Demande de congé envoyée avec succès')),
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
    final isMobile = MediaQuery.of(context).size.width < 700;
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
                  decoration: BoxDecoration(color: kHrColor.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                  child: const Text('🏖️', style: TextStyle(fontSize: 20)),
                ),
                const SizedBox(width: 10),
                Text(AppLocalizations.of(context).translate('Demande de congé'), style: tInter(fontSize: 18, fontWeight: FontWeight.w900, color: kCrmText)),
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

                // ── Section : Type de congé ─────────────────────────────────
                _Section(
                  icon: Icons.category_outlined,
                  title: 'Type de congé',
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    isMobile
                        ? Column(children: [
                            _TypeCongeCard(
                              emoji: '🏖️',
                              label: 'Congé ordinaire',
                              selected: _typeConge == 'ordinaire',
                              onTap: () => setState(() {
                                _typeConge = 'ordinaire';
                                _typeError = false;
                              }),
                            ),
                            const SizedBox(height: 12),
                            _TypeCongeCard(
                              emoji: '🤒',
                              label: 'Congé maladie',
                              selected: _typeConge == 'maladie',
                              onTap: () => setState(() {
                                _typeConge = 'maladie';
                                _typeError = false;
                              }),
                            ),
                          ])
                        : Row(children: [
                            Expanded(
                              child: _TypeCongeCard(
                                emoji: '🏖️',
                                label: 'Congé ordinaire',
                                selected: _typeConge == 'ordinaire',
                                onTap: () => setState(() {
                                  _typeConge = 'ordinaire';
                                  _typeError = false;
                                }),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _TypeCongeCard(
                                emoji: '🤒',
                                label: 'Congé maladie',
                                selected: _typeConge == 'maladie',
                                onTap: () => setState(() {
                                  _typeConge = 'maladie';
                                  _typeError = false;
                                }),
                              ),
                            ),
                          ]),
                    if (_typeError) ...[
                      const SizedBox(height: 8),
                      Text(AppLocalizations.of(context).translate('Choisissez un type de congé'), style: tInter(fontSize: 12, color: kHrRefused)),
                    ],
                  ]),
                ),
                const SizedBox(height: 16),

                // ── Section : Dates du congé ────────────────────────────────
                _Section(
                  icon: Icons.event_note_outlined,
                  title: 'Dates du congé',
                  child: Form(
                    key: _formKey,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      crmTwoCols(
                        isMobile: isMobile,
                        left: CrmDateField(label: 'Date début', controller: _dateDebutCtrl, required: true, onTap: () => _pickDate(isDebut: true)),
                        right: CrmDateField(
                          label: 'Date fin',
                          controller: _dateFinCtrl,
                          required: true,
                          onTap: () => _pickDate(isDebut: false),
                          validator: (_) => _dateFinError,
                        ),
                      ),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(color: kHrColor.withOpacity(0.08), borderRadius: BorderRadius.circular(14)),
                        child: Row(children: [
                          const Icon(Icons.event_available_rounded, color: kHrColor, size: 22),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(AppLocalizations.of(context).translate('Jours ouvrables calculés automatiquement'),
                                style: tInter(fontSize: 12.5, color: kCrmText)),
                          ),
                          Text(_joursOuvrables == null ? '—' : '$_joursOuvrables',
                              style: tInter(fontSize: 24, fontWeight: FontWeight.w900, color: kHrColor)),
                        ]),
                      ),

                      // ── Section : Coordonnées pendant le congé ────────────
                      const SizedBox(height: 20),
                      Text(AppLocalizations.of(context).translate('Coordonnées pendant le congé'),
                          style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmTextSub)),
                      const SizedBox(height: 4),
                      CrmTextField(
                        label: 'Adresse pendant le congé',
                        controller: _adresse,
                        onChanged: _onAnyFieldChanged,
                        validator: (v) => (v == null || v.trim().isEmpty) ? AppLocalizations.of(context).translate('Adresse requise') : null,
                      ),
                      CrmTextField(
                        label: 'Téléphone',
                        controller: _telephone,
                        keyboardType: TextInputType.phone,
                        onChanged: _onAnyFieldChanged,
                        validator: (v) {
                          final t = (v ?? '').trim();
                          if (t.isEmpty) return AppLocalizations.of(context).translate('Téléphone requis');
                          if (!RegExp(_kPhonePattern).hasMatch(t)) return AppLocalizations.of(context).translate('Numéro de téléphone invalide');
                          return null;
                        },
                      ),
                      CrmTextField(label: 'Commentaire (optionnel)', controller: _commentaire, maxLines: 3),
                    ]),
                  ),
                ),
                const SizedBox(height: 16),

                // ── Section : Justificatifs (facultatif) ────────────────────
                _Section(
                  icon: Icons.attach_file_rounded,
                  title: 'Justificatifs (facultatif, max 5)',
                  child: Wrap(spacing: 8, runSpacing: 8, children: [
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
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: IndustrialBigButton(
                    label: AppLocalizations.of(context).translate(_saving ? 'Envoi en cours…' : 'Envoyer la demande'),
                    icon: Icons.send_rounded,
                    color: kHrColor,
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

/// Carte de section réutilisable — icône + titre, même charte que le reste
/// du module RH (coins arrondis, ombre légère).
class _Section extends StatelessWidget {
  final IconData icon;
  final String title;
  final Widget child;

  const _Section({required this.icon, required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kCrmBorder),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: kHrColor.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 17, color: kHrColor),
          ),
          const SizedBox(width: 10),
          Text(AppLocalizations.of(context).translate(title), style: tInter(fontSize: 14, fontWeight: FontWeight.w900, color: kCrmText)),
        ]),
        const SizedBox(height: 14),
        child,
      ]),
    );
  }
}

/// Grande carte sélectionnable pour le type de congé — icône énorme, un
/// seul mot-clé, indicateur de sélection visible immédiatement.
class _TypeCongeCard extends StatelessWidget {
  final String emoji;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TypeCongeCard({required this.emoji, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
        decoration: BoxDecoration(
          color: selected ? kHrColor.withOpacity(0.1) : kCrmBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? kHrColor : kCrmBorder, width: selected ? 2 : 1),
        ),
        child: Row(children: [
          Text(emoji, style: const TextStyle(fontSize: 32)),
          const SizedBox(width: 14),
          Expanded(
            child: Text(AppLocalizations.of(context).translate(label),
                style: tInter(fontSize: 15, fontWeight: FontWeight.w800, color: selected ? kHrColor : kCrmText)),
          ),
          Icon(selected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
              size: 22, color: selected ? kHrColor : kCrmTextSub),
        ]),
      ),
    );
  }
}
