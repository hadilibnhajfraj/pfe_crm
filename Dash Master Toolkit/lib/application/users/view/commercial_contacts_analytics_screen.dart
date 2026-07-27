// lib/application/users/view/commercial_contacts_analytics_screen.dart
//
// Commercial Contacts Analytics — Direction Commerciale
// Route : /users/commercial-contacts-kpi
// Style : Salesforce CRM / HubSpot / Zoho CRM

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
import 'package:dash_master_toolkit/localization/app_localizations.dart';

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
// DATA MODEL
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

  double get tauxReussite =>
      contacts == 0 ? 0.0 : actifs / contacts * 100;

  double scoreWith({
    required int maxContacts,
    required int maxCalls,
    required int maxEnts,
  }) {
    final cN = maxContacts == 0 ? 0.0 : contacts / maxContacts * 100;
    final kN = maxCalls    == 0 ? 0.0 : calls    / maxCalls    * 100;
    final eN = maxEnts     == 0 ? 0.0 : entreprises / maxEnts  * 100;
    return (cN * 0.25 + kN * 0.25 + tauxReussite * 0.30 + eN * 0.20)
        .clamp(0, 100);
  }
}

class _CompanyStat {
  final String name;
  final int    contacts;
  final int    calls;
  const _CompanyStat(
      {required this.name, required this.contacts, required this.calls});
}

