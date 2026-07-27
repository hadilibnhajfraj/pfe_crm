// lib/dashboard/commercial_contacts/view/commercial_contacts_kpi_screen.dart
//
// Commercial Contacts Analytics KPI Dashboard
// Route: /dashboard/commercial-contacts-kpi
// Style: Salesforce CRM / HubSpot / Zoho CRM

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/application/users/model/commercial_contact_model.dart';
import 'package:dash_master_toolkit/services/commercial_contact_service.dart';
import 'package:dash_master_toolkit/core/theme/app_text_styles.dart';
import 'package:dash_master_toolkit/dashboard/academic/widgets/crm_dashboard_widgets.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const _kBg     = Color(0xFFF0F4F8);
const _kCard   = Colors.white;
const _kBorder = Color(0xFFE2E8F0);
const _kText   = Color(0xFF0F172A);
const _kMuted  = Color(0xFF64748B);
const _kIndigo = Color(0xFF4F46E5);

// ─────────────────────────────────────────────────────────────────────────────
// DATA CLASSES
// ─────────────────────────────────────────────────────────────────────────────

class _UserStat {
  final String    name;
  final String?   email;
  final int       contacts;
  final int       calls;
  final int       actifs;
  final int       nonValides;
  final int       entreprises;
  final DateTime? lastActivity;

  const _UserStat({
    required this.name,
    this.email,
    required this.contacts,
    required this.calls,
    required this.actifs,
    required this.nonValides,
    required this.entreprises,
    this.lastActivity,
  });

  double get tauxReussite => contacts == 0 ? 0 : actifs / contacts * 100;

  double get score {
    if (contacts == 0) return 0;
    final successRate  = tauxReussite;
    final callsRate    = math.min(calls / contacts * 10.0, 10.0) * 10;
    final volumeRate   = math.min(contacts / 50.0 * 100, 100.0);
    return (successRate * 0.5 + callsRate * 0.3 + volumeRate * 0.2).clamp(0, 100);
  }
}

class _CompanyStat {
  final String name;
  final int    contacts;
  final int    calls;
  const _CompanyStat({required this.name, required this.contacts, required this.calls});
}

class _MonthData {
  final String label;
  final int    contacts;
  final int    calls;
  const _MonthData({required this.label, required this.contacts, required this.calls});
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

BoxDecoration _card({double r = 18}) => BoxDecoration(
  color:        _kCard,
  borderRadius: BorderRadius.circular(r),
  border:       Border.all(color: _kBorder, width: 0.8),
  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 20, offset: const Offset(0, 6))],
);

Color _statutColor(String s) {
  final l = s.toLowerCase().trim();
  if (l == 'ok')                        return const Color(0xFF22C55E);
  if (l.contains('non') || l.contains('refus') || l.contains('perdu')) return const Color(0xFFEF4444);
  if (l == 'client')                    return const Color(0xFF8B5CF6);
  if (l.contains('prospect'))           return const Color(0xFF3B82F6);
  if (l.contains('attente'))            return const Color(0xFFF59E0B);
  if (l.contains('gagn') || l.contains('valid')) return const Color(0xFF22C55E);
  return const Color(0xFF94A3B8);
}

Color _typeColor(String t) {
  final l = t.toLowerCase().trim();
  if (l.contains('batiment') || l.contains('bâtiment')) return const Color(0xFF3B82F6);
  if (l.contains('industrie'))  return const Color(0xFFF97316);
  if (l.contains('promoteur'))  return const Color(0xFF8B5CF6);
  if (l.contains('revendeur'))  return const Color(0xFF14B8A6);
  if (l.contains('applicateur')) return const Color(0xFFEF4444);
  return const Color(0xFF94A3B8);
}

bool _isActif(String s) {
  final l = s.toLowerCase().trim();
  return l == 'ok' || l == 'client' || (l.contains('valid') && !l.contains('non'));
}

bool _isNonValide(String s) {
  final l = s.toLowerCase().trim();
  return l.contains('non') || l.contains('refus') || l.contains('perdu');
}

const _kMonths = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────
class CommercialContactsKpiScreen extends StatefulWidget {
  final String token;
  const CommercialContactsKpiScreen({super.key, required this.token});

  @override
  State<CommercialContactsKpiScreen> createState() =>
      _CommercialContactsKpiScreenState();
}

