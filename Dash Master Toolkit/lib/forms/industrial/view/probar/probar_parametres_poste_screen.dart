// lib/forms/industrial/view/probar/probar_parametres_poste_screen.dart
//
// Paramètres Poste PROBAR — résumé + diagnostic détaillé avant "Terminer".
//
// Design :
//   • Une seule logique de validation (canFinish) pilote TOUT — bouton ET résumé.
//   • Pour chaque module incomplet, on liste EXACTEMENT les champs manquants.
//   • Qualité : une seule ligne (celle de la machine, voir _lineIndexForMachine),
//     8 champs (statutCOQ + heure + 7 numériques).
//   • Observations / Non-Conformité : message direct.
//
// Le module PROBAR n'a plus de section Contrôle Process (supprimée de
// l'interface) — aucun diagnostic dédié ici.

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';
import 'probar_module_scaffold.dart';

// Créneaux Qualité (identiques à probar_controle_qualite_screen.dart)
const _kQualiteSlots = [
  ('L1', '07:30', Color(0xFF7C3AED)),
  ('L2', '11:00', Color(0xFF16A34A)),
  ('L3', '14:00', Color(0xFFEA580C)),
  ('L4', '17:00', Color(0xFF2563EB)),
];

// Même mapping que probar_controle_qualite_screen.dart / _machine_screen.dart
// (_lineIndexForMachine) : Machine 1→L1, 2→L2, 3→L3, 4→L4. Le diagnostic ne
// doit porter que sur la ligne de cette machine, jamais les 3 autres.
int _lineIndexForMachine(String machine) => ((int.tryParse(machine) ?? 1) - 1).clamp(0, 3);

// ─────────────────────────────────────────────────────────────────────────────
class ProbarParametresPosteScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;
  const ProbarParametresPosteScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ProbarParametresPosteScreen> createState() => _State();
}