class _MonthData {
  final String label;
  final int    contacts;
  final int    calls;
  const _MonthData(
      {required this.label, required this.contacts, required this.calls});
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
BoxDecoration _card({double r = 18}) => BoxDecoration(
  color:        _kCard,
  borderRadius: BorderRadius.circular(r),
  border:       Border.all(color: _kBorder, width: 0.8),
  boxShadow: [
    BoxShadow(
        color:  Colors.black.withOpacity(0.04),
        blurRadius: 20,
        offset: const Offset(0, 6))
  ],
);

Color _statutColor(String s) {
  final l = s.toLowerCase().trim();
  if (l == 'ok')                                          return const Color(0xFF22C55E);
  if (l.contains('non') || l.contains('refus') || l.contains('perdu')) { return const Color(0xFFEF4444); }
  if (l == 'client')                                      return const Color(0xFF8B5CF6);
  if (l.contains('prospect'))                             return const Color(0xFF3B82F6);
  if (l.contains('attente'))                              return const Color(0xFFF59E0B);
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

Color _scoreColor(double s) {
  if (s >= 70) return const Color(0xFF22C55E);
  if (s >= 40) return const Color(0xFFF59E0B);
  return const Color(0xFFEF4444);
}

const _kMonths =
    ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

const _kUserPalette = [
  Color(0xFF4F46E5), Color(0xFF0EA5E9), Color(0xFF10B981), Color(0xFFF59E0B),
  Color(0xFFEF4444), Color(0xFF8B5CF6), Color(0xFF14B8A6), Color(0xFFF97316),
  Color(0xFF6366F1), Color(0xFF22C55E),
];

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────
class CommercialContactsAnalyticsScreen extends StatefulWidget {
  final String token;
  const CommercialContactsAnalyticsScreen({super.key, required this.token});

  @override
  State<CommercialContactsAnalyticsScreen> createState() =>
      _CommercialContactsAnalyticsScreenState();
}

class _CommercialContactsAnalyticsScreenState
    extends State<CommercialContactsAnalyticsScreen> {
  final _svc = CommercialContactService();

  bool    _loading = true;
  String? _error;
  bool    _isAdmin = true;

  List<CommercialContact> _allContacts = [];

  // KPIs
  int    _totalContacts    = 0;
  int    _totalCalls       = 0;
  int    _totalEntreprises = 0;
  int    _totalCommerciaux = 0;
  int    _totalActifs      = 0;
  int    _totalNonValides  = 0;

  // Chart data
  List<Map<String, dynamic>> _statutStats = [];
  List<Map<String, dynamic>> _typeStats   = [];
  List<_UserStat>    _userStats    = [];
  List<_CompanyStat> _companyStats = [];
  List<_MonthData>   _monthlyData  = [];

  // Computed scores (need max values across all users)
  int _maxContacts = 1;
  int _maxCalls    = 1;
  int _maxEnts     = 1;

  // Table state
  final _searchCtrl = TextEditingController();
  int  _sortCol     = 1;
  bool _sortAsc     = false;
  int  _tablePage   = 0;
  static const _rowsPerPage = 10;
  List<_UserStat> _filtered = [];

  DateTime _lastUpdate = DateTime.now();

  // ── Init ──────────────────────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    final role   = (AuthService().userRole ?? '').toLowerCase().trim();
    final userId = AuthService().userId ?? 'N/A';
    _isAdmin = role == 'admin' || role == 'superadmin' || role == 'superadmin2';
    debugPrint('========== KPI FRONT DEBUG ==========');
    debugPrint('ROLE CONNECTE = $role');
    debugPrint('USER ID = $userId');
    _load();
    _searchCtrl.addListener(_onSearch);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      // ── 1. Essai endpoint KPI agrégé ──────────────────────────────────────
      // commercial → /my-kpi | admin/superadmin → /kpi
      // Retourne CommercialAnalyticsModel si le backend envoie {totalContacts,...}
      // Retourne null si format inattendu (404, liste, JSON mal formé)
      final kpiModel = _isAdmin
          ? await _svc.fetchGlobalKpiAggregated(token: widget.token)
          : await _svc.fetchMyKpiAggregated(token: widget.token);

      if (kpiModel != null) {
        // ── Données pré-agrégées du backend ─────────────────────────────
        _totalContacts    = kpiModel.totalContacts;
        _totalCalls       = kpiModel.totalCalls;
        _totalEntreprises = kpiModel.totalCompanies;
        _totalCommerciaux = kpiModel.totalCommerciaux;
        _totalActifs      = kpiModel.totalActifs;
        _totalNonValides  = kpiModel.totalNonValides;

        _statutStats = kpiModel.contactsByStatut
            .map((s) => <String, dynamic>{'statut': s.statut, 'count': s.count})
            .toList();
        _typeStats = kpiModel.contactsByType
            .map((t) => <String, dynamic>{'statut': t.type, 'count': t.count})
            .toList();

        if (kpiModel.monthlyActivity.isNotEmpty) {
          _monthlyData = kpiModel.monthlyActivity
              .map((m) => _MonthData(label: m.month, contacts: m.contacts, calls: m.calls))
              .toList();
        }

        // Per-user stats — pour admin (podium + classement)
        _userStats = kpiModel.contactsByCommercial.map((c) => _UserStat(
          name:        c.commercial,
          contacts:    c.contacts,
          calls:       c.calls,
          actifs:      c.actifs,
          nonValides:  c.nonValides,
          entreprises: c.entreprises,
        )).toList();

        _companyStats = kpiModel.topCompanies.map((c) => _CompanyStat(
          name:     c.name,
          contacts: c.contacts,
          calls:    c.calls,
        )).toList();

        _maxContacts = _userStats.isEmpty ? 1 : _userStats.map((u) => u.contacts).reduce(math.max).clamp(1, 1 << 30);
        _maxCalls    = _userStats.isEmpty ? 1 : _userStats.map((u) => u.calls).reduce(math.max).clamp(1, 1 << 30);
        _maxEnts     = _userStats.isEmpty ? 1 : _userStats.map((u) => u.entreprises).reduce(math.max).clamp(1, 1 << 30);
        _filtered    = List.from(_userStats);
        _allContacts = [];

      } else {
        // ── 2. Fallback : liste brute + calcul client-side ─────────────
        debugPrint('Endpoint KPI non disponible — chargement liste contacts');
        final data = await _svc.fetchMyContacts(token: widget.token);
        _allContacts = data;
        _compute();
      }

      _lastUpdate = DateTime.now();
      setState(() => _loading = false);
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _compute() {
    // ── KPIs ─────────────────────────────────────────────────────────────
    _totalContacts   = _allContacts.length;
    _totalCalls      = _allContacts.fold(0, (s, c) => s + c.nbAppels);
    _totalActifs     = _allContacts.where((c) => _isActif(c.statut)).length;
    _totalNonValides = _allContacts.where((c) => _isNonValide(c.statut)).length;

    final compSet = <String>{};
    for (final c in _allContacts) {
      if ((c.nomSociete ?? '').trim().isNotEmpty) compSet.add(c.nomSociete!.trim());
    }
    _totalEntreprises = compSet.length;

    // ── Statut ───────────────────────────────────────────────────────────
    final sCounts = <String, int>{};
    for (final c in _allContacts) {
      final s = c.statut.trim().isEmpty ? 'Inconnu' : c.statut.trim();
      sCounts[s] = (sCounts[s] ?? 0) + 1;
    }
    _statutStats = sCounts.entries
        .map((e) => {'statut': e.key, 'count': e.value})
        .toList()
      ..sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));

    // ── Type ─────────────────────────────────────────────────────────────
    const types = ['Batiment','Industrie','Promoteur','Revendeur','Applicateur'];
    final tCounts = <String, int>{for (final t in types) t: 0};
    for (final c in _allContacts) {
      final t = c.typeClient.trim().isEmpty ? 'Autre' : c.typeClient.trim();
      tCounts[t] = (tCounts[t] ?? 0) + 1;
    }
    _typeStats = tCounts.entries
        .where((e) => e.value > 0)
        .map((e) => {'statut': e.key, 'count': e.value})
        .toList()
      ..sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));

    // ── Users ─────────────────────────────────────────────────────────────
    final byUser = <String, List<CommercialContact>>{};
    for (final c in _allContacts) {
      final name = (c.userNomCustom?.trim().isNotEmpty == true
          ? c.userNomCustom
          : c.userNom?.trim().isNotEmpty == true
              ? c.userNom
              : 'Non assigné')!;
      byUser.putIfAbsent(name, () => []).add(c);
    }
    _totalCommerciaux = byUser.length;

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
      final email  = list.map((c) => c.email).where((e) => (e ?? '').isNotEmpty).firstOrNull;
      return _UserStat(
        name:         e.key,
        email:        email,
        contacts:     list.length,
        calls:        calls,
        actifs:       acts,
        nonValides:   nonVal,
        entreprises:  entSet.length,
        lastActivity: dates.isNotEmpty ? dates.first : null,
      );
    }).toList();
    _userStats.sort((a, b) => b.contacts.compareTo(a.contacts));

    _maxContacts = _userStats.isEmpty ? 1 : _userStats.map((u) => u.contacts).reduce(math.max).clamp(1, 1 << 30);
    _maxCalls    = _userStats.isEmpty ? 1 : _userStats.map((u) => u.calls).reduce(math.max).clamp(1, 1 << 30);
    _maxEnts     = _userStats.isEmpty ? 1 : _userStats.map((u) => u.entreprises).reduce(math.max).clamp(1, 1 << 30);

    // ── Companies ──────────────────────────────────────────────────────────
    final byComp = <String, List<CommercialContact>>{};
    for (final c in _allContacts) {
      final name = (c.nomSociete ?? '').trim();
      if (name.isEmpty) continue;
      byComp.putIfAbsent(name, () => []).add(c);
    }
    _companyStats = byComp.entries.map((e) => _CompanyStat(
      name:     e.key,
      contacts: e.value.length,
      calls:    e.value.fold(0, (s, c) => s + c.nbAppels),
    )).toList();
    _companyStats.sort((a, b) => b.contacts.compareTo(a.contacts));
    if (_companyStats.length > 10) _companyStats = _companyStats.sublist(0, 10);

    // ── Monthly ─────────────────────────────────────────────────────────────
    final now = DateTime.now();
    _monthlyData = List.generate(12, (i) {
      final month = DateTime(now.year, now.month - 11 + i, 1);
      final list  = _allContacts.where((c) {
        final d = c.createdAt;
        return d != null && d.year == month.year && d.month == month.month;
      }).toList();
      return _MonthData(
        label:    _kMonths[month.month - 1],
        contacts: list.length,
        calls:    list.fold(0, (s, c) => s + c.nbAppels),
      );
    });

    _filtered = List.from(_userStats);
  }

  double _score(_UserStat u) => u.scoreWith(
    maxContacts: _maxContacts, maxCalls: _maxCalls, maxEnts: _maxEnts);

  List<String> _whyTop(_UserStat u) {
    final reasons = <String>[];
    if (u.contacts == _maxContacts && _maxContacts > 0) reasons.add('Plus grand portefeuille contacts');
    if (u.calls    == _maxCalls    && _maxCalls > 0)    reasons.add('Plus grand nombre d\'appels');
    if (u.tauxReussite >= 70)  reasons.add('Excellent taux de validation (${u.tauxReussite.toStringAsFixed(0)}%)');
    if (u.entreprises == _maxEnts && _maxEnts > 0)      reasons.add('Gestion de plusieurs entreprises');
    if (_score(u) >= 80)       reasons.add('Score CRM exceptionnel');
    if (reasons.isEmpty)       reasons.add('Performance globale solide');
    return reasons.take(4).toList();
  }

  // ── Table helpers ──────────────────────────────────────────────────────────
  void _onSearch() {
    final q = _searchCtrl.text.toLowerCase().trim();
    setState(() {
      _tablePage = 0;
      _filtered = q.isEmpty
          ? List.from(_userStats)
          : _userStats.where((u) => u.name.toLowerCase().contains(q)).toList();
    });
  }

  void _sort(int col, bool asc) {
    setState(() {
      _sortCol = col; _sortAsc = asc;
      _filtered.sort((a, b) {
        final va = _cellVal(a, col);
        final vb = _cellVal(b, col);
        final cmp = Comparable.compare(va, vb);
        return asc ? cmp : -cmp;
      });
    });
  }

  Comparable _cellVal(_UserStat u, int col) {
    switch (col) {
      case 0: return u.name;
      case 1: return u.contacts;
      case 2: return u.calls;
      case 3: return u.entreprises;
      case 4: return u.actifs;
      case 5: return u.nonValides;
      case 6: return u.tauxReussite;
      case 7: return _score(u);
      default: return 0;
    }
  }

  List<_UserStat> get _paged {
    final start = _tablePage * _rowsPerPage;
    if (start >= _filtered.length) return [];
    return _filtered.sublist(start, math.min(start + _rowsPerPage, _filtered.length));
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  void _exportExcel(BuildContext ctx) {
    final sb = StringBuffer();
    sb.writeln('Commercial,Contacts,Appels,Entreprises,Validés,Non Validés,Taux Validation (%),Score CRM');
    for (final u in _userStats) {
      sb.writeln('${u.name},${u.contacts},${u.calls},${u.entreprises},${u.actifs},${u.nonValides},${u.tauxReussite.toStringAsFixed(1)},${_score(u).toStringAsFixed(0)}');
    }
    Clipboard.setData(ClipboardData(text: sb.toString()));
    _snack(ctx, AppLocalizations.of(ctx).translate('Export Excel — Données CSV copiées. Collez dans Excel ou Google Sheets.'), const Color(0xFF059669));
  }

  void _exportPdf(BuildContext ctx) {
    _snack(ctx, AppLocalizations.of(ctx).translate('Export PDF — Utilisez Ctrl+P pour imprimer ou enregistrer en PDF.'), const Color(0xFF0284C7));
  }

  void _snack(BuildContext ctx, String msg, Color color) =>
      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
        content: Row(children: [
          const Icon(Icons.check_circle_rounded, color: Colors.white, size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(msg)),
        ]),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 4),
      ));

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD
  // ─────────────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: _kBg,
    body: _loading
        ? _skeleton()
        : _error != null
            ? _errorView()
            : _content(),
  );

  // ── Skeleton ──────────────────────────────────────────────────────────────
  Widget _skeleton() => SingleChildScrollView(
    padding: const EdgeInsets.all(24),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _Sk(280, 40), const SizedBox(height: 6), _Sk(200, 16), const SizedBox(height: 28),
      _ResponsiveGrid(3, 14, List.generate(6, (_) => _Sk(double.infinity, 110))),
      const SizedBox(height: 28),
      _ResponsiveGrid(3, 16, List.generate(3, (_) => _Sk(double.infinity, 220))),
      const SizedBox(height: 28),
      Row(children: [Expanded(child: _Sk(double.infinity, 280)), const SizedBox(width: 16), Expanded(child: _Sk(double.infinity, 280))]),
      const SizedBox(height: 28),
      Row(children: [Expanded(child: _Sk(double.infinity, 260)), const SizedBox(width: 16), Expanded(child: _Sk(double.infinity, 260))]),
      const SizedBox(height: 28),
      _Sk(double.infinity, 400),
      const SizedBox(height: 28),
      _Sk(double.infinity, 240),
    ]),
  );

  // ── Error ─────────────────────────────────────────────────────────────────
  Widget _errorView() => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
    const Icon(Icons.cloud_off_rounded, size: 52, color: Color(0xFFEF4444)),
    const SizedBox(height: 16),
    Text(AppLocalizations.of(context).translate('Erreur de chargement'), style: const TextStyle(fontFamily: 'InterTight', fontSize: 18, fontWeight: FontWeight.w700, color: _kText)),
    const SizedBox(height: 8),
    Text(_error ?? '', style: AppTextStyles.bodyMuted, textAlign: TextAlign.center),
    const SizedBox(height: 24),
    FilledButton.icon(
      onPressed: _load,
      icon: const Icon(Icons.refresh_rounded),
      label: Text(AppLocalizations.of(context).translate('Réessayer')),
      style: FilledButton.styleFrom(
        backgroundColor: _kIndigo,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontFamily: 'InterTight', fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
  ]));

  // ── Content ───────────────────────────────────────────────────────────────
  Widget _content() => RefreshIndicator(
    color: _kIndigo,
    onRefresh: _load,
    child: SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _header(),
        const SizedBox(height: 28),
        // §1 KPIs — admin : 6 cartes globales / commercial : 4 cartes personnelles
        _isAdmin ? _section1Kpis() : _section1KpisMe(),
        const SizedBox(height: 28),
        // §2 Podium — admin uniquement
        if (_isAdmin) ...[
          _section2Podium(),
          const SizedBox(height: 28),
        ],
        // §3 & §4 Donuts (statut + type) — toujours affiché
        _section3and4Donuts(),
        const SizedBox(height: 28),
        // §5 & §6 Comparaison commerciaux — admin uniquement
        if (_isAdmin) ...[
          _section5and6Bars(),
          const SizedBox(height: 28),
        ],
        // §7 Top entreprises — admin uniquement
        if (_isAdmin) ...[
          _section7Companies(),
          const SizedBox(height: 28),
        ],
        // §8 Tableau performance (classement utilisateurs) — admin uniquement
        if (_isAdmin) ...[
          _section8Table(),
          const SizedBox(height: 28),
        ],
        // §9 Activité mensuelle — toujours affiché
        _section9Monthly(),
        const SizedBox(height: 40),
      ]),
    ),
  );

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ══════════════════════════════════════════════════════════════════════════
  Widget _header() {
    final lang  = AppLocalizations.of(context);
    final upd   = DateFormat('dd/MM/yyyy HH:mm').format(_lastUpdate);
    final isMe  = !_isAdmin;
    final title = lang.translate(isMe ? 'Mon Tableau de Bord Commercial' : 'Commercial Contacts Analytics');
    final sub   = lang.translate(isMe ? 'Vos contacts et performances personnelles.' : 'Analyse complète des contacts commerciaux.');

    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(11),
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.all(Radius.circular(14)),
            ),
            child: const Icon(Icons.analytics_rounded, color: Colors.white, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              Flexible(
                child: Text(title,
                    style: const TextStyle(fontFamily: 'InterTight', fontSize: 26, fontWeight: FontWeight.w800, color: _kText, letterSpacing: -0.5)),
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
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.person_rounded, size: 12, color: _kIndigo),
                    const SizedBox(width: 4),
                    Text(lang.translate('Vue personnelle'),
                        style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w700, color: _kIndigo)),
                  ]),
                ),
              ],
            ]),
            const SizedBox(height: 3),
            Text(sub, style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, color: _kMuted)),
          ])),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          const Icon(Icons.access_time_rounded, size: 12, color: _kMuted),
          const SizedBox(width: 5),
          Text('${lang.translate('Mis à jour')} : $upd — $_totalContacts ${lang.translate('contacts').toLowerCase()} · $_totalCalls ${lang.translate('appels')}',
              style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, color: _kMuted)),
        ]),
      ])),
      const SizedBox(width: 16),
      Row(mainAxisSize: MainAxisSize.min, children: [
        _Btn(Icons.table_chart_rounded,   'Export Excel', const Color(0xFF059669), () => _exportExcel(context)),
        const SizedBox(width: 8),
        _Btn(Icons.picture_as_pdf_rounded, 'Export PDF',  const Color(0xFF0284C7), () => _exportPdf(context)),
        const SizedBox(width: 8),
        _Btn(Icons.refresh_rounded,        'Actualiser',  _kIndigo,               _load),
      ]),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §1 — KPI GLOBAUX (6 cartes)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _section1Kpis() {
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 1200 ? 6 : w > 900 ? 3 : w > 600 ? 2 : 1;
    return _ResponsiveGrid(cols, 14, [
      CrmModernKpiCard(label: 'Total Contacts', value: '$_totalContacts', icon: Icons.people_alt_rounded,     gradient: const [Color(0xFF4F46E5), Color(0xFF6366F1)], subtitle: '$_totalCommerciaux commerciaux'),
      CrmModernKpiCard(label: 'Total Calls',    value: '$_totalCalls',    icon: Icons.phone_in_talk_rounded,  gradient: const [Color(0xFF0284C7), Color(0xFF38BDF8)], subtitle: _totalContacts > 0 ? '${(_totalCalls / _totalContacts).toStringAsFixed(1)} moy/contact' : '—'),
      CrmModernKpiCard(label: 'Entreprises',    value: '$_totalEntreprises', icon: Icons.business_rounded,    gradient: const [Color(0xFFD97706), Color(0xFFF59E0B)], subtitle: 'sociétés distinctes'),
      CrmModernKpiCard(label: 'Commerciaux',    value: '$_totalCommerciaux', icon: Icons.badge_rounded,       gradient: const [Color(0xFF7C3AED), Color(0xFFA78BFA)], subtitle: 'actifs'),
      CrmModernKpiCard(label: 'Contacts OK',    value: '$_totalActifs',   icon: Icons.verified_rounded,       gradient: const [Color(0xFF059669), Color(0xFF10B981)], subtitle: _totalContacts > 0 ? '${(_totalActifs / _totalContacts * 100).toStringAsFixed(0)}% du total' : '—'),
      CrmModernKpiCard(label: 'Non Validés',    value: '$_totalNonValides', icon: Icons.cancel_rounded,       gradient: const [Color(0xFFDC2626), Color(0xFFEF4444)], subtitle: _totalContacts > 0 ? '${(_totalNonValides / _totalContacts * 100).toStringAsFixed(0)}% du total' : '—'),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §1b — KPI PERSONNELS COMMERCIAL (4 cartes)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _section1KpisMe() {
    final taux = _totalContacts == 0 ? 0.0 : _totalActifs / _totalContacts * 100;
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 900 ? 4 : w > 600 ? 2 : 1;
    return _ResponsiveGrid(cols, 14, [
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
  // §2 — TOP COMMERCIAUX (3 podium cards)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _section2Podium() {
    if (_userStats.isEmpty) {
      return Container(padding: const EdgeInsets.all(24), decoration: _card(), child: const _Empty('Aucun commercial disponible'));
    }
    final top3 = _userStats.take(3).toList();
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 900 ? 3 : 1;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SH(title: 'Top Commerciaux', badge: 'Podium CRM'),
      const SizedBox(height: 14),
      _ResponsiveGrid(cols, 16, [
        for (int i = 0; i < top3.length; i++)
          _PodiumCard(rank: i, user: top3[i], score: _score(top3[i]), reasons: _whyTop(top3[i]),
              onTap: () => _openDrawer(context, top3[i])),
      ]),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §3 (Statut donut) + §4 (Type donut) — côte à côte
  // ══════════════════════════════════════════════════════════════════════════
  Widget _section3and4Donuts() {
    final w = MediaQuery.of(context).size.width;

    Widget sec3 = Container(
      padding: const EdgeInsets.all(24), decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _SH(title: 'Répartition par Statut'),
        const SizedBox(height: 20),
        _statutStats.isEmpty
            ? const _Empty('Aucun statut')
            : CrmDonutWithLegend(stats: _statutStats, colorOf: _statutColor, centerLabel: 'contacts'),
      ]),
    );

    Widget sec4 = Container(
      padding: const EdgeInsets.all(24), decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _SH(title: 'Répartition par Type'),
        const SizedBox(height: 20),
        _typeStats.isEmpty
            ? const _Empty('Aucun type')
            : CrmDonutWithLegend(stats: _typeStats, colorOf: _typeColor, centerLabel: 'contacts'),
      ]),
    );

    if (w > 800) {
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: sec3), const SizedBox(width: 16), Expanded(child: sec4),
      ]);
    }
    return Column(children: [sec3, const SizedBox(height: 16), sec4]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §5 (contacts/commercial) + §6 (calls/commercial) — côte à côte
  // ══════════════════════════════════════════════════════════════════════════
  Widget _section5and6Bars() {
    final top10 = _userStats.take(10).toList();
    final w     = MediaQuery.of(context).size.width;

    Widget sec5 = Container(
      padding: const EdgeInsets.all(24), decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _SH(title: 'Contacts par Commercial'),
        const SizedBox(height: 20),
        top10.isEmpty
            ? const _Empty('Aucun commercial')
            : _HorizBars(
                labels: top10.map((u) => u.name).toList(),
                values: top10.map((u) => u.contacts).toList(),
                maxVal: _maxContacts,
                colors: List.generate(top10.length, (i) => _kUserPalette[i % _kUserPalette.length]),
              ),
      ]),
    );

    Widget sec6 = Container(
      padding: const EdgeInsets.all(24), decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _SH(title: 'Appels par Commercial'),
        const SizedBox(height: 20),
        top10.isEmpty
            ? const _Empty('Aucun commercial')
            : _HorizBars(
                labels: top10.map((u) => u.name).toList(),
                values: top10.map((u) => u.calls).toList(),
                maxVal: _maxCalls,
                colors: List.generate(top10.length, (i) => _kUserPalette[i % _kUserPalette.length]),
                unit: 'appels',
              ),
      ]),
    );

    if (w > 900) {
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: sec5), const SizedBox(width: 16), Expanded(child: sec6),
      ]);
    }
    return Column(children: [sec5, const SizedBox(height: 16), sec6]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §7 — TOP ENTREPRISES
  // ══════════════════════════════════════════════════════════════════════════
  Widget _section7Companies() {
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 1100 ? 5 : w > 800 ? 3 : w > 550 ? 2 : 1;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _SH(title: 'Top Entreprises', badge: '${_companyStats.length}'),
      const SizedBox(height: 14),
      _companyStats.isEmpty
          ? Container(padding: const EdgeInsets.all(24), decoration: _card(), child: const _Empty('Aucune entreprise'))
          : _ResponsiveGrid(cols, 14, [
              for (int i = 0; i < _companyStats.length; i++)
                _CompanyCard(rank: i, stat: _companyStats[i], maxContacts: _companyStats.first.contacts),
            ]),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §8 — TABLEAU PERFORMANCE
  // ══════════════════════════════════════════════════════════════════════════
  Widget _section8Table() => Container(
    padding: const EdgeInsets.all(24), decoration: _card(),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Header — Row pour permettre Spacer (Wrap ne supporte pas Spacer/Expanded)
      Row(children: [
        const _SH(title: 'Tableau Performance'),
        const Spacer(),
        SizedBox(
          width: 240, height: 38,
          child: TextField(
            controller: _searchCtrl,
            style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, color: _kText),
            decoration: InputDecoration(
              hintText: AppLocalizations.of(context).translate('Rechercher…'),
              hintStyle: AppTextStyles.bodyMuted,
              prefixIcon: const Icon(Icons.search_rounded, size: 18, color: _kMuted),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 0),
              border:        OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kBorder)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kBorder)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kIndigo, width: 1.5)),
              filled: true, fillColor: const Color(0xFFF8FAFC),
            ),
          ),
        ),
        const SizedBox(width: 8),
        _Btn(Icons.table_chart_rounded,    'Excel', const Color(0xFF059669), () => _exportExcel(context)),
        const SizedBox(width: 8),
        _Btn(Icons.picture_as_pdf_rounded, 'PDF',   const Color(0xFF0284C7), () => _exportPdf(context)),
      ]),
      const SizedBox(height: 20),
      if (_filtered.isEmpty)
        const _Empty('Aucun résultat')
      else ...[
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
              horizontalMargin: 16, columnSpacing: 22, dividerThickness: 0.5,
              columns: [
                DataColumn(label: Text(AppLocalizations.of(context).translate('Commercial')),    onSort: _sort),
                DataColumn(label: Text(AppLocalizations.of(context).translate('Contacts')),      numeric: true, onSort: _sort),
                DataColumn(label: Text(AppLocalizations.of(context).translate('Appels')),        numeric: true, onSort: _sort),
                DataColumn(label: Text(AppLocalizations.of(context).translate('Entreprises')),   numeric: true, onSort: _sort),
                DataColumn(label: Text(AppLocalizations.of(context).translate('Validés')),       numeric: true, onSort: _sort),
                DataColumn(label: Text(AppLocalizations.of(context).translate('Non validés')),   numeric: true, onSort: _sort),
                DataColumn(label: Text(AppLocalizations.of(context).translate('Taux valid.')),   numeric: true, onSort: _sort),
                DataColumn(label: Text(AppLocalizations.of(context).translate('Score CRM')),     numeric: true, onSort: _sort),
              ],
              rows: _paged.asMap().entries.map((e) {
                final idx  = _filtered.indexOf(e.value);
                final u    = e.value;
                final sc   = _score(u);
                final rank = idx + 1;
                return DataRow(
                  onSelectChanged: (_) => _openDrawer(context, u),
                  cells: [
                    DataCell(Row(mainAxisSize: MainAxisSize.min, children: [
                      _Avatar(name: u.name, size: 30),
                      const SizedBox(width: 8),
                      Flexible(child: Text(u.name, style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w600, color: _kText), overflow: TextOverflow.ellipsis)),
                      const SizedBox(width: 6),
                      _RankBadge(rank),
                    ])),
                    DataCell(Text('${u.contacts}', style: const TextStyle(fontFamily: 'InterTight', fontWeight: FontWeight.w700, color: _kIndigo))),
                    DataCell(Text('${u.calls}')),
                    DataCell(Text('${u.entreprises}')),
                    DataCell(_ColorBadge(value: '${u.actifs}', color: const Color(0xFF22C55E))),
                    DataCell(_ColorBadge(value: '${u.nonValides}', color: const Color(0xFFEF4444))),
                    DataCell(_TauxBadge(u.tauxReussite)),
                    DataCell(_ScoreBar(sc)),
                  ],
                );
              }).toList(),
            ),
          ),
        ),
        const SizedBox(height: 14),
        _pagination(),
      ],
    ]),
  );

  Widget _pagination() {
    final total = _filtered.length;
    final start = _tablePage * _rowsPerPage + 1;
    final end   = math.min((_tablePage + 1) * _rowsPerPage, total);
    final pages = (total / _rowsPerPage).ceil();
    return Row(mainAxisAlignment: MainAxisAlignment.end, children: [
      Text('$start–$end ${AppLocalizations.of(context).translate('de')} $total', style: AppTextStyles.bodyMuted.copyWith(fontSize: 12)),
      const SizedBox(width: 12),
      IconButton(
        icon: const Icon(Icons.chevron_left_rounded, size: 20), color: _kIndigo,
        disabledColor: _kBorder, padding: EdgeInsets.zero,
        constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
        onPressed: _tablePage > 0 ? () => setState(() => _tablePage--) : null,
      ),
      ...List.generate(math.min(pages, 5), (i) {
        final p = _tablePage < 3 ? i : _tablePage - 2 + i;
        if (p >= pages) return const SizedBox();
        return GestureDetector(
          onTap: () => setState(() => _tablePage = p),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            width: 30, height: 30,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: _tablePage == p ? _kIndigo : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _tablePage == p ? _kIndigo : _kBorder),
            ),
            alignment: Alignment.center,
            child: Text('${p + 1}', style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600, color: _tablePage == p ? Colors.white : _kMuted)),
          ),
        );
      }),
      IconButton(
        icon: const Icon(Icons.chevron_right_rounded, size: 20), color: _kIndigo,
        disabledColor: _kBorder, padding: EdgeInsets.zero,
        constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
        onPressed: (_tablePage + 1) * _rowsPerPage < total ? () => setState(() => _tablePage++) : null,
      ),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // §9 — ACTIVITÉ MENSUELLE (Line Chart)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _section9Monthly() {
    final maxY = _monthlyData.fold<int>(0, (m, d) => math.max(math.max(d.contacts, d.calls), m)) + 2;
    final allZ = _monthlyData.every((d) => d.contacts == 0 && d.calls == 0);

    return Container(
      padding: const EdgeInsets.all(24), decoration: _card(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: _SH(title: _isAdmin ? 'Activité Mensuelle' : 'Mes Appels Mensuels')),
          _Leg(_kIndigo,                   'Nouveaux contacts'),
          const SizedBox(width: 12),
          _Leg(const Color(0xFF0EA5E9),    'Appels'),
        ]),
        const SizedBox(height: 24),
        SizedBox(
          height: 230,
          child: allZ
              ? const _Empty('Aucune donnée mensuelle')
              : LineChart(LineChartData(
                  minY: 0, maxY: maxY.toDouble(),
                  gridData: FlGridData(
                    show: true, drawVerticalLine: false,
                    horizontalInterval: math.max(1, (maxY / 4).ceilToDouble()),
                    getDrawingHorizontalLine: (_) => const FlLine(color: Color(0xFFF1F5F9), strokeWidth: 1),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    leftTitles: AxisTitles(sideTitles: SideTitles(
                      showTitles: true,
                      interval: math.max(1, (maxY / 4).ceilToDouble()),
                      reservedSize: 30,
                      getTitlesWidget: (v, _) => Text(v.toInt().toString(), style: AppTextStyles.chartAxis),
                    )),
                    rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    topTitles:   const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    bottomTitles: AxisTitles(sideTitles: SideTitles(
                      showTitles: true, reservedSize: 28,
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
                        final i   = s.x.toInt();
                        final lbl = i < _monthlyData.length ? _monthlyData[i].label : '';
                        final isC = s.barIndex == 0;
                        return LineTooltipItem(
                          '$lbl\n${isC ? "Contacts" : "Appels"}: ${s.y.toInt()}',
                          TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600,
                              color: isC ? _kIndigo : const Color(0xFF0EA5E9)),
                        );
                      }).toList(),
                    ),
                  ),
                  lineBarsData: [
                    _line(_monthlyData.map((d) => d.contacts.toDouble()).toList(), _kIndigo),
                    _line(_monthlyData.map((d) => d.calls.toDouble()).toList(), const Color(0xFF0EA5E9)),
                  ],
                )),
        ),
      ]),
    );
  }

  LineChartBarData _line(List<double> vals, Color color) => LineChartBarData(
    spots: vals.asMap().entries.map((e) => FlSpot(e.key.toDouble(), e.value)).toList(),
    isCurved: true, curveSmoothness: 0.35, color: color, barWidth: 2.5,
    dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
        FlDotCirclePainter(radius: 4, color: Colors.white, strokeWidth: 2, strokeColor: color)),
    belowBarData: BarAreaData(show: true, color: color.withOpacity(0.07)),
  );

  // ══════════════════════════════════════════════════════════════════════════
  // §10 — DRAWER DETAIL COMMERCIAL
  // ══════════════════════════════════════════════════════════════════════════
  void _openDrawer(BuildContext ctx, _UserStat user) {
    final userContacts = _allContacts.where((c) {
      final name = (c.userNomCustom?.trim().isNotEmpty == true ? c.userNomCustom : c.userNom)?.trim() ?? 'Non assigné';
      return name == user.name;
    }).toList();

    final rank = _userStats.indexOf(user) + 1;

    showGeneralDialog(
      context: ctx,
      barrierDismissible: true, barrierLabel: 'close',
      barrierColor: Colors.black.withOpacity(0.32),
      transitionDuration: const Duration(milliseconds: 280),
      transitionBuilder: (_, anim, __, child) {
        final curve = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
        return SlideTransition(
          position: Tween<Offset>(begin: const Offset(1, 0), end: Offset.zero).animate(curve),
          child: child,
        );
      },
      pageBuilder: (_, __, ___) => Align(
        alignment: Alignment.centerRight,
        child: Material(
          color: Colors.transparent,
          child: SizedBox(
            width: math.min(MediaQuery.of(ctx).size.width * 0.48, 520),
            height: double.infinity,
            child: _DetailDrawer(
              user:        user,
              contacts:    userContacts,
              rank:        rank,
              score:       _score(user),
              reasons:     _whyTop(user),
              maxContacts: _maxContacts,
              maxCalls:    _maxCalls,
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PODIUM CARD (§2)
// ─────────────────────────────────────────────────────────────────────────────

class _PodiumCard extends StatefulWidget {
  const _PodiumCard({
    required this.rank,
    required this.user,
    required this.score,
    required this.reasons,
    required this.onTap,
  });
  final int          rank;
  final _UserStat    user;
  final double       score;
  final List<String> reasons;
  final VoidCallback onTap;

  @override
  State<_PodiumCard> createState() => _PodiumCardState();
}

class _PodiumCardState extends State<_PodiumCard> {
  bool _hovered = false;

  static const _gradients = [
    [Color(0xFFFFD700), Color(0xFFFFA500)], // Gold
    [Color(0xFF94A3B8), Color(0xFF64748B)], // Silver
    [Color(0xFFCD7F32), Color(0xFFA0522D)], // Bronze
  ];
  static const _labels = ['🥇 Leader CRM', '🥈 Challenger', '🥉 Top Performer'];
  static const _icons  = [Icons.workspace_premium_rounded, Icons.military_tech_rounded, Icons.star_rounded];

  @override
  Widget build(BuildContext context) {
    final u    = widget.user;
    final grad = _gradients[widget.rank];

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            color:        _kCard,
            borderRadius: BorderRadius.circular(20),
            border:       Border.all(color: _hovered ? grad[0].withOpacity(0.6) : _kBorder, width: _hovered ? 1.5 : 0.8),
            boxShadow: [BoxShadow(color: (_hovered ? grad[0] : Colors.black).withOpacity(_hovered ? 0.18 : 0.04), blurRadius: _hovered ? 28 : 16, offset: const Offset(0, 6))],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // ── Gradient header ─────────────────────────────────────────
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: grad, begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Row(children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.22), borderRadius: BorderRadius.circular(12)),
                  alignment: Alignment.center,
                  child: Text(u.name.isNotEmpty ? u.name[0].toUpperCase() : '?',
                    style: const TextStyle(fontFamily: 'InterTight', fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white)),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_labels[widget.rank], style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white70, letterSpacing: 0.5)),
                  const SizedBox(height: 2),
                  Text(u.name, style: const TextStyle(fontFamily: 'InterTight', fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (u.email != null && u.email!.isNotEmpty)
                    Text(u.email!, style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, color: Colors.white70), maxLines: 1, overflow: TextOverflow.ellipsis),
                ])),
                Icon(_icons[widget.rank], color: Colors.white, size: 28),
              ]),
            ),

            // ── Score + progress ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text('Score CRM', style: AppTextStyles.bodyMuted.copyWith(fontSize: 12)),
                  const Spacer(),
                  Text('${widget.score.toStringAsFixed(0)}/100',
                    style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w800, color: grad[0])),
                ]),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: (widget.score / 100).clamp(0, 1), minHeight: 8,
                    backgroundColor: grad[0].withOpacity(0.1),
                    valueColor: AlwaysStoppedAnimation(grad[0]),
                  ),
                ),
              ]),
            ),

            // ── Metrics grid ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
              child: Row(children: [
                _MetTile('Contacts',    '${u.contacts}',    _kIndigo),
                _MetTile('Appels',      '${u.calls}',       const Color(0xFF0EA5E9)),
                _MetTile('Actifs',      '${u.actifs}',      const Color(0xFF22C55E)),
                _MetTile('Entreprises', '${u.entreprises}', const Color(0xFFF59E0B)),
              ]),
            ),

            // ── Validation ──────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
              child: Row(children: [
                Text('Taux validation', style: AppTextStyles.bodyMuted.copyWith(fontSize: 11)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: _scoreColor(u.tauxReussite).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                  child: Text('${u.tauxReussite.toStringAsFixed(1)}%',
                    style: TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w800, color: _scoreColor(u.tauxReussite))),
                ),
              ]),
            ),

            // ── Why top ─────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Pourquoi ce classement', style: AppTextStyles.bodyMuted.copyWith(fontSize: 11, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                ...widget.reasons.map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: 5),
                  child: Row(children: [
                    Icon(Icons.check_circle_rounded, size: 13, color: grad[0]),
                    const SizedBox(width: 6),
                    Flexible(child: Text(r, style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w500, color: _kText))),
                  ]),
                )),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HORIZONTAL BARS (§5 & §6)