class _CommercialContactsKpiScreenState
    extends State<CommercialContactsKpiScreen> {
  final _svc = CommercialContactService();

  // ── Loading state ──────────────────────────────────────────────────────────
  bool    _loading = true;
  String? _error;
  bool    _isAdmin = true;

  // ── Raw data ───────────────────────────────────────────────────────────────
  List<CommercialContact> _contacts = [];

  // ── Computed KPIs ──────────────────────────────────────────────────────────
  int    _totalContacts   = 0;
  int    _totalCalls      = 0;
  int    _totalEntreprises = 0;
  int    _totalActifs     = 0;
  int    _totalNonValides = 0;
  double _avgCalls        = 0;

  // ── Chart data ─────────────────────────────────────────────────────────────
  List<Map<String, dynamic>> _statutStats = [];
  List<Map<String, dynamic>> _typeStats   = [];
  List<_MonthData>   _monthlyData  = [];
  List<_UserStat>    _userStats    = [];
  List<_CompanyStat> _companyStats = [];

  // ── Table state ────────────────────────────────────────────────────────────
  final _searchCtrl = TextEditingController();
  int  _sortCol     = 1;
  bool _sortAsc     = false;
  int  _page        = 0;
  static const _rowsPerPage = 10;
  List<_UserStat> _filteredUsers = [];

  DateTime _lastUpdate = DateTime.now();

  // ─────────────────────────────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    final role = (AuthService().userRole ?? '').toLowerCase().trim();
    _isAdmin = role == 'admin' || role == 'superadmin' || role == 'superadmin2';
    _load();
    _searchCtrl.addListener(_onSearch);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await _svc.fetchMyContacts(token: widget.token);
      _contacts   = data;
      _lastUpdate = DateTime.now();
      _computeStats();
      setState(() => _loading = false);
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _computeStats() {
    // ── Global KPIs ──────────────────────────────────────────────────────────
    _totalContacts    = _contacts.length;
    _totalCalls       = _contacts.fold(0, (s, c) => s + c.nbAppels);
    _totalActifs      = _contacts.where((c) => _isActif(c.statut)).length;
    _totalNonValides  = _contacts.where((c) => _isNonValide(c.statut)).length;
    _avgCalls         = _totalContacts == 0 ? 0 : _totalCalls / _totalContacts;

    final compSet = <String>{};
    for (final c in _contacts) {
      if ((c.nomSociete ?? '').trim().isNotEmpty) compSet.add(c.nomSociete!.trim());
    }
    _totalEntreprises = compSet.length;

    // ── Statut distribution ──────────────────────────────────────────────────
    final sCounts = <String, int>{};
    for (final c in _contacts) {
      final s = c.statut.trim().isEmpty ? 'Inconnu' : c.statut.trim();
      sCounts[s] = (sCounts[s] ?? 0) + 1;
    }
    _statutStats = sCounts.entries
        .map((e) => {'statut': e.key, 'count': e.value})
        .toList()
      ..sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));

    // ── Type distribution ────────────────────────────────────────────────────
    const types = ['Batiment','Industrie','Promoteur','Revendeur','Applicateur'];
    final tCounts = <String, int>{for (final t in types) t: 0};
    for (final c in _contacts) {
      final t = c.typeClient.trim().isEmpty ? 'Autre' : c.typeClient.trim();
      tCounts[t] = (tCounts[t] ?? 0) + 1;
    }
    _typeStats = tCounts.entries
        .where((e) => e.value > 0)
        .map((e) => {'statut': e.key, 'count': e.value})
        .toList()
      ..sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));

    // ── User stats ───────────────────────────────────────────────────────────
    final byUser = <String, List<CommercialContact>>{};
    for (final c in _contacts) {
      final name = (c.userNomCustom?.trim().isNotEmpty == true
          ? c.userNomCustom
          : c.userNom?.trim().isNotEmpty == true
              ? c.userNom
              : 'Non assigné')!;
      byUser.putIfAbsent(name, () => []).add(c);
    }
    _userStats = byUser.entries.map((e) {
      final list   = e.value;
      final acts   = list.where((c) => _isActif(c.statut)).length;
      final nonVal = list.where((c) => _isNonValide(c.statut)).length;
      final entSet = <String>{};
      for (final c in list) {
        if ((c.nomSociete ?? '').trim().isNotEmpty) entSet.add(c.nomSociete!.trim());
      }
      final calls  = list.fold(0, (s, c) => s + c.nbAppels);
      final dates  = list.map((c) => c.dateAppel ?? c.createdAt).whereType<DateTime>().toList();
      dates.sort((a, b) => b.compareTo(a));

      // Try to get email from first contact
      final emailVal = list.map((c) => c.email).where((e) => (e ?? '').isNotEmpty).firstOrNull;

      return _UserStat(
        name:         e.key,
        email:        emailVal,
        contacts:     list.length,
        calls:        calls,
        actifs:       acts,
        nonValides:   nonVal,
        entreprises:  entSet.length,
        lastActivity: dates.isNotEmpty ? dates.first : null,
      );
    }).toList();
    _userStats.sort((a, b) => b.contacts.compareTo(a.contacts));

    // ── Company stats ────────────────────────────────────────────────────────
    final byComp = <String, List<CommercialContact>>{};
    for (final c in _contacts) {
      final comp = (c.nomSociete ?? '').trim();
      if (comp.isEmpty) continue;
      byComp.putIfAbsent(comp, () => []).add(c);
    }
    _companyStats = byComp.entries.map((e) => _CompanyStat(
      name:     e.key,
      contacts: e.value.length,
      calls:    e.value.fold(0, (s, c) => s + c.nbAppels),
    )).toList();
    _companyStats.sort((a, b) => b.contacts.compareTo(a.contacts));
    if (_companyStats.length > 10) _companyStats = _companyStats.sublist(0, 10);

    // ── Monthly activity (last 12 months) ────────────────────────────────────
    final now = DateTime.now();
    _monthlyData = List.generate(12, (i) {
      final month = DateTime(now.year, now.month - 11 + i, 1);
      final list  = _contacts.where((c) {
        final d = c.createdAt;
        return d != null && d.year == month.year && d.month == month.month;
      }).toList();
      return _MonthData(
        label:    _kMonths[month.month - 1],
        contacts: list.length,
        calls:    list.fold(0, (s, c) => s + c.nbAppels),
      );
    });

    _filteredUsers = List.from(_userStats);
  }

  // ── Table helpers ──────────────────────────────────────────────────────────
  void _onSearch() {
    final q = _searchCtrl.text.toLowerCase().trim();
    setState(() {
      _page = 0;
      _filteredUsers = q.isEmpty
          ? List.from(_userStats)
          : _userStats.where((u) => u.name.toLowerCase().contains(q)).toList();
    });
  }

  void _sortUsers(int col, bool asc) {
    setState(() {
      _sortCol = col;
      _sortAsc = asc;
      _filteredUsers.sort((a, b) {
        final va = _cellValue(a, col);
        final vb = _cellValue(b, col);
        final cmp = Comparable.compare(va, vb);
        return asc ? cmp : -cmp;
      });
    });
  }

  Comparable _cellValue(_UserStat u, int col) {
    switch (col) {
      case 0: return u.name;
      case 1: return u.contacts;
      case 2: return u.calls;
      case 3: return u.entreprises;
      case 4: return u.actifs;
      case 5: return u.nonValides;
      case 6: return u.tauxReussite;
      case 7: return u.lastActivity?.millisecondsSinceEpoch ?? 0;
      default: return 0;
    }
  }

  List<_UserStat> get _pagedUsers {
    final start = _page * _rowsPerPage;
    if (start >= _filteredUsers.length) return [];
    return _filteredUsers.sublist(
        start, math.min(start + _rowsPerPage, _filteredUsers.length));
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  void _exportCsv(BuildContext context) {
    final sb = StringBuffer();
    sb.writeln('Utilisateur,Contacts,Appels,Entreprises,Actifs,Non Validés,Taux Réussite (%),Dernière Activité');
    for (final u in _userStats) {
      final date = u.lastActivity != null
          ? DateFormat('dd/MM/yyyy').format(u.lastActivity!)
          : '';
      sb.writeln(
          '${u.name},${u.contacts},${u.calls},${u.entreprises},${u.actifs},${u.nonValides},${u.tauxReussite.toStringAsFixed(1)},$date');
    }
    Clipboard.setData(ClipboardData(text: sb.toString()));
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: const Row(children: [
        Icon(Icons.check_circle_rounded, color: Colors.white, size: 18),
        SizedBox(width: 10),
        Text('Données CSV copiées — collez dans Excel ou Google Sheets.'),
      ]),
      backgroundColor: const Color(0xFF22C55E),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      duration: const Duration(seconds: 3),
    ));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD
  // ─────────────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBg,
      body: _loading
          ? _buildSkeleton()
          : _error != null
              ? _buildError()
              : _buildContent(),
    );
  }

  // ── Skeleton loading ───────────────────────────────────────────────────────
  Widget _buildSkeleton() => SingleChildScrollView(
    padding: const EdgeInsets.all(24),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SkeletonBox(width: 280, height: 36, r: 10),
      const SizedBox(height: 8),
      _SkeletonBox(width: 200, height: 16, r: 8),
      const SizedBox(height: 28),
      _ResponsiveGrid(cols: 3, gap: 14, children: List.generate(6, (_) => _SkeletonBox(height: 120, r: 18))),
      const SizedBox(height: 28),
      Row(children: [
        Expanded(child: _SkeletonBox(height: 300, r: 18)),
        const SizedBox(width: 16),
        Expanded(child: _SkeletonBox(height: 300, r: 18)),
      ]),
      const SizedBox(height: 28),
      _SkeletonBox(height: 380, r: 18),
      const SizedBox(height: 28),
      Row(children: [
        Expanded(child: _SkeletonBox(height: 260, r: 18)),
        const SizedBox(width: 16),
        Expanded(child: _SkeletonBox(height: 260, r: 18)),
      ]),
    ]),
  );

  // ── Error state ────────────────────────────────────────────────────────────
  Widget _buildError() => Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.cloud_off_rounded, size: 52, color: Color(0xFFEF4444)),
      const SizedBox(height: 16),
      const Text('Erreur de chargement',
          style: TextStyle(fontFamily: 'InterTight', fontSize: 18, fontWeight: FontWeight.w700, color: _kText)),
      const SizedBox(height: 8),
      Text(_error ?? '', style: AppTextStyles.bodyMuted, textAlign: TextAlign.center),
      const SizedBox(height: 24),
      FilledButton.icon(
        onPressed: _load,
        icon: const Icon(Icons.refresh_rounded, size: 18),
        label: const Text('Réessayer'),
        style: FilledButton.styleFrom(
          backgroundColor: _kIndigo,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: const TextStyle(fontFamily: 'InterTight', fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
    ]),
  );

  // ── Main content ───────────────────────────────────────────────────────────
  Widget _buildContent() => RefreshIndicator(
    color: _kIndigo,
    onRefresh: _load,
    child: SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _buildHeader(),
        const SizedBox(height: 28),
        // §1 KPIs — admin : 6 globaux / commercial : 4 personnels
        _isAdmin ? _buildSection1_GlobalKpis() : _buildSection1_PersonalKpis(),
        const SizedBox(height: 28),
        // §2 Top Commerciaux + §4 Statut — admin seulement
        // Commercial : donut statut seul (pleine largeur)
        _isAdmin ? _buildSection2and4_Row() : _buildSection4_StatutOnly(),
        const SizedBox(height: 28),
        // §3 Tableau Performance (classement) — admin seulement
        if (_isAdmin) ...[
          _buildSection3_PerformanceTable(),
          const SizedBox(height: 28),
        ],
        // §5 Type + §6 Mensuel — toujours affiché
        _buildSection5and6_Row(),
        const SizedBox(height: 28),
        // §7 Top Entreprises — admin seulement
        if (_isAdmin) ...[
          _buildSection7_TopCompanies(),
          const SizedBox(height: 28),
        ],
        const SizedBox(height: 12),
      ]),
    ),
  );

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildHeader() {
    final updateStr = DateFormat('dd/MM/yyyy HH:mm').format(_lastUpdate);
    final isMe      = !_isAdmin;
    final title     = isMe ? 'Mon Tableau de Bord Commercial' : 'Commercial Contacts Analytics';
    final subtitle  = isMe
        ? 'Vos contacts et performances personnelles.'
        : '$_totalContacts contacts · $_totalCalls appels · ${_userStats.length} commerciaux';

    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                begin: Alignment.topLeft, end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.people_alt_rounded, color: Colors.white, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              Flexible(
                child: Text(title,
                    style: const TextStyle(fontFamily: 'InterTight', fontSize: 26,
                        fontWeight: FontWeight.w800, color: _kText, letterSpacing: -0.5)),
              ),
              if (isMe) ...[
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color:        _kIndigo.withOpacity(0.10),
                    borderRadius: BorderRadius.circular(20),
                    border:       Border.all(color: _kIndigo.withOpacity(0.30)),
                  ),
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.person_rounded, size: 12, color: _kIndigo),
                    SizedBox(width: 4),
                    Text('Vue personnelle',
                        style: TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w700, color: _kIndigo)),
                  ]),
                ),
              ],
            ]),
            const SizedBox(height: 4),
            Text(subtitle, style: AppTextStyles.bodyMuted),
          ])),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          const Icon(Icons.access_time_rounded, size: 12, color: _kMuted),
          const SizedBox(width: 5),
          Text('Mis à jour : $updateStr', style: AppTextStyles.bodyMuted.copyWith(fontSize: 11)),
        ]),
      ])),
      const SizedBox(width: 16),
      // Actions
      Row(mainAxisSize: MainAxisSize.min, children: [
        _ActionBtn(
          icon: Icons.table_chart_rounded,
          label: 'Export CSV',
          color: const Color(0xFF059669),
          onTap: () => _exportCsv(context),
        ),
        const SizedBox(width: 10),
        _ActionBtn(
          icon: Icons.refresh_rounded,
          label: 'Actualiser',
          color: _kIndigo,
          onTap: _load,
        ),
      ]),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §1b — KPI PERSONNELS COMMERCIAL (4 cartes)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSection1_PersonalKpis() {
    final taux = _totalContacts == 0 ? 0.0 : _totalActifs / _totalContacts * 100;
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 900 ? 4 : w > 600 ? 2 : 1;
    return _ResponsiveGrid(cols: cols, gap: 14, children: [
      CrmModernKpiCard(
        label:    'Mes Contacts',
        value:    '$_totalContacts',
        icon:     Icons.people_alt_rounded,
        gradient: const [Color(0xFF4F46E5), Color(0xFF6366F1)],
        subtitle: 'contacts assignés',
      ),
      CrmModernKpiCard(
        label:    'Mes Appels',
        value:    '$_totalCalls',
        icon:     Icons.phone_in_talk_rounded,
        gradient: const [Color(0xFF0284C7), Color(0xFF38BDF8)],
        subtitle: _totalContacts > 0
            ? '${(_totalCalls / _totalContacts).toStringAsFixed(1)} moy/contact'
            : '—',
      ),
      CrmModernKpiCard(
        label:    'Mes Entreprises',
        value:    '$_totalEntreprises',
        icon:     Icons.business_rounded,
        gradient: const [Color(0xFFD97706), Color(0xFFF59E0B)],
        subtitle: 'sociétés distinctes',
      ),
      CrmModernKpiCard(
        label:    'Mon Taux de Validation',
        value:    '${taux.toStringAsFixed(1)}%',
        icon:     Icons.verified_rounded,
        gradient: const [Color(0xFF059669), Color(0xFF10B981)],
        subtitle: '$_totalActifs validés · $_totalNonValides non validés',
      ),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §4b — DONUT STATUT SEUL (vue commercial, pleine largeur)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSection4_StatutOnly() => Container(
    padding: const EdgeInsets.all(24),
    decoration: _card(),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const _SectionHeader(title: 'Mes Contacts par Statut'),
      const SizedBox(height: 20),
      _statutStats.isEmpty
          ? _EmptyState('Aucun statut disponible')
          : CrmDonutWithLegend(
              stats:       _statutStats,
              colorOf:     _statutColor,
              centerLabel: 'contacts',
            ),
    ]),
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — GLOBAL KPIs (6 cards)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSection1_GlobalKpis() {
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 1200 ? 6 : w > 900 ? 3 : w > 600 ? 2 : 1;

    final avgStr = _avgCalls.toStringAsFixed(1);

    final cards = [
      CrmModernKpiCard(
        label:    'Total Contacts',
        value:    '$_totalContacts',
        icon:     Icons.people_alt_rounded,
        gradient: const [Color(0xFF4F46E5), Color(0xFF6366F1)],
        subtitle: '${_userStats.length} commerciaux',
      ),
      CrmModernKpiCard(
        label:    'Total Appels',
        value:    '$_totalCalls',
        icon:     Icons.phone_in_talk_rounded,
        gradient: const [Color(0xFF0284C7), Color(0xFF38BDF8)],
        subtitle: '$avgStr appels/contact',
      ),
      CrmModernKpiCard(
        label:    'Entreprises',
        value:    '$_totalEntreprises',
        icon:     Icons.business_rounded,
        gradient: const [Color(0xFFD97706), Color(0xFFF59E0B)],
        subtitle: 'sociétés distinctes',
      ),
      CrmModernKpiCard(
        label:    'Contacts Actifs',
        value:    '$_totalActifs',
        icon:     Icons.verified_rounded,
        gradient: const [Color(0xFF059669), Color(0xFF10B981)],
        subtitle: _totalContacts > 0 ? '${(_totalActifs / _totalContacts * 100).toStringAsFixed(0)}% du total' : '—',
      ),
      CrmModernKpiCard(
        label:    'Non Validés',
        value:    '$_totalNonValides',
        icon:     Icons.cancel_rounded,
        gradient: const [Color(0xFFDC2626), Color(0xFFEF4444)],
        subtitle: _totalContacts > 0 ? '${(_totalNonValides / _totalContacts * 100).toStringAsFixed(0)}% du total' : '—',
      ),
      CrmModernKpiCard(
        label:    'Moy. Appels/Contact',
        value:    avgStr,
        icon:     Icons.trending_up_rounded,
        gradient: const [Color(0xFF7C3AED), Color(0xFFA78BFA)],
        subtitle: 'indicateur d\'engagement',
      ),
    ];

    return _ResponsiveGrid(cols: cols, gap: 14, children: cards);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 (Top Commerciaux) + SECTION 4 (Donut) — side by side
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSection2and4_Row() {
    final w = MediaQuery.of(context).size.width;

    final sec2 = Container(
      padding: const EdgeInsets.all(24),
      decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _SectionHeader(title: 'Top Commerciaux', badge: '${math.min(_userStats.length, 10)}'),
        const SizedBox(height: 20),
        if (_userStats.isEmpty)
          _EmptyState('Aucun commercial disponible')
        else
          ..._userStats.take(10).toList().asMap().entries.map((e) =>
              _TopCommercialCard(
                rank:    e.key,
                stat:    e.value,
                maxContacts: _userStats.first.contacts,
                onTap: () => _showUserDetail(context, e.value),
              )),
      ]),
    );

    final sec4 = Container(
      padding: const EdgeInsets.all(24),
      decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _SectionHeader(title: 'Contacts par Statut'),
        const SizedBox(height: 20),
        _statutStats.isEmpty
            ? _EmptyState('Aucun statut disponible')
            : CrmDonutWithLegend(
                stats:       _statutStats,
                colorOf:     _statutColor,
                centerLabel: 'contacts',
              ),
      ]),
    );

    if (w > 1000) {
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: 6, child: sec2),
        const SizedBox(width: 16),
        Expanded(flex: 4, child: sec4),
      ]);
    }
    return Column(children: [sec2, const SizedBox(height: 16), sec4]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — PERFORMANCE TABLE
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSection3_PerformanceTable() => Container(
    padding: const EdgeInsets.all(24),
    decoration: _card(),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Header row
      Row(children: [
        const _SectionHeader(title: 'Performance Utilisateurs'),
        const Spacer(),
        SizedBox(
          width: 240,
          height: 38,
          child: TextField(
            controller: _searchCtrl,
            style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, color: _kText),
            decoration: InputDecoration(
              hintText: 'Rechercher un commercial…',
              hintStyle: AppTextStyles.bodyMuted,
              prefixIcon: const Icon(Icons.search_rounded, size: 18, color: _kMuted),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 0),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kBorder)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kBorder)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kIndigo, width: 1.5)),
              filled: true, fillColor: const Color(0xFFF8FAFC),
            ),
          ),
        ),
      ]),
      const SizedBox(height: 20),
      if (_filteredUsers.isEmpty)
        _EmptyState('Aucun résultat')
      else ...[
        // Table
        SizedBox(
          width: double.infinity,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              sortColumnIndex: _sortCol,
              sortAscending:   _sortAsc,
              headingRowColor: WidgetStateProperty.all(const Color(0xFFF8FAFC)),
              headingTextStyle: AppTextStyles.tableHeader,
              dataTextStyle: const TextStyle(fontFamily: 'InterTight', fontSize: 13, color: _kText),
              horizontalMargin: 16,
              columnSpacing: 24,
              dividerThickness: 0.6,
              columns: [
                DataColumn(label: const Text('Utilisateur'),    onSort: _sortUsers),
                DataColumn(label: const Text('Contacts'),       numeric: true, onSort: _sortUsers),
                DataColumn(label: const Text('Appels'),         numeric: true, onSort: _sortUsers),
                DataColumn(label: const Text('Entreprises'),    numeric: true, onSort: _sortUsers),
                DataColumn(label: const Text('Actifs'),         numeric: true, onSort: _sortUsers),
                DataColumn(label: const Text('Non validés'),    numeric: true, onSort: _sortUsers),
                DataColumn(label: const Text('Taux réussite'),  numeric: true, onSort: _sortUsers),
                DataColumn(label: const Text('Dernière activ.'),               onSort: _sortUsers),
              ],
              rows: _pagedUsers.map((u) => DataRow(
                onSelectChanged: (_) => _showUserDetail(context, u),
                cells: [
                  DataCell(Row(mainAxisSize: MainAxisSize.min, children: [
                    _UserAvatar(name: u.name, size: 30),
                    const SizedBox(width: 10),
                    Flexible(child: Text(u.name, style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w600, color: _kText), overflow: TextOverflow.ellipsis)),
                  ])),
                  DataCell(Text('${u.contacts}', style: const TextStyle(fontFamily: 'InterTight', fontWeight: FontWeight.w700, color: _kIndigo))),
                  DataCell(Text('${u.calls}')),
                  DataCell(Text('${u.entreprises}')),
                  DataCell(Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: const Color(0xFF22C55E).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: Text('${u.actifs}', style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF22C55E))),
                  )),
                  DataCell(Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: const Color(0xFFEF4444).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: Text('${u.nonValides}', style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFEF4444))),
                  )),
                  DataCell(_TauxCell(taux: u.tauxReussite)),
                  DataCell(Text(
                    u.lastActivity != null ? DateFormat('dd/MM/yyyy').format(u.lastActivity!) : '—',
                    style: AppTextStyles.bodyMuted.copyWith(fontSize: 12),
                  )),
                ],
              )).toList(),
            ),
          ),
        ),
        const SizedBox(height: 16),
        // Pagination
        _buildPagination(),
      ],
    ]),
  );

  Widget _buildPagination() {
    final total = _filteredUsers.length;
    final start = _page * _rowsPerPage + 1;
    final end   = math.min((_page + 1) * _rowsPerPage, total);
    final pages = (total / _rowsPerPage).ceil();

    return Row(mainAxisAlignment: MainAxisAlignment.end, children: [
      Text('$start–$end de $total', style: AppTextStyles.bodyMuted.copyWith(fontSize: 12)),
      const SizedBox(width: 16),
      IconButton(
        icon: const Icon(Icons.chevron_left_rounded, size: 20),
        onPressed: _page > 0 ? () => setState(() => _page--) : null,
        color: _kIndigo,
        disabledColor: _kBorder,
        padding: EdgeInsets.zero,
        constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      ),
      ...List.generate(math.min(pages, 5), (i) {
        final p = _page < 3 ? i : _page - 2 + i;
        if (p >= pages) return const SizedBox();
        return GestureDetector(
          onTap: () => setState(() => _page = p),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            width: 32, height: 32,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: _page == p ? _kIndigo : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _page == p ? _kIndigo : _kBorder),
            ),
            alignment: Alignment.center,
            child: Text('${p + 1}', style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600, color: _page == p ? Colors.white : _kMuted)),
          ),
        );
      }),
      IconButton(
        icon: const Icon(Icons.chevron_right_rounded, size: 20),
        onPressed: (_page + 1) * _rowsPerPage < total ? () => setState(() => _page++) : null,
        color: _kIndigo,
        disabledColor: _kBorder,
        padding: EdgeInsets.zero,
        constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      ),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5 (Type bars) + SECTION 6 (Monthly line) — side by side
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSection5and6_Row() {
    final w           = MediaQuery.of(context).size.width;
    final typeTitle   = _isAdmin ? 'Contacts par Type'  : 'Mes Contacts par Type';
    final monthTitle  = _isAdmin ? 'Activité Mensuelle' : 'Mes Appels Mensuels';

    final sec5 = Container(
      padding: const EdgeInsets.all(24),
      decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _SectionHeader(title: typeTitle),
        const SizedBox(height: 20),
        _typeStats.isEmpty
            ? _EmptyState('Aucun type disponible')
            : CrmStatusBars(stats: _typeStats, colorOf: _typeColor),
      ]),
    );

    final sec6 = Container(
      padding: const EdgeInsets.all(24),
      decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: _SectionHeader(title: monthTitle)),
          _Legend(color: _kIndigo, label: 'Nouveaux contacts'),
          const SizedBox(width: 12),
          _Legend(color: const Color(0xFF0EA5E9), label: 'Appels'),
        ]),
        const SizedBox(height: 24),
        _buildLineChart(),
      ]),
    );

    if (w > 900) {
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(flex: 4, child: sec5),
        const SizedBox(width: 16),
        Expanded(flex: 6, child: sec6),
      ]);
    }
    return Column(children: [sec5, const SizedBox(height: 16), sec6]);
  }

  Widget _buildLineChart() {
    final maxY = _monthlyData.fold<int>(
      0, (m, d) => math.max(math.max(d.contacts, d.calls), m),
    ) + 2;

    final allZero = _monthlyData.every((d) => d.contacts == 0 && d.calls == 0);
    if (allZero) return _EmptyState('Aucune donnée mensuelle');

    return SizedBox(
      height: 220,
      child: LineChart(LineChartData(
        minY: 0,
        maxY: maxY.toDouble(),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: math.max(1, (maxY / 4).ceilToDouble()),
          getDrawingHorizontalLine: (_) => const FlLine(color: Color(0xFFF1F5F9), strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          leftTitles: AxisTitles(sideTitles: SideTitles(
            showTitles: true,
            interval:   math.max(1, (maxY / 4).ceilToDouble()),
            reservedSize: 30,
            getTitlesWidget: (v, _) => Text(v.toInt().toString(), style: AppTextStyles.chartAxis),
          )),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles:   const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(sideTitles: SideTitles(
            showTitles:   true,
            reservedSize: 28,
            getTitlesWidget: (v, _) {
              final i = v.toInt();
              if (i < 0 || i >= _monthlyData.length) return const SizedBox();
              return Padding(padding: const EdgeInsets.only(top: 6),
                  child: Text(_monthlyData[i].label, style: AppTextStyles.chartAxis));
            },
          )),
        ),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            tooltipRoundedRadius: 10,
            tooltipPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            getTooltipItems: (spots) => spots.map((s) {
              final i     = s.x.toInt();
              final label = i < _monthlyData.length ? _monthlyData[i].label : '';
              final isC   = s.barIndex == 0;
              return LineTooltipItem(
                '$label\n${isC ? "Contacts" : "Appels"}: ${s.y.toInt()}',
                TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600,
                    color: isC ? _kIndigo : const Color(0xFF0EA5E9)),
              );
            }).toList(),
          ),
        ),
        lineBarsData: [
          LineChartBarData(
            spots: _monthlyData.asMap().entries.map((e) => FlSpot(e.key.toDouble(), e.value.contacts.toDouble())).toList(),
            isCurved: true, curveSmoothness: 0.35,
            color: _kIndigo, barWidth: 2.5,
            dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
                FlDotCirclePainter(radius: 4, color: Colors.white, strokeWidth: 2, strokeColor: _kIndigo)),
            belowBarData: BarAreaData(show: true, color: _kIndigo.withOpacity(0.07)),
          ),
          LineChartBarData(
            spots: _monthlyData.asMap().entries.map((e) => FlSpot(e.key.toDouble(), e.value.calls.toDouble())).toList(),
            isCurved: true, curveSmoothness: 0.35,
            color: const Color(0xFF0EA5E9), barWidth: 2.5,
            dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
                FlDotCirclePainter(radius: 4, color: Colors.white, strokeWidth: 2, strokeColor: const Color(0xFF0EA5E9))),
            belowBarData: BarAreaData(show: true, color: const Color(0xFF0EA5E9).withOpacity(0.05)),
          ),
        ],
      )),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — TOP ENTREPRISES
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildSection7_TopCompanies() => Container(
    padding: const EdgeInsets.all(24),
    decoration: _card(),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SectionHeader(title: 'Top Entreprises', badge: '${_companyStats.length}'),
      const SizedBox(height: 20),
      if (_companyStats.isEmpty)
        _EmptyState('Aucune entreprise avec des contacts')
      else ...[
        Row(children: [
          const Expanded(flex: 4, child: Text('Entreprise', style: AppTextStyles.tableHeader)),
          const SizedBox(width: 16),
          const SizedBox(width: 80, child: Text('Contacts', style: AppTextStyles.tableHeader, textAlign: TextAlign.center)),
          const SizedBox(width: 80, child: Text('Appels', style: AppTextStyles.tableHeader, textAlign: TextAlign.center)),
          const Expanded(flex: 3, child: Text('Volume', style: AppTextStyles.tableHeader)),
        ]),
        const SizedBox(height: 12),
        ..._companyStats.asMap().entries.map((e) =>
            _CompanyRow(rank: e.key, stat: e.value, maxContacts: _companyStats.first.contacts)),
      ],
    ]),
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 8 — USER DETAIL DRAWER (on click)
  // ══════════════════════════════════════════════════════════════════════════
  void _showUserDetail(BuildContext context, _UserStat user) {
    final userContacts = _contacts.where((c) {
      final name = (c.userNomCustom?.trim().isNotEmpty == true ? c.userNomCustom : c.userNom)?.trim() ?? 'Non assigné';
      return name == user.name;
    }).toList();

    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Close',
      barrierColor: Colors.black.withOpacity(0.35),
      transitionDuration: const Duration(milliseconds: 280),
      transitionBuilder: (ctx, anim, _, child) {
        final curve = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
        return SlideTransition(
          position: Tween<Offset>(begin: const Offset(1, 0), end: Offset.zero).animate(curve),
          child: child,
        );
      },
      pageBuilder: (ctx, _, __) => Align(
        alignment: Alignment.centerRight,
        child: Material(
          color: Colors.transparent,
          child: SizedBox(
            width: math.min(MediaQuery.of(context).size.width * 0.48, 520),
            height: double.infinity,
            child: _UserDetailPanel(user: user, contacts: userContacts),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP COMMERCIAL CARD (Section 2)
// ─────────────────────────────────────────────────────────────────────────────

class _TopCommercialCard extends StatefulWidget {
  const _TopCommercialCard({
    required this.rank,
    required this.stat,
    required this.maxContacts,
    required this.onTap,
  });
  final int       rank;
  final _UserStat stat;
  final int       maxContacts;
  final VoidCallback onTap;

  @override
  State<_TopCommercialCard> createState() => _TopCommercialCardState();
}

class _TopCommercialCardState extends State<_TopCommercialCard> {
  bool _hovered = false;

  static const _kPalette = [
    Color(0xFF4F46E5), Color(0xFF0EA5E9), Color(0xFF10B981),
    Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFF8B5CF6),
    Color(0xFF14B8A6), Color(0xFFF97316), Color(0xFF6366F1), Color(0xFF22C55E),
  ];

  static const _kBadges = ['🥇 Leader', '🥈 Challenger', '🥉 Top Performer'];

  String get _badge {
    if (widget.rank < 3) return _kBadges[widget.rank];
    return '#${widget.rank + 1}';
  }

  Color get _color => _kPalette[widget.rank % _kPalette.length];

  @override
  Widget build(BuildContext context) {
    final u    = widget.stat;
    final frac = widget.maxContacts == 0 ? 0.0 : u.contacts / widget.maxContacts;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color:        _hovered ? _color.withOpacity(0.04) : const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(14),
            border:       Border.all(color: _hovered ? _color.withOpacity(0.35) : const Color(0xFFE2E8F0)),
            boxShadow:    _hovered ? [BoxShadow(color: _color.withOpacity(0.12), blurRadius: 12, offset: const Offset(0, 4))] : [],
          ),
          child: Row(children: [
            // Badge
            Container(
              width: 32,
              alignment: Alignment.center,
              child: Text(widget.rank < 3 ? ['🥇','🥈','🥉'][widget.rank] : '${widget.rank + 1}',
                style: TextStyle(fontSize: widget.rank < 3 ? 18 : 12, fontWeight: FontWeight.w800, color: _kMuted)),
            ),
            const SizedBox(width: 10),
            // Avatar
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [_color, _color.withOpacity(0.65)],
                    begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(10),
              ),
              alignment: Alignment.center,
              child: Text(
                u.name.isNotEmpty ? u.name[0].toUpperCase() : '?',
                style: const TextStyle(fontFamily: 'InterTight', fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white),
              ),
            ),
            const SizedBox(width: 12),
            // Info
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(u.name, style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w700, color: _kText), maxLines: 1, overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 6),
                if (widget.rank < 3)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: _color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: Text(_badge, style: TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w800, color: _color)),
                  ),
              ]),
              if (u.email != null && u.email!.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(u.email!, style: AppTextStyles.bodyMuted.copyWith(fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
              const SizedBox(height: 8),
              // Metrics row
              Row(children: [
                _MiniChip(label: '${u.contacts}', icon: Icons.people_rounded, color: _color),
                const SizedBox(width: 6),
                _MiniChip(label: '${u.calls}', icon: Icons.phone_rounded, color: const Color(0xFF0EA5E9)),
                const SizedBox(width: 6),
                _MiniChip(label: '${u.actifs} actifs', icon: Icons.check_circle_rounded, color: const Color(0xFF22C55E)),
                const Spacer(),
                // Score pill
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: _scoreColor(u.score).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _scoreColor(u.score).withOpacity(0.25)),
                  ),
                  child: Text('${u.score.toStringAsFixed(0)} pts',
                    style: TextStyle(fontFamily: 'InterTight', fontSize: 10, fontWeight: FontWeight.w800, color: _scoreColor(u.score))),
                ),
              ]),
              const SizedBox(height: 8),
              // Progress bar
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: frac,
                  minHeight: 5,
                  backgroundColor: _color.withOpacity(0.1),
                  valueColor: AlwaysStoppedAnimation(_color),
                ),
              ),
            ])),
          ]),
        ),
      ),
    );
  }
}

