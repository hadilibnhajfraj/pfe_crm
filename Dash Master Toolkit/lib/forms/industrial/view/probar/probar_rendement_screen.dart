// lib/forms/industrial/view/probar/probar_rendement_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';
import 'probar_module_scaffold.dart';

class ProbarRendementScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;
  const ProbarRendementScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ProbarRendementScreen> createState() => _ProbarRendementScreenState();
}

class _ProbarRendementScreenState extends State<ProbarRendementScreen> {
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text(AppLocalizations.of(context).translate('Rendement enregistré')),
              backgroundColor: kCrmSuccess,
              duration: const Duration(seconds: 2)),
        );
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

  // Enregistre puis revient TOUJOURS à la page Modules de cette même fiche
  // (jamais vers un autre module, jamais vers la liste des fiches) —
  // conserve machine+poste, donc l'identité de la fiche (recordId reste
  // dans le ProbarController singleton).
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
      title: AppLocalizations.of(context).translate('Rendement'),
      icon: Icons.speed_rounded,
      color: kProbarColor,
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
      child: _RendementBody(c: c),
    );
  }
}

class _RendementBody extends StatelessWidget {
  final ProbarController c;
  const _RendementBody({required this.c});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context).translate('Production du poste'),
          style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
      const SizedBox(height: 6),
      Text(
          AppLocalizations.of(context)
              .translate('Saisissez la quantité produite en m² pour ce poste.'),
          style: tInter(fontSize: 13, color: kCrmTextSub)),
      const SizedBox(height: 28),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: kCrmSurface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: kProbarColor.withOpacity(0.3), width: 1.4),
          boxShadow: [
            BoxShadow(color: kProbarColor.withOpacity(0.12), blurRadius: 24, offset: const Offset(0, 10)),
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 64, height: 64,
              decoration: BoxDecoration(
                  color: kProbarColor.withOpacity(0.12), borderRadius: BorderRadius.circular(18)),
              child: const Icon(Icons.speed_rounded, size: 36, color: kProbarColor),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(AppLocalizations.of(context).translate('Quantité produite'),
                    style: tInter(fontSize: 20, fontWeight: FontWeight.w900, color: kCrmText)),
                const SizedBox(height: 2),
                Text(AppLocalizations.of(context).translate('Production de ce poste'),
                    style: tInter(fontSize: 13, color: kCrmTextSub)),
              ]),
            ),
          ]),
          const SizedBox(height: 28),
          TextField(
            controller: c.productionM2,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.,]'))],
            textAlign: TextAlign.center,
            style: tInter(fontSize: 52, fontWeight: FontWeight.w900, color: kProbarColor),
            decoration: InputDecoration(
              isDense: true,
              border: InputBorder.none,
              hintText: '0',
              hintStyle: tInter(fontSize: 52, fontWeight: FontWeight.w900, color: kCrmBorder),
              suffixText: 'm²',
              suffixStyle: tInter(fontSize: 26, fontWeight: FontWeight.w800, color: kCrmTextSub),
            ),
          ),
          const SizedBox(height: 8),
          Center(
              child: Text(AppLocalizations.of(context).translate('Exemple : 1250 m²'),
                  style: tInter(fontSize: 12.5, color: kCrmTextSub))),
          const SizedBox(height: 12),
          AnimatedBuilder(
            animation: c.productionM2,
            builder: (context, _) {
              final val = double.tryParse(c.productionM2.text.replaceAll(',', '.'));
              if (val == null) return const SizedBox.shrink();
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                    color: kCrmSuccess.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: Row(children: [
                  const Icon(Icons.check_circle_rounded, color: kCrmSuccess, size: 18),
                  const SizedBox(width: 8),
                  Text('$val m² ${AppLocalizations.of(context).translate('saisi')}',
                      style: tInter(fontSize: 14, fontWeight: FontWeight.w700, color: kCrmSuccess)),
                ]),
              );
            },
          ),
        ]),
      ),
    ]);
  }
}