// ─────────────────────────────────────────────────────────────────────────────

class _HorizBars extends StatefulWidget {
  const _HorizBars({
    required this.labels,
    required this.values,
    required this.maxVal,
    required this.colors,
    this.unit = 'contacts',
  });
  final List<String> labels;
  final List<int>    values;
  final int          maxVal;
  final List<Color>  colors;
  final String       unit;

  @override
  State<_HorizBars> createState() => _HorizBarsState();
}

class _HorizBarsState extends State<_HorizBars> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) => Column(
        children: widget.labels.asMap().entries.map((e) {
          final i     = e.key;
          final label = e.value;
          final val   = widget.values[i];
          final frac  = widget.maxVal == 0 ? 0.0 : val / widget.maxVal;
          final color = widget.colors[i % widget.colors.length];
          final anim  = CurvedAnimation(
            parent: _ctrl,
            curve: Interval(i / widget.labels.length * 0.4, 1.0, curve: Curves.easeOutCubic),
          ).value;

          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(width: 22, height: 22,
                  decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
                  alignment: Alignment.center,
                  child: Text('${i + 1}', style: TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w800, color: color)),
                ),
                const SizedBox(width: 8),
                Expanded(child: Text(label, style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600, color: _kText), maxLines: 1, overflow: TextOverflow.ellipsis)),
                Text('$val', style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w800, color: color)),
                const SizedBox(width: 5),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                  child: Text('${(frac * 100).toStringAsFixed(0)}%',
                    style: TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w700, color: color)),
                ),
              ]),
              const SizedBox(height: 5),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(height: 18, child: Stack(children: [
                  Container(color: color.withOpacity(0.08)),
                  FractionallySizedBox(
                    widthFactor: (frac * anim).clamp(0.0, 1.0),
                    child: Container(decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [color, color.withOpacity(0.72)]),
                    )),
                  ),
                ])),
              ),
            ]),
          );
        }).toList(),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY CARD (§7)
