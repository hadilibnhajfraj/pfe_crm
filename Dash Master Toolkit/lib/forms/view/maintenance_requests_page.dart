// lib/forms/view/maintenance_requests_page.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/providers/maintenance_request_provider.dart';
import 'package:dash_master_toolkit/models/maintenance_request_model.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/maintenance_request_dialog.dart';

// ══════════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════════
class MaintenanceRequestsPage extends StatelessWidget {
  const MaintenanceRequestsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = MaintenanceRequestProvider.to;

    // provider.canManage n'est pas une variable Rx (simple getter dérivé du
    // rôle/email utilisateur, fixe pour la session) — ne jamais l'entourer d'Obx.
    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      floatingActionButton: provider.canManage
          ? null
          : FloatingActionButton.extended(
              onPressed: () => showMaintenanceRequestDialog(context),
              backgroundColor: kCrmPrimary,
              icon: const Icon(Icons.add_rounded, color: Colors.white),
              label: const Text('Nouvelle demande', style: TextStyle(color: Colors.white)),
            ),
      body: Obx(() {
        if (provider.loading.value) {
          return const Center(child: CircularProgressIndicator(strokeWidth: 2));
        }
        if (provider.canManage) {
          return _ManagerBody(provider: provider);
        }
        if (provider.requests.isEmpty) {
          return const _EmptyState();
        }
        return _UserBody(provider: provider);
      }),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// USER BODY — cartes "mes demandes"
// ══════════════════════════════════════════════════════════════════════════
class _UserBody extends StatelessWidget {
  final MaintenanceRequestProvider provider;
  const _UserBody({required this.provider});

  @override
  Widget build(BuildContext context) {
    return Obx(() => ListView.builder(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 90),
          itemCount: provider.requests.length,
          itemBuilder: (_, i) => _RequestCard(request: provider.requests[i]),
        ));
  }
}

class _RequestCard extends StatelessWidget {
  final MaintenanceRequest request;
  const _RequestCard({required this.request});

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(request.statut);
    final statusLabel = _statusLabel(request.statut);
    final statusIcon = _statusIcon(request.statut);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: request.isEnAttente ? const Color(0xFFD97706).withValues(alpha: 0.25) : Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.04),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            border: Border(bottom: BorderSide(color: Colors.grey.shade100)),
          ),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(color: kCrmPrimary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
              child: Icon(Icons.build_rounded, size: 18, color: kCrmPrimary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('#${request.ticketNo} · ${request.equipement}',
                    style: tInter(fontSize: 14, fontWeight: FontWeight.w700, color: kCrmText), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(request.typePanne, style: tInter(fontSize: 11, color: kCrmTextSub), overflow: TextOverflow.ellipsis),
              ]),
            ),
            _urgenceBadge(request.urgence),
            const SizedBox(width: 6),
            _statusBadge(statusColor, statusIcon, statusLabel),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _field('Description', request.description),
            if (request.isRefusee && (request.rejectionReason ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              _field('Motif du refus', request.rejectionReason ?? ''),
            ],
            if (request.technicianName != null) ...[
              const SizedBox(height: 12),
              _field('Technicien assigné', request.technicianName!),
            ],
            const SizedBox(height: 12),
            Row(children: [
              Icon(Icons.access_time_rounded, size: 13, color: kCrmTextSub),
              const SizedBox(width: 5),
              Text(_fmtDateTime(request.createdAt), style: tInter(fontSize: 11, color: kCrmTextSub)),
            ]),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: _outlinedBtn(
            icon: Icons.visibility_outlined,
            label: 'Voir la fiche',
            color: kCrmPrimary,
            onTap: () => context.push('/forms/maintenance-requests/details?id=${request.id}'),
          ),
        ),
      ]),
    );
  }

  Widget _field(String label, String value) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: tInter(fontSize: 10, fontWeight: FontWeight.w600, color: kCrmTextSub, letterSpacing: 0.4)),
      const SizedBox(height: 4),
      Text(value.isEmpty ? '—' : value, style: tInter(fontSize: 13, color: kCrmText, fontWeight: FontWeight.w500), maxLines: 3, overflow: TextOverflow.ellipsis),
    ]);
  }

  Widget _outlinedBtn({required IconData icon, required String label, required Color color, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withValues(alpha: 0.28))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Text(label, style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ]),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(color: kCrmPrimary.withValues(alpha: 0.07), shape: BoxShape.circle),
          child: Icon(Icons.build_outlined, size: 44, color: kCrmPrimary.withValues(alpha: 0.6)),
        ),
        const SizedBox(height: 18),
        Text('Aucune demande', style: tInter(fontSize: 16, fontWeight: FontWeight.w700, color: kCrmText)),
        const SizedBox(height: 6),
        Text('Vos demandes de maintenance apparaîtront ici.', style: tInter(fontSize: 13, color: kCrmTextSub)),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MANAGER BODY — centre de gestion : KPI + filtres + recherche + tableau
