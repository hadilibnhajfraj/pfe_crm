// lib/forms/hr/view/hr_requests_admin_page.dart
//
// Centre de gestion RH — Administration > Demandes > RH — Demandes de congé /
// Demandes d'autorisation. Un seul widget paramétré par [type], calqué sur
// maintenance_requests_page.dart (KPI + filtres + recherche + tableau +
// pagination pour le Responsable RH ; cartes "mes demandes" pour l'employé).

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

import '../model/hr_request_model.dart';
import '../provider/hr_request_provider.dart';
import '../theme/hr_theme.dart';

class HrRequestsAdminPage extends StatelessWidget {
  final String type; // 'conge' | 'sortie'
  const HrRequestsAdminPage({super.key, required this.type});

  @override
  Widget build(BuildContext context) {
    final provider = HrRequestProvider.to;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F8FA),
      body: Obx(() {
        if (provider.loading.value) {
          return const Center(child: CircularProgressIndicator(strokeWidth: 2));
        }
        if (provider.canManage) {
          return _ManagerBody(provider: provider, type: type);
        }
        final mine = provider.byType(type);
        if (mine.isEmpty) return _EmptyState(type: type);
        return _UserBody(requests: mine);
      }),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// USER BODY — cartes "mes demandes" (employé)
// ══════════════════════════════════════════════════════════════════════════
class _UserBody extends StatelessWidget {
  final List<HrRequestModel> requests;
  const _UserBody({required this.requests});

  @override
  Widget build(BuildContext context) {
    final sorted = [...requests]..sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
      itemCount: sorted.length,
      itemBuilder: (_, i) => _RequestCard(request: sorted[i]),
    );
  }
}

class _RequestCard extends StatelessWidget {
  final HrRequestModel request;
  const _RequestCard({required this.request});

  @override
  Widget build(BuildContext context) {
    final statut = hrStatutInfo(request.statut);
    final isConge = request.isConge;
    final dateLabel = isConge ? '${_fmt(request.dateDebut)} → ${_fmt(request.dateFin)}' : _fmt(request.dateSortie);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: InkWell(
        onTap: () => context.go('${MyRoute.hrDetailScreen}?id=${request.id}'),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: kHrColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
              child: Text(isConge ? '🏖️' : '🚪', style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('#${request.ticketNo ?? "-"} · ${isConge ? AppLocalizations.of(context).translate("Demande de congé") : AppLocalizations.of(context).translate("Autorisation de sortie")}',
                    style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText)),
                const SizedBox(height: 3),
                Text(dateLabel, style: tInter(fontSize: 12.5, color: kCrmTextSub)),
              ]),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: statut.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(statut.emoji, style: const TextStyle(fontSize: 12)),
                const SizedBox(width: 5),
                Text(AppLocalizations.of(context).translate(statut.label), style: tInter(fontSize: 11.5, fontWeight: FontWeight.w800, color: statut.color)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  String _fmt(String? raw) {
    if (raw == null || raw.isEmpty) return '—';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy').format(d);
  }
}

class _EmptyState extends StatelessWidget {
  final String type;
  const _EmptyState({required this.type});

