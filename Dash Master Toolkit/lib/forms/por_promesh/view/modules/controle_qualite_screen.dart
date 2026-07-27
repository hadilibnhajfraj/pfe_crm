// lib/forms/por_promesh/view/modules/controle_qualite_screen.dart
//
// Module "Contrôle Qualité" — DERNIER module du workflow PROMESH (Modules →
// Rendement → Personnel → Observation → N/C → Contrôle Machine [qui
// contient désormais aussi Contrôle Process et Paramètres du Poste] →
// Contrôle Qualité → fin de fiche). Écran autonome, ne chaîne plus vers
// aucun autre module — "Suivant" enregistre puis revient directement à la
// page Modules, comme Rendement/Personnel/Observation/N/C/Contrôle
// Machine. L'utilisateur ne voit plus jamais "Contrôle Process" ni
// "Paramètres du Poste" en sortant d'ici (ces écrans n'existent plus).
// Contenu : UNIQUEMENT les mesures qualité (heure/numéro de plaque/maille/
// longueur/largeur/statut, mesures toutes les 3 heures) — `c.controlesQualite`,
// indépendant du Contrôle Process. "Hauteur" a été supprimée.
// Les justifications (Process/Machine, conditionnelles en cas d'anomalie)
// ont été déplacées sur l'écran "Contrôle Machine" (`controle_machine_screen.dart`)
// — c'est là que l'anomalie est saisie, c'est là qu'elle doit être justifiée.
// "Observation" (Responsable Production), "Note /10" et "Signature Chef
// d'équipe" ont été retirés de cet écran. "Note"/"Signature" sont
// supprimés du modèle : ces champs n'existent plus nulle part.
// "Observation" reste dans le modèle (`observationsGenerales`) car
// partagée avec le module "Observation" séparé de la grille — seule sa
// carte a été retirée d'ICI.
// La finalisation de la fiche ("Terminer la saisie") reste exposée
// exclusivement depuis `ModulesGridScreen` (gated par `c.canFinish`).

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';

import '../../controller/por_promesh_controller.dart';
import 'module_scaffold.dart';

import 'controle_qualite/quality_measurement_card.dart';

class ControleQualiteScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;

  const ControleQualiteScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ControleQualiteScreen> createState() => _ControleQualiteScreenState();
}

class _ControleQualiteScreenState extends State<ControleQualiteScreen> {
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
    // Données déjà en mémoire (ex. retour depuis un autre écran du même
    // parcours) ⇒ pas de skeleton de chargement : transition immédiate.
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

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Contrôle qualité enregistré')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String get _modulesRoute =>
      '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/modules?ficheId=${widget.ficheId}';

  // Dernier module du workflow : "Suivant" enregistre puis revient à la
  // grille des modules, exactement comme les autres modules autonomes —
  // ne chaîne plus jamais vers Contrôle Process (module supprimé).
  Future<void> _saveAndNext() async {
    setState(() => _nextBusy = true);
    try {
      await c.saveDraft();
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
      title: 'Contrôle Qualité',
      icon: Icons.verified_outlined,
      color: kMaintenanceColor,
      machine: widget.machine,
      poste: widget.poste,
      controller: c,
      backRoute: _modulesRoute,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndNext,
      nextBusy: _nextBusy,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        QualityMeasurementCard(rows: c.controlesQualite),
      ]),
    );
  }
}
