// lib/forms/industrial/view/probar/probar_personnel_screen.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';
import 'probar_module_scaffold.dart';

const _kPersonnel = <(String, String, IconData)>[
  ('responsable1', 'Responsable 1', Icons.manage_accounts_rounded),
  ('responsable2', 'Responsable 2', Icons.manage_accounts_outlined),
  ('operateur1', 'Opérateur 1', Icons.engineering_rounded),
  ('operateur2', 'Opérateur 2', Icons.engineering_outlined),
  ('aideOperateur', 'Aide Opérateur', Icons.handyman_rounded),
  ('manoeuvre', 'Manœuvre', Icons.person_rounded),
  ('stagiaire1', 'Stagiaire 1', Icons.school_rounded),
  ('stagiaire2', 'Stagiaire 2', Icons.school_outlined),
];

class ProbarPersonnelScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;
  const ProbarPersonnelScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ProbarPersonnelScreen> createState() => _ProbarPersonnelScreenState();
}

class _ProbarPersonnelScreenState extends State<ProbarPersonnelScreen> {
  late final ProbarController c;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    c = Get.isRegistered<ProbarController>()
        ? Get.find<ProbarController>()
        : Get.put(ProbarController(), permanent: true);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await c.bootstrapWithId(widget.machine, widget.poste, widget.ficheId);
    if (!mounted) return;
    if (c.isLocked.value) {
      context.go(_fichePath);
      return;
    }
    setState(() => _loading = false);
  }

  String get _base => '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}';
  String get _fichePath => '$_base/dashboard';
  String get _modulesPath => '$_base/modules?ficheId=${widget.ficheId}';

  TextEditingController _fieldFor(String key) => switch (key) {
        'responsable1' => c.responsable1,
        'responsable2' => c.responsable2,
        'operateur1' => c.operateur1,
        'operateur2' => c.operateur2,
        'aideOperateur' => c.aideOperateur,
        'manoeuvre' => c.manoeuvre,
        'stagiaire1' => c.stagiaire1,
        'stagiaire2' => c.stagiaire2,
        _ => c.responsable1,
      };

  Future<void> _editPerson(String key, String label) async {
    final field = _fieldFor(key);
    final ctrl = TextEditingController(text: field.text);
    final translatedLabel = AppLocalizations.of(context).translate(label);
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(translatedLabel, style: tInter(fontSize: 16, fontWeight: FontWeight.w800)),
        content: SizedBox(
          width: 320,
          child: TextField(
            controller: ctrl,
            autofocus: true,
            decoration: InputDecoration(
                hintText:
                    '${AppLocalizations.of(context).translate('Nom de')} $translatedLabel'),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(AppLocalizations.of(context).translate('Annuler')),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: kPersonnelColor),
            onPressed: () => Navigator.of(dialogContext).pop(ctrl.text.trim()),
            child: Text(AppLocalizations.of(context).translate('Valider')),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (result == null) return;
    field.text = result;
    setState(() {});
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context).translate('Personnel enregistré')),
          backgroundColor: kCrmSuccess,
          duration: const Duration(seconds: 2),
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'),
            backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // Enregistre puis revient TOUJOURS à la page Modules de cette même fiche.
  Future<void> _saveAndReturnToModules() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) context.go(_modulesPath);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'),
            backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ProbarModuleScaffold(
      title: AppLocalizations.of(context).translate('Personnel'),
      icon: Icons.groups_outlined,
      color: kPersonnelColor,
      machine: widget.machine,
      poste: widget.poste,
      backRoute: _modulesPath,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndReturnToModules,
      nextLabel: AppLocalizations.of(context).translate('Suivant'),
      nextIcon: Icons.arrow_forward_rounded,
      controller: c,
      child: _PersonnelBody(personnel: _kPersonnel, fieldFor: _fieldFor, onEdit: _editPerson),
    );
  }
}

class _PersonnelBody extends StatelessWidget {
  final List<(String, String, IconData)> personnel;
  final TextEditingController Function(String) fieldFor;
  final Future<void> Function(String, String) onEdit;

  const _PersonnelBody({required this.personnel, required this.fieldFor, required this.onEdit});

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final crossAxisCount = screenWidth >= 900 ? 4 : (screenWidth >= 600 ? 2 : 1);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context).translate('Équipe du poste'),
          style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
      const SizedBox(height: 6),
      Text(
          AppLocalizations.of(context)
              .translate('Appuyez sur un badge pour saisir le nom du membre d\'équipe.'),
          style: tInter(fontSize: 13, color: kCrmTextSub)),
      const SizedBox(height: 24),
      GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: crossAxisCount,
          mainAxisSpacing: 14,
          crossAxisSpacing: 14,
          mainAxisExtent: 110,
        ),
        itemCount: personnel.length,
        itemBuilder: (context, i) {
          final (key, label, icon) = personnel[i];
          final field = fieldFor(key);
          return AnimatedBuilder(
            animation: field,
            builder: (context, _) => _PersonBadge(
              label: label,
              icon: icon,
              value: field.text,
              onTap: () => onEdit(key, label),
            ),
          );
        },
      ),
    ]);
  }
}

class _PersonBadge extends StatefulWidget {
  final String label;
  final IconData icon;
  final String value;
  final VoidCallback onTap;

  const _PersonBadge({required this.label, required this.icon, required this.value, required this.onTap});

  @override
  State<_PersonBadge> createState() => _PersonBadgeState();
}

class _PersonBadgeState extends State<_PersonBadge> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final filled = widget.value.isNotEmpty;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedScale(
        scale: _hover ? 1.02 : 1.0,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        child: Material(
          color: kCrmSurface,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(16),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: filled ? kPersonnelColor : kCrmBorder, width: filled ? 1.5 : 1),
                boxShadow: [
                  BoxShadow(
                    color: kPersonnelColor.withOpacity(_hover ? 0.2 : 0.06),
                    blurRadius: _hover ? 20 : 8,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: filled ? kPersonnelColor.withOpacity(0.14) : kCrmBorder.withOpacity(0.5),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(widget.icon,
                      size: 22, color: filled ? kPersonnelColor : kCrmTextSub),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                    Text(AppLocalizations.of(context).translate(widget.label),
                        style: tInter(fontSize: 11, fontWeight: FontWeight.w600, color: kCrmTextSub)),
                    const SizedBox(height: 2),
                    Text(
                      filled
                          ? widget.value
                          : AppLocalizations.of(context).translate('Appuyer pour saisir'),
                      style: tInter(
                        fontSize: 13,
                        fontWeight: filled ? FontWeight.w800 : FontWeight.w400,
                        color: filled ? kCrmText : kCrmTextSub,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ]),
                ),
                Icon(Icons.edit_outlined, size: 14, color: kPersonnelColor.withOpacity(0.7)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