// ─────────────────────────────────────────────────────────────────────────────

class _CompanyCard extends StatefulWidget {
  const _CompanyCard({required this.rank, required this.stat, required this.maxContacts});
  final int          rank;
  final _CompanyStat stat;
  final int          maxContacts;

  @override
  State<_CompanyCard> createState() => _CompanyCardState();
}

class _CompanyCardState extends State<_CompanyCard> {
  bool _hovered = false;

  static String _badge(int contacts) {
    if (contacts >= 5) return 'Premium';
    if (contacts >= 3) return 'Gold';
    if (contacts >= 2) return 'Silver';
    return 'Active';
  }

  static Color _badgeColor(int contacts) {
    if (contacts >= 5) return const Color(0xFF7C3AED);
    if (contacts >= 3) return const Color(0xFFF59E0B);
    if (contacts >= 2) return const Color(0xFF64748B);
    return const Color(0xFF22C55E);
  }

  @override
  Widget build(BuildContext context) {
    final s     = widget.stat;
    final color = _kUserPalette[widget.rank % _kUserPalette.length];
    final frac  = widget.maxContacts == 0 ? 0.0 : s.contacts / widget.maxContacts;
    final badge = _badge(s.contacts);
    final bc    = _badgeColor(s.contacts);

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color:        _hovered ? color.withOpacity(0.03) : _kCard,
          borderRadius: BorderRadius.circular(16),
          border:       Border.all(color: _hovered ? color.withOpacity(0.35) : _kBorder, width: _hovered ? 1.5 : 0.8),
          boxShadow: [BoxShadow(color: (_hovered ? color : Colors.black).withOpacity(_hovered ? 0.12 : 0.04), blurRadius: _hovered ? 20 : 10, offset: const Offset(0, 4))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
              alignment: Alignment.center,
              child: Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : '?',
                style: TextStyle(fontFamily: 'InterTight', fontSize: 15, fontWeight: FontWeight.w900, color: color)),
            ),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.name, style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w700, color: _kText), maxLines: 1, overflow: TextOverflow.ellipsis),
              Text('#${widget.rank + 1}', style: TextStyle(fontFamily: 'InterTight', fontSize: 10, color: color, fontWeight: FontWeight.w700)),
            ])),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(color: bc.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: bc.withOpacity(0.25))),
              child: Text(badge, style: TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w800, color: bc)),
            ),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            _SmallKpi('${s.contacts}', 'Contacts', color),
            const SizedBox(width: 12),
            _SmallKpi('${s.calls}', 'Appels', const Color(0xFF0EA5E9)),
          ]),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: frac.clamp(0.0, 1.0), minHeight: 6,
              backgroundColor: color.withOpacity(0.1),
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ]),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL DRAWER (§10)
// ─────────────────────────────────────────────────────────────────────────────

