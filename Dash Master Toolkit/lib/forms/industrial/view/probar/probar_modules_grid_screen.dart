// lib/forms/industrial/view/probar/probar_modules_grid_screen.dart
//
// Grille des modules PROBAR — identique à PROMESH (même design, mêmes cartes
// premium, même workflow). Couleur accent kProbarColor (orange) à la place du
// bleu PROMESH. Route racine : /production/probar/machine/:num/poste/:poste/modules.

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/industrial_context_header.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';

class _ModuleSpec {
  final IconData icon;
  final String title;
  final String description;
  final Color color;
  final String routeSegment;
  // Lit l'état de complétion depuis le ProbarController — basé sur la
  // présence de données déjà saisies pour ce module (pas de nouveau champ
  // de statut backend), donc toujours fidèle aux vraies données.
  final bool Function(ProbarController c) isCompleted;

  const _ModuleSpec({
    required this.icon,
    required this.title,
    required this.description,
    required this.color,
    required this.routeSegment,
    required this.isCompleted,
  });
}

// Même ordre que PROMESH
const _kModules = <_ModuleSpec>[
  _ModuleSpec(
    icon: Icons.speed_rounded,
    title: 'RENDEMENT',
    description: 'Production du poste,\nexprimée en m².',
    color: kProbarColor,
    routeSegment: 'rendement',
    isCompleted: _rendementCompleted,
  ),
  _ModuleSpec(
    icon: Icons.groups_outlined,
    title: 'PERSONNEL',
    description: 'Gestion des opérateurs\net équipes présentes.',
    color: kPersonnelColor,
    routeSegment: 'personnel',
    isCompleted: _personnelCompleted,
  ),
  _ModuleSpec(
    icon: Icons.chat_bubble_outline_rounded,
    title: 'OBSERVATION',
    description: 'Remarques, photos,\ncommentaires de production.',
    color: kMelangeColor,
    routeSegment: 'observation',
    isCompleted: _observationCompleted,
  ),
  _ModuleSpec(
    icon: Icons.warning_amber_rounded,
    title: 'N/C',
    description: 'Conformité du poste\n: Conforme / Non Conforme.',
    color: Color(0xFFF97316),
    routeSegment: 'nc',
    isCompleted: _ncCompleted,
  ),
  _ModuleSpec(
    icon: Icons.precision_manufacturing_rounded,
    title: 'CONTRÔLE MACHINE',
    description: 'État machine, température,\ncontrôle du poste.',
    color: kMaintenanceColor,
    routeSegment: 'controle-machine',
    isCompleted: _controleMachineCompleted,
  ),
  _ModuleSpec(
    icon: Icons.shield_outlined,
    title: 'CONTRÔLE QUALITÉ',
    description: 'Contrôle qualité\net validation du process.',
    color: kMaintenanceColor,
    routeSegment: 'qualite',
    isCompleted: _qualiteCompleted,
  ),
];

// Un module est "complété" uniquement si tous ses champs obligatoires sont
// renseignés (jamais simplement parce qu'une fiche existe en base — voir
// ProbarController.isControleMachineComplete()/isControleQualiteComplete()
// pour Contrôle Machine/Contrôle Qualité, cohérent avec canFinish).
bool _rendementCompleted(ProbarController c) => c.rendementSaved;
bool _personnelCompleted(ProbarController c) => c.personnelSaved;
bool _observationCompleted(ProbarController c) => c.isObservationComplete();
bool _ncCompleted(ProbarController c) => c.isNonConformiteComplete();
bool _controleMachineCompleted(ProbarController c) => c.isControleMachineComplete();
bool _qualiteCompleted(ProbarController c) => c.isControleQualiteComplete();

class ProbarModulesGridScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;

  const ProbarModulesGridScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ProbarModulesGridScreen> createState() => _ProbarModulesGridScreenState();
}

class _ProbarModulesGridScreenState extends State<ProbarModulesGridScreen> {
  late final ProbarController c;
  bool _loading = true;
  bool _finishing = false;

  @override
  void initState() {
    super.initState();
    c = Get.isRegistered<ProbarController>()
        ? Get.find<ProbarController>()
        : Get.put(ProbarController(), permanent: true);
    _bootstrap();
  }

