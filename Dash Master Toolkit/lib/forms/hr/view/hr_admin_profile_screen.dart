// lib/forms/hr/view/hr_admin_profile_screen.dart
//
// Écran admin — renseigne une seule fois par utilisateur les champs RH
// (nom/prénom/matricule/qualification/département/service) nécessaires à
// l'auto-remplissage du module "Demandes". Réservé à admin/superadmin
// (l'API `/users` et `/users/:id/profile` l'imposent déjà côté backend).

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../theme/hr_theme.dart';
import '../model/employee_profile_model.dart';
import '../service/employee_profile_service.dart';

class HrAdminProfileScreen extends StatefulWidget {
  const HrAdminProfileScreen({super.key});

  @override
  State<HrAdminProfileScreen> createState() => _HrAdminProfileScreenState();
}

class _HrAdminProfileScreenState extends State<HrAdminProfileScreen> {
  bool _loading = true;
  String? _error;
  List<HrUserRef> _users = [];
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final users = await EmployeeProfileService.instance.fetchAllUsers();
      if (!mounted) return;
      setState(() => _users = users);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<HrUserRef> get _filtered => _search.trim().isEmpty
      ? _users
      : _users.where((u) => u.email.toLowerCase().contains(_search.trim().toLowerCase())).toList();

  Future<void> _openEditor(HrUserRef user) async {
    EmployeeProfileModel? profile;
    try {
      profile = await EmployeeProfileService.instance.fetchUserProfile(user.id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kHrRefused));
      return;
    }
    if (!mounted) return;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => _ProfileEditorDialog(user: user, profile: profile!),
    );
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(AppLocalizations.of(context).translate('Profils RH'), style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
                const SizedBox(height: 4),
                Text(AppLocalizations.of(context).translate('Renseignez matricule, qualification, département et service pour chaque employé.'),
                    style: tInter(fontSize: 13, color: kCrmTextSub)),
                const SizedBox(height: 18),
                TextField(
                  onChanged: (v) => setState(() => _search = v),
                  decoration: InputDecoration(
                    hintText: AppLocalizations.of(context).translate('Rechercher par email…'),
                    prefixIcon: const Icon(Icons.search_rounded, size: 20),
                    filled: true,
                    fillColor: kCrmSurface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
                  ),
                ),
                const SizedBox(height: 16),
                if (_loading)
                  const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: CircularProgressIndicator()))
                else if (_error != null)
                  Text('${AppLocalizations.of(context).translate('Erreur')} : $_error', style: tInter(color: kHrRefused))
                else if (_filtered.isEmpty)
                  Text(AppLocalizations.of(context).translate('Aucun utilisateur trouvé'), style: tInter(fontSize: 13, color: kCrmTextSub))
                else
                  ..._filtered.map((u) => Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(
                          color: kCrmSurface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: kCrmBorder),
                        ),
                        child: ListTile(
                          onTap: () => _openEditor(u),
                          leading: Container(
                            width: 40,
                            height: 40,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: kHrColor.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                            child: const Icon(Icons.person_outline_rounded, color: kHrColor),
                          ),
                          title: Text(u.email, style: tInter(fontSize: 13.5, fontWeight: FontWeight.w700, color: kCrmText)),
                          subtitle: Text(u.role, style: tInter(fontSize: 11.5, color: kCrmTextSub)),
                          trailing: const Icon(Icons.edit_outlined, size: 18, color: kCrmTextSub),
                        ),
                      )),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProfileEditorDialog extends StatefulWidget {
  final HrUserRef user;
  final EmployeeProfileModel profile;
  const _ProfileEditorDialog({required this.user, required this.profile});

  @override
  State<_ProfileEditorDialog> createState() => _ProfileEditorDialogState();
}

class _ProfileEditorDialogState extends State<_ProfileEditorDialog> {
  late final _nom = TextEditingController(text: widget.profile.nom);
  late final _prenom = TextEditingController(text: widget.profile.prenom);
  late final _matricule = TextEditingController(text: widget.profile.matricule);
  late final _qualification = TextEditingController(text: widget.profile.qualification);
  late final _departement = TextEditingController(text: widget.profile.departement);
  late final _service = TextEditingController(text: widget.profile.service);
  bool _saving = false;

  @override
  void dispose() {
    _nom.dispose();
    _prenom.dispose();
    _matricule.dispose();
    _qualification.dispose();
    _departement.dispose();
    _service.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final updated = EmployeeProfileModel(
        nom: _nom.text.trim(),
        prenom: _prenom.text.trim(),
        matricule: _matricule.text.trim(),
        qualification: _qualification.text.trim(),
        departement: _departement.text.trim(),
        service: _service.text.trim(),
      );
      await EmployeeProfileService.instance.updateUserProfile(widget.user.id, updated);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kHrRefused));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Text(widget.user.email, style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText)),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            _field(context, 'Nom', _nom),
            _field(context, 'Prénom', _prenom),
            _field(context, 'Matricule', _matricule),
            _field(context, 'Qualification', _qualification),
            _field(context, 'Département', _departement),
            _field(context, 'Service', _service),
          ]),
        ),
      ),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.pop(context, false), child: Text(AppLocalizations.of(context).translate('Annuler'))),
        ElevatedButton(
          onPressed: _saving ? null : _save,
          style: ElevatedButton.styleFrom(backgroundColor: kHrColor),
          child: Text(AppLocalizations.of(context).translate(_saving ? 'Enregistrement…' : 'Enregistrer')),
        ),
      ],
    );
  }

  Widget _field(BuildContext context, String label, TextEditingController ctrl) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: ctrl,
        decoration: InputDecoration(
          labelText: AppLocalizations.of(context).translate(label),
          filled: true,
          fillColor: kCrmBg,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
        ),
      ),
    );
  }
}