// ══════════════════════════════════════════════════════════════════════════
enum _ReqFilter { all, enAttente, acceptee, enCours, refusee, terminee, faible, moyenne, critique }

class _ManagerBody extends StatefulWidget {
  final MaintenanceRequestProvider provider;
  const _ManagerBody({required this.provider});

  @override
  State<_ManagerBody> createState() => _ManagerBodyState();
}

class _ManagerBodyState extends State<_ManagerBody> {
  _ReqFilter _filter = _ReqFilter.all;
  final _searchCtrl = TextEditingController();
  String _search = '';
  bool _sortDesc = true;
  int _page = 0;
  static const _kPageSizes = [10, 20, 50];
  int _pageSize = 10;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<MaintenanceRequest> _applyFilters(List<MaintenanceRequest> source) {
    var list = source.where((r) {
      switch (_filter) {
        case _ReqFilter.all: return true;
        case _ReqFilter.enAttente: return r.isEnAttente;
        case _ReqFilter.acceptee: return r.isAcceptee;
        case _ReqFilter.enCours: return r.isEnCours;
        case _ReqFilter.refusee: return r.isRefusee;
        case _ReqFilter.terminee: return r.isTerminee;
        case _ReqFilter.faible: return r.urgence == 'faible';
        case _ReqFilter.moyenne: return r.urgence == 'moyenne';
        case _ReqFilter.critique: return r.urgence == 'critique';
      }
    }).toList();

    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      list = list.where((r) =>
          r.equipement.toLowerCase().contains(q) ||
          r.typePanne.toLowerCase().contains(q) ||
          r.requesterName.toLowerCase().contains(q) ||
          r.requesterEmail.toLowerCase().contains(q)).toList();
    }

