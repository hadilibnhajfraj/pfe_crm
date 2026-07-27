// lib/forms/industrial/view/probar/probar_detail_screen.dart
//
// Écran détail d'une fiche PROBAR — refondu pour suivre exactement le même
// design/organisation que PorPromeshDetailScreen : CqSectionHeading +
// CqCardSurface pour chaque section, mêmes couleurs/typographie/espacements
// (cq_theme.dart), mêmes boutons d'action (Modifier/Imprimer/Export PDF/
// Export Excel/Supprimer). Toutes les valeurs sont en lecture seule — aucun
// TextField modifiable. Le contenu propre à PROBAR (Contrôle Machine,
// Observation, Non-Conformité) est décodé une seule fois par
// ProbarDetailData puis distribué à des cards réutilisables (widgets/*.dart)
// au lieu d'être construit inline ici. Le module PROBAR n'a plus de section
// Contrôle Process ni Contrôle Qualité sur cette page (supprimées de
// l'interface — la saisie Contrôle Qualité reste disponible côté module de
// saisie, seule la lecture ici a été retirée).
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/industrial_context_header.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite/cq_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../../controller/probar_controller.dart';
import '../../model/industrial_record_model.dart';
import '../../service/industrial_record_service.dart';

import 'widgets/probar_detail_data.dart';
import 'widgets/general_info_card.dart';
import 'widgets/rendement_card.dart';
import 'widgets/personnel_card.dart';
import 'widgets/machine_control_card.dart';
import 'widgets/observation_card.dart';
import 'widgets/non_conformity_card.dart';

class ProbarDetailScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String id;

  const ProbarDetailScreen({super.key, required this.machine, required this.poste, required this.id});

  @override
  State<ProbarDetailScreen> createState() => _ProbarDetailScreenState();
}

