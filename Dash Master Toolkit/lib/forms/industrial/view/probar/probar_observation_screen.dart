// lib/forms/industrial/view/probar/probar_observation_screen.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';
import 'probar_module_scaffold.dart';

class ProbarObservationScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;
  const ProbarObservationScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ProbarObservationScreen> createState() => _ProbarObservationScreenState();
}

class _ProbarObservationScreenState extends State<ProbarObservationScreen> {
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

  static const int _kMaxChars = 5000;

  bool _validateObservation() {
    if (c.observationsGenerales.text.trim().length > _kMaxChars) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(AppLocalizations.of(context)
            .translate('Le commentaire ne peut pas dépasser 5000 caractères.')),
        backgroundColor: kCrmDanger,
        duration: const Duration(seconds: 3),
      ));
      return false;
    }
    return true;
  }

  Future<void> _save() async {
    if (_saving) return;
    if (!_validateObservation()) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context).translate('Observation enregistrée')),
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
    if (!_validateObservation()) return;
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
      title: AppLocalizations.of(context).translate('Observation'),
      icon: Icons.chat_bubble_outline_rounded,
      color: kMelangeColor,
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
      child: _ObservationBody(c: c),
    );
  }
}

class _ObservationBody extends StatelessWidget {
  final ProbarController c;
  const _ObservationBody({required this.c});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context).translate('Observations du poste'),
          style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
      const SizedBox(height: 6),
      Text(
          AppLocalizations.of(context)
              .translate('Saisissez vos remarques, commentaires ou incidents notables.'),
          style: tInter(fontSize: 13, color: kCrmTextSub)),
      const SizedBox(height: 24),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: kCrmSurface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: kMelangeColor.withOpacity(0.3), width: 1.4),
          boxShadow: [
            BoxShadow(color: kMelangeColor.withOpacity(0.1), blurRadius: 20, offset: const Offset(0, 8)),
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                  color: kMelangeColor.withOpacity(0.12), borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.chat_bubble_outline_rounded, size: 24, color: kMelangeColor),
            ),
            const SizedBox(width: 14),
            Text(AppLocalizations.of(context).translate('Commentaires'),
                style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
          ]),
          const SizedBox(height: 18),
          AnimatedBuilder(
            animation: c.observationsGenerales,
            builder: (context, _) {
              final len = c.observationsGenerales.text.trim().length;
              final over = len > _ProbarObservationScreenState._kMaxChars;
              return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                TextField(
                  controller: c.observationsGenerales,
                  maxLines: 8,
                  decoration: InputDecoration(
                    hintText: AppLocalizations.of(context)
                        .translate('Saisissez vos observations ici…'),
                    filled: true,
                    fillColor: over
                        ? kCrmDanger.withOpacity(0.05)
                        : kMelangeColor.withOpacity(0.05),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: kMelangeColor.withOpacity(0.3)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                          color: over ? kCrmDanger : kMelangeColor, width: 2),
                    ),
                    errorBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: kCrmDanger, width: 2),
                    ),
                    contentPadding: const EdgeInsets.all(16),
                  ),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  Icon(
                    over
                        ? Icons.error_rounded
                        : len > 0
                            ? Icons.check_circle_rounded
                            : Icons.radio_button_unchecked,
                    size: 14,
                    color: over ? kCrmDanger : len > 0 ? kCrmSuccess : kCrmTextSub,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      over
                          ? '${AppLocalizations.of(context).translate('Le commentaire ne peut pas dépasser 5000 caractères.')} ($len / 5000)'
                          : len > 0
                              ? '$len / 5000 ${AppLocalizations.of(context).translate('caractères')}'
                              : AppLocalizations.of(context).translate('Champ vide'),
                      style: tInter(
                        fontSize: 11.5,
                        color: over ? kCrmDanger : len > 0 ? kCrmSuccess : kCrmTextSub,
                      ),
                    ),
                  ),
                ]),
              ]);
            },
          ),
        ]),
      ),
    ]);
  }
}
