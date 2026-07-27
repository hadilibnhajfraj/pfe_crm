// lib/forms/hr/view/hr_detail_screen.dart
//
// Détail d'une demande RH — toutes les informations (lecture seule) + le
// PDF officiel généré par le backend (jamais montré pendant la saisie,
// uniquement ici, via Télécharger / Imprimer).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher_string.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../theme/hr_theme.dart';
import '../model/hr_request_model.dart';
import '../service/hr_request_service.dart';
import '../provider/hr_request_provider.dart';
import 'widgets/employee_info_card.dart';

class HrDetailScreen extends StatefulWidget {
  final String id;
  const HrDetailScreen({super.key, required this.id});

  @override
  State<HrDetailScreen> createState() => _HrDetailScreenState();
}

class _HrDetailScreenState extends State<HrDetailScreen> {
  bool _loading = true;
  bool _exporting = false;
  String? _error;
  HrRequestModel? _request;
  List<HrRequestActivityModel> _history = [];

  bool get _canManage => AuthService().canManageHrRequests;

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
      final r = await HrRequestService.instance.fetchById(widget.id);
      final history = await HrRequestService.instance.fetchHistory(widget.id);
      if (!mounted) return;
      setState(() {
        _request = r;
        _history = history;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _accept() async {
    final comment = await _promptComment(AppLocalizations.of(context).translate('Accepter la demande'));
    if (comment == null) return;
    await HrRequestProvider.to.acceptRequest(widget.id, comment: comment.isEmpty ? null : comment);
    _load();
  }

  Future<void> _reject() async {
    final comment = await _promptComment(AppLocalizations.of(context).translate('Refuser la demande'));
    if (comment == null) return;
    await HrRequestProvider.to.rejectRequest(widget.id, comment: comment.isEmpty ? null : comment);
    _load();
  }

  Future<void> _markProcessed() async {
    await HrRequestProvider.to.markProcessed(widget.id);
    _load();
  }

  Future<void> _addComment() async {
    final comment = await _promptComment(AppLocalizations.of(context).translate('Ajouter un commentaire'), initial: _request?.reviewComment);
    if (comment == null || comment.isEmpty) return;
    await HrRequestProvider.to.addComment(widget.id, comment);
    _load();
  }

  Future<String?> _promptComment(String title, {String? initial}) async {
    final ctrl = TextEditingController(text: initial ?? '');
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(title, style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: TextField(
          controller: ctrl,
          maxLines: 3,
          decoration: InputDecoration(hintText: AppLocalizations.of(context).translate('Commentaire (facultatif)...'), border: OutlineInputBorder(borderRadius: BorderRadius.circular(10))),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(AppLocalizations.of(context).translate('Annuler'), style: tInter(color: kCrmTextSub))),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, ctrl.text.trim()),
            style: ElevatedButton.styleFrom(backgroundColor: kHrColor, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
            child: Text(AppLocalizations.of(context).translate('Confirmer'), style: tInter(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _download() async {
    setState(() => _exporting = true);
    try {
      final bytes = await HrRequestService.instance.fetchPdfBytes(widget.id);
      await Printing.sharePdf(bytes: bytes, filename: 'demande-rh-${widget.id}.pdf');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur export PDF')} : $e'), backgroundColor: kHrRefused));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _print() async {
    setState(() => _exporting = true);
    try {
      final bytes = await HrRequestService.instance.fetchPdfBytes(widget.id);
      await Printing.layoutPdf(onLayout: (_) async => bytes);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur impression')} : $e'), backgroundColor: kHrRefused));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _request;
    final statut = r == null ? null : hrStatutInfo(r.statut);

    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                InkWell(
                  onTap: () => context.go(MyRoute.hrHistoriqueScreen),
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
                  child: Text(AppLocalizations.of(context).translate('Détail Demande RH'), style: tInter(fontSize: 17, fontWeight: FontWeight.w900, color: kCrmText)),
                ),
                if (statut != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(color: statut.color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(statut.emoji, style: const TextStyle(fontSize: 12)),
                      const SizedBox(width: 5),
                      Text(AppLocalizations.of(context).translate(statut.label), style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: statut.color)),
                    ]),
                  ),
              ]),
              const SizedBox(height: 20),