    list.sort((a, b) => _sortDesc ? b.createdAt.compareTo(a.createdAt) : a.createdAt.compareTo(b.createdAt));
    return list;
  }

  // Scaffold/header/pagination controls ne dépendent d'aucune variable Rx —
  // ils ne doivent pas être reconstruits à chaque changement de la liste.
  // Seuls le bloc KPI et le bloc tableau+pagination lisent provider.requests
  // / provider.stats (Rx) et sont donc isolés dans leur propre Obx.
  @override
  Widget build(BuildContext context) {
    return Column(children: [
      _header(context),
      Expanded(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Obx(() => _kpiRow()),
            const SizedBox(height: 24),
            _filterAndSearchRow(),
            const SizedBox(height: 16),
            _buildTableAndPagination(),
          ]),
        ),
      ),
    ]);
  }

  Widget _buildTableAndPagination() {
    return Obx(() {
      final all = widget.provider.requests;
      final filtered = _applyFilters(all);

      final totalPages = filtered.isEmpty ? 1 : ((filtered.length - 1) ~/ _pageSize) + 1;
      final safePage = _page.clamp(0, totalPages - 1);
      final start = safePage * _pageSize;
      final end = (start + _pageSize).clamp(0, filtered.length);
      final pageItems = start < filtered.length ? filtered.sublist(start, end) : <MaintenanceRequest>[];

      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _table(pageItems, sourceEmpty: all.isEmpty),
        const SizedBox(height: 12),
        _paginationRow(filtered.length, safePage, totalPages),
      ]);
    });
  }

  // ── Header ───────────────────────────────────────────────────────────────
  Widget _header(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(28, 22, 28, 18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [kCrmPrimary, kCrmPrimary.withValues(alpha: 0.75)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: kCrmPrimary.withValues(alpha: 0.25), blurRadius: 10, offset: const Offset(0, 4))],
          ),
          child: const Icon(Icons.build_rounded, size: 24, color: Colors.white),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Centre de gestion — Maintenance', style: tInter(fontSize: 19, fontWeight: FontWeight.w800, color: kCrmText)),
            const SizedBox(height: 3),
            Text('Administration › Demandes › Maintenance', style: tInter(fontSize: 12.5, color: kCrmTextSub)),
          ]),
        ),
        OutlinedButton.icon(
          onPressed: () => widget.provider.load(),
          icon: Icon(Icons.refresh_rounded, size: 17, color: kCrmTextSub),
          label: Text('Actualiser', style: tInter(fontSize: 12.5, color: kCrmTextSub, fontWeight: FontWeight.w600)),
          style: OutlinedButton.styleFrom(
            side: BorderSide(color: Colors.grey.shade300),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
        const SizedBox(width: 10),
        ElevatedButton.icon(
          onPressed: () => showMaintenanceRequestDialog(context),
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Nouvelle demande'),
          style: ElevatedButton.styleFrom(
            backgroundColor: kCrmPrimary,
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
          ),
        ),
      ]),
    );
  }

  // ── KPI ──────────────────────────────────────────────────────────────────
  Widget _kpiRow() {
    final stats = widget.provider.stats;
    final cards = [
      _KpiData('Total', stats['total'] ?? 0, const Color(0xFF64748B), Icons.assignment_outlined),
      _KpiData('En attente', stats['enAttente'] ?? 0, const Color(0xFFD97706), Icons.hourglass_top_rounded),
      _KpiData('Acceptées', stats['acceptee'] ?? 0, const Color(0xFF16A34A), Icons.check_circle_outline_rounded),
      _KpiData('Refusées', stats['refusee'] ?? 0, const Color(0xFFDC2626), Icons.cancel_outlined),
      _KpiData('En cours', stats['enCours'] ?? 0, const Color(0xFF2563EB), Icons.engineering_outlined),
      _KpiData('Terminées', stats['terminee'] ?? 0, const Color(0xFF64748B), Icons.task_alt_rounded),
      _KpiData('Critiques', stats['critique'] ?? 0, const Color(0xFFB91C1C), Icons.warning_amber_rounded),
      _KpiData("Aujourd'hui", stats['today'] ?? 0, const Color(0xFF7C3AED), Icons.today_rounded),
      _KpiData('Cette semaine', stats['thisWeek'] ?? 0, const Color(0xFF0891B2), Icons.date_range_rounded),
    ];

    return LayoutBuilder(builder: (context, constraints) {
      final perRow = constraints.maxWidth < 640 ? 2 : (constraints.maxWidth < 1000 ? 3 : (constraints.maxWidth < 1300 ? 4 : 5));
      final gap = 14.0;
      final width = (constraints.maxWidth - gap * (perRow - 1)) / perRow;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: cards.map((c) => SizedBox(width: width, child: _kpiCard(c))).toList(),
      );
    });
  }

  Widget _kpiCard(_KpiData c) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.035), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: c.color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(11)),
          alignment: Alignment.center,
          child: Icon(c.icon, size: 19, color: c.color),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${c.value}', style: tInter(fontSize: 21, fontWeight: FontWeight.w800, color: kCrmText)),
            Text(c.label, style: tInter(fontSize: 11, color: kCrmTextSub, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
          ]),
        ),
      ]),
    );
  }

  // ── Filtres + recherche ──────────────────────────────────────────────────
  Widget _filterAndSearchRow() {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _filterChip('Toutes', _ReqFilter.all),
        _filterChip('En attente', _ReqFilter.enAttente),
        _filterChip('Acceptée', _ReqFilter.acceptee),
        _filterChip('En cours', _ReqFilter.enCours),
        _filterChip('Refusée', _ReqFilter.refusee),
        _filterChip('Terminée', _ReqFilter.terminee),
        Container(width: 1, height: 22, color: Colors.grey.shade300),
        _filterChip('Faible', _ReqFilter.faible),
        _filterChip('Moyenne', _ReqFilter.moyenne),
        _filterChip('Critique', _ReqFilter.critique),
        SizedBox(
          width: 280,
          child: TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() { _search = v; _page = 0; }),
            decoration: InputDecoration(
              hintText: 'Rechercher (équipement, demandeur, email, panne)...',
              hintStyle: tInter(fontSize: 12, color: kCrmTextSub),
              prefixIcon: const Icon(Icons.search_rounded, size: 18),
              isDense: true,
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: kCrmPrimary)),
            ),
            style: tInter(fontSize: 12, color: kCrmText),
          ),
        ),
        InkWell(
          onTap: () => setState(() => _sortDesc = !_sortDesc),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.grey.shade300)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(_sortDesc ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, size: 14, color: kCrmTextSub),
              const SizedBox(width: 4),
              Text('Date', style: tInter(fontSize: 12, color: kCrmTextSub)),
            ]),
          ),
        ),
      ],
    );
  }

  Widget _filterChip(String label, _ReqFilter value) {
    final selected = _filter == value;
    return InkWell(
      onTap: () => setState(() { _filter = value; _page = 0; }),
      borderRadius: BorderRadius.circular(20),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? kCrmPrimary : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? kCrmPrimary : Colors.grey.shade300),
        ),
        child: Text(label, style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: selected ? Colors.white : kCrmTextSub)),
      ),
    );
  }

  // ── Tableau ──────────────────────────────────────────────────────────────
  Widget _table(List<MaintenanceRequest> items, {required bool sourceEmpty}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: LayoutBuilder(builder: (context, outer) {
          final tableWidth = outer.maxWidth < 1400 ? 1400.0 : outer.maxWidth;
          return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: tableWidth,
              child: Column(children: [
                _tableHeaderRow(),
                if (items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(40),
                    child: Column(children: [
                      Icon(Icons.inbox_outlined, size: 36, color: kCrmTextSub.withValues(alpha: 0.4)),
                      const SizedBox(height: 10),
                      Text(
                        sourceEmpty ? 'Aucune demande trouvée.' : 'Aucune demande ne correspond aux filtres.',
                        style: tInter(fontSize: 13, color: kCrmTextSub),
                      ),
                    ]),
                  )
                else
                  ...items.asMap().entries.map((e) => _HoverableRow(index: e.key, child: _tableRow(e.value))),
              ]),
            ),
          );
        }),
      ),
    );
  }

  Widget _tableHeaderRow() {
    TextStyle s = tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: kCrmTextSub, letterSpacing: 0.3);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(color: const Color(0xFFF8FAFC), border: Border(bottom: BorderSide(color: Colors.grey.shade200))),
      child: Row(children: [
        Expanded(flex: 4,  child: Text('N°', style: s)),
        Expanded(flex: 12, child: Text('ÉQUIPEMENT', style: s)),
        Expanded(flex: 12, child: Text('TYPE DE PANNE', style: s)),
        Expanded(flex: 7,  child: Text('URGENCE', style: s)),
        Expanded(flex: 11, child: Text('DEMANDEUR', style: s)),
        Expanded(flex: 13, child: Text('EMAIL', style: s)),
        Expanded(flex: 8,  child: Text('DATE', style: s)),
        Expanded(flex: 6,  child: Text('HEURE', style: s)),
        Expanded(flex: 14, child: Text('DESCRIPTION', style: s)),
        Expanded(flex: 8,  child: Text('STATUT', style: s)),
        Expanded(flex: 11, child: Text('TECHNICIEN', style: s)),
        Expanded(flex: 9,  child: Text('DATE TRAIT.', style: s)),
        Expanded(flex: 13, child: Text('ACTIONS', style: s)),
      ]),
    );
  }

  Widget _tableRow(MaintenanceRequest r) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(flex: 4, child: Text('#${r.ticketNo}', style: tInter(fontSize: 12, color: kCrmTextSub, fontWeight: FontWeight.w600))),
        Expanded(flex: 12, child: Text(r.equipement, style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 12, child: Text(r.typePanne, style: tInter(fontSize: 12, color: kCrmTextSub), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 7, child: _urgenceBadge(r.urgence)),
        Expanded(flex: 11, child: Text(r.requesterName, style: tInter(fontSize: 12, color: kCrmText), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 13, child: Text(r.requesterEmail, style: tInter(fontSize: 12, color: kCrmTextSub), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 8, child: Text(DateFormat('dd/MM/yyyy').format(r.createdAt), style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 6, child: Text(DateFormat('HH:mm').format(r.createdAt), style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 14, child: Text(r.description.isEmpty ? '—' : r.description, style: tInter(fontSize: 12, color: kCrmTextSub), maxLines: 2, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 8, child: _statusPill(r.statut)),
        Expanded(flex: 11, child: Text(r.technicianName ?? '—', style: tInter(fontSize: 12, color: r.technicianName == null ? kCrmTextSub.withValues(alpha: 0.6) : kCrmText), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 9, child: Text(r.processedAt == null ? '—' : DateFormat('dd/MM/yyyy').format(r.processedAt!), style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 13, child: _rowActions(r)),
      ]),
    );
  }

  Widget _rowActions(MaintenanceRequest r) {
    return Wrap(spacing: 4, runSpacing: 4, children: [
      if (r.isEnAttente) _iconBtn(Icons.check_circle_outline_rounded, const Color(0xFF16A34A), 'Accepter', () => widget.provider.acceptRequest(r.id)),
      if (r.isEnAttente) _iconBtn(Icons.cancel_outlined, const Color(0xFFDC2626), 'Refuser', () => _promptReject(r)),
      if (r.isAcceptee) _iconBtn(Icons.engineering_outlined, const Color(0xFF2563EB), 'Affecter un technicien', () => _promptAssign(r)),
      if (r.isAcceptee && r.technicianId != null) _iconBtn(Icons.play_circle_outline_rounded, const Color(0xFF2563EB), 'Passer en cours', () => widget.provider.startRequest(r.id)),
      if (r.isEnCours) _iconBtn(Icons.task_alt_rounded, const Color(0xFF16A34A), 'Marquer terminée', () => widget.provider.completeRequest(r.id)),
      _iconBtn(Icons.chat_bubble_outline_rounded, kCrmPrimary, 'Commenter', () => context.push('/forms/maintenance-requests/details?id=${r.id}')),
      _iconBtn(Icons.visibility_outlined, kCrmPrimary, 'Voir', () => context.push('/forms/maintenance-requests/details?id=${r.id}')),
      _iconBtn(Icons.delete_outline_rounded, const Color(0xFF94A3B8), 'Supprimer', () => _confirmDelete(r)),
    ]);
  }

  Widget _iconBtn(IconData icon, Color color, String tooltip, VoidCallback onTap) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 15, color: color),
        ),
      ),
    );
  }

  // ── Pagination ───────────────────────────────────────────────────────────
  Widget _paginationRow(int total, int page, int totalPages) {
    return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Row(children: [
        Text('Lignes par page :', style: tInter(fontSize: 12, color: kCrmTextSub)),
        const SizedBox(width: 8),
        DropdownButton<int>(
          value: _pageSize,
          underline: const SizedBox.shrink(),
          items: _kPageSizes.map((s) => DropdownMenuItem(value: s, child: Text('$s'))).toList(),
          onChanged: (v) { if (v == null) return; setState(() { _pageSize = v; _page = 0; }); },
        ),
        const SizedBox(width: 16),
        Text('$total demande(s)', style: tInter(fontSize: 12, color: kCrmTextSub)),
      ]),
      Row(children: [
        IconButton(icon: const Icon(Icons.chevron_left_rounded), onPressed: page > 0 ? () => setState(() => _page = page - 1) : null),
        Text('${page + 1} / $totalPages', style: tInter(fontSize: 12, color: kCrmText)),
        IconButton(icon: const Icon(Icons.chevron_right_rounded), onPressed: page < totalPages - 1 ? () => setState(() => _page = page + 1) : null),
      ]),
    ]);
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  void _promptReject(MaintenanceRequest r) {
    final ctrl = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Refuser la demande', style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Motif du refus pour "${r.equipement}" :', style: tInter(fontSize: 13, color: kCrmTextSub)),
          const SizedBox(height: 10),
          TextField(controller: ctrl, maxLines: 3, decoration: InputDecoration(hintText: 'Expliquez le motif du refus...', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text('Annuler', style: tInter(color: kCrmTextSub))),
          ElevatedButton(
            onPressed: () { Navigator.pop(dialogContext); widget.provider.rejectRequest(r.id, reason: ctrl.text.trim()); },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
            child: Text('Refuser', style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  void _promptAssign(MaintenanceRequest r) {
    String? selectedId = r.technicianId;
    showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('Affecter un technicien', style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
          content: Obx(() => DropdownButtonFormField<String>(
                initialValue: selectedId,
                items: widget.provider.technicians
                    .map((t) => DropdownMenuItem(value: t.id, child: Text(t.name)))
                    .toList(),
                onChanged: (v) => setDialogState(() => selectedId = v),
                decoration: InputDecoration(labelText: 'Technicien', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10))),
              )),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text('Annuler', style: tInter(color: kCrmTextSub))),
            ElevatedButton(
              onPressed: selectedId == null ? null : () { Navigator.pop(dialogContext); widget.provider.assignTechnician(r.id, selectedId!); },
              style: ElevatedButton.styleFrom(backgroundColor: kCrmPrimary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
              child: Text('Affecter', style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
            ),
          ],
        );
      }),
    );
  }

  void _confirmDelete(MaintenanceRequest r) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Supprimer la demande', style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: Text('Supprimer définitivement la demande #${r.ticketNo} ("${r.equipement}") ?', style: tInter(fontSize: 13, color: kCrmTextSub)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text('Annuler', style: tInter(color: kCrmTextSub))),
          ElevatedButton(
            onPressed: () { Navigator.pop(dialogContext); widget.provider.deleteRequest(r.id); },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
            child: Text('Supprimer', style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

class _KpiData {
  final String label;
  final int value;
  final Color color;
  final IconData icon;
  _KpiData(this.label, this.value, this.color, this.icon);
}

// ── Ligne de tableau avec effet de survol ───────────────────────────────────
class _HoverableRow extends StatefulWidget {
  final int index;
  final Widget child;
  const _HoverableRow({required this.index, required this.child});

  @override
  State<_HoverableRow> createState() => _HoverableRowState();
}

class _HoverableRowState extends State<_HoverableRow> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final baseColor = widget.index.isEven ? Colors.white : const Color(0xFFFBFCFD);
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 100),
        decoration: BoxDecoration(
          color: _hovered ? kCrmPrimary.withValues(alpha: 0.035) : baseColor,
          border: Border(bottom: BorderSide(color: Colors.grey.shade100)),
        ),
        child: widget.child,
      ),
    );
  }
}