class _DetailDrawer extends StatelessWidget {
  const _DetailDrawer({
    required this.user,
    required this.contacts,
    required this.rank,
    required this.score,
    required this.reasons,
    required this.maxContacts,
    required this.maxCalls,
  });
  final _UserStat                user;
  final List<CommercialContact>  contacts;
  final int                      rank;
  final double                   score;
  final List<String>             reasons;
  final int                      maxContacts;
  final int                      maxCalls;

  @override
  Widget build(BuildContext context) {
    // Statut counts for this user
    final sCounts = <String, int>{};
    for (final c in contacts) {
      final s = c.statut.trim().isEmpty ? 'Inconnu' : c.statut.trim();
      sCounts[s] = (sCounts[s] ?? 0) + 1;
    }

    // Recent (last 5)
    final recent = contacts.toList()
      ..sort((a, b) {
        final da = a.createdAt ?? a.dateAppel;
        final db = b.createdAt ?? b.dateAppel;
        if (da == null) return 1;
        if (db == null) return -1;
        return db.compareTo(da);
      });
    final last5 = recent.take(5).toList();

    final rankLabel = rank <= 3
        ? ['🥇 Leader CRM', '🥈 Challenger', '🥉 Top Performer'][rank - 1]
        : '#$rank';

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Color(0x22000000), blurRadius: 40, offset: Offset(-8, 0))],
      ),
      child: Column(children: [
        // Header gradient
        Container(
          padding: const EdgeInsets.fromLTRB(20, 20, 14, 20),
          decoration: const BoxDecoration(
            gradient: LinearGradient(colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          ),
          child: Row(children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(14)),
              alignment: Alignment.center,
              child: Text(user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                style: const TextStyle(fontFamily: 'InterTight', fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(user.name, style: const TextStyle(fontFamily: 'InterTight', fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
              if (user.email != null && user.email!.isNotEmpty)
                Text(user.email!, style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, color: Colors.white70)),
              const SizedBox(height: 6),
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(8)),
                  child: Text(rankLabel, style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(8)),
                  child: Text('Score: ${score.toStringAsFixed(0)}/100', style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
              ]),
            ])),
            IconButton(icon: const Icon(Icons.close_rounded, color: Colors.white70), onPressed: () => Navigator.of(context).pop()),
          ]),
        ),

        // Body
        Expanded(child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // KPI chips
            Wrap(spacing: 10, runSpacing: 10, children: [
              _DKpi(Icons.people_alt_rounded,   'Contacts',    '${user.contacts}',    _kIndigo),
              _DKpi(Icons.phone_rounded,        'Appels',      '${user.calls}',       const Color(0xFF0EA5E9)),
              _DKpi(Icons.verified_rounded,     'Validés',     '${user.actifs}',      const Color(0xFF22C55E)),
              _DKpi(Icons.cancel_rounded,       'Non validés', '${user.nonValides}',  const Color(0xFFEF4444)),
              _DKpi(Icons.business_rounded,     'Entreprises', '${user.entreprises}', const Color(0xFFF59E0B)),
            ]),
            const SizedBox(height: 20),

            // Taux
            Row(children: [
              const Text('Taux de validation', style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w600, color: _kText)),
              const Spacer(),
              Text('${user.tauxReussite.toStringAsFixed(1)}%',
                style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w800, color: _scoreColor(user.tauxReussite))),
            ]),
            const SizedBox(height: 8),
            ClipRRect(borderRadius: BorderRadius.circular(8), child: LinearProgressIndicator(
              value: (user.tauxReussite / 100).clamp(0, 1), minHeight: 10,
              backgroundColor: _scoreColor(user.tauxReussite).withOpacity(0.1),
              valueColor: AlwaysStoppedAnimation(_scoreColor(user.tauxReussite)),
            )),

            const SizedBox(height: 18),
            const Divider(height: 1, color: _kBorder),
            const SizedBox(height: 16),

            // Pourquoi ce classement
            const Text('Pourquoi ce classement', style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w700, color: _kText)),
            const SizedBox(height: 10),
            ...reasons.map((r) => Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(children: [
                const Icon(Icons.check_circle_rounded, size: 14, color: Color(0xFF22C55E)),
                const SizedBox(width: 8),
                Flexible(child: Text(r, style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w500, color: _kText))),
              ]),
            )),

            const SizedBox(height: 16),
            const Divider(height: 1, color: _kBorder),
            const SizedBox(height: 14),

            // Répartition par statut
            const Text('Répartition par statut', style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w700, color: _kText)),
            const SizedBox(height: 12),
            if (sCounts.isEmpty) const _Empty('Aucun statut')
            else ...sCounts.entries.map((e) {
              final pct   = user.contacts == 0 ? 0.0 : e.value / user.contacts * 100;
              final color = _statutColor(e.key);
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(width: 8, height: 8, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
                    const SizedBox(width: 8),
                    Expanded(child: Text(e.key, style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, color: _kText))),
                    Text('${e.value}', style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w800, color: color)),
                    const SizedBox(width: 5),
                    Text('(${pct.toStringAsFixed(0)}%)', style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, color: _kMuted)),
                  ]),
                  const SizedBox(height: 4),
                  ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(
                    value: (pct / 100).clamp(0, 1), minHeight: 7,
                    backgroundColor: color.withOpacity(0.1),
                    valueColor: AlwaysStoppedAnimation(color),
                  )),
                ]),
              );
            }),

            if (user.lastActivity != null) ...[
              const SizedBox(height: 14),
              const Divider(height: 1, color: _kBorder),
              const SizedBox(height: 12),
              Row(children: [
                const Icon(Icons.access_time_rounded, size: 14, color: _kMuted),
                const SizedBox(width: 6),
                const Text('Dernière activité : ', style: TextStyle(fontFamily: 'InterTight', fontSize: 12, color: _kMuted)),
                Text(DateFormat('dd/MM/yyyy').format(user.lastActivity!),
                  style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700, color: _kText)),
              ]),
            ],

            const SizedBox(height: 16),
            const Divider(height: 1, color: _kBorder),
            const SizedBox(height: 14),

            // Historique activité
            const Text('Historique activité', style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w700, color: _kText)),
            const SizedBox(height: 10),
            if (last5.isEmpty) const _Empty('Aucun contact récent')
            else ...last5.map((c) => _RecentTile(c)),
          ]),
        )),
      ]),
    );
  }
}