Color _scoreColor(double s) {
  if (s >= 70) return const Color(0xFF22C55E);
  if (s >= 40) return const Color(0xFFF59E0B);
  return const Color(0xFFEF4444);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY ROW (Section 7)
// ─────────────────────────────────────────────────────────────────────────────

class _CompanyRow extends StatelessWidget {
  const _CompanyRow({required this.rank, required this.stat, required this.maxContacts});
  final int           rank;
  final _CompanyStat  stat;
  final int           maxContacts;

  static const _kColors = [
    Color(0xFF4F46E5), Color(0xFF0EA5E9), Color(0xFF10B981), Color(0xFFF59E0B),
    Color(0xFFEF4444), Color(0xFF8B5CF6), Color(0xFF14B8A6), Color(0xFFF97316),
    Color(0xFF6366F1), Color(0xFF22C55E),
  ];

  @override
  Widget build(BuildContext context) {
    final color = _kColors[rank % _kColors.length];
    final frac  = maxContacts == 0 ? 0.0 : stat.contacts / maxContacts;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: rank == 0 ? color.withOpacity(0.04) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: rank == 0 ? color.withOpacity(0.25) : const Color(0xFFE2E8F0)),
      ),
      child: Row(children: [
        // Rank + company name
        Expanded(flex: 4, child: Row(children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.center,
            child: Text(stat.name.isNotEmpty ? stat.name[0].toUpperCase() : '?',
              style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w800, color: color)),
          ),
          const SizedBox(width: 10),
          Flexible(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(stat.name, style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w600, color: _kText), maxLines: 1, overflow: TextOverflow.ellipsis),
            Text('#${rank + 1}', style: TextStyle(fontFamily: 'InterTight', fontSize: 10, color: color, fontWeight: FontWeight.w700)),
          ])),
        ])),
        const SizedBox(width: 16),
        // Contacts
        SizedBox(width: 80, child: Text('${stat.contacts}', textAlign: TextAlign.center,
          style: TextStyle(fontFamily: 'InterTight', fontSize: 14, fontWeight: FontWeight.w800, color: color))),
        // Calls
        SizedBox(width: 80, child: Text('${stat.calls}', textAlign: TextAlign.center,
          style: const TextStyle(fontFamily: 'InterTight', fontSize: 14, fontWeight: FontWeight.w700, color: _kMuted))),
        // Progress bar
        Expanded(flex: 3, child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            height: 20,
            child: Stack(children: [
              Container(color: color.withOpacity(0.08)),
              FractionallySizedBox(
                widthFactor: frac.clamp(0.0, 1.0),
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [color, color.withOpacity(0.75)]),
                  ),
                ),
              ),
            ]),
          ),
        )),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER DETAIL PANEL (Drawer on click)