// ── Helpers partagés ────────────────────────────────────────────────────────
Widget _urgenceBadge(String urgence) {
  final color = _urgenceColor(urgence);
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
    // Row(mainAxisSize: min) + Text non contraint provoquait un RenderFlex
    // overflow dès que le parent (cellule Expanded du tableau, ou carte
    // utilisateur étroite) offrait moins de largeur que le contenu
    // intrinsèque (point + espace + libellé) — Flexible force le Text à se
    // limiter à l'espace réellement disponible et à tronquer avec "…".
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 5),
      Flexible(
        fit: FlexFit.loose,
        child: Text(
          _urgenceLabel(urgence),
          style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: color),
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
          softWrap: false,
        ),
      ),
    ]),
  );
}

Widget _statusBadge(Color color, IconData icon, String label) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: 0.3))),
    // Même correctif que _urgenceBadge — voir commentaire ci-dessus.
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 12, color: color),
      const SizedBox(width: 4),
      Flexible(
        fit: FlexFit.loose,
        child: Text(
          label,
          style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: color),
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
          softWrap: false,
        ),
      ),
    ]),
  );
}

Widget _statusPill(String statut) {
  final color = _statusColor(statut);
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
    child: Text(_statusLabel(statut), style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: color), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
  );
}

Color _urgenceColor(String urgence) {
  switch (urgence) {
    case 'critique': return const Color(0xFFB91C1C);
    case 'faible': return const Color(0xFF16A34A);
    default: return const Color(0xFFD97706);
  }
}

String _urgenceLabel(String urgence) {
  switch (urgence) {
    case 'critique': return 'Critique';
    case 'faible': return 'Faible';
    default: return 'Moyenne';
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

IconData _statusIcon(String statut) {
  switch (statut) {
    case 'acceptee': return Icons.check_circle_outline_rounded;
    case 'en_cours': return Icons.engineering_outlined;
    case 'refusee': return Icons.cancel_outlined;
    case 'terminee': return Icons.task_alt_rounded;
    default: return Icons.schedule_rounded;
  }
}

String _fmtDateTime(DateTime dt) {
  try {
    return DateFormat('dd/MM/yyyy à HH:mm').format(dt);
  } catch (_) {
    return '';
  }
}