  @override
  Widget build(BuildContext context) {
    final isConge = type == 'conge';
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(color: kHrColor.withValues(alpha: 0.07), shape: BoxShape.circle),
          child: Text(isConge ? '🏖️' : '🚪', style: const TextStyle(fontSize: 36)),
        ),
        const SizedBox(height: 18),
        Text(AppLocalizations.of(context).translate('Aucune demande'), style: tInter(fontSize: 16, fontWeight: FontWeight.w700, color: kCrmText)),
        const SizedBox(height: 6),
        Text(
          AppLocalizations.of(context).translate(isConge ? 'Vos demandes de congé apparaîtront ici.' : "Vos demandes d'autorisation apparaîtront ici."),
          style: tInter(fontSize: 13, color: kCrmTextSub),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// MANAGER BODY — centre de gestion (Responsable RH)
// ══════════════════════════════════════════════════════════════════════════
enum _ReqFilter { all, enAttente, acceptee, refusee, traitee }

class _ManagerBody extends StatefulWidget {
  final HrRequestProvider provider;
  final String type;
  const _ManagerBody({required this.provider, required this.type});

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

  bool get _isConge => widget.type == 'conge';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<HrRequestModel> _applyFilters(List<HrRequestModel> source) {
    var list = source.where((r) {
      switch (_filter) {
        case _ReqFilter.all: return true;
        case _ReqFilter.enAttente: return r.isEnAttente;
        case _ReqFilter.acceptee: return r.isAcceptee;
        case _ReqFilter.refusee: return r.isRefusee;
        case _ReqFilter.traitee: return r.isTraitee;
      }
    }).toList();

    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      list = list.where((r) =>
          (r.employeeNom ?? '').toLowerCase().contains(q) ||
          (r.employeePrenom ?? '').toLowerCase().contains(q) ||
          (r.employeeMatricule ?? '').toLowerCase().contains(q)).toList();
    }

    list.sort((a, b) => _sortDesc
        ? (b.createdAt ?? '').compareTo(a.createdAt ?? '')
        : (a.createdAt ?? '').compareTo(b.createdAt ?? ''));
    return list;
  }

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
      final all = widget.provider.byType(widget.type);
      final filtered = _applyFilters(all);

      final totalPages = filtered.isEmpty ? 1 : ((filtered.length - 1) ~/ _pageSize) + 1;
      final safePage = _page.clamp(0, totalPages - 1);
      final start = safePage * _pageSize;
      final end = (start + _pageSize).clamp(0, filtered.length);
      final pageItems = start < filtered.length ? filtered.sublist(start, end) : <HrRequestModel>[];

      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _table(pageItems, sourceEmpty: all.isEmpty),
        const SizedBox(height: 12),
        _paginationRow(filtered.length, safePage, totalPages),
      ]);
    });
  }

  Widget _header(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(28, 22, 28, 18),
      decoration: BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: Colors.grey.shade200))),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [kHrColor, kHrColor.withValues(alpha: 0.75)], begin: Alignment.topLeft, end: Alignment.bottomRight),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: kHrColor.withValues(alpha: 0.25), blurRadius: 10, offset: const Offset(0, 4))],
          ),
          child: Text(_isConge ? '🏖️' : '🚪', style: const TextStyle(fontSize: 22)),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(AppLocalizations.of(context).translate(_isConge ? 'Demandes de congé' : "Demandes d'autorisation"), style: tInter(fontSize: 19, fontWeight: FontWeight.w800, color: kCrmText)),
            const SizedBox(height: 3),
            Text(AppLocalizations.of(context).translate('Administration › Demandes › RH'), style: tInter(fontSize: 12.5, color: kCrmTextSub)),
          ]),
        ),
        OutlinedButton.icon(
          onPressed: () => widget.provider.load(),
          icon: Icon(Icons.refresh_rounded, size: 17, color: kCrmTextSub),
          label: Text(AppLocalizations.of(context).translate('Actualiser'), style: tInter(fontSize: 12.5, color: kCrmTextSub, fontWeight: FontWeight.w600)),
          style: OutlinedButton.styleFrom(
            side: BorderSide(color: Colors.grey.shade300),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
      ]),
    );
  }

  Widget _kpiRow() {
    final stats = widget.provider.statsFor(widget.type);
    final cards = [
      _KpiData('Total', stats['total'] ?? 0, const Color(0xFF64748B), Icons.assignment_outlined),
      _KpiData('En attente', stats['enAttente'] ?? 0, const Color(0xFFD97706), Icons.hourglass_top_rounded),
      _KpiData('Acceptées', stats['acceptee'] ?? 0, kHrAccepted, Icons.check_circle_outline_rounded),
      _KpiData('Refusées', stats['refusee'] ?? 0, kHrRefused, Icons.cancel_outlined),
      _KpiData('Traitées', stats['traitee'] ?? 0, kHrProcessed, Icons.task_alt_rounded),
      _KpiData("Aujourd'hui", stats['today'] ?? 0, const Color(0xFF7C3AED), Icons.today_rounded),
      _KpiData('Cette semaine', stats['thisWeek'] ?? 0, const Color(0xFF0891B2), Icons.date_range_rounded),
    ];

    return LayoutBuilder(builder: (context, constraints) {
      final perRow = constraints.maxWidth < 640 ? 2 : (constraints.maxWidth < 1000 ? 3 : (constraints.maxWidth < 1300 ? 4 : 5));
      final gap = 14.0;
      final width = (constraints.maxWidth - gap * (perRow - 1)) / perRow;
      return Wrap(spacing: gap, runSpacing: gap, children: cards.map((c) => SizedBox(width: width, child: _kpiCard(c))).toList());
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
            Text(AppLocalizations.of(context).translate(c.label), style: tInter(fontSize: 11, color: kCrmTextSub, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
          ]),
        ),
      ]),
    );
  }

  Widget _filterAndSearchRow() {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _filterChip('Toutes', _ReqFilter.all),
        _filterChip('En attente', _ReqFilter.enAttente),
        _filterChip('Acceptée', _ReqFilter.acceptee),
        _filterChip('Refusée', _ReqFilter.refusee),
        _filterChip('Traitée', _ReqFilter.traitee),
        SizedBox(
          width: 280,
          child: TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() { _search = v; _page = 0; }),
            decoration: InputDecoration(
              hintText: AppLocalizations.of(context).translate('Rechercher (nom, prénom, matricule)...'),
              hintStyle: tInter(fontSize: 12, color: kCrmTextSub),
              prefixIcon: const Icon(Icons.search_rounded, size: 18),
              isDense: true,
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
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
              Text(AppLocalizations.of(context).translate('Date'), style: tInter(fontSize: 12, color: kCrmTextSub)),
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
        decoration: BoxDecoration(color: selected ? kHrColor : Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: selected ? kHrColor : Colors.grey.shade300)),
        child: Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: selected ? Colors.white : kCrmTextSub)),
      ),
    );
  }

  Widget _table(List<HrRequestModel> items, {required bool sourceEmpty}) {
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
          final tableWidth = outer.maxWidth < 1300 ? 1300.0 : outer.maxWidth;
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
                      Text(AppLocalizations.of(context).translate(sourceEmpty ? 'Aucune demande trouvée.' : 'Aucune demande ne correspond aux filtres.'), style: tInter(fontSize: 13, color: kCrmTextSub)),
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
        Expanded(flex: 4,  child: Text(AppLocalizations.of(context).translate('N°'), style: s)),
        Expanded(flex: 11, child: Text(AppLocalizations.of(context).translate('NOM'), style: s)),
        Expanded(flex: 11, child: Text(AppLocalizations.of(context).translate('PRÉNOM'), style: s)),
        Expanded(flex: 12, child: Text(AppLocalizations.of(context).translate('DÉPARTEMENT'), style: s)),
        Expanded(flex: 11, child: Text(AppLocalizations.of(context).translate('SERVICE'), style: s)),
        Expanded(flex: 9,  child: Text(AppLocalizations.of(context).translate('TYPE'), style: s)),
        Expanded(flex: 9,  child: Text(AppLocalizations.of(context).translate('DATE DÉBUT'), style: s)),
        Expanded(flex: 9,  child: Text(AppLocalizations.of(context).translate('DATE FIN'), style: s)),
        Expanded(flex: 7,  child: Text(AppLocalizations.of(context).translate('DURÉE'), style: s)),
        Expanded(flex: 13, child: Text(AppLocalizations.of(context).translate('MOTIF'), style: s)),
        Expanded(flex: 9,  child: Text(AppLocalizations.of(context).translate('STATUT'), style: s)),
        Expanded(flex: 8,  child: Text(AppLocalizations.of(context).translate('DATE'), style: s)),
        Expanded(flex: 12, child: Text(AppLocalizations.of(context).translate('ACTIONS'), style: s)),
      ]),
    );
  }

  Widget _tableRow(HrRequestModel r) {
    final duree = _isConge ? '${r.nombreJours ?? "-"} j.' : (r.heureSortie != null && r.heureRetour != null ? '${r.heureSortie}-${r.heureRetour}' : '-');
    final createdAt = DateTime.tryParse(r.createdAt ?? '');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(flex: 4, child: Text('#${r.ticketNo ?? "-"}', style: tInter(fontSize: 12, color: kCrmTextSub, fontWeight: FontWeight.w600))),
        Expanded(flex: 11, child: Text(r.employeeNom ?? '-', style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 11, child: Text(r.employeePrenom ?? '-', style: tInter(fontSize: 12, color: kCrmText), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 12, child: Text(r.employeeDepartement ?? '-', style: tInter(fontSize: 12, color: kCrmTextSub), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 11, child: Text(r.employeeService ?? '-', style: tInter(fontSize: 12, color: kCrmTextSub), maxLines: 1, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 9, child: Text(AppLocalizations.of(context).translate(_isConge ? 'Congé' : 'Autorisation'), style: tInter(fontSize: 11.5, fontWeight: FontWeight.w700, color: kHrColor))),
        Expanded(flex: 9, child: Text(_fmt(_isConge ? r.dateDebut : r.dateSortie), style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 9, child: Text(_isConge ? _fmt(r.dateFin) : '-', style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 7, child: Text(duree, style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 13, child: Text(_isConge ? '-' : (r.motif ?? '-'), style: tInter(fontSize: 12, color: kCrmTextSub), maxLines: 2, overflow: TextOverflow.ellipsis)),
        Expanded(flex: 9, child: _statusPill(context, r.statut)),
        Expanded(flex: 8, child: Text(createdAt == null ? '-' : DateFormat('dd/MM/yyyy').format(createdAt), style: tInter(fontSize: 12, color: kCrmTextSub))),
        Expanded(flex: 12, child: _rowActions(r)),
      ]),
    );
  }

  Widget _rowActions(HrRequestModel r) {
    return Wrap(spacing: 4, runSpacing: 4, children: [
      if (r.isEnAttente) _iconBtn(Icons.check_circle_outline_rounded, kHrAccepted, 'Accepter', () => _promptDecision(r, accept: true)),
      if (r.isEnAttente) _iconBtn(Icons.cancel_outlined, kHrRefused, 'Refuser', () => _promptDecision(r, accept: false)),
      if (r.isAcceptee) _iconBtn(Icons.task_alt_rounded, kHrProcessed, 'Marquer traitée', () => widget.provider.markProcessed(r.id!)),
      _iconBtn(Icons.chat_bubble_outline_rounded, kHrColor, 'Commenter', () => _promptComment(r)),
      _iconBtn(Icons.visibility_outlined, kHrColor, 'Voir', () => context.go('${MyRoute.hrDetailScreen}?id=${r.id}')),
      _iconBtn(Icons.delete_outline_rounded, const Color(0xFF94A3B8), 'Supprimer', () => _confirmDelete(r)),
    ]);
  }

  Widget _iconBtn(IconData icon, Color color, String tooltip, VoidCallback onTap) {
    return Tooltip(
      message: AppLocalizations.of(context).translate(tooltip),
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

  Widget _paginationRow(int total, int page, int totalPages) {
    return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Row(children: [
        Text(AppLocalizations.of(context).translate('Lignes par page :'), style: tInter(fontSize: 12, color: kCrmTextSub)),
        const SizedBox(width: 8),
        DropdownButton<int>(
          value: _pageSize,
          underline: const SizedBox.shrink(),
          items: _kPageSizes.map((s) => DropdownMenuItem(value: s, child: Text('$s'))).toList(),
          onChanged: (v) { if (v == null) return; setState(() { _pageSize = v; _page = 0; }); },
        ),
        const SizedBox(width: 16),
        Text('$total ${AppLocalizations.of(context).translate('demande(s)')}', style: tInter(fontSize: 12, color: kCrmTextSub)),
      ]),
      Row(children: [
        IconButton(icon: const Icon(Icons.chevron_left_rounded), onPressed: page > 0 ? () => setState(() => _page = page - 1) : null),
        Text('${page + 1} / $totalPages', style: tInter(fontSize: 12, color: kCrmText)),
        IconButton(icon: const Icon(Icons.chevron_right_rounded), onPressed: page < totalPages - 1 ? () => setState(() => _page = page + 1) : null),
      ]),
    ]);
  }

  void _promptDecision(HrRequestModel r, {required bool accept}) {
    final ctrl = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(AppLocalizations.of(context).translate(accept ? 'Accepter la demande' : 'Refuser la demande'), style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${AppLocalizations.of(context).translate('Commentaire (facultatif) pour')} ${r.employeeNom ?? ""} ${r.employeePrenom ?? ""} :', style: tInter(fontSize: 13, color: kCrmTextSub)),
          const SizedBox(height: 10),
          TextField(controller: ctrl, maxLines: 3, decoration: InputDecoration(hintText: AppLocalizations.of(context).translate('Votre commentaire...'), border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(AppLocalizations.of(context).translate('Annuler'), style: tInter(color: kCrmTextSub))),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              final comment = ctrl.text.trim().isEmpty ? null : ctrl.text.trim();
              if (accept) {
                widget.provider.acceptRequest(r.id!, comment: comment);
              } else {
                widget.provider.rejectRequest(r.id!, comment: comment);
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: accept ? kHrAccepted : kHrRefused, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
            child: Text(AppLocalizations.of(context).translate(accept ? 'Accepter' : 'Refuser'), style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  void _promptComment(HrRequestModel r) {
    final ctrl = TextEditingController(text: r.reviewComment ?? '');
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(AppLocalizations.of(context).translate('Ajouter un commentaire'), style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: TextField(controller: ctrl, maxLines: 4, decoration: InputDecoration(hintText: AppLocalizations.of(context).translate('Votre commentaire...'), border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(AppLocalizations.of(context).translate('Annuler'), style: tInter(color: kCrmTextSub))),
          ElevatedButton(
            onPressed: ctrl.text.trim().isEmpty ? null : () { Navigator.pop(dialogContext); widget.provider.addComment(r.id!, ctrl.text.trim()); },
            style: ElevatedButton.styleFrom(backgroundColor: kHrColor, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
            child: Text(AppLocalizations.of(context).translate('Enregistrer'), style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(HrRequestModel r) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(AppLocalizations.of(context).translate('Supprimer la demande'), style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
        content: Text('${AppLocalizations.of(context).translate('Supprimer définitivement la demande')} #${r.ticketNo ?? "-"} ?', style: tInter(fontSize: 13, color: kCrmTextSub)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(AppLocalizations.of(context).translate('Annuler'), style: tInter(color: kCrmTextSub))),
          ElevatedButton(
            onPressed: () { Navigator.pop(dialogContext); widget.provider.deleteRequest(r.id!); },
            style: ElevatedButton.styleFrom(backgroundColor: kHrRefused, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
            child: Text(AppLocalizations.of(context).translate('Supprimer'), style: tInter(color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  String _fmt(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final d = DateTime.tryParse(raw);
    return d == null ? raw : DateFormat('dd/MM/yyyy').format(d);
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
          color: _hovered ? kHrColor.withValues(alpha: 0.035) : baseColor,
          border: Border(bottom: BorderSide(color: Colors.grey.shade100)),
        ),
        child: widget.child,
      ),
    );
  }
}

Widget _statusPill(BuildContext context, String statut) {
  final info = hrStatutInfo(statut);
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(color: info.color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
    child: Text(AppLocalizations.of(context).translate(info.label), style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: info.color), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
  );
}