              if (_loading)
                const Center(child: CircularProgressIndicator())
              else if (_error != null)
                Text('${AppLocalizations.of(context).translate('Erreur')} : $_error', style: tInter(color: kHrRefused))
              else if (r != null) ...[
                if (_canManage) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(12), border: Border.all(color: kCrmBorder)),
                    child: Wrap(spacing: 8, runSpacing: 8, children: [
                      if (r.isEnAttente) _ActionBtn(label: 'Accepter', icon: Icons.check_circle_outline_rounded, color: kHrAccepted, onTap: _accept),
                      if (r.isEnAttente) _ActionBtn(label: 'Refuser', icon: Icons.cancel_outlined, color: kHrRefused, onTap: _reject),
                      if (r.isAcceptee) _ActionBtn(label: 'Marquer traitée', icon: Icons.task_alt_rounded, color: kHrProcessed, onTap: _markProcessed),
                      _ActionBtn(label: 'Ajouter un commentaire', icon: Icons.chat_bubble_outline_rounded, color: kHrColor, onTap: _addComment),
                    ]),
                  ),
                  const SizedBox(height: 16),
                ],
                Wrap(spacing: 8, runSpacing: 8, children: [
                  _ActionBtn(label: 'Télécharger', icon: Icons.download_rounded, color: kHrColor, onTap: _exporting ? null : _download),
                  _ActionBtn(label: 'Imprimer', icon: Icons.print_outlined, color: kCrmTextSub, onTap: _exporting ? null : _print),
                ]),
                const SizedBox(height: 20),

                EmployeeInfoCard(
                  nom: r.employeeNom,
                  prenom: r.employeePrenom,
                  matricule: r.employeeMatricule,
                  qualification: r.employeeQualification,
                  departement: r.employeeDepartement,
                  service: r.employeeService,
                  email: r.employeeEmail,
                ),
                const SizedBox(height: 16),

                _InfoGrid(rows: [
                  (AppLocalizations.of(context).translate('Type de demande'), r.isConge ? AppLocalizations.of(context).translate('Congé') : AppLocalizations.of(context).translate('Autorisation de sortie')),
                  if (r.isConge) ...[
                    (AppLocalizations.of(context).translate('Type de congé'), r.typeConge == 'maladie' ? AppLocalizations.of(context).translate('Congé maladie') : AppLocalizations.of(context).translate('Congé ordinaire')),
                    (AppLocalizations.of(context).translate('Date début'), _fmt(r.dateDebut)),
                    (AppLocalizations.of(context).translate('Date fin'), _fmt(r.dateFin)),
                    (AppLocalizations.of(context).translate('Nombre de jours ouvrables'), '${r.nombreJours ?? '-'}'),
                    (AppLocalizations.of(context).translate('Année'), '${r.anneeConge ?? '-'}'),
                    (AppLocalizations.of(context).translate('Adresse'), r.adresse ?? '-'),
                    (AppLocalizations.of(context).translate('Téléphone'), r.telephone ?? '-'),
                  ] else ...[
                    (AppLocalizations.of(context).translate('Motif'), r.motif ?? '-'),
                    (AppLocalizations.of(context).translate('Date'), _fmt(r.dateSortie)),
                    (AppLocalizations.of(context).translate('Heure de sortie'), r.heureSortie ?? '-'),
                    (AppLocalizations.of(context).translate('Heure de retour'), r.heureRetour ?? '-'),
                  ],
                  if ((r.commentaire ?? '').trim().isNotEmpty) (AppLocalizations.of(context).translate('Commentaire'), r.commentaire!),
                  (AppLocalizations.of(context).translate('Signature numérique'), r.signature ?? '-'),
                  (AppLocalizations.of(context).translate('Date de la demande'), _fmtDateTime(r.createdAt)),
                  if ((r.reviewComment ?? '').trim().isNotEmpty) (AppLocalizations.of(context).translate('Commentaire du Responsable RH'), r.reviewComment!),
                  if (r.reviewedByName != null) (AppLocalizations.of(context).translate('Traité par'), r.reviewedByName!),
                  if (r.processedByName != null) (AppLocalizations.of(context).translate('Marqué traitée par'), r.processedByName!),
                ]),

                if (r.justificatifs.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _JustificatifsSection(paths: r.justificatifs),
                ],

                const SizedBox(height: 16),
                _HistorySection(activities: _history),
              ],
              const SizedBox(height: 20),
            ]),
          ),
        ),
      ),
    );
  }

  String _fmt(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy').format(d);
  }

  String _fmtDateTime(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy HH:mm').format(d);
  }
}