  // Le ficheId (créé dès "Nouvelle fiche") est la source de vérité pour
  // identifier la fiche — plus de résolution implicite par date du jour ici.
  Future<void> _bootstrap() async {
    await c.bootstrapWithId(widget.machine, widget.poste, widget.ficheId);
    if (!mounted) return;
    if (c.isLocked.value) {
      // Fiche verrouillée (déjà validée) : la grille des modules ne peut
      // plus être affichée en édition. Redirection vers le dashboard — avec
      // un message explicite pour ne jamais laisser cette redirection
      // paraître comme une page qui "ne s'affiche plus" sans raison.
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(AppLocalizations.of(context).translate('Cette fiche est déjà validée et verrouillée.')),
        backgroundColor: Colors.orange,
        duration: const Duration(seconds: 3),
      ));
      context.go(_fichePath);
      return;
    }
    setState(() => _loading = false);
  }

  String _modulePath(String module) => '$_modulesRoot/$module?ficheId=${widget.ficheId}';
  String get _modulesRoot =>
      '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}/modules';
  String get _fichePath =>
      '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}/dashboard';

  Future<void> _finishEntry() async {
    if (!c.canFinish) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(AppLocalizations.of(context).translate('Complétez tous les modules obligatoires avant de terminer.')),
        backgroundColor: Colors.orange,
      ));
      return;
    }
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(AppLocalizations.of(dialogContext).translate('Terminer la saisie ?')),
        content: Text(AppLocalizations.of(dialogContext).translate(
            'La fiche de production sera générée et verrouillée. Aucune modification ne sera plus possible.')),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(AppLocalizations.of(dialogContext).translate('Annuler'))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: kCrmSuccess),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(AppLocalizations.of(dialogContext).translate('Terminer')),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _finishing = true);
    try {
      await c.submit();
      if (!mounted) return;
      context.go(_fichePath);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${AppLocalizations.of(context).translate('Erreur')} : ${e.toString().replaceFirst('Exception: ', '')}'),
        backgroundColor: Colors.red.shade700,
      ));
    } finally {
      if (mounted) setState(() => _finishing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final crossAxisCount = screenWidth >= 1100 ? 3 : (screenWidth >= 700 ? 2 : 1);
    final completedCount = _kModules.where((m) => m.isCompleted(c)).length;
    final remainingModules = _kModules.where((m) => !m.isCompleted(c)).toList();

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              InkWell(
                onTap: () => context.go(
                    '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}/dashboard'),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                ),
              ),
              const SizedBox(height: 16),
              IndustrialContextHeader(machine: widget.machine, poste: widget.poste, color: kProbarColor, lineLabel: 'PROBAR'),
              const SizedBox(height: 24),
              Text(AppLocalizations.of(context).translate('Que souhaitez-vous saisir ?'),
                  style: tInter(fontSize: 22, fontWeight: FontWeight.w900, color: kCrmText)),
              const SizedBox(height: 16),
              _ProgressSection(completed: completedCount, total: _kModules.length, color: kProbarColor),
              const SizedBox(height: 20),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: crossAxisCount,
                  mainAxisSpacing: 18,
                  crossAxisSpacing: 18,
                  mainAxisExtent: 264,
                ),
                itemCount: _kModules.length,
                itemBuilder: (context, i) {
                  final m = _kModules[i];
                  return _PremiumModuleCard(
                    spec: m,
                    completed: m.isCompleted(c),
                    lastUpdatedAt: c.lastUpdatedAt.value,
                    onTap: () => context.go(_modulePath(m.routeSegment)),
                  );
                },
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                height: 64,
                // Désactivé (grisé) tant que les modules obligatoires ne sont
                // pas tous complétés — pas seulement un avertissement au clic.
                child: ElevatedButton.icon(
                  onPressed: (_loading || _finishing || !c.canFinish) ? null : _finishEntry,
                  icon: _finishing
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.check_circle_rounded, size: 24),
                  label: Text(AppLocalizations.of(context).translate(_finishing ? 'Génération en cours…' : 'TERMINER LA SAISIE'),
                      style: tInter(fontSize: 17, fontWeight: FontWeight.w900)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kCrmSuccess,
                    disabledBackgroundColor: kCrmBorder,
                    foregroundColor: Colors.white,
                    disabledForegroundColor: kCrmTextSub,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
              if (remainingModules.isNotEmpty) ...[
                const SizedBox(height: 16),
                _RemainingModulesPanel(remaining: remainingModules),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// "Progression : x / y modules complétés" + barre de progression.
// ─────────────────────────────────────────────────────────────────────────
class _ProgressSection extends StatelessWidget {
  final int completed;
  final int total;
  final Color color;

  const _ProgressSection({required this.completed, required this.total, required this.color});

  @override
  Widget build(BuildContext context) {
    final ratio = total == 0 ? 0.0 : completed / total;
    final done = completed >= total;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(AppLocalizations.of(context).translate('Progression'), style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText)),
            Text('$completed / $total ${AppLocalizations.of(context).translate('modules complétés')}',
                style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmTextSub)),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: ratio,
            minHeight: 10,
            backgroundColor: kCrmBorder.withOpacity(0.4),
            valueColor: AlwaysStoppedAnimation<Color>(done ? kCrmSuccess : color),
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// "Modules restants :" — liste sous le bouton "Terminer la saisie", chaque
// module obligatoire non complété apparaît avec une case ☐ ; disparaît dès
// que le module correspondant est complété (liste recalculée à chaque
// build depuis l'état réel des données du contrôleur, voir `isCompleted`).
// ─────────────────────────────────────────────────────────────────────────
class _RemainingModulesPanel extends StatelessWidget {
  final List<_ModuleSpec> remaining;

  const _RemainingModulesPanel({required this.remaining});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmWarning.withOpacity(0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmWarning.withOpacity(0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(AppLocalizations.of(context).translate('Modules restants :'), style: tInter(fontSize: 13, fontWeight: FontWeight.w800, color: kCrmText)),
        const SizedBox(height: 8),
        for (final m in remaining)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(children: [
              const Icon(Icons.check_box_outline_blank_rounded, size: 16, color: kCrmTextSub),
              const SizedBox(width: 8),
              Expanded(
                child: Text(AppLocalizations.of(context).translate(m.title), style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: kCrmTextSub)),
              ),
            ]),
          ),
      ]),
    );
  }
}

