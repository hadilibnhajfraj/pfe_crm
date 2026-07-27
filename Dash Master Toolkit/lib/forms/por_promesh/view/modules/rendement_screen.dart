// lib/forms/por_promesh/view/modules/rendement_screen.dart
//
// Module Rendement — version opérateur simplifiée : une seule mesure,
// la production du poste exprimée en m² (jamais en kg). Une seule grande
// carte, pas de grille dense de champs secondaires.

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../../controller/por_promesh_controller.dart';
import 'module_scaffold.dart';

class RendementScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;

  const RendementScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<RendementScreen> createState() => _RendementScreenState();
}

class _RendementScreenState extends State<RendementScreen> {
  late final PorPromeshController c;
  bool _loading = true;
  bool _saving = false;
  bool _nextBusy = false;

  @override
  void initState() {
    super.initState();
    // `permanent: true` : ce controller est partagé par les 5 écrans-module
    // (et l'écran Informations générales) de la session machine/poste — il
    // ne doit jamais être supprimé par le dispose() d'un écran particulier.
    // Flutter construit l'écran suivant (initState) AVANT de détruire
    // l'écran précédent (dispose, différé en fin de frame) : si chaque écran
    // supprimait ce controller partagé en quittant, l'écran suivant — qui
    // l'a retrouvé via Get.find() et l'utilise déjà — se retrouvait avec des
    // TextEditingController disposés sous les pieds ("used after disposed").
    c = Get.isRegistered<PorPromeshController>()
        ? Get.find<PorPromeshController>()
        : Get.put(PorPromeshController(), permanent: true);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await c.bootstrapWithId(widget.machine, widget.poste, widget.ficheId);
    if (!mounted) return;
    if (c.isLocked.value || c.status.value == 'submitted') {
      context.go(_fichePath);
      return;
    }
    setState(() => _loading = false);
  }

  String get _fichePath =>
      '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/dashboard';
  String get _modulesPath =>
      '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/modules?ficheId=${widget.ficheId}';

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rendement enregistré')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String get _backRoute => _modulesPath;

  // Enregistre puis revient TOUJOURS à la page Modules de cette même fiche
  // (jamais vers un autre module, jamais vers la liste des fiches).
  Future<void> _saveAndNext() async {
    setState(() => _nextBusy = true);
    try {
      await c.saveDraft();
      if (!mounted) return;
      context.go(_modulesPath);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _nextBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ModuleScaffold(
      title: 'Rendement',
      icon: Icons.speed_rounded,
      color: kPromeshColor,
      machine: widget.machine,
      poste: widget.poste,
      controller: c,
      backRoute: _backRoute,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndNext,
      nextBusy: _nextBusy,
      child: _BigProductionCard(controller: c.productionM2),
    );
  }
}

class _BigProductionCard extends StatelessWidget {
  final TextEditingController controller;

  const _BigProductionCard({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: kPromeshColor.withOpacity(0.3), width: 1.4),
        boxShadow: [
          BoxShadow(color: kPromeshColor.withOpacity(0.12), blurRadius: 24, offset: const Offset(0, 10)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(color: kPromeshColor.withOpacity(0.12), borderRadius: BorderRadius.circular(18)),
            child: Icon(Icons.speed_rounded, size: 36, color: kPromeshColor),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Quantité Produite', style: tInter(fontSize: 20, fontWeight: FontWeight.w900, color: kCrmText)),
              const SizedBox(height: 2),
              Text('Production de ce poste', style: tInter(fontSize: 13, color: kCrmTextSub)),
            ]),
          ),
        ]),
        const SizedBox(height: 28),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          textAlign: TextAlign.center,
          style: tInter(fontSize: 56, fontWeight: FontWeight.w900, color: kPromeshColor),
          decoration: InputDecoration(
            isDense: true,
            border: InputBorder.none,
            hintText: '0',
            hintStyle: tInter(fontSize: 56, fontWeight: FontWeight.w900, color: kCrmBorder),
            suffixText: 'm²',
            suffixStyle: tInter(fontSize: 28, fontWeight: FontWeight.w800, color: kCrmTextSub),
          ),
        ),
        const SizedBox(height: 6),
        Center(
          child: Text('Exemple : 1250 m²', style: tInter(fontSize: 12.5, color: kCrmTextSub)),
        ),
      ]),
    );
  }
}
