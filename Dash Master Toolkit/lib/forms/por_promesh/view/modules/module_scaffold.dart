// lib/forms/por_promesh/view/modules/module_scaffold.dart
//
// Coquille partagée par tous les écrans-module PROMESH (Rendement /
// Observation / NC / Personnel / Contrôle Machine / Contrôle Qualité,
// tous autonomes) : header coloré + retour + chips Machine/Poste + une
// rangée "Enregistrer" / "Suivant →" en bas. "Contrôle Process" et
// "Paramètres du Poste" ne sont plus des écrans séparés (fusionnés dans
// Contrôle Machine) — `previousRoute` (bouton "Précédent" optionnel,
// `null` par défaut) n'est donc plus utilisé par aucun écran aujourd'hui,
// conservé pour compatibilité si un futur sous-parcours en a besoin.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import '../../controller/por_promesh_controller.dart';
import '../../model/operator_option.dart';
import '../../service/por_promesh_service.dart';
import 'industrial_context_header.dart';
import '../widgets/shimmer_box.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class ModuleScaffold extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final String machine;
  final String poste;
  final String backRoute;
  final bool loading;
  final bool saving;
  final VoidCallback onSave;
  final Widget child;
  // Date/heures/opérateur auto-remplis à la création de la fiche (voir
  // PorPromeshController.bootstrapWithId) — affichés immédiatement dès que
  // les données sont chargées, jamais besoin de les ressaisir. Heure fin
  // reste modifiable (tap) jusqu'à la validation.
  final PorPromeshController controller;

  // "Suivant →" (module courant) ou "Terminer la fiche" (dernier module) —
  // enregistre automatiquement avant de changer de page / verrouiller.
  final VoidCallback onNext;
  final String nextLabel;
  final IconData nextIcon;
  final Color? nextColor;
  final bool nextBusy;
  // `false` désactive visuellement "Suivant" (ex. Contrôle Qualité tant que
  // tous les contrôles obligatoires ne sont pas renseignés) sans toucher à
  // "Enregistrer", qui doit rester disponible pour sauvegarder un brouillon
  // partiel.
  final bool nextEnabled;

  // Bouton "Précédent" optionnel — `null` (défaut) garde le footer à 2
  // boutons inchangé pour les écrans existants (Rendement/Personnel/
  // Observation/N/C, jamais touchés par cet ajout). Fourni uniquement par
  // la sous-chaîne "Contrôle Qualité" (Machine → Process → Paramètres du
  // Poste → Qualité), qui a besoin d'un "Précédent" explicite en plus de la
  // flèche retour du header (vers l'écran précédent de la chaîne, pas vers
  // la grille des modules).
  final String? previousRoute;
  final String previousLabel;

  const ModuleScaffold({
    super.key,
    required this.title,
    required this.icon,
    required this.color,
    required this.machine,
    required this.poste,
    required this.backRoute,
    required this.loading,
    required this.saving,
    required this.onSave,
    required this.onNext,
    required this.child,
    required this.controller,
    this.nextLabel = 'Suivant',
    this.nextIcon = Icons.arrow_forward_rounded,
    this.nextColor,
    this.nextBusy = false,
    this.nextEnabled = true,
    this.previousRoute,
    this.previousLabel = 'Précédent',
  });

  @override
  Widget build(BuildContext context) {
    // Le header, les chips Machine/Poste et les boutons s'affichent toujours
    // immédiatement — seul le contenu central (dépendant des données pas
    // encore chargées) est remplacé par un skeleton pendant `loading`, pour
    // ne jamais montrer un écran vide pendant l'appel réseau.
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: ModuleHeaderSection(
                title: title,
                icon: icon,
                color: color,
                machine: machine,
                poste: poste,
                backRoute: backRoute,
                loading: loading,
                controller: controller,
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: loading ? const ModuleContentSkeleton() : child,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Row(children: [
                if (previousRoute != null) ...[
                  Expanded(
                    child: IndustrialBigButton(
                      label: AppLocalizations.of(context).translate(previousLabel),
                      icon: Icons.arrow_back_rounded,
                      color: kCrmTextSub,
                      outlined: true,
                      onTap: (loading || saving || nextBusy) ? null : () => context.go(previousRoute!),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: IndustrialBigButton(
                    label: AppLocalizations.of(context)
                        .translate(saving ? 'Enregistrement…' : 'Enregistrer'),
                    icon: Icons.save_outlined,
                    color: color,
                    outlined: true,
                    onTap: (loading || saving || nextBusy) ? null : onSave,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: IndustrialBigButton(
                    label: AppLocalizations.of(context)
                        .translate(nextBusy ? 'Enregistrement…' : nextLabel),
                    icon: nextIcon,
                    color: nextColor ?? color,
                    onTap: (loading || saving || nextBusy || !nextEnabled) ? null : onNext,
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Bloc d'en-tête réutilisable d'un écran-module : retour + icône + titre,
/// chips Machine/Poste, puis (une fois les données chargées) la ligne
/// Date/Heure/Opérateur. Utilisé par [ModuleScaffold] et par tout écran qui
/// gère lui-même son scroll (voir `controle_qualite_screen.dart`) afin de
/// garder un en-tête visuellement identique sans dupliquer ce code.
class ModuleHeaderSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final String machine;
  final String poste;
  final String backRoute;
  final bool loading;
  final PorPromeshController controller;

  const ModuleHeaderSection({
    super.key,
    required this.title,
    required this.icon,
    required this.color,
    required this.machine,
    required this.poste,
    required this.backRoute,
    required this.loading,
    required this.controller,
  });

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        InkWell(
          onTap: () => context.go(backRoute),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              border: Border.all(color: kCrmBorder),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
          ),
        ),
        const SizedBox(width: 12),
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: color, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(AppLocalizations.of(context).translate(title),
              style: tInter(fontSize: 18, fontWeight: FontWeight.w900, color: kCrmText)),
        ),
      ]),
      const SizedBox(height: 14),
      IndustrialContextHeader(machine: machine, poste: poste, color: color),
      if (!loading) ...[
        const SizedBox(height: 12),
        FicheInfoRow(controller: controller, color: color),
      ],
    ]);
  }
}

/// Date / Heure début / Heure fin / Opérateur — auto-remplis à la création
/// de la fiche (jamais vides), affichés immédiatement sur chaque écran-module
/// (même contrôleur partagé : les 5 écrans-module affichent toujours les
/// mêmes valeurs). Les 4 restent modifiables (tap → sélecteur ou Autocomplete)
/// jusqu'à la validation, et chaque modification est sauvegardée
/// immédiatement (`saveDraft()`) — survit à un rafraîchissement de page.
class FicheInfoRow extends StatelessWidget {
  final PorPromeshController controller;
  final Color color;

  const FicheInfoRow({super.key, required this.controller, required this.color});

  Future<void> _pickAndSave(BuildContext context, Future<void> Function() pick) async {
    await pick();
    try {
      await controller.saveDraft();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${AppLocalizations.of(context).translate('Erreur :')} $e'),
          backgroundColor: Colors.red.shade700));
    }
  }

  Future<void> _editOperateur(BuildContext context) async {
    final result = await showDialog<String>(
      context: context,
      builder: (_) => _OperatorPickerDialog(initialValue: controller.operateur.text),
    );
    if (result == null || result.trim().isEmpty) return;
    controller.operateur.text = result.trim();
  }

  Widget _editableChip(BuildContext context, IconData icon, Listenable listenable, String Function() text, VoidCallback onTap) {
    return AnimatedBuilder(
      animation: listenable,
      builder: (context, _) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: _chip(icon, text(), editable: true),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 14, runSpacing: 8, children: [
      _editableChip(context, Icons.event_outlined, controller.dateProduction, () => controller.dateProduction.text,
          () => _pickAndSave(context, () => controller.pickDateProduction(context))),
      _editableChip(context, Icons.schedule_outlined, controller.heureDebut, () => controller.heureDebut.text,
          () => _pickAndSave(context, () => controller.pickHeureDebut(context))),
      _editableChip(context, Icons.update_rounded, controller.heureFin, () => controller.heureFin.text,
          () => _pickAndSave(context, () => controller.pickHeureFin(context))),
      _editableChip(context, Icons.person_outline_rounded, controller.operateur, () => controller.operateur.text,
          () => _pickAndSave(context, () => _editOperateur(context))),
    ]);
  }

  Widget _chip(IconData icon, String label, {bool editable = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
        border: editable ? Border.all(color: color.withOpacity(0.4)) : null,
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 5),
        Text(label.isEmpty ? '-' : label, style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
        if (editable) ...[
          const SizedBox(width: 3),
          Icon(Icons.edit_outlined, size: 11, color: color),
        ],
      ]),
    );
  }
}