class _RecentTile extends StatelessWidget {
  const _RecentTile(this.c);
  final CommercialContact c;

  @override
  Widget build(BuildContext context) {
    final color = _statutColor(c.statut);
    final date  = c.createdAt ?? c.dateAppel;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(10), border: Border.all(color: _kBorder)),
      child: Row(children: [
        Container(width: 32, height: 32, decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
          alignment: Alignment.center,
          child: Text(c.fullName.isNotEmpty ? c.fullName[0].toUpperCase() : '?',
            style: TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w800, color: color))),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(c.fullName.isEmpty ? '—' : c.fullName,
            style: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600, color: _kText), maxLines: 1, overflow: TextOverflow.ellipsis),
          Row(children: [
            Container(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1), decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(5)),
              child: Text(c.statut, style: TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w700, color: color))),
            if (c.nomSociete?.isNotEmpty == true) ...[
              const SizedBox(width: 5),
              Flexible(child: Text(c.nomSociete!, style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, color: _kMuted), maxLines: 1, overflow: TextOverflow.ellipsis)),
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
// SMALL WIDGETS
// ─────────────────────────────────────────────────────────────────────────────

class _SH extends StatelessWidget {
  const _SH({required this.title, this.badge});
  final String  title;
  final String? badge;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Text(AppLocalizations.of(context).translate(title), style: AppTextStyles.sectionTitle),
    if (badge != null) ...[
      const SizedBox(width: 8),
      Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: _kIndigo.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
        child: Text(AppLocalizations.of(context).translate(badge!), style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w800, color: _kIndigo))),
    ],
  ]);
}

