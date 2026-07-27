// lib/forms/view/archive_requests_page.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/providers/archive_request_provider.dart';
import 'package:dash_master_toolkit/models/archive_request_model.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

// ══════════════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════════════
class ArchiveRequestsPage extends StatelessWidget {
  const ArchiveRequestsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = ArchiveRequestProvider.to;

    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: provider.isAdmin ? null : _buildAppBar(provider),
      body: Obx(() {
        if (provider.loading.value) {
          return const Center(
            child: CircularProgressIndicator(strokeWidth: 2),
          );
        }
        if (provider.isAdmin) {
          return _AdminRequestsBody(provider: provider);
        }
        if (provider.requests.isEmpty) {
          return _EmptyState();
        }
        return _Body(provider: provider);
      }),
    );
  }

  PreferredSizeWidget _buildAppBar(ArchiveRequestProvider provider) {
    return AppBar(
      backgroundColor: Colors.white,
      elevation: 0,
      titleSpacing: 20,
      title: Row(children: [
        Container(
          padding: const EdgeInsets.all(9),
          decoration: BoxDecoration(
            color: kCrmPrimary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.forum_rounded, size: 20, color: kCrmPrimary),
        ),
        const SizedBox(width: 12),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Mes demandes',
              style: tInter(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: kCrmText)),
          Obx(() => Text(
                '${provider.pendingCount} en attente · ${provider.requests.length} au total',
                style: tInter(fontSize: 11, color: kCrmTextSub),
              )),
        ]),
      ]),
      actions: [
        Obx(() => provider.loading.value
            ? const Padding(
                padding: EdgeInsets.all(14),
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            : IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: 'Rafraîchir',
                onPressed: provider.loadArchiveRequests,
              )),
        const SizedBox(width: 8),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Divider(height: 1, color: Colors.grey.shade200),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BODY (utilisateur normal) — scrollable card list
// ══════════════════════════════════════════════════════════════════════════════
class _Body extends StatelessWidget {
  final ArchiveRequestProvider provider;
  const _Body({required this.provider});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final list = provider.requests;
      return ListView.builder(
        padding: const EdgeInsets.all(20),
        itemCount: list.length,
        itemBuilder: (_, i) => _RequestCard(
          request: list[i],
          provider: provider,
        ),
      );
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// REQUEST CARD (utilisateur normal)
// ══════════════════════════════════════════════════════════════════════════════
class _RequestCard extends StatelessWidget {
  final ArchiveRequest request;
  final ArchiveRequestProvider provider;

  const _RequestCard({required this.request, required this.provider});

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(request.status);
    final statusLabel = _statusLabel(request.status);
    final statusIcon  = _statusIcon(request.status);
    final isPending   = request.status == 'pending';
    final initials    = _initials(request.userEmail.isNotEmpty
        ? request.userEmail
        : request.userName);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isPending
              ? const Color(0xFFD97706).withValues(alpha: 0.25)
              : Colors.grey.shade200,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── Card header ─────────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.04),
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(16)),
            border: Border(
                bottom: BorderSide(color: Colors.grey.shade100)),
          ),
          child: Row(children: [
            // Avatar
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    kCrmPrimary.withValues(alpha: 0.8),
                    kCrmPrimary
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Text(initials,
                  style: tInter(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: Colors.white)),
            ),
            const SizedBox(width: 12),
            // User + project info
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(
                        child: Text(
                          request.projectName,
                          style: tInter(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: kCrmText),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      _typeBadge(request.type),
                    ]),
                    const SizedBox(height: 2),
                    Text(
                      request.userEmail.isNotEmpty
                          ? request.userEmail
                          : request.userName,
                      style: tInter(fontSize: 11, color: kCrmTextSub),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ]),
            ),
            // Status badge
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                    color: statusColor.withValues(alpha: 0.3)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(statusIcon, size: 12, color: statusColor),
                const SizedBox(width: 4),
                Text(statusLabel,
                    style: tInter(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: statusColor)),
              ]),
            ),
          ]),
        ),

        // ── Card body ───────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Subject
                _field('Sujet', request.subject),
                const SizedBox(height: 12),
                // Message
                _field('Message', request.message, multiline: true),
                if (request.status == 'rejected' &&
                    (request.rejectionReason ?? '').isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _field('Motif du refus', request.rejectionReason ?? '',
                      multiline: true),
                ],
                const SizedBox(height: 12),
                // Date
                Row(children: [
                  Icon(Icons.access_time_rounded,
                      size: 13, color: kCrmTextSub),
                  const SizedBox(width: 5),
                  Text(
                    _fmtDate(request.createdAt),
                    style: tInter(fontSize: 11, color: kCrmTextSub),
                  ),
                ]),
              ]),
        ),

        // ── Discussion button ─────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: _outlinedBtn(
            icon: Icons.forum_outlined,
            label: 'Ouvrir la discussion',
            color: kCrmPrimary,
            onTap: () {
              provider.selectRequest(request.id);
              context.push('/forms/archive-requests/chat?id=${request.id}');
            },
          ),
        ),
      ]),
    );
  }

  // ── Widget helpers ─────────────────────────────────────────────────────────
  Widget _field(String label, String value, {bool multiline = false}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label,
          style: tInter(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: kCrmTextSub,
              letterSpacing: 0.4)),
      const SizedBox(height: 4),
      Text(
        value.isEmpty ? '—' : value,
        style: tInter(
            fontSize: 13,
            color: kCrmText,
            fontWeight: FontWeight.w500),
        maxLines: multiline ? 4 : 1,
        overflow: TextOverflow.ellipsis,
      ),
    ]);
  }

  Widget _outlinedBtn({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(8),
          border:
              Border.all(color: color.withValues(alpha: 0.28)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Text(label,
              style: tInter(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color)),
        ]),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EMPTY STATE (utilisateur normal)
// ══════════════════════════════════════════════════════════════════════════════
class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: kCrmPrimary.withValues(alpha: 0.07),
            shape: BoxShape.circle,
          ),
          child: Icon(Icons.archive_outlined,
              size: 44, color: kCrmPrimary.withValues(alpha: 0.6)),
        ),
        const SizedBox(height: 18),
        Text('Aucune demande',
            style: tInter(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: kCrmText)),
        const SizedBox(height: 6),
        Text(
          'Vos demandes d\'archivage et de désarchivage apparaîtront ici.',
          style: tInter(fontSize: 13, color: kCrmTextSub),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN BODY — KPI cards + filtres + recherche + tableau + pagination
// Réservé à cbitunisia@cbi-tunisia.com (provider.isAdmin == AuthService().isRootAdmin)
// ══════════════════════════════════════════════════════════════════════════════
enum _ReqFilter { all, archivage, desarchivage, pending, approved, rejected }

class _AdminRequestsBody extends StatefulWidget {
  final ArchiveRequestProvider provider;
  const _AdminRequestsBody({required this.provider});

  @override
  State<_AdminRequestsBody> createState() => _AdminRequestsBodyState();
}

class _AdminRequestsBodyState extends State<_AdminRequestsBody> {
  _ReqFilter _filter = _ReqFilter.all;
  final _searchCtrl = TextEditingController();
  String _search = '';
  bool _sortDesc = true; // by date
  int _page = 0;
  static const _kPageSizes = [10, 20, 50];
  int _pageSize = 10;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<ArchiveRequest> _applyFilters(List<ArchiveRequest> source) {
    var list = source.where((r) {
      switch (_filter) {
        case _ReqFilter.all:
          return true;
        case _ReqFilter.archivage:
          return r.isArchivage;
        case _ReqFilter.desarchivage:
          return !r.isArchivage;
        case _ReqFilter.pending:
          return r.status == 'pending';
        case _ReqFilter.approved:
          return r.status == 'approved';
        case _ReqFilter.rejected:
          return r.status == 'rejected';
      }
    }).toList();

    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      list = list.where((r) =>
          r.projectName.toLowerCase().contains(q) ||
          r.society.toLowerCase().contains(q) ||
          r.userName.toLowerCase().contains(q) ||
          r.userEmail.toLowerCase().contains(q)).toList();
    }

    list.sort((a, b) => _sortDesc
        ? b.createdAt.compareTo(a.createdAt)
        : a.createdAt.compareTo(b.createdAt));

    return list;
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final all = widget.provider.requests;
      final filtered = _applyFilters(all);

      final totalPages =
          filtered.isEmpty ? 1 : ((filtered.length - 1) ~/ _pageSize) + 1;
      final safePage = _page.clamp(0, totalPages - 1);
      final start = safePage * _pageSize;
      final end = (start + _pageSize).clamp(0, filtered.length);
      final pageItems =
          start < filtered.length ? filtered.sublist(start, end) : <ArchiveRequest>[];

      return Column(children: [
        _header(context),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _kpiRow(),
              const SizedBox(height: 20),
              _filterAndSearchRow(),
              const SizedBox(height: 16),
              _table(pageItems),
              const SizedBox(height: 12),
              _paginationRow(filtered.length, safePage, totalPages),
            ]),
          ),
        ),
      ]);
    });
  }

  // ── Header ───────────────────────────────────────────────────────────────
  Widget _header(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: kCrmPrimary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(Icons.inbox_rounded, size: 22, color: kCrmPrimary),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Demandes d\'archivage / désarchivage',
                style: tInter(
                    fontSize: 18, fontWeight: FontWeight.w800, color: kCrmText)),
            const SizedBox(height: 2),
            Text('Administration — cbitunisia@cbi-tunisia.com',
                style: tInter(fontSize: 12, color: kCrmTextSub)),
          ]),
        ),
        IconButton(
          icon: const Icon(Icons.refresh),
          tooltip: 'Rafraîchir',
          onPressed: () => widget.provider.load(),
        ),
      ]),
    );
  }

  // ── KPI cards ────────────────────────────────────────────────────────────
  Widget _kpiRow() {
    final stats = widget.provider.stats;
    final pending = stats['pending'] ?? widget.provider.pendingCount;
    final archivage = stats['archivage'] ?? widget.provider.archivageCount;
    final desarchivage = stats['desarchivage'] ?? widget.provider.desarchivageCount;
    final approved = stats['approved'] ?? widget.provider.approvedCount;
    final rejected = stats['rejected'] ?? widget.provider.rejectedCount;

    final cards = [
      _KpiData('En attente', pending, const Color(0xFFD97706), Icons.schedule_rounded),
      _KpiData('Archivage', archivage, const Color(0xFF64748B), Icons.archive_rounded),
      _KpiData('Désarchivage', desarchivage, const Color(0xFF8B5CF6), Icons.unarchive_rounded),
      _KpiData('Acceptées', approved, const Color(0xFF16A34A), Icons.check_circle_rounded),
      _KpiData('Refusées', rejected, const Color(0xFFDC2626), Icons.cancel_rounded),
    ];

    return LayoutBuilder(builder: (context, constraints) {
      final isNarrow = constraints.maxWidth < 760;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: cards.map((c) {
          final width = isNarrow
              ? (constraints.maxWidth - 12) / 2
              : (constraints.maxWidth - 12 * 4) / 5;
          return SizedBox(width: width, child: _kpiCard(c));
        }).toList(),
      );
    });
  }

  Widget _kpiCard(_KpiData c) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: c.color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(c.icon, size: 18, color: c.color),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${c.value}',
                style: tInter(
                    fontSize: 20, fontWeight: FontWeight.w800, color: kCrmText)),
            Text(c.label,
                style: tInter(fontSize: 11, color: kCrmTextSub),
                overflow: TextOverflow.ellipsis),
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
        _filterChip('Archivage', _ReqFilter.archivage),
        _filterChip('Désarchivage', _ReqFilter.desarchivage),
        _filterChip('En attente', _ReqFilter.pending),
        _filterChip('Acceptée', _ReqFilter.approved),
        _filterChip('Refusée', _ReqFilter.rejected),
        SizedBox(
          width: 260,
          child: TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() { _search = v; _page = 0; }),
            decoration: InputDecoration(
              hintText: 'Rechercher (projet, société, demandeur)...',
              hintStyle: tInter(fontSize: 12, color: kCrmTextSub),
              prefixIcon: const Icon(Icons.search_rounded, size: 18),
              isDense: true,
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
            ),
            style: tInter(fontSize: 12, color: kCrmText),
          ),
        ),
        InkWell(
          onTap: () => setState(() => _sortDesc = !_sortDesc),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(_sortDesc ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded,
                  size: 14, color: kCrmTextSub),
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
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? kCrmPrimary : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? kCrmPrimary : Colors.grey.shade300),
        ),
        child: Text(label,
            style: tInter(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : kCrmTextSub)),
      ),
    );
  }

  // ── Tableau ──────────────────────────────────────────────────────────────
  // NOTE LAYOUT : un SingleChildScrollView horizontal donne une largeur non
  // bornée (maxWidth: infinity) à son enfant. Un ConstrainedBox(minWidth: ...)
  // seul ne corrige pas ça : minWidth ne fixe qu'un plancher, maxWidth reste
  // infini. Les Row ci-dessous (_tableHeaderRow/_tableRow) contiennent des
  // Expanded, qui exigent une largeur MAXIMALE finie pour répartir l'espace —
  // avec maxWidth infini, RenderFlex ne peut jamais se layouter (l'app crash
  // ensuite au premier hit-test avec "size: MISSING"). Le LayoutBuilder +
  // SizedBox(width: ...) ci-dessous donne une largeur finie et explicite à
  // la Column/Row, tout en gardant le scroll horizontal si l'écran est étroit.
  Widget _table(List<ArchiveRequest> items) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: LayoutBuilder(builder: (context, outer) {
        final tableWidth = outer.maxWidth < 1080 ? 1080.0 : outer.maxWidth;
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SizedBox(
            width: tableWidth,
            child: Column(children: [
              _tableHeaderRow(),
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text('Aucune demande ne correspond aux filtres.',
                      style: tInter(fontSize: 13, color: kCrmTextSub)),
                )
              else
                ...items.map((r) => _tableRow(r)),
            ]),
          ),
        );
      }),
    );
  }

  Widget _tableHeaderRow() {
    TextStyle s = tInter(fontSize: 11, fontWeight: FontWeight.w700, color: kCrmTextSub);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(children: [
        Expanded(flex: 16, child: Text('PROJET', style: s)),
        Expanded(flex: 12, child: Text('SOCIÉTÉ', style: s)),
        Expanded(flex: 14, child: Text('DEMANDEUR', style: s)),
        Expanded(flex: 16, child: Text('EMAIL', style: s)),
        Expanded(flex: 10, child: Text('TYPE', style: s)),
        Expanded(flex: 10, child: Text('DATE', style: s)),
        Expanded(flex: 7,  child: Text('HEURE', style: s)),
        Expanded(flex: 16, child: Text('MOTIF', style: s)),
        Expanded(flex: 9,  child: Text('STATUT', style: s)),
        Expanded(flex: 14, child: Text('ACTIONS', style: s)),
      ]),
    );
  }

  Widget _tableRow(ArchiveRequest r) {
    final statusColor = _statusColor(r.status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: Colors.grey.shade100)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(flex: 16, child: Text(r.projectName,
            style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText),
            maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 12, child: Text(r.society.isEmpty ? '—' : r.society,
            style: tInter(fontSize: 12, color: kCrmTextSub),
            maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 14, child: Text(r.userName,
            style: tInter(fontSize: 12, color: kCrmText),
            maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 16, child: Text(r.userEmail,
            style: tInter(fontSize: 12, color: kCrmTextSub),
            maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 10, child: _typeBadge(r.type)),
        Expanded(flex: 10, child: Text(DateFormat('dd/MM/yyyy').format(r.createdAt),
            style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 7, child: Text(DateFormat('HH:mm').format(r.createdAt),
            style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 16, child: Text(r.message.isEmpty ? '—' : r.message,
            style: tInter(fontSize: 12, color: kCrmTextSub),
            maxLines: 2, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 9, child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(_statusLabel(r.status),
              style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor),
              textAlign: TextAlign.center),
        )),
        Expanded(flex: 14, child: _rowActions(r)),
      ]),
    );
  }

  Widget _rowActions(ArchiveRequest r) {
    final isPending = r.status == 'pending';
    return Wrap(spacing: 4, runSpacing: 4, children: [
      if (isPending)
        _iconBtn(Icons.check_circle_outline_rounded, const Color(0xFF16A34A),
            'Accepter', () => _confirmApprove(r)),
      if (isPending)
        _iconBtn(Icons.cancel_outlined, const Color(0xFFDC2626),
            'Refuser', () => _promptReject(r)),
      _iconBtn(Icons.visibility_outlined, kCrmPrimary, 'Voir', () {
        widget.provider.selectRequest(r.id);
        context.push('/forms/archive-requests/chat?id=${r.id}');
      }),
      _iconBtn(Icons.delete_outline_rounded, const Color(0xFF94A3B8),
          'Supprimer', () => _confirmDelete(r)),
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
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(8),
          ),
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
          items: _kPageSizes
              .map((s) => DropdownMenuItem(value: s, child: Text('$s')))
              .toList(),
          onChanged: (v) {
            if (v == null) return;
            setState(() { _pageSize = v; _page = 0; });
          },
        ),
        const SizedBox(width: 16),
        Text('$total demande(s)', style: tInter(fontSize: 12, color: kCrmTextSub)),
      ]),
      Row(children: [
        IconButton(
          icon: const Icon(Icons.chevron_left_rounded),
          onPressed: page > 0 ? () => setState(() => _page = page - 1) : null,
        ),
        Text('${page + 1} / $totalPages', style: tInter(fontSize: 12, color: kCrmText)),
        IconButton(
          icon: const Icon(Icons.chevron_right_rounded),
          onPressed: page < totalPages - 1 ? () => setState(() => _page = page + 1) : null,
        ),
      ]),
    ]);
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  // Cette page n'utilise PAS GetMaterialApp (voir main.dart : MaterialApp.router
  // + go_router). Get.back()/Get.dialog() dépendent de Get.key, qui n'est
  // jamais attaché dans cette configuration → "contextless navigation
  // without a GetMaterialApp or Get.key" au clic sur Annuler/Approuver/
  // Refuser/Supprimer. Ces boîtes de dialogue sont donc ouvertes avec
  // showDialog(context: ...) (le BuildContext du State, toujours valide) et
  // fermées avec Navigator.pop(dialogContext) — jamais Get.back().
  void _confirmApprove(ArchiveRequest r) {
    final label = r.isArchivage ? 'archiver' : 'désarchiver';
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Approuver la demande',
            style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: Text('Confirmer pour $label le projet "${r.projectName}" ?',
            style: tInter(fontSize: 13, color: kCrmTextSub)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text('Annuler', style: tInter(color: kCrmTextSub)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              widget.provider.approveRequest(r.id);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF16A34A),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: Text('Approuver',
                style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  void _promptReject(ArchiveRequest r) {
    final ctrl = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Refuser la demande',
            style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Motif du refus pour "${r.projectName}" :',
              style: tInter(fontSize: 13, color: kCrmTextSub)),
          const SizedBox(height: 10),
          TextField(
            controller: ctrl,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Expliquez le motif du refus...',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ]),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text('Annuler', style: tInter(color: kCrmTextSub)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              widget.provider.rejectRequest(r.id, reason: ctrl.text.trim());
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: Text('Refuser',
                style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(ArchiveRequest r) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Supprimer la demande',
            style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: Text('Supprimer définitivement cette demande pour "${r.projectName}" ?',
            style: tInter(fontSize: 13, color: kCrmTextSub)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text('Annuler', style: tInter(color: kCrmTextSub)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              widget.provider.deleteRequest(r.id);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: Text('Supprimer',
                style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
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

Widget _typeBadge(String type) {
  final isArchivage = type == 'ARCHIVAGE';
  final color = isArchivage ? const Color(0xFF64748B) : const Color(0xFF8B5CF6);
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(isArchivage ? 'Archivage' : 'Désarchivage',
        style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: color),
        overflow: TextOverflow.ellipsis),
  );
}

// ── Helpers partagés ────────────────────────────────────────────────────────
Color _statusColor(String status) {
  switch (status) {
    case 'approved': return const Color(0xFF16A34A);
    case 'rejected': return const Color(0xFFDC2626);
    default:         return const Color(0xFFD97706);
  }
}

String _statusLabel(String status) {
  switch (status) {
    case 'approved': return 'Approuvé';
    case 'rejected': return 'Rejeté';
    default:         return 'En attente';
  }
}

IconData _statusIcon(String status) {
  switch (status) {
    case 'approved': return Icons.check_circle_outline_rounded;
    case 'rejected': return Icons.cancel_outlined;
    default:         return Icons.schedule_rounded;
  }
}

String _fmtDate(DateTime dt) {
  try {
    return DateFormat('dd/MM/yyyy à HH:mm').format(dt);
  } catch (_) {
    return '';
  }
}

String _initials(String value) {
  if (value.isEmpty) return '?';
  final parts = value.split(RegExp(r'[\s@._-]'))
      .where((p) => p.isNotEmpty)
      .toList();
  if (parts.length >= 2) {
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }
  return value[0].toUpperCase();
}