/// Sélecteur "Opérateur" — Autocomplete chargé depuis
/// GET /por-promesh/operators (utilisateurs autorisés : admin/superadmin/
/// responsable_logistique_achat, nom résolu via user_profiles). Préselectionné
/// sur la valeur actuelle ; repli en saisie libre si la liste est vide ou
/// l'appel échoue (jamais de champ bloqué).
class _OperatorPickerDialog extends StatefulWidget {
  final String initialValue;
  const _OperatorPickerDialog({required this.initialValue});

  @override
  State<_OperatorPickerDialog> createState() => _OperatorPickerDialogState();
}

class _OperatorPickerDialogState extends State<_OperatorPickerDialog> {
  late final TextEditingController _ctrl = TextEditingController(text: widget.initialValue);
  final FocusNode _focusNode = FocusNode();
  late final Future<List<OperatorOption>> _future = PorPromeshService.instance.fetchOperators();

  @override
  void dispose() {
    _ctrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(AppLocalizations.of(context).translate('Opérateur'),
          style: tInter(fontSize: 16, fontWeight: FontWeight.w800)),
      content: SizedBox(
        width: 320,
        child: FutureBuilder<List<OperatorOption>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const SizedBox(
                  height: 56, child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
            }
            final options = snapshot.data ?? const <OperatorOption>[];
            if (snapshot.hasError || options.isEmpty) {
              return TextField(
                controller: _ctrl,
                autofocus: true,
                decoration: InputDecoration(
                    hintText: AppLocalizations.of(context).translate("Nom de l'opérateur")),
              );
            }
            return Autocomplete<OperatorOption>(
              textEditingController: _ctrl,
              focusNode: _focusNode,
              optionsBuilder: (value) {
                final q = value.text.trim().toLowerCase();
                if (q.isEmpty) return options;
                return options.where(
                    (o) => o.name.toLowerCase().contains(q) || o.email.toLowerCase().contains(q));
              },
              displayStringForOption: (o) => o.name,
              onSelected: (o) => _ctrl.text = o.name,
              fieldViewBuilder: (context, textEditingController, focusNode, onFieldSubmitted) {
                return TextField(
                  controller: textEditingController,
                  focusNode: focusNode,
                  autofocus: true,
                  decoration: InputDecoration(
                      hintText: AppLocalizations.of(context).translate('Rechercher un opérateur...')),
                );
              },
            );
          },
        ),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context).translate('Annuler'))),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, _ctrl.text.trim()),
          child: Text(AppLocalizations.of(context).translate('Valider')),
        ),
      ],
    );
  }
}