class _JustificatifsSection extends StatelessWidget {
  final List<String> paths;
  const _JustificatifsSection({required this.paths});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(12), border: Border.all(color: kCrmBorder)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(AppLocalizations.of(context).translate('Justificatifs'), style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText)),
        const SizedBox(height: 12),
        Wrap(spacing: 10, runSpacing: 10, children: paths.map((path) {
          final url = path.startsWith('http') ? path : '${ApiConfig.baseUrl}$path';
          final isImage = path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg') || path.toLowerCase().endsWith('.png');
          return InkWell(
            onTap: () => launchUrlString(url),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 110,
              height: 110,
              decoration: BoxDecoration(color: kCrmBg, borderRadius: BorderRadius.circular(10), border: Border.all(color: kCrmBorder)),
              child: isImage
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(url, fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined)),
                    )
                  : const Center(child: Icon(Icons.picture_as_pdf_outlined, size: 32, color: kHrRefused)),
            ),
          );
        }).toList()),
      ]),
    );
  }
}

class _HistorySection extends StatelessWidget {
  final List<HrRequestActivityModel> activities;
  const _HistorySection({required this.activities});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(12), border: Border.all(color: kCrmBorder)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(AppLocalizations.of(context).translate('Historique'), style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText)),
        const SizedBox(height: 12),
        if (activities.isEmpty)
          Text(AppLocalizations.of(context).translate('Aucun historique.'), style: tInter(fontSize: 13, color: kCrmTextSub))
        else
          ...activities.map((a) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(margin: const EdgeInsets.only(top: 4), width: 8, height: 8, decoration: const BoxDecoration(color: kHrColor, shape: BoxShape.circle)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(a.message, style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: kCrmText)),
                      const SizedBox(height: 2),
                      Text('${a.actorName} · ${DateFormat('dd/MM/yyyy HH:mm').format(a.createdAt)}', style: tInter(fontSize: 11, color: kCrmTextSub)),
                    ]),
                  ),
                ]),
              )),
      ]),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;
  const _ActionBtn({required this.label, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    final effectiveColor = disabled ? kCrmBorder : color;
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 15, color: effectiveColor),
      label: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: effectiveColor)),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: effectiveColor.withOpacity(0.5)),
        backgroundColor: effectiveColor.withOpacity(0.06),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      ),
    );
  }
}

class _InfoGrid extends StatelessWidget {
  final List<(String, String)> rows;
  const _InfoGrid({required this.rows});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: kCrmSurface, borderRadius: BorderRadius.circular(12), border: Border.all(color: kCrmBorder)),
      child: Column(children: [
        for (int i = 0; i < rows.length; i++)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: i.isOdd ? kCrmBg.withOpacity(0.5) : kCrmSurface,
              borderRadius: i == rows.length - 1 ? const BorderRadius.vertical(bottom: Radius.circular(12)) : BorderRadius.zero,
              border: i < rows.length - 1 ? const Border(bottom: BorderSide(color: kCrmBorder)) : null,
            ),
            child: Row(children: [
              Expanded(flex: 2, child: Text(rows[i].$1, style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmTextSub))),
              Expanded(flex: 3, child: Text(rows[i].$2, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText))),
            ]),
          ),
      ]),
    );
  }
}
