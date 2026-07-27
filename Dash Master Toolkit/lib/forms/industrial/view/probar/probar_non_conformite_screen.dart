// lib/forms/industrial/view/probar/probar_non_conformite_screen.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';
import 'probar_module_scaffold.dart';

class ProbarNonConformiteScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;
  const ProbarNonConformiteScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ProbarNonConformiteScreen> createState() => _ProbarNonConformiteScreenState();
}

class _ProbarNonConformiteScreenState extends State<ProbarNonConformiteScreen> {
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

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context).translate('Non-conformité enregistrée')), backgroundColor: kCrmSuccess, duration: const Duration(seconds: 2)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // Enregistre puis revient TOUJOURS à la page Modules de cette même fiche.
  Future<void> _saveAndReturnToModules() async {
    if (_saving) return;
    if (c.conformite.value == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(AppLocalizations.of(context).translate('Veuillez choisir Conforme ou Non Conforme')), backgroundColor: Colors.orange));
      return;
    }
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) context.go(_modulesPath);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ProbarModuleScaffold(
      title: 'Non-Conformité',
      icon: Icons.warning_amber_rounded,
      color: kProbarColor,
      machine: widget.machine,
      poste: widget.poste,
      backRoute: _modulesPath,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndReturnToModules,
      nextLabel: 'Suivant',
      nextIcon: Icons.arrow_forward_rounded,
      controller: c,
      child: _NcBody(c: c, onRebuild: () => setState(() {})),
    );
  }
}

class _NcBody extends StatelessWidget {
  final ProbarController c;
  final VoidCallback onRebuild;

  const _NcBody({required this.c, required this.onRebuild});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final selected = c.conformite.value;
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(AppLocalizations.of(context).translate('Conformité du poste'), style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
        const SizedBox(height: 6),
        Text(AppLocalizations.of(context).translate('Indiquez si le poste est conforme ou non conforme.'),
            style: tInter(fontSize: 13, color: kCrmTextSub)),
        const SizedBox(height: 24),
        Row(children: [
          Expanded(
            child: _ChoiceCard(
              label: 'Conforme',
              icon: Icons.check_circle_rounded,
              color: kCrmSuccess,
              selected: selected == 'conforme',
              onTap: () => c.conformite.value = 'conforme',
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: _ChoiceCard(
              label: 'Non Conforme',
              icon: Icons.cancel_rounded,
              color: kCrmDanger,
              selected: selected == 'non_conforme',
              onTap: () => c.conformite.value = 'non_conforme',
            ),
          ),
        ]),
        if (selected == 'non_conforme') ...[
          const SizedBox(height: 24),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: kCrmSurface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: kCrmDanger.withOpacity(0.35), width: 1.4),
              boxShadow: [
                BoxShadow(color: kCrmDanger.withOpacity(0.08), blurRadius: 18, offset: const Offset(0, 6)),
              ],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                      color: kCrmDanger.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.description_outlined, size: 20, color: kCrmDanger),
                ),
                const SizedBox(width: 12),
                Text(AppLocalizations.of(context).translate('Description de la non-conformité'),
                    style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText)),
              ]),
              const SizedBox(height: 16),
              TextField(
                controller: c.descriptionNonConformite,
                maxLines: 4,
                decoration: InputDecoration(
                  hintText: AppLocalizations.of(context).translate('Décrivez le problème constaté…'),
                  filled: true,
                  fillColor: kCrmDanger.withOpacity(0.04),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: kCrmDanger.withOpacity(0.3)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: kCrmDanger, width: 2),
                  ),
                  contentPadding: const EdgeInsets.all(14),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: c.actionsCorrectives,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: AppLocalizations.of(context).translate('Actions correctives mises en place…'),
                  filled: true,
                  fillColor: kCrmWarning.withOpacity(0.04),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: kCrmWarning.withOpacity(0.3)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: kCrmWarning, width: 2),
                  ),
                  contentPadding: const EdgeInsets.all(14),
                  label: Text(AppLocalizations.of(context).translate('Actions correctives')),
                ),
              ),
            ]),
          ),
        ],
      ]);
    });
  }
}

class _ChoiceCard extends StatefulWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  const _ChoiceCard({
    required this.label,
    required this.icon,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_ChoiceCard> createState() => _ChoiceCardState();
}

class _ChoiceCardState extends State<_ChoiceCard> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedScale(
        scale: (_hover || widget.selected) ? 1.02 : 1.0,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        child: Material(
          color: widget.selected ? widget.color.withOpacity(0.1) : kCrmSurface,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(16),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: widget.selected ? widget.color : kCrmBorder,
                  width: widget.selected ? 2 : 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: widget.color.withOpacity(widget.selected ? 0.2 : 0.06),
                    blurRadius: widget.selected ? 24 : 8,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(widget.icon, size: 44, color: widget.color),
                const SizedBox(height: 12),
                Text(AppLocalizations.of(context).translate(widget.label),
                    style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: widget.color),
                    textAlign: TextAlign.center),
                if (widget.selected) ...[
                  const SizedBox(height: 8),
                  Icon(Icons.check_circle_rounded, size: 18, color: widget.color),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
