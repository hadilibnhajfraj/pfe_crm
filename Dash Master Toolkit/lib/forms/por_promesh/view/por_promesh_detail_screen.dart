// lib/forms/por_promesh/view/por_promesh_detail_screen.dart
//
// Détail (lecture seule) d'une fiche POR PROMESH — refonte visuelle pour
// suivre exactement le design des écrans-module actuels (cq_theme.dart :
// CqCardSurface/CqCardHeader/CqSectionHeading + les nouveaux widgets
// `view/detail/*.dart` : DetailInfoCard/DetailKpiCard/DetailPersonCard/
// DetailMachineValueCard/QualityMeasuresTable/DetailActionsBar).
//
// Refonte STRICTEMENT visuelle : mêmes données (`PorPromeshModel`), même
// ordre de sections, aucune route/modèle/contrôleur/service/API modifié.
//
// Charge la fiche UNE SEULE FOIS (`_load()`), toutes les sections lisent la
// même instance `PorPromeshModel` en mémoire — aucun appel réseau
// supplémentaire par section.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../model/por_promesh_model.dart';
import '../service/por_promesh_service.dart';
import '../service/por_promesh_pdf_service.dart';
import '../service/por_promesh_excel_service.dart';
import '../utils/por_promesh_safe_value.dart';
import 'modules/controle_qualite/cq_theme.dart';
import 'detail/detail_info_card.dart';
import 'detail/detail_kpi_card.dart';
import 'detail/detail_person_card.dart';
import 'detail/detail_machine_value_card.dart';
import 'detail/detail_quality_table.dart';
import 'detail/detail_actions_bar.dart';

const _imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// Rouge foncé réservé au statut "VERROUILLÉE", distinct de kCrmDanger
// (utilisé pour "Refusée").
const Color _kLockedColor = Color(0xFF7F1D1D);

class PorPromeshDetailScreen extends StatefulWidget {
  final String id;
  const PorPromeshDetailScreen({super.key, required this.id});

  @override
  State<PorPromeshDetailScreen> createState() => _PorPromeshDetailScreenState();
}

class _PorPromeshDetailScreenState extends State<PorPromeshDetailScreen> {
  bool _loading = true;
  String? _error;
  PorPromeshModel? _item;

  @override
  void initState() {
    super.initState();
    _load();
  }