// ─────────────────────────────────────────────────────────────────────────────

class _UserDetailPanel extends StatefulWidget {
  const _UserDetailPanel({required this.user, required this.contacts});
  final _UserStat                user;
  final List<CommercialContact>  contacts;

  @override
  State<_UserDetailPanel> createState() => _UserDetailPanelState();
}

class _UserDetailPanelState extends State<_UserDetailPanel> {
  @override
  Widget build(BuildContext context) {
    final u        = widget.user;
    final contacts = widget.contacts;

    // Statut distribution for this user
    final sCounts = <String, int>{};
    for (final c in contacts) {
      final s = c.statut.trim().isEmpty ? 'Inconnu' : c.statut.trim();
      sCounts[s] = (sCounts[s] ?? 0) + 1;
    }
    final total = contacts.length.toDouble();

    // Last 5 recent contacts
    final recent = contacts.toList()
      ..sort((a, b) {
        final da = a.createdAt ?? a.dateAppel;
        final db = b.createdAt ?? b.dateAppel;
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return db.compareTo(da);
      });
    final last5 = recent.take(5).toList();

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Color(0x22000000), blurRadius: 40, offset: Offset(-8, 0))],
      ),
      child: Column(children: [
        // ── Header ────────────────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.fromLTRB(24, 20, 16, 20),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
              begin: Alignment.topLeft, end: Alignment.bottomRight,
            ),
          ),
          child: Row(children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(14),
              ),
              alignment: Alignment.center,
              child: Text(
                u.name.isNotEmpty ? u.name[0].toUpperCase() : '?',
                style: const TextStyle(fontFamily: 'InterTight', fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(u.name, style: const TextStyle(fontFamily: 'InterTight', fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
              if (u.email != null && u.email!.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(u.email!, style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, color: Colors.white70)),
              ],
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
                child: Text('Score : ${u.score.toStringAsFixed(0)}/100',
                  style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
              ),
            ])),
            IconButton(
              icon: const Icon(Icons.close_rounded, color: Colors.white70),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ]),
        ),

        // ── Body ──────────────────────────────────────────────────────────
        Expanded(child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // KPI chips
            Wrap(spacing: 10, runSpacing: 10, children: [
              _DrawerKpi(label: 'Contacts',    value: '${u.contacts}', color: _kIndigo, icon: Icons.people_rounded),
              _DrawerKpi(label: 'Appels',      value: '${u.calls}',    color: const Color(0xFF0EA5E9), icon: Icons.phone_rounded),
              _DrawerKpi(label: 'Actifs',      value: '${u.actifs}',   color: const Color(0xFF22C55E), icon: Icons.check_circle_rounded),
              _DrawerKpi(label: 'Non validés', value: '${u.nonValides}', color: const Color(0xFFEF4444), icon: Icons.cancel_rounded),
              _DrawerKpi(label: 'Entreprises', value: '${u.entreprises}', color: const Color(0xFFF59E0B), icon: Icons.business_rounded),
            ]),

            const SizedBox(height: 20),

            // Taux réussite
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Text('Taux de réussite', style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w600, color: _kText)),
                const Spacer(),
                Text('${u.tauxReussite.toStringAsFixed(1)}%',
                  style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w800, color: _scoreColor(u.tauxReussite))),
              ]),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: LinearProgressIndicator(
                  value: (u.tauxReussite / 100).clamp(0, 1),
                  minHeight: 10,
                  backgroundColor: _scoreColor(u.tauxReussite).withOpacity(0.1),
                  valueColor: AlwaysStoppedAnimation(_scoreColor(u.tauxReussite)),
                ),
              ),
            ]),

            const SizedBox(height: 20),
            const Divider(height: 1, color: _kBorder),
            const SizedBox(height: 16),

            // Répartition par statut
            const Text('Répartition par statut', style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w700, color: _kText)),
            const SizedBox(height: 14),
            if (sCounts.isEmpty)
              _EmptyState('Aucun statut')
            else
              _buildUserDonut(sCounts, total),

            const SizedBox(height: 20),
            const Divider(height: 1, color: _kBorder),
            const SizedBox(height: 16),

            // Dernière activité
            if (u.lastActivity != null) ...[
              Row(children: [
                const Icon(Icons.access_time_rounded, size: 14, color: _kMuted),
                const SizedBox(width: 6),
                const Text('Dernière activité : ', style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w500, color: _kMuted)),
                Text(DateFormat('dd/MM/yyyy').format(u.lastActivity!),
                  style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700, color: _kText)),
              ]),
              const SizedBox(height: 16),
              const Divider(height: 1, color: _kBorder),
              const SizedBox(height: 16),
            ],

            // Historique activité (recent contacts)
            const Text('Historique activité', style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w700, color: _kText)),
            const SizedBox(height: 12),
            if (last5.isEmpty)
              _EmptyState('Aucun contact récent')
            else
              ...last5.map((c) => _RecentContactTile(contact: c)),
          ]),
        )),
      ]),
    );
  }

  Widget _buildUserDonut(Map<String, int> sCounts, double total) {
    final entries = sCounts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return Column(children: entries.map((e) {
      final pct   = total == 0 ? 0.0 : e.value / total * 100;
      final color = _statutColor(e.key);
      return Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 8),
            Expanded(child: Text(e.key, style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w500, color: _kText))),
            Text('${e.value}', style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w800, color: color)),
            const SizedBox(width: 6),
            Text('(${pct.toStringAsFixed(0)}%)', style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, color: _kMuted)),
          ]),
          const SizedBox(height: 5),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: (pct / 100).clamp(0, 1),
              minHeight: 7,
              backgroundColor: color.withOpacity(0.1),
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ]),
      );
    }).toList());
  }
}