class _State extends State<ProbarParametresPosteScreen> {
  late final ProbarController c;
  bool _loading    = true;
  bool _saving     = false;

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
    if (c.isLocked.value) { context.go(_fichePath); return; }
    setState(() => _loading = false);
  }

  String get _base =>
      '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}';
  String get _fichePath => '$_base/dashboard';
  String get _modulesPath => '$_base/modules?ficheId=${widget.ficheId}';

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) {
        _snack(AppLocalizations.of(context).translate('Paramètres enregistrés'), kCrmSuccess);
      }
    } catch (e) {
      if (mounted) {
        _snack('${AppLocalizations.of(context).translate('Erreur')} : $e', kCrmDanger);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // Écran atteignable uniquement par navigation directe (plus de "Suivant"
  // y menant depuis Contrôle Qualité, qui retourne désormais directement à
  // la grille des modules) — enregistre puis revient à la page Modules. La
  // finalisation de la fiche ("Terminer la saisie") est une action unique,
  // exposée uniquement depuis ProbarModulesGridScreen (gated par
  // c.canFinish) — ce bouton ne doit plus verrouiller la fiche ici, pour ne
  // jamais quitter le workflow "modules" par surprise depuis un sous-écran.
  Future<void> _saveAndReturnToModules() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) context.go(_modulesPath);
    } catch (e) {
      if (mounted) {
        _snack('${AppLocalizations.of(context).translate('Erreur')} : $e', kCrmDanger);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String msg, Color bg) =>
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: bg, duration: const Duration(seconds: 2)));

  @override
  Widget build(BuildContext context) {
    return ProbarModuleScaffold(
      title:         AppLocalizations.of(context).translate('Paramètres Poste'),
      icon:          Icons.tune_rounded,
      color:         kProbarColor,
      machine:       widget.machine,
      poste:         widget.poste,
      backRoute:     _modulesPath,
      loading:       _loading,
      saving:        _saving,
      onSave:        _save,
      onNext:        _saveAndReturnToModules,
      nextLabel:     AppLocalizations.of(context).translate('Suivant'),
      nextIcon:      Icons.arrow_forward_rounded,
      previousRoute: _modulesPath,
      previousLabel: AppLocalizations.of(context).translate('Modules'),
      controller:    c,
      child: _ResumeBody(c: c, machine: widget.machine),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Corps principal : résumé + diagnostic détaillé
// ─────────────────────────────────────────────────────────────────────────────
class _ResumeBody extends StatelessWidget {
  final ProbarController c;
  final String machine;
  const _ResumeBody({required this.c, required this.machine});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final rendementOk = c.rendementSaved;
      final personnelOk = c.personnelSaved;
      final machineOk   = c.isControleMachineComplete();
      final qualiteOk   = c.isControleQualiteComplete();
      final obsOk       = c.isObservationComplete();
      final ncOk        = c.isNonConformiteComplete();
      final allDone     = c.canFinish;

      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

        // ── 1. Titre ───────────────────────────────────────────────────────
        Text(AppLocalizations.of(context).translate('Résumé des modules'),
            style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
        const SizedBox(height: 4),
        Text(
            AppLocalizations.of(context)
                .translate('Modules obligatoires à compléter avant de terminer la fiche.'),
            style: tInter(fontSize: 13, color: kCrmTextSub)),
        const SizedBox(height: 20),

        // ── 2. Lignes de statut rapide ─────────────────────────────────────
        _StatusRow(label: 'Rendement', icon: Icons.speed_rounded,
            color: kProbarColor, done: rendementOk),
        const SizedBox(height: 8),
        _StatusRow(label: 'Personnel', icon: Icons.people_outline_rounded,
            color: kProbarColor, done: personnelOk),
        const SizedBox(height: 8),
        _StatusRow(label: 'Contrôle Machine', icon: Icons.settings_outlined,
            color: kMaintenanceColor, done: machineOk),
        const SizedBox(height: 8),
        _StatusRow(label: 'Contrôle Qualité', icon: Icons.shield_outlined,
            color: kMaintenanceColor, done: qualiteOk),
        const SizedBox(height: 8),
        _StatusRow(label: 'Observations', icon: Icons.chat_bubble_outline_rounded,
            color: kMelangeColor, done: obsOk),
        const SizedBox(height: 8),
        _StatusRow(label: 'Non-Conformité', icon: Icons.warning_amber_rounded,
            color: kProbarColor, done: ncOk),
        const SizedBox(height: 20),

        // ── 3. Bannière globale ────────────────────────────────────────────
        _GlobalBanner(allDone: allDone),

        // ── 4. Diagnostic détaillé (seulement si incomplet) ───────────────
        if (!allDone) ...[
          const SizedBox(height: 28),
          Row(children: [
            const Icon(Icons.search_rounded, size: 16, color: kCrmTextSub),
            const SizedBox(width: 6),
            Text(AppLocalizations.of(context).translate('Détail des champs manquants'),
                style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText)),
          ]),
          const SizedBox(height: 4),
          Text(
            AppLocalizations.of(context).translate(
                'Corrigez chaque point ci-dessous pour activer le bouton "Terminer la fiche".'),
            style: tInter(fontSize: 12.5, color: kCrmTextSub),
          ),
          const SizedBox(height: 16),

          if (!rendementOk) ...[
            _SimpleDetailCard(
              icon: Icons.speed_rounded,
              color: kProbarColor,
              title: 'Rendement',
              errors: const ['Production M² manquante'],
            ),
            const SizedBox(height: 12),
          ],
          if (!personnelOk) ...[
            _SimpleDetailCard(
              icon: Icons.people_outline_rounded,
              color: kProbarColor,
              title: 'Personnel',
              errors: const ['Au moins un agent doit être renseigné'],
            ),
            const SizedBox(height: 12),
          ],
          if (!machineOk) ...[
            _SimpleDetailCard(
              icon: Icons.settings_outlined,
              color: kMaintenanceColor,
              title: 'Contrôle Machine',
              errors: const ['Des champs de contrôle machine sont manquants'],
            ),
            const SizedBox(height: 12),
          ],
          if (!qualiteOk) ...[
            _QualiteDetailCard(c: c, machine: machine),
            const SizedBox(height: 12),
          ],
          if (!obsOk) ...[
            _SimpleDetailCard(
              icon: Icons.chat_bubble_outline_rounded,
              color: kMelangeColor,
              title: 'Observations',
              errors: const ['Commentaire d\'observation manquant'],
            ),
            const SizedBox(height: 12),
          ],
          if (!ncOk) ...[
            _SimpleDetailCard(
              icon: Icons.warning_amber_rounded,
              color: kProbarColor,
              title: 'Non-Conformité',
              errors: [
                if (c.conformite.value == null)
                  'Statut de conformité non sélectionné'
                else
                  'Description obligatoire lorsque le produit est non conforme',
              ],
            ),
          ],
        ],
      ]);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Carte détaillée — Contrôle Qualité (une seule ligne : celle de la machine)
// ─────────────────────────────────────────────────────────────────────────────
class _QualiteDetailCard extends StatelessWidget {
  final ProbarController c;
  final String machine;
  const _QualiteDetailCard({required this.c, required this.machine});

  @override
  Widget build(BuildContext context) {
    final i = _lineIndexForMachine(machine);
    return _DetailCard(
      icon:  Icons.shield_outlined,
      color: kMaintenanceColor,
      title: 'Contrôle Qualité',
      child: _SlotDiagnostic(
        label:  _kQualiteSlots[i].$1,
        time:   _kQualiteSlots[i].$2,
        accent: _kQualiteSlots[i].$3,
        errors: c.qualiteSlotErrors(i),
      ),
    );
  }
}

class _SlotDiagnostic extends StatelessWidget {
  final String label;
  final String time;
  final Color  accent;
  final List<String> errors;
  const _SlotDiagnostic({required this.label, required this.time,
      required this.accent, required this.errors});

  @override
  Widget build(BuildContext context) {
    final isComplete = errors.isEmpty;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // En-tête créneau
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: accent.withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: accent.withOpacity(0.3)),
            ),
            child: Text('$label  $time',
                style: tInter(fontSize: 12, fontWeight: FontWeight.w800, color: accent)),
          ),
          const Spacer(),
          if (isComplete) ...[
            const Icon(Icons.check_circle_rounded, size: 15, color: kCrmSuccess),
            const SizedBox(width: 4),
            Text(AppLocalizations.of(context).translate('Complet'),
                style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: kCrmSuccess)),
          ],
        ]),
        // Liste des erreurs (si incomplet)
        if (!isComplete) ...[
          const SizedBox(height: 8),
          for (final err in errors) _ErrorLine(err),
        ],
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Carte simple (Observations / Non-Conformité)
// ─────────────────────────────────────────────────────────────────────────────
class _SimpleDetailCard extends StatelessWidget {
  final IconData     icon;
  final Color        color;
  final String       title;
  final List<String> errors;
  const _SimpleDetailCard({required this.icon, required this.color,
      required this.title, required this.errors});