  // Un seul appel réseau pour toute la page — toutes les sections lisent
  // ensuite `_item` (même instance mémoire, jamais re-fetché par section).
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final item = await PorPromeshService.instance.fetchById(widget.id);
      if (!mounted) return;
      setState(() => _item = item);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _delete() async {
    final item = _item;
    if (item?.id == null) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Supprimer'),
        content: const Text('Voulez-vous vraiment supprimer cette fiche POR PROMESH ?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Annuler')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await PorPromeshService.instance.delete(item!.id!);
      if (!mounted) return;
      context.go(MyRoute.porPromeshListScreen);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  // Modifier une fiche rouvre le même parcours Machine→Poste→Modules que
  // les opérateurs (aucun formulaire CRM dédié).
  String _editRoute(PorPromeshModel item) {
    if (item.machine == null || item.poste == null) return MyRoute.productionPromeshRoot;
    return '${MyRoute.productionPromeshRoot}/machine/${item.machine}/poste/${item.poste}';
  }

  Future<void> _printPdf() async {
    if (_item == null) return;
    try {
      await PorPromeshPdfService.instance.printPdf(_item!);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur impression : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  Future<void> _exportPdf() async {
    if (_item == null) return;
    try {
      await PorPromeshPdfService.instance.exportPdf(_item!);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur export PDF : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  Future<void> _exportExcel() async {
    if (_item == null) return;
    try {
      PorPromeshExcelService.instance.export(_item!);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur export Excel : $e'), backgroundColor: Colors.red.shade700));
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: Row(children: [
              InkWell(
                onTap: () => context.go(MyRoute.porPromeshListScreen),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.all(7),
                  decoration:
                      BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text('Détail Fiche POR PROMESH',
                    style: tInter(fontSize: 16, fontWeight: FontWeight.w800, color: kCrmText)),
              ),
            ]),
          ),
          Expanded(child: _buildBody()),
          if (item != null)
            DetailActionsBar(
              isLocked: item.isLocked,
              onBack: () => context.go(MyRoute.porPromeshListScreen),
              onEdit: item.isLocked ? null : () => context.go(_editRoute(item)),
              onPrint: _printPdf,
              onExportPdf: _exportPdf,
              onExportExcel: _exportExcel,
              onDelete: item.isLocked ? null : _delete,
            ),
        ]),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text('Erreur : $_error', style: tInter(fontSize: 13, color: kCrmDanger)));
    }
    final m = _item;
    if (m == null) return const SizedBox.shrink();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: kIndustrialMaxContentWidth),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (m.isLocked) ...[_lockedBanner(), const SizedBox(height: kCqSectionGap)],

          // 1. Informations générales
          const CqSectionHeading(
            icon: Icons.info_outline_rounded,
            title: '1. Informations Générales',
            subtitle: 'Identification de la fiche',
            color: kMaintenanceColor,
          ),
          const SizedBox(height: 10),
          _headerGrid(m),
          const SizedBox(height: kCqSectionGap),

          // 2. Rendement
          const CqSectionHeading(
            icon: Icons.speed_rounded,
            title: '2. Rendement',
            subtitle: 'Production du poste',
            color: kPromeshColor,
          ),
          const SizedBox(height: 10),
          _rendementSection(m),
          const SizedBox(height: kCqSectionGap),

          // 3. Personnel
          const CqSectionHeading(
            icon: Icons.groups_2_outlined,
            title: '3. Personnel',
            subtitle: 'Équipe présente sur le poste',
            color: kPersonnelColor,
          ),
          const SizedBox(height: 10),
          _personnelSection(m),
          const SizedBox(height: kCqSectionGap),

          // 4. Observation
          const CqSectionHeading(
            icon: Icons.chat_bubble_outline_rounded,
            title: '4. Observation',
            subtitle: 'Remarques, photos, pièces jointes',
            color: kMelangeColor,
          ),
          const SizedBox(height: 10),
          _observationCard(m),
          const SizedBox(height: kCqSectionGap),

          // 5. Non-Conformité
          const CqSectionHeading(
            icon: Icons.warning_amber_rounded,
            title: '5. Non-Conformité',
            subtitle: 'Conformité du poste',
            color: kProbarColor,
          ),
          const SizedBox(height: 10),
          _nonConformiteCard(m),
          const SizedBox(height: kCqSectionGap),

          // 6. Contrôle Machine
          const CqSectionHeading(
            icon: Icons.precision_manufacturing_rounded,
            title: '6. Contrôle Machine',
            subtitle: 'État machine et températures',
            color: kMaintenanceColor,
          ),
          const SizedBox(height: 10),
          _controleMachineSection(m),
          const SizedBox(height: kCqSectionGap),

          // 7. Contrôle Qualité
          const CqSectionHeading(
            icon: Icons.straighten_rounded,
            title: '7. Contrôle Qualité',
            subtitle: 'Mesures toutes les 3 heures, observation',
            color: kMaintenanceColor,
          ),
          const SizedBox(height: 10),
          _qualiteProduitCard(m),
          const SizedBox(height: 10),
          _observationResponsableCard(m),
          const SizedBox(height: kCqSectionGap),

          // 8. Historique
          const CqSectionHeading(
            icon: Icons.history_rounded,
            title: '8. Historique',
            subtitle: 'Traçabilité de la fiche',
            color: kCrmTextSub,
          ),
          const SizedBox(height: 10),
          _historiqueSection(m),
        ]),
      ),
    );
  }

  // ── 1. INFORMATIONS GÉNÉRALES ──────────────────────────────────────────

  Widget _headerGrid(PorPromeshModel m) {
    final info = porPromeshStatusInfo(m.status);
    final heure = _heureRange(m.heureDebut, m.heureFin);
    return Wrap(spacing: 12, runSpacing: 12, children: [
      DetailInfoCard(icon: Icons.confirmation_number_outlined, label: 'Numéro Fiche', value: safeValue(m.numero)),
      DetailInfoCard(
          icon: info.icon,
          label: 'Statut',
          value: AppLocalizations.of(context).translate(info.label),
          valueColor: info.color,
          accentColor: info.color),
      DetailInfoCard(
        icon: Icons.precision_manufacturing_outlined,
        label: 'Machine',
        value: m.machine == null ? '' : 'Machine ${m.machine}',
      ),
      DetailInfoCard(
        icon: m.poste == 'matin' ? Icons.wb_sunny_rounded : Icons.nightlight_round,
        label: 'Poste',
        value: m.poste == 'matin'
            ? AppLocalizations.of(context).translate('Matin')
            : (m.poste == 'nuit' ? AppLocalizations.of(context).translate('Nuit') : safeValue(m.poste)),
      ),
      DetailInfoCard(icon: Icons.event_outlined, label: 'Date', value: safeValue(m.dateProduction)),
      DetailInfoCard(icon: Icons.schedule_outlined, label: 'Heure', value: heure),
      DetailInfoCard(icon: Icons.person_outline_rounded, label: 'Opérateur', value: safeValue(m.operateur)),
      DetailInfoCard(
        icon: Icons.supervisor_account_outlined,
        label: 'Responsable',
        value: safeValue(m.personnelActif['responsable1']),
      ),
      DetailInfoCard(icon: Icons.calendar_today_outlined, label: 'Date de Création', value: _formatDateTime(m.createdAt)),
      DetailInfoCard(icon: Icons.verified_outlined, label: 'Date de Validation', value: safeValue(m.dateValidationProcess)),
    ]);
  }

  String _heureRange(String? debut, String? fin) {
    final d = (debut ?? '').trim();
    final f = (fin ?? '').trim();
    if (d.isEmpty && f.isEmpty) return '';
    if (d.isEmpty) return f;
    if (f.isEmpty) return d;
    return '$d – $f';
  }

  // ── 2. RENDEMENT ────────────────────────────────────────────────────────
  //
  // Seuls deux champs existent réellement dans le modèle pour ce module
  // (`productionM2`, `diametreMaille1/2/3`) — "Largeur"/"Longueur" ne sont
  // pas des données de Rendement (elles vivent dans les mesures Contrôle
  // Qualité, section 7) : pas de KPI fabriquée pour elles ici.

  Widget _rendementSection(PorPromeshModel m) {
    final diametre =
        [m.diametreMaille1, m.diametreMaille2, m.diametreMaille3].where((v) => (v ?? '').trim().isNotEmpty).join(' / ');
    return Wrap(spacing: 12, runSpacing: 12, children: [
      DetailKpiCard(
        icon: Icons.trending_up_rounded,
        value: m.productionM2 == null ? '—' : '${_fmtNum(m.productionM2)} m²',
        label: 'Production',
        color: kPromeshColor,
      ),
      DetailKpiCard(
        icon: Icons.straighten_rounded,
        value: diametre.isEmpty ? '—' : diametre,
        label: 'Diamètre Maille',
        color: kCrmInfo,
      ),
    ]);
  }

  // ── 3. PERSONNEL ────────────────────────────────────────────────────────

  Widget _personnelSection(PorPromeshModel m) {
    const roles = [
      ('responsable1', 'Responsable 1', Icons.supervisor_account_rounded),
      ('responsable2', 'Responsable 2', Icons.supervisor_account_rounded),
      ('operateur1', 'Opérateur 1', Icons.engineering_rounded),
      ('operateur2', 'Opérateur 2', Icons.engineering_rounded),
      ('aideOperateur', 'Aide Opérateur', Icons.person_add_alt_1_rounded),
      ('manoeuvre', 'Manœuvre', Icons.handyman_rounded),
      ('stagiaire1', 'Stagiaire 1', Icons.school_rounded),
      ('stagiaire2', 'Stagiaire 2', Icons.school_rounded),
    ];
    final cards = <Widget>[];
    for (final r in roles) {
      final name = (m.personnelActif[r.$1] ?? '').trim();
      if (name.isNotEmpty) cards.add(DetailPersonCard(icon: r.$3, fonction: r.$2, name: name));
    }
    if (cards.isEmpty) {
      return CqCardSurface(
        child: Text('Aucun personnel renseigné', style: tInter(fontSize: 12, color: kCrmTextSub)),
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 12, runSpacing: 12, children: cards),
      if ((m.observationPersonnel ?? '').trim().isNotEmpty) ...[
        const SizedBox(height: 12),
        CqCardSurface(
          child: Text(m.observationPersonnel!, style: tInter(fontSize: 12, color: kCrmTextSub)),
        ),
      ],
    ]);
  }

  // ── 4. OBSERVATION ──────────────────────────────────────────────────────

  Widget _observationCard(PorPromeshModel m) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: kMelangeColor.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.chat_bubble_outline_rounded, size: 16, color: kMelangeColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: kCrmBg, borderRadius: BorderRadius.circular(kCqInnerRadius)),
              child: Text(
                (m.observationsGenerales ?? '').trim().isEmpty ? 'Aucune observation.' : m.observationsGenerales!,
                style: tInter(fontSize: 12.5, color: kCrmText, height: 1.4),
              ),
            ),
          ),
        ]),
        if (m.attachments.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(spacing: 10, runSpacing: 10, children: [for (final a in m.attachments) _attachmentTile(a)]),
        ],
      ]),
    );
  }

  bool _isImage(String fileUrl) => _imageExtensions.any((ext) => fileUrl.toLowerCase().endsWith(ext));
  String _fullUrl(String fileUrl) => '${ApiClient.instance.dio.options.baseUrl}$fileUrl';

  Widget _attachmentTile(Map<String, dynamic> a) {
    final fileUrl = (a['fileUrl'] ?? '').toString();
    final fileName = (a['fileName'] ?? '').toString();
    return Container(
      width: 110,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: kCrmBg, borderRadius: BorderRadius.circular(kCqInnerRadius), border: Border.all(color: kCrmBorder)),
      child: Column(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: _isImage(fileUrl)
              ? Image.network(_fullUrl(fileUrl),
                  height: 64, width: 90, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined, size: 32, color: kCrmTextSub))
              : Container(
                  height: 64,
                  width: 90,
                  color: kCrmSurface,
                  alignment: Alignment.center,
                  child: const Icon(Icons.insert_drive_file_outlined, size: 28, color: kCrmTextSub),
                ),
        ),
        const SizedBox(height: 4),
        Text(fileName.isEmpty ? 'Fichier' : fileName,
            maxLines: 1, overflow: TextOverflow.ellipsis, style: tInter(fontSize: 9.5, color: kCrmTextSub)),
      ]),
    );
  }

  // ── 5. NON-CONFORMITÉ ───────────────────────────────────────────────────

  Widget _nonConformiteCard(PorPromeshModel m) {
    final isNonConforme = m.conformite == 'non_conforme';
    final hasStatus = m.conformite != null;
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (hasStatus)
          _badge(
            isNonConforme ? 'Non Conforme' : 'Conforme',
            isNonConforme ? kCrmDanger : kCrmSuccess,
            isNonConforme ? Icons.cancel_rounded : Icons.check_circle_rounded,
          )
        else
          Text('Statut non renseigné', style: tInter(fontSize: 12, color: kCrmTextSub)),
        if (isNonConforme) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: kCrmDanger.withOpacity(0.06),
              borderRadius: BorderRadius.circular(kCqInnerRadius),
              border: Border.all(color: kCrmDanger.withOpacity(0.3)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(Icons.report_gmailerrorred_rounded, size: 16, color: kCrmDanger),
                const SizedBox(width: 8),
                Text('Détail de la non-conformité',
                    style: tInter(fontSize: 12.5, fontWeight: FontWeight.w800, color: kCrmDanger)),
              ]),
              const SizedBox(height: 10),
              _alertField('Description', safeValue(m.descriptionNonConformite)),
              const SizedBox(height: 8),
              _alertField('Actions Correctives', safeValue(m.actionsCorrectives)),
            ]),
          ),
          if ((m.photoNonConformite ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            _attachmentTile({'fileUrl': m.photoNonConformite, 'fileName': 'Photo'}),
          ],
        ],
      ]),
    );
  }

  Widget _alertField(String label, String value) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: kCrmDanger)),
      const SizedBox(height: 2),
      Text(value.isEmpty ? '—' : value, style: tInter(fontSize: 12.5, color: kCrmText)),
    ]);
  }

  // ── 6. CONTRÔLE MACHINE ─────────────────────────────────────────────────

  Widget _controleMachineSection(PorPromeshModel m) {
    final justification = (m.justificationControleMachine ?? '').trim();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 12, runSpacing: 12, children: [
        DetailMachineValueCard(
          icon: Icons.air_rounded,
          title: 'Air',
          value: safeValue(m.air),
          color: detailAirColor(m.air),
        ),
        DetailMachineValueCard(
          icon: Icons.water_drop_outlined,
          title: 'Niveau Bain Eau',
          value: safeValue(m.niveauBainEau),
          color: detailNiveauBainEauColor(m.niveauBainEau),
        ),
        DetailMachineValueCard(
          icon: Icons.thermostat_outlined,
          title: 'Température Eau',
          value: m.temperatureEau == null ? '' : '${_fmtNum(m.temperatureEau)} °C',
          color: detailTemperatureEauColor(m.temperatureEau),
        ),
        DetailMachineValueCard(
          icon: Icons.local_fire_department_rounded,
          title: 'Température des Pistons',
          value: m.temperaturePistons == null ? '' : '${_fmtNum(m.temperaturePistons)} °C',
          color: kCrmInfo,
        ),
        DetailMachineValueCard(
          icon: Icons.settings_outlined,
          title: 'État Pistons',
          value: safeValue(m.etatPistons),
          color: detailEtatPistonsColor(m.etatPistons),
        ),
        DetailMachineValueCard(
          icon: Icons.visibility_outlined,
          title: 'Fluide Visuel',
          value: safeValue(m.fluideVisuel),
          color: detailFluideVisuelColor(m.fluideVisuel),
        ),
        DetailMachineValueCard(
          icon: Icons.content_cut_rounded,
          title: 'État Disque Coupe',
          value: safeValue(m.etatDisqueCoupe),
          color: detailEtatDisqueCoupeColor(m.etatDisqueCoupe),
        ),
      ]),
      if (justification.isNotEmpty) ...[
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: kCrmWarning.withOpacity(0.06),
            borderRadius: BorderRadius.circular(kCqInnerRadius),
            border: Border.all(color: kCrmWarning.withOpacity(0.3)),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.note_alt_outlined, size: 15, color: kCrmWarning),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Justification', style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: kCrmWarning)),
                const SizedBox(height: 2),
                Text(justification, style: tInter(fontSize: 12, color: kCrmText)),
              ]),
            ),
          ]),
        ),
      ],
    ]);
  }

  // ── 7. CONTRÔLE QUALITÉ ─────────────────────────────────────────────────

  Widget _qualiteProduitCard(PorPromeshModel m) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const CqCardHeader(
          icon: Icons.straighten_rounded,
          title: 'Contrôle Qualité Produit',
          subtitle: 'Heure, numéro de plaque, maille, longueur, largeur, statut',
          color: kMaintenanceColor,
        ),
        const SizedBox(height: 10),
        QualityMeasuresTable(rows: m.controlesQualite),
      ]),
    );
  }

  Widget _observationResponsableCard(PorPromeshModel m) {
    return CqCardSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const CqCardHeader(icon: Icons.notes_rounded, title: 'Observation Responsable Production', color: kCrmInfo),
        const SizedBox(height: 6),
        Text(
          (m.observationsGenerales ?? '').trim().isEmpty ? 'Aucune observation.' : m.observationsGenerales!,
          style: tInter(fontSize: 12, color: kCrmText),
        ),
      ]),
    );
  }

  // Les sections "Contrôle Process" (14 paramètres × 08h20/10h20/14h20) et
  // "Paramètres du Poste" (P1/P2) ont été retirées de l'affichage : toutes
  // les informations utiles sont déjà visibles dans la section "Contrôle
  // Machine" ci-dessus, plus besoin de dupliquer ces données. Aucune donnée
  // backend supprimée — `m.processControl` continue de les contenir, cet
  // écran ne les affiche simplement plus.

  // ── 10. HISTORIQUE ──────────────────────────────────────────────────────

  Widget _historiqueSection(PorPromeshModel m) {
    final createdLabel =
        (m.creator?['email']?.trim().isNotEmpty ?? false) ? m.creator!['email']! : safeValue(m.createdBy);
    return Wrap(spacing: 12, runSpacing: 12, children: [
      DetailInfoCard(icon: Icons.person_outline_rounded, label: 'Créé par', value: createdLabel),
      DetailInfoCard(icon: Icons.calendar_today_outlined, label: 'Créé le', value: _formatDateTime(m.createdAt)),
      DetailInfoCard(icon: Icons.edit_calendar_outlined, label: 'Modifié le', value: _formatDateTime(m.updatedAt)),
      DetailInfoCard(icon: Icons.verified_outlined, label: 'Validé le', value: safeValue(m.dateValidationProcess)),
    ]);
  }

  // ── BANNIÈRE VERROUILLÉE ─────────────────────────────────────────────────

  Widget _lockedBanner() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: _kLockedColor.withOpacity(0.08),
        borderRadius: BorderRadius.circular(kCqInnerRadius),
        border: Border.all(color: _kLockedColor.withOpacity(0.4)),
      ),
      child: Row(children: [
        const Icon(Icons.lock_rounded, size: 18, color: _kLockedColor),
        const SizedBox(width: 10),
        Expanded(
          child: Text('Cette fiche est verrouillée et ne peut plus être modifiée ni supprimée.',
              style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: _kLockedColor)),
        ),
      ]),
    );
  }

  // ── HELPERS PARTAGÉS ────────────────────────────────────────────────────

  Widget _badge(String label, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 15, color: color),
        const SizedBox(width: 6),
        Text(label, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w800, color: color)),
      ]),
    );
  }

  String _fmtNum(num? v) {
    if (v == null || v.isNaN) return '';
    if (v == v.roundToDouble()) return v.toInt().toString();
    return v.toStringAsFixed(2);
  }

  String _formatDateTime(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final d = DateTime.tryParse(iso);
    if (d == null) return safeValue(iso);
    return DateFormat('dd/MM/yyyy HH:mm').format(d);
  }
}