class _RecentContactTile extends StatelessWidget {
  const _RecentContactTile({required this.contact});
  final CommercialContact contact;

  @override
  Widget build(BuildContext context) {
    final color = _statutColor(contact.statut);
    final date  = contact.createdAt ?? contact.dateAppel;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _kBorder),
      ),
      child: Row(children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
          alignment: Alignment.center,
          child: Text(
            contact.fullName.isNotEmpty ? contact.fullName[0].toUpperCase() : '?',
            style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w800, color: color),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(contact.fullName.isEmpty ? '—' : contact.fullName,
            style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600, color: _kText),
            maxLines: 1, overflow: TextOverflow.ellipsis),
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
              child: Text(contact.statut, style: TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w700, color: color)),
            ),
            if (contact.nomSociete?.isNotEmpty == true) ...[
              const SizedBox(width: 6),
              Flexible(child: Text(contact.nomSociete!, style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, color: _kMuted), maxLines: 1, overflow: TextOverflow.ellipsis)),
            ],
          ]),
        ])),
        if (date != null)
          Text(DateFormat('dd/MM').format(date), style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, color: _kMuted)),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL WIDGETS / ATOMS
// ─────────────────────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.badge});
  final String  title;
  final String? badge;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Text(title, style: AppTextStyles.sectionTitle),
    if (badge != null) ...[
      const SizedBox(width: 8),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: _kIndigo.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
        child: Text(badge!, style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w800, color: _kIndigo)),
      ),
    ],
  ]);
}