  @override
  Widget build(BuildContext context) {
    return _DetailCard(
      icon:  icon,
      color: color,
      title: title,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Column(children: [for (final e in errors) _ErrorLine(e)]),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Widgets de base réutilisables
// ─────────────────────────────────────────────────────────────────────────────

class _DetailCard extends StatelessWidget {
  final IconData icon;
  final Color    color;
  final String   title;
  final String?  subtitle;
  final Widget   child;
  const _DetailCard({required this.icon, required this.color,
      required this.title, this.subtitle, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kCrmDanger.withOpacity(0.25)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // En-tête carte
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: kCrmDanger.withOpacity(0.06),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            border: Border(bottom: BorderSide(color: kCrmDanger.withOpacity(0.2))),
          ),
          child: Row(children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(7)),
              child: Icon(icon, size: 14, color: color),
            ),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(AppLocalizations.of(context).translate(title),
                  style: tInter(fontSize: 13, fontWeight: FontWeight.w800, color: kCrmText)),
              if (subtitle != null)
                Text(AppLocalizations.of(context).translate(subtitle!),
                    style: tInter(fontSize: 11, color: kCrmTextSub, fontStyle: FontStyle.italic)),
            ]),
          ]),
        ),
        child,
      ]),
    );
  }
}

class _ErrorLine extends StatelessWidget {
  final String msg;
  const _ErrorLine(this.msg);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.cancel_rounded, size: 14, color: kCrmDanger),
        const SizedBox(width: 6),
        Expanded(child: Text(AppLocalizations.of(context).translate(msg),
            style: tInter(fontSize: 12.5, color: kCrmDanger, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}

class _StatusRow extends StatelessWidget {
  final String   label;
  final IconData icon;
  final Color    color;
  final bool     done;
  const _StatusRow({required this.label, required this.icon,
      required this.color, required this.done});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: done ? kCrmSuccess.withOpacity(0.3) : kCrmBorder),
      ),
      child: Row(children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(
            color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(AppLocalizations.of(context).translate(label),
            style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: kCrmText))),
        Icon(done ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
            size: 18, color: done ? kCrmSuccess : kCrmBorder),
      ]),
    );
  }
}

class _GlobalBanner extends StatelessWidget {
  final bool allDone;
  const _GlobalBanner({required this.allDone});

  @override
  Widget build(BuildContext context) {
    final bg   = (allDone ? kCrmSuccess : kCrmDanger).withOpacity(0.08);
    final bdr  = (allDone ? kCrmSuccess : kCrmDanger).withOpacity(0.4);
    final fg   = allDone ? kCrmSuccess : kCrmDanger;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: bdr)),
      child: Row(children: [
        Icon(allDone ? Icons.check_circle_rounded : Icons.warning_amber_rounded,
            color: fg, size: 20),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            AppLocalizations.of(context).translate(allDone
                ? 'Tous les modules sont complétés. Utilisez le bouton "Terminer la fiche".'
                : 'Des champs sont manquants. Consultez le détail ci-dessous et revenez en arrière pour compléter.'),
            style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: fg),
          ),
        ),
      ]),
    );
  }
}