class _PremiumModuleCard extends StatefulWidget {
  final _ModuleSpec spec;
  final bool completed;
  final DateTime? lastUpdatedAt;
  final VoidCallback onTap;

  const _PremiumModuleCard({
    required this.spec,
    required this.completed,
    required this.lastUpdatedAt,
    required this.onTap,
  });

  @override
  State<_PremiumModuleCard> createState() => _PremiumModuleCardState();
}

class _PremiumModuleCardState extends State<_PremiumModuleCard> {
  bool _hover = false;

  String _lastModifiedLabel(BuildContext context) {
    final dt = widget.lastUpdatedAt;
    if (!widget.completed || dt == null) return AppLocalizations.of(context).translate('Aucune donnée enregistrée');
    return '${AppLocalizations.of(context).translate('Modifié le')} ${DateFormat('dd/MM/yyyy à HH:mm').format(dt)}';
  }

  @override
  Widget build(BuildContext context) {
    final spec = widget.spec;
    final completed = widget.completed;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedScale(
        scale: _hover ? 1.02 : 1.0,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        child: Material(
          color: kCrmSurface,
          borderRadius: BorderRadius.circular(24),
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(24),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: _hover ? spec.color : (completed ? kCrmSuccess.withOpacity(0.5) : kCrmBorder),
                  width: _hover ? 1.8 : (completed ? 1.4 : 1),
                ),
                boxShadow: [
                  BoxShadow(
                    color: spec.color.withOpacity(_hover ? 0.26 : 0.08),
                    blurRadius: _hover ? 28 : 14,
                    offset: Offset(0, _hover ? 12 : 8),
                  ),
                ],
              ),
              // Le badge de statut est un élément de la ligne d'en-tête (Row),
              // jamais une superposition en Stack — il ne peut donc plus
              // chevaucher le titre, quelle que soit la longueur de celui-ci.
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(color: spec.color.withOpacity(0.12), borderRadius: BorderRadius.circular(16)),
                    child: Icon(spec.icon, size: 28, color: spec.color),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(AppLocalizations.of(context).translate(spec.title),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: tInter(fontSize: 19, fontWeight: FontWeight.w900, color: kCrmText, letterSpacing: 0.2)),
                  ),
                  const SizedBox(width: 8),
                  _StatusBadge(completed: completed),
                ]),
                const SizedBox(height: 10),
                Expanded(
                  child: Text(AppLocalizations.of(context).translate(spec.description),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: tInter(fontSize: 13.5, color: kCrmTextSub, height: 1.3)),
                ),
                const SizedBox(height: 10),
                Divider(height: 1, color: kCrmBorder.withOpacity(0.6)),
                const SizedBox(height: 10),
                Row(children: [
                  const Icon(Icons.history_rounded, size: 13, color: kCrmTextSub),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(_lastModifiedLabel(context),
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: tInter(fontSize: 11.5, color: kCrmTextSub)),
                  ),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  Text(AppLocalizations.of(context).translate(completed ? 'Modifier' : 'Compléter'),
                      style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: spec.color)),
                  const SizedBox(width: 4),
                  Icon(Icons.arrow_forward_rounded, size: 18, color: spec.color),
                ]),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Badge de statut — élément normal de la ligne d'en-tête (jamais positionné
// en absolu), s'adapte donc naturellement à la largeur disponible.
// ─────────────────────────────────────────────────────────────────────────
class _StatusBadge extends StatelessWidget {
  final bool completed;

  const _StatusBadge({required this.completed});

  @override
  Widget build(BuildContext context) {
    final color = completed ? kCrmSuccess : kCrmWarning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(
        AppLocalizations.of(context).translate(completed ? '✅ Complété' : '⏳ À compléter'),
        maxLines: 1,
        style: tInter(fontSize: 10.5, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}