class _ActionBtn extends StatelessWidget {
  const _ActionBtn({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String   label;
  final Color    color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: onTap,
    icon: Icon(icon, size: 16),
    label: Text(label),
    style: TextButton.styleFrom(
      foregroundColor: color,
      backgroundColor: color.withOpacity(0.08),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      textStyle: const TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w600),
    ),
  );
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});
  final Color  color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Container(width: 10, height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
    const SizedBox(width: 6),
    Text(label, style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w500, color: _kMuted)),
  ]);
}

class _MiniChip extends StatelessWidget {
  const _MiniChip({required this.label, required this.icon, required this.color});
  final String   label;
  final IconData icon;
  final Color    color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
    decoration: BoxDecoration(color: color.withOpacity(0.08), borderRadius: BorderRadius.circular(8)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 10, color: color),
      const SizedBox(width: 3),
      Text(label, style: TextStyle(fontFamily: 'InterTight', fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    ]),
  );
}

class _TauxCell extends StatelessWidget {
  const _TauxCell({required this.taux});
  final double taux;

  @override
  Widget build(BuildContext context) {
    final color = _scoreColor(taux);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
      child: Text('${taux.toStringAsFixed(1)}%',
        style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

class _UserAvatar extends StatelessWidget {
  const _UserAvatar({required this.name, this.size = 36});
  final String name;
  final double size;

  static const _kColors = [
    Color(0xFF4F46E5), Color(0xFF0EA5E9), Color(0xFF10B981), Color(0xFFF59E0B),
    Color(0xFFEF4444), Color(0xFF8B5CF6),
  ];

  @override
  Widget build(BuildContext context) {
    final color = _kColors[name.isEmpty ? 0 : name.codeUnitAt(0) % _kColors.length];
    return Container(
      width: size, height: size,
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(size * 0.28)),
      alignment: Alignment.center,
      child: Text(
        name.isNotEmpty ? name[0].toUpperCase() : '?',
        style: TextStyle(fontFamily: 'InterTight', fontSize: size * 0.4, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}

class _DrawerKpi extends StatelessWidget {
  const _DrawerKpi({required this.label, required this.value, required this.color, required this.icon});
  final String   label;
  final String   value;
  final Color    color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(
      color: color.withOpacity(0.06),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 14, color: color),
      const SizedBox(width: 6),
      Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(value, style: TextStyle(fontFamily: 'InterTight', fontSize: 16, fontWeight: FontWeight.w900, color: color, letterSpacing: -0.5)),
        Text(label, style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, fontWeight: FontWeight.w500, color: _kMuted)),
      ]),
    ]),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState(this.message);
  final String message;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(padding: const EdgeInsets.symmetric(vertical: 32), child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.inbox_rounded, size: 40, color: Colors.grey[300]),
      const SizedBox(height: 10),
      Text(message, style: AppTextStyles.bodyMuted),
    ])),
  );
}