class _Btn extends StatelessWidget {
  const _Btn(this.icon, this.label, this.color, this.onTap);
  final IconData     icon;
  final String       label;
  final Color        color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: onTap,
    icon: Icon(icon, size: 15),
    label: Text(AppLocalizations.of(context).translate(label)),
    style: TextButton.styleFrom(
      foregroundColor: color,
      backgroundColor: color.withOpacity(0.08),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      textStyle: const TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600),
    ),
  );
}

class _Leg extends StatelessWidget {
  const _Leg(this.color, this.label);
  final Color  color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Container(width: 10, height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
    const SizedBox(width: 6),
    Text(AppLocalizations.of(context).translate(label), style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w500, color: _kMuted)),
  ]);
}

class _MetTile extends StatelessWidget {
  const _MetTile(this.label, this.value, this.color);
  final String label;
  final String value;
  final Color  color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(color: color.withOpacity(0.06), borderRadius: BorderRadius.circular(10)),
      alignment: Alignment.center,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(value, style: TextStyle(fontFamily: 'InterTight', fontSize: 16, fontWeight: FontWeight.w900, color: color, letterSpacing: -0.5)),
        Text(label, style: const TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w500, color: _kMuted)),
      ]),
    ),
  );
}

class _SmallKpi extends StatelessWidget {
  const _SmallKpi(this.value, this.label, this.color);
  final String value;
  final String label;
  final Color  color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(color: color.withOpacity(0.07), borderRadius: BorderRadius.circular(8)),
      alignment: Alignment.center,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(value, style: TextStyle(fontFamily: 'InterTight', fontSize: 15, fontWeight: FontWeight.w900, color: color)),
        Text(label, style: const TextStyle(fontFamily: 'InterTight', fontSize: 9, color: _kMuted)),
      ]),
    ),
  );
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.size = 36});
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = _kUserPalette[name.isEmpty ? 0 : name.codeUnitAt(0) % _kUserPalette.length];
    return Container(
      width: size, height: size,
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(size * 0.28)),
      alignment: Alignment.center,
      child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?',
        style: TextStyle(fontFamily: 'InterTight', fontSize: size * 0.4, fontWeight: FontWeight.w800, color: color)),
    );
  }
}

