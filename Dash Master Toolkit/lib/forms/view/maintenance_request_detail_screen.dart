// lib/forms/view/maintenance_request_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/models/maintenance_request_model.dart';
import 'package:dash_master_toolkit/services/maintenance_request_service.dart';
import 'package:dash_master_toolkit/providers/maintenance_request_provider.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

class MaintenanceRequestDetailScreen extends StatefulWidget {
  final String requestId;
  const MaintenanceRequestDetailScreen({super.key, required this.requestId});

  @override
  State<MaintenanceRequestDetailScreen> createState() => _MaintenanceRequestDetailScreenState();
}

class _MaintenanceRequestDetailScreenState extends State<MaintenanceRequestDetailScreen> with SingleTickerProviderStateMixin {
  final _service = MaintenanceRequestService.instance;
  late TabController _tabController;

  bool _loading = true;
  MaintenanceRequest? _request;
  List<MaintenanceRequestComment> _comments = [];
  List<MaintenanceRequestActivity> _activities = [];
  final _commentCtrl = TextEditingController();
  bool _sendingComment = false;

  bool get _canManage => AuthService().canManageMaintenanceRequests;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _service.fetchById(widget.requestId),
        _service.fetchComments(widget.requestId),
        _service.fetchHistory(widget.requestId),
      ]);
      if (!mounted) return;
      setState(() {
        _request = results[0] as MaintenanceRequest;
        _comments = results[1] as List<MaintenanceRequestComment>;
        _activities = results[2] as List<MaintenanceRequestActivity>;
      });
    } catch (e) {
      debugPrint('[MaintenanceRequestDetail] load error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sendComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _sendingComment = true);
    try {
      final comment = await _service.addComment(widget.requestId, text);
      setState(() {
        _comments = [..._comments, comment];
        _commentCtrl.clear();
      });
    } catch (e) {
      debugPrint('[MaintenanceRequestDetail] comment error: $e');
    } finally {
      if (mounted) setState(() => _sendingComment = false);
    }
  }

  Future<void> _accept() async {
    await MaintenanceRequestProvider.to.acceptRequest(widget.requestId);
    _load();
  }

  Future<void> _reject() async {
    final ctrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Refuser la demande', style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: TextField(controller: ctrl, maxLines: 3, decoration: InputDecoration(hintText: 'Motif du refus...', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text('Annuler', style: tInter(color: kCrmTextSub))),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, ctrl.text.trim()),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            child: Text('Refuser', style: tInter(color: Colors.white)),
          ),
        ],
      ),
    );
    if (reason == null) return;
    await MaintenanceRequestProvider.to.rejectRequest(widget.requestId, reason: reason);
    _load();
  }

  Future<void> _assign() async {
    await MaintenanceRequestProvider.to.loadTechnicians();
    if (!mounted) return;
    String? selectedId;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('Affecter un technicien', style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
          content: Obx(() => DropdownButtonFormField<String>(
                initialValue: selectedId,
                items: MaintenanceRequestProvider.to.technicians.map((t) => DropdownMenuItem(value: t.id, child: Text(t.name))).toList(),
                onChanged: (v) => setDialogState(() => selectedId = v),
                decoration: InputDecoration(labelText: 'Technicien', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10))),
              )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: Text('Annuler', style: tInter(color: kCrmTextSub))),
            ElevatedButton(onPressed: selectedId == null ? null : () => Navigator.pop(dialogContext, true), child: const Text('Affecter')),
          ],
        );
      }),
    );
    if (confirmed == true && selectedId != null) {
      await MaintenanceRequestProvider.to.assignTechnician(widget.requestId, selectedId!);
      _load();
    }
  }

  Future<void> _start() async {
    await MaintenanceRequestProvider.to.startRequest(widget.requestId);
    _load();
  }

  Future<void> _complete() async {
    await MaintenanceRequestProvider.to.completeRequest(widget.requestId);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(_request == null ? 'Fiche maintenance' : '#${_request!.ticketNo} · ${_request!.equipement}', style: tInter(fontSize: 15, fontWeight: FontWeight.w700, color: kCrmText)),
      ),
      body: _loading || _request == null
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : _buildBody(_request!),
    );
  }

  Widget _buildBody(MaintenanceRequest r) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (_canManage) _actionsBar(r),
        _infoCard(r),
        const SizedBox(height: 16),
        if (r.photos.isNotEmpty) ...[_photosSection(r), const SizedBox(height: 16)],
        _tabsSection(),
      ]),
    );
  }

  Widget _actionsBar(MaintenanceRequest r) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Wrap(spacing: 8, runSpacing: 8, children: [
        if (r.isEnAttente) _actionBtn('Accepter', Icons.check_circle_outline_rounded, const Color(0xFF16A34A), _accept),
        if (r.isEnAttente) _actionBtn('Refuser', Icons.cancel_outlined, const Color(0xFFDC2626), _reject),
        if (r.isAcceptee) _actionBtn('Affecter un technicien', Icons.engineering_outlined, const Color(0xFF2563EB), _assign),
        if (r.isAcceptee && r.technicianId != null) _actionBtn('Passer en cours', Icons.play_circle_outline_rounded, const Color(0xFF2563EB), _start),
        if (r.isEnCours) _actionBtn('Marquer terminée', Icons.task_alt_rounded, const Color(0xFF16A34A), _complete),
      ]),
    );
  }

  Widget _actionBtn(String label, IconData icon, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withValues(alpha: 0.3))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(label, style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
        ]),
      ),
    );
  }

  Widget _infoCard(MaintenanceRequest r) {
    final statusColor = _statusColor(r.statut);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.grey.shade200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('Informations générales', style: tInter(fontSize: 15, fontWeight: FontWeight.w800, color: kCrmText))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: statusColor.withValues(alpha: 0.3))),
            child: Text(_statusLabel(r.statut), style: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: statusColor)),
          ),
        ]),
        const SizedBox(height: 16),
        Wrap(spacing: 24, runSpacing: 16, children: [
          _infoField('Équipement', r.equipement),
          _infoField('Type de panne', r.typePanne),
          _infoField('Urgence', _urgenceLabel(r.urgence)),
          _infoField('Demandeur', '${r.requesterName} (${r.requesterEmail})'),
          _infoField('Date de création', DateFormat('dd/MM/yyyy à HH:mm').format(r.createdAt)),
          if (r.technicianName != null) _infoField('Technicien assigné', r.technicianName!),
          if (r.processedAt != null) _infoField('Date de traitement', DateFormat('dd/MM/yyyy à HH:mm').format(r.processedAt!)),
          if (r.assignedAt != null) _infoField('Date d\'affectation', DateFormat('dd/MM/yyyy à HH:mm').format(r.assignedAt!)),
          if (r.startedAt != null) _infoField('Début d\'intervention', DateFormat('dd/MM/yyyy à HH:mm').format(r.startedAt!)),
          if (r.isRefusee && (r.rejectionReason ?? '').isNotEmpty) _infoField('Motif du refus', r.rejectionReason!),
        ]),
        const SizedBox(height: 16),
        Text('Description', style: tInter(fontSize: 11, fontWeight: FontWeight.w600, color: kCrmTextSub, letterSpacing: 0.4)),
        const SizedBox(height: 6),
        Text(r.description.isEmpty ? '—' : r.description, style: tInter(fontSize: 13, color: kCrmText)),
      ]),
    );
  }

  Widget _infoField(String label, String value) {
    return SizedBox(
      width: 260,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: tInter(fontSize: 10, fontWeight: FontWeight.w600, color: kCrmTextSub, letterSpacing: 0.4)),
        const SizedBox(height: 4),
        Text(value, style: tInter(fontSize: 13, color: kCrmText, fontWeight: FontWeight.w500)),
      ]),
    );
  }

  Widget _photosSection(MaintenanceRequest r) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.grey.shade200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Photos', style: tInter(fontSize: 15, fontWeight: FontWeight.w800, color: kCrmText)),
        const SizedBox(height: 12),
        Wrap(spacing: 10, runSpacing: 10, children: r.photos.map((path) {
          final url = path.startsWith('http') ? path : '${ApiConfig.baseUrl}$path';
          return ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.network(url, width: 110, height: 110, fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(width: 110, height: 110, color: Colors.grey.shade200, child: const Icon(Icons.broken_image_outlined))),
          );
        }).toList()),
      ]),
    );
  }

  Widget _tabsSection() {
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.grey.shade200)),
      child: Column(children: [
        TabBar(
          controller: _tabController,
          labelColor: kCrmPrimary,
          unselectedLabelColor: kCrmTextSub,
          indicatorColor: kCrmPrimary,
          tabs: const [Tab(text: 'Historique'), Tab(text: 'Commentaires')],
        ),
        SizedBox(
          height: 360,
          child: TabBarView(controller: _tabController, children: [_historyTab(), _commentsTab()]),
        ),
      ]),
    );
  }

  Widget _historyTab() {
    if (_activities.isEmpty) {
      return Center(child: Text('Aucun historique.', style: tInter(fontSize: 13, color: kCrmTextSub)));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _activities.length,
      itemBuilder: (_, i) {
        final a = _activities[i];
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              margin: const EdgeInsets.only(top: 4),
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: kCrmPrimary, shape: BoxShape.circle),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(a.message, style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: kCrmText)),
                const SizedBox(height: 2),
                Text('${a.actorName} · ${DateFormat('dd/MM/yyyy HH:mm').format(a.createdAt)}', style: tInter(fontSize: 11, color: kCrmTextSub)),
              ]),
            ),
          ]),
        );
      },
    );
  }

  Widget _commentsTab() {
    return Column(children: [
      Expanded(
        child: _comments.isEmpty
            ? Center(child: Text('Aucun commentaire.', style: tInter(fontSize: 13, color: kCrmTextSub)))
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _comments.length,
                itemBuilder: (_, i) {
                  final c = _comments[i];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(c.senderName, style: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: kCrmTextSub)),
                      const SizedBox(height: 3),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                        decoration: BoxDecoration(color: const Color(0xFFF8F9FA), borderRadius: BorderRadius.circular(10)),
                        child: Text(c.message, style: tInter(fontSize: 13, color: kCrmText)),
                      ),
                      const SizedBox(height: 2),
                      Text(DateFormat('dd/MM/yyyy HH:mm').format(c.createdAt), style: tInter(fontSize: 10, color: kCrmTextSub)),
                    ]),
                  );
                },
              ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _commentCtrl,
              minLines: 1,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Écrire un commentaire...',
                filled: true,
                fillColor: const Color(0xFFF8F9FA),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
              style: tInter(fontSize: 13),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: _sendingComment ? null : _sendComment,
            icon: _sendingComment
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Icon(Icons.send_rounded, color: kCrmPrimary),
          ),
        ]),
      ),
    ]);
  }
}

Color _statusColor(String statut) {
  switch (statut) {
    case 'acceptee': return const Color(0xFF16A34A);
    case 'en_cours': return const Color(0xFF2563EB);
    case 'refusee': return const Color(0xFFDC2626);
    case 'terminee': return const Color(0xFF64748B);
    default: return const Color(0xFFD97706);
  }
}

String _statusLabel(String statut) {
  switch (statut) {
    case 'acceptee': return 'Acceptée';
    case 'en_cours': return 'En cours';
    case 'refusee': return 'Refusée';
    case 'terminee': return 'Terminée';
    default: return 'En attente';
  }
}

String _urgenceLabel(String urgence) {
  switch (urgence) {
    case 'critique': return 'Critique';
    case 'faible': return 'Faible';
    default: return 'Moyenne';
  }
}