class _ProbarDetailScreenState extends State<ProbarDetailScreen> {
  bool _loading = true;
  bool _deleting = false;
  String? _error;
  IndustrialRecordModel? _record;
  ProbarDetailData? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await IndustrialRecordService.instance.fetchById(widget.id);
      if (!mounted) return;
      setState(() {
        _record = r;
        _data = ProbarDetailData.fromModel(r);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String get _backRoute =>
      '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}/dashboard';
  String get _modulesRoute =>
      '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}/modules';

  Future<void> _openForEdit() async {
    final c = Get.isRegistered<ProbarController>()
        ? Get.find<ProbarController>()
        : Get.put(ProbarController(), permanent: true);
    await c.bootstrapWithId(widget.machine, widget.poste, widget.id);
    if (mounted) context.go('$_modulesRoute?ficheId=${widget.id}');
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(AppLocalizations.of(ctx).translate('Supprimer la fiche ?')),
        content: Text(AppLocalizations.of(ctx).translate('Cette action est irréversible. La fiche sera définitivement supprimée.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(AppLocalizations.of(ctx).translate('Annuler'))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: kCrmDanger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(AppLocalizations.of(ctx).translate('Supprimer')),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _deleting = true);
    try {
      await IndustrialRecordService.instance.delete(widget.id);
      if (mounted) context.go(_backRoute);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  void _print() => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context).translate('Impression — fonctionnalité à venir')), duration: const Duration(seconds: 2)));

  void _exportPdf() => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context).translate('Export PDF — fonctionnalité à venir')), duration: const Duration(seconds: 2)));

  void _exportExcel() => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context).translate('Export Excel — fonctionnalité à venir')), duration: const Duration(seconds: 2)));

  @override
  Widget build(BuildContext context) {
    final record = _record;
    final isLocked = record?.statut == 'validee';

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // ── 1. Header ────────────────────────────────────────────────
              Row(children: [
                InkWell(
                  onTap: () => context.go(_backRoute),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration:
                        BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  width: 38,
                  height: 38,
                  decoration:
                      BoxDecoration(color: kProbarColor.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.fact_check_outlined, color: kProbarColor, size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(AppLocalizations.of(context).translate('Détail Fiche PROBAR'),
                      style: tInter(fontSize: 17, fontWeight: FontWeight.w900, color: kCrmText)),
                ),
              ]),
              const SizedBox(height: 14),
              Wrap(spacing: 20, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
                IndustrialContextHeader(machine: widget.machine, poste: widget.poste, color: kProbarColor, lineLabel: 'PROBAR'),
                if (record != null) ...[
                  IndustrialInfoChip(icon: Icons.event_outlined, label: safeValueOr(record.dateFiche, '—'), color: kCrmTextSub),
                  _statusBadge(isLocked ? 'Validé' : 'Brouillon', isLocked ? kCrmSuccess : kCrmWarning,
                      isLocked ? Icons.verified_rounded : Icons.edit_note_rounded),
                  if (record.statutQualite != null)
                    _statusBadge(record.statutQualite == 'nok' ? 'Non Conforme' : 'Conforme',
                        record.statutQualite == 'nok' ? kCrmDanger : kCrmSuccess,
                        record.statutQualite == 'nok' ? Icons.cancel_rounded : Icons.check_circle_rounded),
                ],
              ]),
              const SizedBox(height: 14),

              // ── 2. Barre d'actions ───────────────────────────────────────
              Wrap(spacing: 8, runSpacing: 8, children: [
                _actionButton('Modifier', Icons.edit_outlined, kCrmInfo, (_loading || isLocked) ? null : _openForEdit),
                _actionButton('Imprimer', Icons.print_outlined, kCrmTextSub, _loading ? null : _print),
                _actionButton('Export PDF', Icons.picture_as_pdf_outlined, kCrmSecondary, _loading ? null : _exportPdf),
                _actionButton('Export Excel', Icons.grid_on_rounded, kCrmSuccess, _loading ? null : _exportExcel),
                _actionButton('Supprimer', Icons.delete_outline_rounded, kCrmDanger,
                    (_loading || _deleting || isLocked) ? null : _delete),
              ]),
            ]),
          ),
          Expanded(child: _buildBody()),
        ]),
      ),
    );
  }

  // Même style de bouton que PorPromeshDetailScreen._actionButton (Wrap,
  // même taille/couleurs/espacement/icônes).
  Widget _actionButton(String label, IconData icon, Color color, VoidCallback? onTap) {
    final disabled = onTap == null;
    final effectiveColor = disabled ? kCrmBorder : color;
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 14, color: effectiveColor),
      label: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 11.5, fontWeight: FontWeight.w600, color: effectiveColor)),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: effectiveColor.withOpacity(0.4)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        backgroundColor: effectiveColor.withOpacity(0.06),
        minimumSize: Size.zero,
      ),
    );
  }

  Widget _statusBadge(String label, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 5),
        Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }

  String safeValueOr(String? v, String fallback) => (v == null || v.isEmpty) ? fallback : v;

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text('${AppLocalizations.of(context).translate('Erreur')} : $_error', style: tInter(fontSize: 13, color: kCrmDanger)));
    }
    final record = _record;
    final data = _data;
    if (record == null || data == null) return const SizedBox.shrink();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kIndustrialMaxContentWidth),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── 3. Informations Générales ─────────────────────────────────
          CqSectionHeading(
            icon: Icons.info_outline_rounded,
            title: AppLocalizations.of(context).translate('Informations Générales'),
            subtitle: AppLocalizations.of(context).translate('Identification de la fiche'),
            color: kMaintenanceColor,
          ),
          const SizedBox(height: 10),
          GeneralInfoCard(record: record, heureDebut: data.heureDebut, heureFin: data.heureFin),
          const SizedBox(height: kCqSectionGap),

          // ── 4. Card 1 — Rendement ────────────────────────────────────
          CqSectionHeading(
            icon: Icons.speed_rounded,
            title: '1. ${AppLocalizations.of(context).translate('Rendement')}',
            subtitle: AppLocalizations.of(context).translate('Production du poste'),
            color: kProbarColor,
          ),
          const SizedBox(height: 10),
          RendementCard(productionM2: record.quantiteProduite),
          const SizedBox(height: kCqSectionGap),

          // ── Card 2 — Personnel ──────────────────────────────────────────
          CqSectionHeading(
            icon: Icons.groups_rounded,
            title: '2. ${AppLocalizations.of(context).translate('Personnel')}',
            subtitle: AppLocalizations.of(context).translate('Équipe présente sur le poste'),
            color: kPersonnelColor,
          ),
          const SizedBox(height: 10),
          PersonnelCard(personnel: data.personnel),
          const SizedBox(height: kCqSectionGap),

          // ── Card 3 — Observation ───────────────────────────────────────
          CqSectionHeading(
            icon: Icons.chat_bubble_outline_rounded,
            title: '3. ${AppLocalizations.of(context).translate('Observation')}',
            subtitle: AppLocalizations.of(context).translate('Remarques du poste'),
            color: kMelangeColor,
          ),
          const SizedBox(height: 10),
          ObservationCard(text: data.observationsText),
          const SizedBox(height: kCqSectionGap),

          // ── Card 4 — Non-Conformité ────────────────────────────────────
          CqSectionHeading(
            icon: Icons.warning_amber_rounded,
            title: '4. ${AppLocalizations.of(context).translate('Non-Conformité')}',
            subtitle: AppLocalizations.of(context).translate('Conformité du poste'),
            color: kCrmDanger,
          ),
          const SizedBox(height: 10),
          NonConformityCard(
            statutQualite: record.statutQualite,
            description: data.descriptionNonConformite,
            actionsCorrectives: data.actionsCorrectives,
          ),
          const SizedBox(height: kCqSectionGap),

          // ── Card 5 — Contrôle Machine ──────────────────────────────────
          CqSectionHeading(
            icon: Icons.precision_manufacturing_rounded,
            title: '5. ${AppLocalizations.of(context).translate('Contrôle Machine')}',
            subtitle: AppLocalizations.of(context).translate('État machine + mesures qualité'),
            color: kProbarColor,
          ),
          const SizedBox(height: 10),
          MachineControlCard(
            machineControl: data.machineControl,
            qualiteMesures: data.qualiteMesures,
            machine: widget.machine,
          ),
          const SizedBox(height: 12),
        ]),
      ),
    );
  }
}