class _RankBadge extends StatelessWidget {
  const _RankBadge(this.rank);
  final int rank;

  @override
  Widget build(BuildContext context) {
    if (rank > 3) return const SizedBox();
    final colors = [const Color(0xFFFFD700), const Color(0xFF94A3B8), const Color(0xFFCD7F32)];
    final labels = ['#1', '#2', '#3'];
    final c = colors[rank - 1];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(color: c.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
      child: Text(labels[rank - 1], style: TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w800, color: c)),
    );
  }
}

class _ColorBadge extends StatelessWidget {
  const _ColorBadge({required this.value, required this.color});
  final String value;
  final Color  color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
    child: Text(value, style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700, color: color)),
  );
}

class _TauxBadge extends StatelessWidget {
  const _TauxBadge(this.taux);
  final double taux;

  @override
  Widget build(BuildContext context) {
    final c = _scoreColor(taux);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
      child: Text('${taux.toStringAsFixed(1)}%', style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700, color: c)),
    );
  }
}

class _ScoreBar extends StatelessWidget {
  const _ScoreBar(this.score);
  final double score;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 90,
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
      Text('${score.toStringAsFixed(0)}/100',
        style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w800, color: _scoreColor(score))),
      const SizedBox(height: 3),
      ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(
        value: (score / 100).clamp(0, 1), minHeight: 5,
        backgroundColor: _scoreColor(score).withOpacity(0.1),
        valueColor: AlwaysStoppedAnimation(_scoreColor(score)),
      )),
    ]),
  );
}

class _DKpi extends StatelessWidget {
  const _DKpi(this.icon, this.label, this.value, this.color);
  final IconData icon;
  final String   label;
  final String   value;
  final Color    color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(color: color.withOpacity(0.06), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.18))),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 14, color: color),
      const SizedBox(width: 6),
      Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(value, style: TextStyle(fontFamily: 'InterTight', fontSize: 16, fontWeight: FontWeight.w900, color: color, letterSpacing: -0.5)),
        Text(label, style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, color: _kMuted)),
      ]),
    ]),
  );
}

class _Empty extends StatelessWidget {
  const _Empty(this.msg);
  final String msg;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(padding: const EdgeInsets.symmetric(vertical: 32), child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.inbox_rounded, size: 38, color: Colors.grey[300]),
      const SizedBox(height: 8),
      Text(AppLocalizations.of(context).translate(msg), style: AppTextStyles.bodyMuted),
    ])),
  );
}

// Skeleton box
class _Sk extends StatelessWidget {
  const _Sk(this.w, this.h);
  final double  w;
  final double  h;

  @override
  Widget build(BuildContext context) => Container(
    width: w, height: h,
    decoration: BoxDecoration(color: const Color(0xFFE9EEF4), borderRadius: BorderRadius.circular(12)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSIVE GRID
// ─────────────────────────────────────────────────────────────────────────────
class _ResponsiveGrid extends StatelessWidget {
  const _ResponsiveGrid(this.cols, this.gap, this.children);
  final int          cols;
  final double       gap;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (int i = 0; i < children.length; i += cols) {
      final row = children.sublist(i, math.min(i + cols, children.length)).toList();
      while (row.length < cols) { row.add(const SizedBox()); }
      rows.add(IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: row.asMap().entries.map((e) => Expanded(
            child: Padding(padding: EdgeInsets.only(left: e.key == 0 ? 0 : gap), child: e.value),
          )).toList(),
        ),
      ));
      if (i + cols < children.length) rows.add(SizedBox(height: gap));
    }
    return Column(children: rows);
  }
}
