// lib/forms/por_promesh/view/modules/controle_machine_screen.dart
//
// Module "Contrôle Machine" — carte autonome de la grille des modules.
// Contient désormais deux sections éditables :
//   • Contrôle Machine (7 champs état machine, `MachineFieldsPanel`) + sa
//     justification conditionnelle (visible dès qu'un champ est en
//     anomalie — `controleMachineHasNegative`).
//   • Contrôle Process (paramètres physiques du process, vrais widgets
//     éditables — TextField/StatusSelector — `ProcessFieldsPanel`) + sa
//     propre justification conditionnelle (`controleProcessHasNegative`).
//
// Les deux `JustificationCard` vivaient auparavant sur l'écran "Contrôle
// Qualité", séparé de l'endroit où l'anomalie est réellement saisie —
// c'était la cause exacte du bug "Terminer la saisie" bloqué en silence :
// `controleMachineSaved` (qui alimente à la fois le badge "Contrôle
// Machine" ET `canFinish`) exige `justificationControleMachine` dès qu'une
// anomalie existe, mais ce champ n'était affiché que sur un AUTRE écran,
// visité (ou pas) à un autre moment — l'utilisateur ne le voyait jamais
// au bon moment et ne pouvait donc jamais satisfaire la condition. Les
// deux cartes sont maintenant ici, juste sous la section concernée, et
// réagissent en direct (`AnimatedBuilder`/`Obx`) à la saisie sur CETTE
// même page, sans avoir besoin de la quitter.
//
// Les Paramètres du Poste (tableaux P1/P2/COR, `ParametresPosteReadOnlyCard`)
// ne sont plus affichés du tout ici : le backend continue de les générer/
// synchroniser automatiquement à chaque `saveDraft()`
// (`applyDerivedProcessControl` dans `porPromesh.service.js`), en totale
// transparence, mais cet écran ne montre plus que les champs de saisie.
//
// Pas de "Suivant" vers un autre module : on enregistre puis on revient à
// la grille (module autonome, comme Rendement/Personnel/Observation/N/C).
// Workflow : Modules → Rendement → Personnel → Observation → N/C →
// Contrôle Machine → Contrôle Qualité → Terminer.

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../../controller/por_promesh_controller.dart';
import 'module_scaffold.dart';
import 'controle_qualite/cq_theme.dart';
import 'controle_qualite/machine_fields_panel.dart';
import 'controle_qualite/process_fields_panel.dart';
import 'controle_qualite/justification_card.dart';

class ControleMachineScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;

  const ControleMachineScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ControleMachineScreen> createState() => _ControleMachineScreenState();
}

class _ControleMachineScreenState extends State<ControleMachineScreen> {
  late final PorPromeshController c;
  bool _loading = true;
  bool _saving = false;
  bool _nextBusy = false;

  @override
  void initState() {
    super.initState();
    c = Get.isRegistered<PorPromeshController>()
        ? Get.find<PorPromeshController>()
        : Get.put(PorPromeshController(), permanent: true);
    // Données déjà en mémoire (ex. arrivée depuis un autre écran du même
    // parcours) ⇒ pas de skeleton de chargement : transition "Suivant"
    // immédiate, contenu réel dès le premier build.
    if (c.isBootstrappedFor(widget.machine, widget.poste)) _loading = false;
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

  // Un seul `saveDraft()` envoie les champs Contrôle Machine — le backend
  // génère et enregistre automatiquement les Paramètres du Poste dérivés
  // dans le même appel (transaction unique côté serveur), aucun appel API
  // supplémentaire depuis Flutter. `loadFromModel(saved)` resynchronise
  // ensuite le contrôleur avec la réponse serveur (dont les 4 lignes
  // fraîchement calculées) — sans ça, les cartes de lecture seule
  // "Contrôle Process"/"Paramètres du Poste" continueraient d'afficher
  // l'état d'avant cet enregistrement (`saveDraft()` seul ne remet pas
  // `processControlBlocs` à jour).
  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final saved = await c.saveDraft();
      c.loadFromModel(saved, id: saved.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Contrôle Machine enregistré')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String get _modulesRoute =>
      '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/modules?ficheId=${widget.ficheId}';

  // Module autonome : pas de module suivant — on enregistre puis on
  // revient à la grille des modules, comme Rendement/Personnel/Observation/
  // N/C lorsqu'on quitte par la flèche retour.
  Future<void> _saveAndReturn() async {
    setState(() => _nextBusy = true);
    try {
      final saved = await c.saveDraft();
      c.loadFromModel(saved, id: saved.id);
      if (!mounted) return;
      context.go(_modulesRoute);
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
      title: 'Contrôle Machine',
      icon: Icons.precision_manufacturing_rounded,
      color: kMaintenanceColor,
      machine: widget.machine,
      poste: widget.poste,
      controller: c,
      backRoute: _modulesRoute,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndReturn,
      nextLabel: 'Terminer',
      nextIcon: Icons.check_circle_rounded,
      nextColor: kCrmSuccess,
      nextBusy: _nextBusy,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        MachineFieldsPanel(c: c, onChanged: () {}),
        // Réagit à temperatureEau (TextEditingController, hors plage
        // 40-60°C) ET aux 5 champs à choix (RxnString) — les deux types de
        // déclencheurs de `controleMachineHasNegative`.
        AnimatedBuilder(
          animation: c.temperatureEau,
          builder: (context, _) => Obx(() {
            if (!c.controleMachineHasNegative) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(top: 10),
              child: JustificationCard(
                title: 'Justification — Contrôle Machine',
                controller: c.justificationControleMachine,
                onChanged: () {},
              ),
            );
          }),
        ),
        const SizedBox(height: kCqSectionGap),
        const CqSectionHeading(
          icon: Icons.analytics_outlined,
          title: 'Contrôle Process',
          subtitle: 'Paramètres physiques du process',
          color: kMaintenanceColor,
        ),
        const SizedBox(height: 10),
        ProcessFieldsPanel(c: c, onChanged: () {}),
        // Les 4 paramètres process à choix (État impression, Fuite d'eau,
        // Fuite d'air comprimé, État disque de coupe) écrivent dans des
        // TextEditingController (`row.p1`, pas des Rx) — Listenable.merge
        // est donc nécessaire pour réagir en direct à leur saisie.
        AnimatedBuilder(
          animation: Listenable.merge([
            for (final cfg in processParamConfigs)
              if (cfg.kind != ProcessParamKind.numeric)
                c.processControlBlocs[kProcessFieldsBloc]!
                    .firstWhere((r) => r.parametre == cfg.parametre)
                    .p1,
          ]),
          builder: (context, _) {
            if (!c.controleProcessHasNegative) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(top: 10),
              child: JustificationCard(
                title: 'Justification — Contrôle Process',
                controller: c.justificationControleProcess,
                onChanged: () {},
              ),
            );
          },
        ),
      ]),
    );
  }
}