class _SkeletonBox extends StatefulWidget {
  const _SkeletonBox({this.width, required this.height, this.r = 12});
  final double? width;
  final double  height;
  final double  r;

  @override
  State<_SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<_SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat(reverse: true);
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _anim,
    builder: (_, __) => Container(
      width:  widget.width,
      height: widget.height,
      decoration: BoxDecoration(
        color: Color.lerp(const Color(0xFFE2E8F0), const Color(0xFFF1F5F9), _anim.value),
        borderRadius: BorderRadius.circular(widget.r),
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSIVE GRID
// ─────────────────────────────────────────────────────────────────────────────
class _ResponsiveGrid extends StatelessWidget {
  const _ResponsiveGrid({required this.cols, required this.gap, required this.children});
  final int          cols;
  final double       gap;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (int i = 0; i < children.length; i += cols) {
      final rowItems = children.sublist(i, math.min(i + cols, children.length));
      while (rowItems.length < cols) { rowItems.add(const SizedBox()); }
      rows.add(IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: rowItems.asMap().entries.map((e) => Expanded(
            child: Padding(
              padding: EdgeInsets.only(left: e.key == 0 ? 0 : gap),
              child: e.value,
            ),
          )).toList(),
        ),
      ));
      if (i + cols < children.length) rows.add(SizedBox(height: gap));
    }
    return Column(children: rows);
  }
}
