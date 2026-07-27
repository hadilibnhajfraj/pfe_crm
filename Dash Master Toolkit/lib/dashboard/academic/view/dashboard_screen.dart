// lib/dashboard/academic/view/dashboard_screen.dart
// Business Intelligence Dashboard — complete rewrite

import 'dart:convert';
import 'package:dio/dio.dart' show DioException;
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import 'package:dash_master_toolkit/core/theme/app_text_styles.dart';
import 'package:dash_master_toolkit/dashboard/academic/widgets/crm_relance_card.dart';
import 'package:dash_master_toolkit/dashboard/academic/widgets/relances_followup_section.dart';
import 'package:dash_master_toolkit/dashboard/academic/widgets/crm_dashboard_widgets.dart';
import 'package:dash_master_toolkit/dashboard/academic/widgets/crm_performance_widgets.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const _kBg     = Color(0xFFF8FAFC);
const _kCard   = Colors.white;
const _kBorder = Color(0xFFE2E8F0);
const _kText   = Color(0xFF1E293B);
const _kMuted  = Color(0xFF64748B);

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD CONFIG
// ─────────────────────────────────────────────────────────────────────────────
class _KpiCfg {
  final String   label;
  final IconData icon;
  final Color    g1, g2;
  const _KpiCfg({required this.label, required this.icon, required this.g1, required this.g2});
}

const _kKpis = [
  _KpiCfg(label: 'Total Projets',     icon: Icons.folder_copy_rounded,    g1: Color(0xFF4F46E5), g2: Color(0xFF6366F1)),
  _KpiCfg(label: 'Validés',           icon: Icons.check_circle_rounded,   g1: Color(0xFF059669), g2: Color(0xFF10B981)),
  _KpiCfg(label: 'Non validés',       icon: Icons.cancel_rounded,         g1: Color(0xFFDC2626), g2: Color(0xFFEF4444)),
  _KpiCfg(label: 'En attente',        icon: Icons.hourglass_top_rounded,  g1: Color(0xFFD97706), g2: Color(0xFFF59E0B)),
  _KpiCfg(label: 'Taux validation',   icon: Icons.percent_rounded,        g1: Color(0xFF0284C7), g2: Color(0xFF38BDF8)),
  _KpiCfg(label: 'Surface m²',        icon: Icons.square_foot_rounded,    g1: Color(0xFF7C3AED), g2: Color(0xFFA78BFA)),
];

// French month abbreviations
const _months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
String _sf(dynamic v)   => (v == null || v.toString().trim().isEmpty) ? '' : v.toString().trim();
double _num(dynamic v)  => v is num ? v.toDouble() : double.tryParse(_sf(v)) ?? 0;

// Extraction List sécurisée — jamais de cast aveugle
// Évite : type '_JsonMap' is not a subtype of List
List   _safeList(dynamic v) => v is List ? v : [];

BoxDecoration _cardDeco([double r = 20]) => BoxDecoration(
  color: _kCard,
  borderRadius: BorderRadius.circular(r),
  border: Border.all(color: _kBorder, width: 0.8),
  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 20, offset: const Offset(0, 8))],
);

Color _statutColor(String? s) {
  final l = (s ?? '').toLowerCase();
  if (l.contains('identif'))    return const Color(0xFF6B7280);
  if (l.contains('prospect'))   return const Color(0xFF3B82F6);
  if (l.contains('contact'))    return const Color(0xFF0EA5E9);
  if (l.contains('visite'))     return const Color(0xFF6366F1);
  if (l.contains('plan'))       return const Color(0xFF8B5CF6);
  if (l.contains('echant'))     return const Color(0xFF14B8A6);
  if (l.contains('devis'))      return const Color(0xFFF59E0B);
  if (l.contains('nego'))       return const Color(0xFFF97316);
  if (l.contains('gagn') || l.contains('valid') && !l.contains('non')) return const Color(0xFF22C55E);
  if (l.contains('perd') || l.contains('refus') || l.contains('non val')) return const Color(0xFFEF4444);
  if (l.contains('commande'))   return const Color(0xFF8B5CF6);
  if (l.contains('attente'))    return const Color(0xFFF59E0B);
  return const Color(0xFF94A3B8);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────
class DashboardScreen extends StatefulWidget {
  final String token;
  const DashboardScreen({super.key, required this.token});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  // ── Role ─────────────────────────────────────────────────────────────────
  bool _isAdmin = false;
  String _currentUserId = '';

  // ── Raw API data ─────────────────────────────────────────────────────────
  Map<String, dynamic> _kpiRaw          = {};
  // GET /dashboard/user — KPI BI dédiés à la vue utilisateur (cartes
  // cliquables + répartition famille/diamètre). Vide pour un admin (non
  // chargé, la vue admin garde son calcul existant à partir de _projects).
  Map<String, dynamic> _userKpi          = {};
  List<dynamic>        _projects        = [];
  List<dynamic>        _followups       = [];
  // Buckets bruts /crm/upcoming-followups — conservés séparément (en plus de
  // _followups, la liste agrégée) pour pouvoir compter et afficher
  // today/upcoming/overdue indépendamment (cartes KPI Aujourd'hui/À venir/En retard/Toutes).
  List<dynamic>        _followupsToday    = [];
  List<dynamic>        _followupsUpcoming = [];
  List<dynamic>        _followupsOverdue  = [];
  bool                 _loading         = true;
  DateTime?            _lastUpdate;

  // ── Followups error state ─────────────────────────────────────────────────
  bool   _followupsError    = false;
  String _followupsErrorMsg = '';

  @override
  void initState() {
    super.initState();
    final auth = AuthService();
    final role = (auth.userRole ?? '').toLowerCase().trim();
    _isAdmin       = role == 'admin' || role == 'superadmin' || role == 'superadmin2';
    _currentUserId = auth.userId ?? '';
    _loadAll();
  }

  // ── Load — branché par rôle ───────────────────────────────────────────────
  Future<void> _loadAll() async {
    setState(() => _loading = true);
    List<dynamic> rawProjects = [];
    List<dynamic> rawFollowups = [];
    List<dynamic> rawFollowupsToday    = [];
    List<dynamic> rawFollowupsUpcoming = [];
    List<dynamic> rawFollowupsOverdue  = [];

    // ── DIAGNOSTIC LOGS ──────────────────────────────────────────────────────
    print("=== [DASHBOARD DIAG] ========================================");
    print("USER_ID       : '$_currentUserId'");
    print("IS_ADMIN      : $_isAdmin");
    print("WIDGET_TOKEN  : '${widget.token.isEmpty ? 'VIDE !!!' : widget.token.substring(0, widget.token.length.clamp(0, 30))}...'");
    print("GETSTORE_TOKEN: '${ApiClient.instance.getAccessToken()?.substring(0, (ApiClient.instance.getAccessToken()?.length ?? 0).clamp(0, 30)) ?? 'NULL !!!'}...'");
    print("=============================================================");

    try {
      // ── 1. KPI summary ──────────────────────────────────────────────────
      final kpiUri = Uri.parse('${ApiConfig.baseUrl}/projects/dashboard/kpi').replace(
        queryParameters: (!_isAdmin && _currentUserId.isNotEmpty) ? {'userId': _currentUserId} : null,
      );
      print("REQUEST_URL   KPI : $kpiUri");

      final kpiRes = await http.get(kpiUri,
          headers: {'Authorization': 'Bearer ${widget.token}', 'Content-Type': 'application/json'});

      print("RESPONSE      KPI status=${kpiRes.statusCode}");
      print("RESPONSE      KPI body=${kpiRes.body}");

      if (kpiRes.statusCode == 200) {
        _kpiRaw = Map<String, dynamic>.from(jsonDecode(kpiRes.body));
        print("PARSED_DATA   KPI keys=${_kpiRaw.keys.toList()}");
        print("PARSED_DATA   KPI userStats=${_kpiRaw['userStats']}");
        print("PARSED_DATA   KPI statutStats=${_kpiRaw['statutStats']}");
        print("PARSED_DATA   KPI totalProjects=${_kpiRaw['totalProjects']}");
      } else {
        print("ERREUR        KPI HTTP ${kpiRes.statusCode} → _kpiRaw reste vide");
      }

      // ── 1B. User dashboard KPI (BI) — vue utilisateur uniquement ─────────
      // GET /dashboard/user : totalProjects, pendingValidation, successRate,
      // followupProjects, totalSurface, familyStats, diameterStats — calculé
      // côté backend, scopé à l'utilisateur connecté (req.user.sub).
      Map<String, dynamic> rawUserKpi = {};
      if (!_isAdmin) {
        try {
          final userKpiRes = await ApiClient.instance.dio.get('/dashboard/user');
          if (userKpiRes.data is Map) {
            rawUserKpi = Map<String, dynamic>.from(userKpiRes.data);
          }
          print("PARSED_DATA   USER_KPI = $rawUserKpi");
        } catch (e) {
          print("ERREUR        USER_KPI : $e");
        }
      }

      // ── 2. Projects list ────────────────────────────────────────────────
      final endpoint = _isAdmin ? '/projects' : '/projects/my-projects';
      print("REQUEST_URL   PROJECTS : ${ApiConfig.baseUrl}$endpoint?page=1&limit=1000");

      final projRes  = await ApiClient.instance.dio.get(endpoint, queryParameters: {'page': 1, 'limit': 1000});
      final projData = projRes.data;

      print("RESPONSE      PROJECTS type=${projData.runtimeType}");
      if (projData is Map) {
        print("RESPONSE      PROJECTS keys=${projData.keys.toList()}");
        final items   = projData['items'];
        final data    = projData['data'];
        final results = projData['results'];
        print("PARSED_DATA   PROJECTS['items']=${items?.runtimeType} len=${items is List ? items.length : 'N/A'}");
        print("PARSED_DATA   PROJECTS['data']=${data?.runtimeType} len=${data is List ? data.length : 'N/A'}");
        print("PARSED_DATA   PROJECTS['results']=${results?.runtimeType} len=${results is List ? results.length : 'N/A'}");
        // Sécurisé : jamais de cast aveugle
        final candidate = items ?? data ?? results;
        rawProjects = _safeList(candidate);
      } else if (projData is List) {
        rawProjects = projData;
      }
      print("PARSED_DATA   PROJECTS count=${rawProjects.length}");
      if (rawProjects.isNotEmpty) {
        print("PARSED_DATA   PROJECTS[0] keys=${rawProjects[0] is Map ? (rawProjects[0] as Map).keys.toList() : 'non-map'}");
      }

      // ── 3. CRM upcoming followups ────────────────────────────────────────
      bool   _errFollowups    = false;
      String _errFollowupsMsg = '';

      try {
        final followParams = <String, dynamic>{'limit': 200};
        if (!_isAdmin && _currentUserId.isNotEmpty) followParams['userId'] = _currentUserId;
        print("REQUEST_URL   FOLLOWUPS : ${ApiConfig.baseUrl}/crm/upcoming-followups params=$followParams");

        final followRes = await ApiClient.instance.dio.get(
          '/crm/upcoming-followups',
          queryParameters: followParams,
        );

        // ── Logs demandés ──────────────────────────────────────────────────
        print("FOLLOWUPS RESPONSE");
        print(followRes.data);

        final fData = followRes.data;

        if (fData is Map) {
          // Buckets conservés séparément (pas seulement concaténés) afin que
          // le Dashboard puisse compter et afficher today/upcoming/overdue
          // indépendamment — voir _followupsToday/_followupsUpcoming/_followupsOverdue.
          rawFollowupsToday    = _safeList(fData['today']);
          rawFollowupsUpcoming = _safeList(fData['upcoming']);
          rawFollowupsOverdue  = _safeList(fData['overdue']);

          print("COUNT    = ${fData['count']}");
          print("TODAY    = ${rawFollowupsToday.length}");
          print("UPCOMING = ${rawFollowupsUpcoming.length}");
          print("OVERDUE  = ${rawFollowupsOverdue.length}");
          print("RESPONSE FOLLOWUPS keys=${fData.keys.toList()}");

          // Parsing sécurisé — _safeList évite les crashes
          // JAMAIS : (fData['overdue'] as List?) — crash si valeur non-List
          rawFollowups = [
            ...rawFollowupsOverdue,
            ...rawFollowupsToday,
            ...rawFollowupsUpcoming,
            ..._safeList(fData['items']),
            ..._safeList(fData['data']),
          ];
        } else if (fData is List) {
          rawFollowups = fData;
          print("COUNT    = ${rawFollowups.length} (liste directe)");
        } else {
          print("FOLLOWUPS format inattendu : ${fData?.runtimeType}");
        }

        print("PARSED_DATA   FOLLOWUPS total agrégé=${rawFollowups.length}");
      } catch (e, stack) {
        // ── Diagnostic erreur ──────────────────────────────────────────────
        final isDioError = e is DioException;
        final httpStatus = isDioError ? (e.response?.statusCode ?? 0) : 0;

        print("ERREUR FOLLOWUPS [$httpStatus] : $e");
        if (isDioError && e.response != null) {
          print("FOLLOWUPS RESPONSE BODY : ${e.response!.data}");
        }
        print("STACK FOLLOWUPS : $stack");

        if (httpStatus == 500) {
          // Erreur serveur explicite (ex: admin sans accès) —
          // NE PAS afficher un fallback trompeur
          _errFollowups    = true;
          _errFollowupsMsg = 'Erreur serveur (500) — Impossible de charger les relances.';
          print("HTTP 500 → affichage message erreur, pas de fallback");

        } else {
          // Réseau / endpoint absent → fallback prochaineRelance des projets
          rawFollowups = rawProjects
              .where((p) => _sf(p['prochaineRelance'] ?? p['nextRelanceAt']).isNotEmpty)
              .toList();
          print("PARSED_DATA   FOLLOWUPS fallback projets count=${rawFollowups.length}");

          if (rawFollowups.isEmpty) {
            _errFollowups    = true;
            _errFollowupsMsg = 'Impossible de charger les relances (${e.runtimeType}).';
          }
        }
      }

      print("=== [DASHBOARD DIAG END] projects=${rawProjects.length} followups=${rawFollowups.length} followupsError=$_errFollowups ===");

      setState(() {
        _userKpi           = rawUserKpi;
        _projects          = rawProjects;
        _followups         = rawFollowups;
        _followupsToday    = rawFollowupsToday;
        _followupsUpcoming = rawFollowupsUpcoming;
        _followupsOverdue  = rawFollowupsOverdue;
        _followupsError    = _errFollowups;
        _followupsErrorMsg = _errFollowupsMsg;
        _lastUpdate        = DateTime.now();
      });
    } catch (e, stack) {
      print("ERREUR GLOBALE [Dashboard] $e");
      print("STACK: $stack");
      debugPrint('[Dashboard] $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  // ── Computed getters ──────────────────────────────────────────────────────
  List<Map<String, dynamic>> get _userStats =>
      _safeList(_kpiRaw['userStats'])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
  List<Map<String, dynamic>> get _statutStats =>
      _safeList(_kpiRaw['statutStats'])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
  int    get _total       => _projects.length;
  int    get _validated   => _projects.where((p) {
    final v = _sf(p['validationStatut']).toLowerCase();
    return v.contains('valid') && !v.contains('non');
  }).length;
  int    get _nonValidated => _projects.where((p) {
    final v = _sf(p['validationStatut']).toLowerCase();
    return v.contains('non') || v.contains('refus');
  }).length;
  int    get _pending     => _total - _validated - _nonValidated;
  double get _validRate   => _total == 0 ? 0 : _validated / _total * 100;
  double get _surface     => _projects.fold(0, (s, p) => s + _num(p['surfaceProspectee']));

  // ── User KPI (BI) — depuis GET /dashboard/user, vue utilisateur uniquement.
  int    get _uTotalProjects     => (_userKpi['totalProjects'] as num?)?.toInt() ?? 0;
  int    get _uPendingValidation => (_userKpi['pendingValidation'] as num?)?.toInt() ?? 0;
  double get _uSuccessRate       => (_userKpi['successRate'] as num?)?.toDouble() ?? 0;
  int    get _uFollowupProjects  => (_userKpi['followupProjects'] as num?)?.toInt() ?? 0;
  double get _uTotalSurface      => (_userKpi['totalSurface'] as num?)?.toDouble() ?? 0;
  List<Map<String, dynamic>> get _uFamilyStats =>
      _safeList(_userKpi['familyStats']).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  List<Map<String, dynamic>> get _uDiameterStats =>
      _safeList(_userKpi['diameterStats']).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  // ── Navigation KPI → /users/project-list avec filtre automatique ─────────
  // Idiome déjà utilisé par _AlertCard._navigate (context.push + Uri query
  // params) — repris ici pour rester cohérent avec le reste du dashboard.
  void _goToProjectList(BuildContext context, Map<String, String> filters) {
    context.push(Uri(path: '/users/project-list', queryParameters: filters.isEmpty ? null : filters).toString());
  }

  int get _thisMonth {
    final now = DateTime.now();
    return _projects.where((p) {
      final d = DateTime.tryParse(_sf(p['createdAt']));
      return d != null && d.year == now.year && d.month == now.month;
    }).length;
  }
  int get _lastMonth {
    final now = DateTime.now();
    final lm  = now.month == 1 ? DateTime(now.year - 1, 12) : DateTime(now.year, now.month - 1);
    return _projects.where((p) {
      final d = DateTime.tryParse(_sf(p['createdAt']));
      return d != null && d.year == lm.year && d.month == lm.month;
    }).length;
  }

  String _variation(int current, int prev) {
    if (prev == 0) return current > 0 ? '+100%' : '—';
    final pct = ((current - prev) / prev * 100).round();
    return pct >= 0 ? '+$pct%' : '$pct%';
  }

  bool   _isUp(int current, int prev) => current >= prev;

  // Missing field counts
  int _missing(String Function(dynamic) field) =>
      _projects.where((p) => field(p).isEmpty).length;

  int get _missingBureau  => _missing((p) => _sf(p['bureauControle']));
  int get _missingArch    => _missing((p) => _sf(p['architecte']));
  int get _missingIng     => _missing((p) => _sf(p['ingenieurResponsable']));
  int get _missingTel     => _missing((p) => _sf(p['telephoneIngenieur'] ?? p['telephone']));
  int get _missingAddr    => _missing((p) => _sf(p['adresse']));

  // Utilise _followups (API dédiée) ou fallback prochaineRelance dans _projects
  List get _relances {
    final source = _followups.isNotEmpty
        ? _followups
        : _projects.where((p) => _sf(p['prochaineRelance'] ?? p['nextRelanceAt']).isNotEmpty).toList();
    return source..sort((a, b) {
      final da = _sf(a['prochaineRelance'] ?? a['nextRelanceAt'] ?? a['followupDate'] ?? a['nextActionDate'] ?? '');
      final db = _sf(b['prochaineRelance'] ?? b['nextRelanceAt'] ?? b['followupDate'] ?? b['nextActionDate'] ?? '');
      return da.compareTo(db);
    });
  }

  // Monthly data: last 6 months
  List<(String label, int created, int validated)> get _monthly {
    final now = DateTime.now();
    // Génère 6 mois consécutifs distincts, chacun une seule fois
    final seen = <String>{};
    final result = <(String, int, int)>[];
    for (int i = 0; i < 6; i++) {
      // Dart normalise correctement les mois négatifs
      final m   = DateTime(now.year, now.month - 5 + i);
      final key = '${m.year}-${m.month}';
      if (seen.contains(key)) continue;   // sécurité anti-doublon
      seen.add(key);
      // Label : "Jan 26" ou "Jan 2026" si l'année diffère
      final lbl = m.year == now.year
          ? _months[m.month - 1]
          : '${_months[m.month - 1]} ${m.year.toString().substring(2)}';
      final proj = _projects.where((p) {
        final d = DateTime.tryParse(_sf(p['createdAt']));
        return d != null && d.year == m.year && d.month == m.month;
      });
      final val = proj.where((p) {
        final v = _sf(p['validationStatut']).toLowerCase();
        return v.contains('valid') && !v.contains('non');
      }).length;
      result.add((lbl, proj.length, val));
    }
    return result;
  }

  String get _lastUpdateStr => _lastUpdate == null
      ? '—'
      : DateFormat('dd/MM/yyyy HH:mm').format(_lastUpdate!);

  // Statut distribution computed directly from _projects (works for both roles)
  List<Map<String, dynamic>> get _computedStatutStats {
    final counts = <String, int>{};
    for (final p in _projects) {
      final s = _sf(p['statut'] ?? p['validationStatut']);
      if (s.isNotEmpty) counts[s] = (counts[s] ?? 0) + 1;
    }
    final list = counts.entries.map((e) => {'statut': e.key, 'count': e.value}).toList();
    list.sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));
    return list;
  }

  // ── BUILD ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        backgroundColor: _kBg,
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const CircularProgressIndicator(color: Color(0xFF4F46E5), strokeWidth: 2),
            const SizedBox(height: 16),
            Text(AppLocalizations.of(context).translate('Chargement du dashboard...'), style: AppTextStyles.bodyMuted),
          ]),
        ),
      );
    }

    return Scaffold(
      backgroundColor: _kBg,
      body: RefreshIndicator(
        color: const Color(0xFF4F46E5),
        onRefresh: _loadAll,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(),
              const SizedBox(height: 28),
              if (_isAdmin) ...[
                // ── ADMIN VIEW ──────────────────────────────────────────
                _buildAdminKpiRow(context),
                const SizedBox(height: 28),
                _buildStatusSection(context),
                const SizedBox(height: 28),
                // ── NOUVELLES SECTIONS : Top Commerciaux + Pipeline Health
                _buildTopPipelineRow(context),
                const SizedBox(height: 28),
                _buildUserTable(context),
                const SizedBox(height: 28),
                _buildMonthlyChart(context),
                const SizedBox(height: 28),
                _buildAlerts(context),
                const SizedBox(height: 28),
                _buildProjectsFollowup(context),
              ] else ...[
                // ── USER VIEW ───────────────────────────────────────────
                _buildUserKpiRow(context),
                const SizedBox(height: 28),
                _buildUserStatusSection(context),
                const SizedBox(height: 28),
                // ── NOUVEAU : Répartition famille/diamètre + graphique interactif
                _buildUserFamilyDiameterSection(context),
                const SizedBox(height: 28),
                _buildMonthlyChart(context),
                const SizedBox(height: 28),
                _buildProjectsFollowup(context),
              ],
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. HEADER
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildHeader() {
    final lang = AppLocalizations.of(context);
    final subtitle = _isAdmin
        ? '${lang.translate('Vue globale des performances')} — $_total ${lang.translate('projets')} · ${_userStats.length} ${lang.translate('Utilisateurs').toLowerCase()}'
        : '${lang.translate('Mes performances personnelles')} — $_total ${lang.translate('projets')}';
    return Row(children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            lang.translate(_isAdmin ? 'Business Intelligence Dashboard' : 'Mon Dashboard'),
            style: AppTextStyles.pageTitle,
          ),
          const SizedBox(height: 6),
          Text(subtitle, style: AppTextStyles.bodyMuted),
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.access_time_rounded, size: 13, color: Color(0xFF94A3B8)),
            const SizedBox(width: 5),
            Text('${lang.translate('Dernière mise à jour')} : $_lastUpdateStr',
                style: AppTextStyles.bodyMuted.copyWith(fontSize: 11)),
          ]),
        ]),
      ),
      const SizedBox(width: 16),
      // Role badge
      Container(
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: _isAdmin ? const Color(0xFFEEF2FF) : const Color(0xFFF0FDF4),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(_isAdmin ? Icons.admin_panel_settings_rounded : Icons.person_rounded,
              size: 14, color: _isAdmin ? const Color(0xFF4F46E5) : const Color(0xFF22C55E)),
          const SizedBox(width: 5),
          Text(lang.translate(_isAdmin ? 'Admin' : 'Utilisateur'),
              style: TextStyle(
                fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w700,
                color: _isAdmin ? const Color(0xFF4F46E5) : const Color(0xFF22C55E),
              )),
        ]),
      ),
      TextButton.icon(
        onPressed: _loadAll,
        icon: const Icon(Icons.refresh_rounded, size: 16),
        label: Text(lang.translate('Actualiser')),
        style: TextButton.styleFrom(
          foregroundColor: const Color(0xFF4F46E5),
          backgroundColor: const Color(0xFFEEF2FF),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: const TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2A. ADMIN KPI ROW  (5 cards — Revendeurs/Applicateurs supprimés)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildAdminKpiRow(BuildContext context) {
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 1100 ? 5 : w > 750 ? 3 : 2;

    const cfgs = [
      _KpiCfg(label: 'Total Projets',   icon: Icons.folder_copy_rounded,    g1: Color(0xFF4F46E5), g2: Color(0xFF6366F1)),
      _KpiCfg(label: 'Utilisateurs',    icon: Icons.people_alt_rounded,     g1: Color(0xFF0284C7), g2: Color(0xFF38BDF8)),
      _KpiCfg(label: 'Validés',         icon: Icons.check_circle_rounded,   g1: Color(0xFF059669), g2: Color(0xFF10B981)),
      _KpiCfg(label: 'Non validés',     icon: Icons.cancel_rounded,         g1: Color(0xFFDC2626), g2: Color(0xFFEF4444)),
      _KpiCfg(label: 'Surface m²',      icon: Icons.square_foot_rounded,    g1: Color(0xFF0E7490), g2: Color(0xFF06B6D4)),
    ];

    final surfStr = _surface >= 1000
        ? '${(_surface / 1000).toStringAsFixed(1)}k'
        : _surface.toStringAsFixed(0);

    final values = [
      '$_total',
      '${_userStats.length}',
      '$_validated',
      '$_nonValidated',
      surfStr,
    ];

    final variations = [
      _variation(_thisMonth, _lastMonth),
      '—', '—', '—', '—',
    ];

    return _ResponsiveGrid(
      cols: cols, gap: 14,
      children: List.generate(5, (i) => CrmModernKpiCard(
        label:    cfgs[i].label,
        value:    values[i],
        icon:     cfgs[i].icon,
        gradient: [cfgs[i].g1, cfgs[i].g2],
        trend:    variations[i],
        isUp:     !variations[i].startsWith('-'),
      )),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2B. USER KPI ROW  (5 cards — only the user's own data)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildUserKpiRow(BuildContext context) {
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 1000 ? 5 : w > 700 ? 3 : w > 500 ? 2 : 1;

    const cfgs = [
      _KpiCfg(label: 'Mes Projets',        icon: Icons.folder_copy_rounded,    g1: Color(0xFF4F46E5), g2: Color(0xFF6366F1)),
      _KpiCfg(label: 'Mes Validations',    icon: Icons.check_circle_rounded,   g1: Color(0xFF059669), g2: Color(0xFF10B981)),
      _KpiCfg(label: 'Mon Taux Réussite',  icon: Icons.percent_rounded,        g1: Color(0xFF0284C7), g2: Color(0xFF38BDF8)),
      _KpiCfg(label: 'Projets à suivre',   icon: Icons.alarm_rounded,          g1: Color(0xFFD97706), g2: Color(0xFFF59E0B)),
      _KpiCfg(label: 'Ma Surface m²',      icon: Icons.square_foot_rounded,    g1: Color(0xFF7C3AED), g2: Color(0xFFA78BFA)),
    ];

    final surfStr = _uTotalSurface >= 1000
        ? '${(_uTotalSurface / 1000).toStringAsFixed(1)}k'
        : _uTotalSurface.toStringAsFixed(0);

    // Valeurs 100% backend (GET /dashboard/user) — cohérentes avec le filtre
    // appliqué au clic (voir _navigators ci-dessous).
    final values = [
      '$_uTotalProjects',
      '$_uPendingValidation',
      '${_uSuccessRate.toStringAsFixed(1)}%',
      '$_uFollowupProjects',
      surfStr,
    ];

    final variations = [
      _variation(_thisMonth, _lastMonth),
      '—', '—', '—', '—',
    ];

    // Filtre automatique appliqué à /users/project-list selon la carte
    // cliquée — voir section 2 du cahier des charges (FILTRES AUTOMATIQUES).
    final navigators = <void Function()>[
      () => _goToProjectList(context, {}),                             // Mes Projets → tous
      () => _goToProjectList(context, {'validation': 'Non validé'}),   // Mes Validations → en attente
      () => _goToProjectList(context, {'validation': 'Validé'}),       // Mon Taux Réussite → terminés/validés
      () => _goToProjectList(context, {'followup': '1'}),              // Projets à suivre → nécessitent une action
      () => _goToProjectList(context, {}),                             // Ma Surface → tous (surface totale)
    ];

    return _ResponsiveGrid(
      cols: cols, gap: 14,
      children: List.generate(5, (i) => CrmModernKpiCard(
        label:    cfgs[i].label,
        value:    values[i],
        icon:     cfgs[i].icon,
        gradient: [cfgs[i].g1, cfgs[i].g2],
        trend:    variations[i],
        isUp:     !variations[i].startsWith('-'),
        onTap:    navigators[i],
      )),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3B. USER STATUS SECTION  (only user's own projects)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildUserStatusSection(BuildContext context) {
    final stats = _computedStatutStats;
    final w = MediaQuery.of(context).size.width;

    Widget donut = Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Mes projets par statut'),
        const SizedBox(height: 16),
        stats.isEmpty
            ? _emptyState('Aucun projet')
            : _buildDonutFromList(stats, onSegmentTap: (statut) => _goToProjectList(context, {'statut': statut})),
      ]),
    );

    Widget bars = Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Volume par statut'),
        const SizedBox(height: 16),
        stats.isEmpty
            ? _emptyState('Aucun projet')
            : _buildHBarsFromList(stats, onBarTap: (statut) => _goToProjectList(context, {'statut': statut})),
      ]),
    );

    return w > 800
        ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: donut), const SizedBox(width: 16), Expanded(child: bars),
          ])
        : Column(children: [donut, const SizedBox(height: 16), bars]);
  }

  // ── Donut + HBars — délèguent aux widgets modernes ───────────────────────
  // Cliquer sur une part / une barre ouvre /users/project-list filtré sur ce
  // statut (section 6 & 7 du cahier des charges).
  Widget _buildDonutFromList(List<Map<String, dynamic>> stats, {void Function(String statut)? onSegmentTap}) =>
      CrmDonutWithLegend(stats: stats, colorOf: _statutColor, onSegmentTap: onSegmentTap);

  Widget _buildHBarsFromList(List<Map<String, dynamic>> stats, {void Function(String statut)? onBarTap}) =>
      CrmStatusBars(stats: stats, colorOf: _statutColor, onBarTap: onBarTap);

  // ══════════════════════════════════════════════════════════════════════════
  // 3C. RÉPARTITION PAR FAMILLE / PAR DIAMÈTRE + GRAPHIQUE INTERACTIF
  //     (vue utilisateur uniquement — nouveau, depuis GET /dashboard/user)
  // ══════════════════════════════════════════════════════════════════════════
  static const Map<String, Color> _familyDotColors = {
    'PROBAR': Color(0xFF4F46E5),
    'PROMESH': Color(0xFF14B8A6),
  };

  Widget _buildUserFamilyDiameterSection(BuildContext context) {
    final family   = _uFamilyStats;
    final diameter = _uDiameterStats;
    final w        = MediaQuery.of(context).size.width;

    final familyCard = Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Répartition par famille'),
        const SizedBox(height: 16),
        family.isEmpty
            ? _emptyState('Aucune donnée')
            : Column(children: family.map((f) {
                final fam = _sf(f['family']);
                return _ClickableStatRow(
                  color: _familyDotColors[fam] ?? _kMuted,
                  label: fam,
                  count: (f['count'] as num?)?.toInt() ?? 0,
                  onTap: () => _goToProjectList(context, {'family': fam}),
                );
              }).toList()),
      ]),
    );

    final diameterCard = Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Répartition par diamètre'),
        const SizedBox(height: 16),
        diameter.isEmpty
            ? _emptyState('Aucune donnée')
            : Column(children: diameter.map((d) {
                final dia = (d['diameter'] as num?)?.toInt() ?? 0;
                return _ClickableStatRow(
                  color: const Color(0xFF0284C7),
                  label: 'Ø$dia',
                  count: (d['count'] as num?)?.toInt() ?? 0,
                  onTap: () => _goToProjectList(context, {'diameter': '$dia'}),
                );
              }).toList()),
      ]),
    );

    final chartCard = Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Analyse interactive'),
        const SizedBox(height: 20),
        CrmFamilyDiameterChart(
          familyStats:   family,
          diameterStats: diameter,
          onFamilyTap:   (fam) => _goToProjectList(context, {'family': fam}),
          onDiameterTap: (dia) => _goToProjectList(context, {'diameter': '$dia'}),
        ),
      ]),
    );

    final topRow = w > 800
        ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: familyCard), const SizedBox(width: 16), Expanded(child: diameterCard),
          ])
        : Column(children: [familyCard, const SizedBox(height: 16), diameterCard]);

    return Column(children: [topRow, const SizedBox(height: 16), chartCard]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NEW : TOP COMMERCIAUX  +  PIPELINE HEALTH  (côte à côte sur desktop)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildTopPipelineRow(BuildContext context) {
    final w = MediaQuery.of(context).size.width;

    // Calcul valByUser (même logique que _buildUserTable)
    final valByUser = <String, int>{};
    for (final p in _projects) {
      final userMap = p['user'] is Map ? p['user'] as Map : {};
      final uid = _sf(userMap['_id'] ?? userMap['id'] ?? p['userId']);
      final v   = _sf(p['validationStatut']).toLowerCase();
      if (uid.isNotEmpty && v.contains('valid') && !v.contains('non')) {
        valByUser[uid] = (valByUser[uid] ?? 0) + 1;
      }
    }

    final cardTop = Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Top Commerciaux', badge: '${_userStats.length}'),
        const SizedBox(height: 20),
        _userStats.isEmpty
            ? _emptyState('Aucun commercial disponible')
            : CrmTopCommerciaux(
                userStats: _userStats,
                valByUser: valByUser,
              ),
      ]),
    );

    final cardHealth = Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Pipeline Health'),
        const SizedBox(height: 20),
        CrmPipelineHealth(
          statutStats: _computedStatutStats,
          total:       _total,
          validated:   _validated,
        ),
      ]),
    );

    return w > 900
        ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: cardTop),
            const SizedBox(width: 16),
            Expanded(child: cardHealth),
          ])
        : Column(children: [cardTop, const SizedBox(height: 16), cardHealth]);
  }

  // ── keep old _buildKpiRow name as alias so nothing else breaks ────────────
  Widget _buildKpiRow(BuildContext context) => _buildAdminKpiRow(context);

  // (existing _buildStatusSection reads _statutStats from API — kept for admin)
  // dummy placeholder for the old reference:
  Widget _buildOldKpiRow(BuildContext context) {
    final w    = MediaQuery.of(context).size.width;
    final cols = w > 1200 ? 6 : w > 800 ? 3 : w > 550 ? 2 : 1;

    final values = [
      '$_total',
      '$_validated',
      '$_nonValidated',
      '$_pending',
      '${_validRate.toStringAsFixed(1)}%',
      _surface >= 1000
          ? '${(_surface / 1000).toStringAsFixed(1)}k'
          : _surface.toStringAsFixed(0),
    ];

    final variations = [
      _variation(_thisMonth, _lastMonth),
      _variation(
        _projects.where((p) {
          final v = _sf(p['validationStatut']).toLowerCase();
          final d = DateTime.tryParse(_sf(p['createdAt']));
          final now = DateTime.now();
          return d != null && d.year == now.year && d.month == now.month &&
              v.contains('valid') && !v.contains('non');
        }).length,
        0,
      ),
      '—', '—', '—', '—',
    ];

    return _ResponsiveGrid(
      cols: cols,
      gap: 14,
      children: List.generate(6, (i) => _KpiCard(
        cfg:       _kKpis[i],
        value:     values[i],
        variation: variations[i],
        isUp:      !variations[i].startsWith('-'),
      )),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. STATUS SECTION  (donut + horizontal bars)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildStatusSection(BuildContext context) {
    final w = MediaQuery.of(context).size.width;
    final side = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader('Répartition par statut'),
        const SizedBox(height: 16),
        _statutStats.isEmpty
            ? _emptyState('Aucun statut disponible')
            : _buildDonut(),
      ],
    );

    final bars = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader('Volume par statut'),
        const SizedBox(height: 16),
        _statutStats.isEmpty
            ? _emptyState('Aucun statut disponible')
            : _buildHBars(),
      ],
    );

    final cardL = Container(padding: const EdgeInsets.all(24), decoration: _cardDeco(), child: side);
    final cardR = Container(padding: const EdgeInsets.all(24), decoration: _cardDeco(), child: bars);

    return w > 800
        ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: cardL),
            const SizedBox(width: 16),
            Expanded(child: cardR),
          ])
        : Column(children: [cardL, const SizedBox(height: 16), cardR]);
  }

  // Admin : donut et barres horizontales — widgets modernes
  Widget _buildDonut() =>
      CrmDonutWithLegend(stats: _statutStats, colorOf: _statutColor);

  Widget _buildHBars() =>
      CrmStatusBars(stats: _statutStats, colorOf: _statutColor);

  // ══════════════════════════════════════════════════════════════════════════
  // 4. USER PERFORMANCE TABLE
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildUserTable(BuildContext context) {
    final valByUser      = <String, int>{};
    final surfaceByUser  = <String, double>{};
    final pipelineByUser = <String, Map<String, int>>{};

    final now         = DateTime.now();
    final last30Start = now.subtract(const Duration(days: 30));
    final prev30Start = now.subtract(const Duration(days: 60));
    final last30ByUser    = <String, int>{};
    final prev30ByUser    = <String, int>{};
    final thisMonthByUser = <String, int>{};

    for (final p in _projects) {
      final userMap = p['user'] is Map ? p['user'] as Map : {};
      final uid = _sf(userMap['_id'] ?? userMap['id'] ?? p['userId']);
      if (uid.isEmpty) continue;

      final v = _sf(p['validationStatut']).toLowerCase();
      if (v.contains('valid') && !v.contains('non')) {
        valByUser[uid] = (valByUser[uid] ?? 0) + 1;
      }

      surfaceByUser[uid] = (surfaceByUser[uid] ?? 0) + _num(p['surfaceProspectee']);

      final stageMap  = p['pipelineStage'] is Map ? p['pipelineStage'] as Map : null;
      final stageName = _sf(stageMap?['name'] ??
          (p['pipelineStage'] is String ? p['pipelineStage'] : null) ??
          p['etapeCRM'] ?? p['stage'] ?? '');
      if (stageName.isNotEmpty) {
        if (!pipelineByUser.containsKey(uid)) pipelineByUser[uid] = {};
        pipelineByUser[uid]![stageName] =
            (pipelineByUser[uid]![stageName] ?? 0) + 1;
      }

      // évolution 30 jours + objectif mensuel
      final d = DateTime.tryParse(_sf(p['createdAt']));
      if (d != null) {
        if (d.isAfter(last30Start)) {
          last30ByUser[uid] = (last30ByUser[uid] ?? 0) + 1;
        } else if (d.isAfter(prev30Start)) {
          prev30ByUser[uid] = (prev30ByUser[uid] ?? 0) + 1;
        }
        if (d.year == now.year && d.month == now.month) {
          thisMonthByUser[uid] = (thisMonthByUser[uid] ?? 0) + 1;
        }
      }
    }

    // Évolution % sur 30 jours par utilisateur
    final evolutionByUser = <String, double>{};
    for (final e in last30ByUser.entries) {
      final prev = prev30ByUser[e.key] ?? 0;
      if (prev > 0) {
        evolutionByUser[e.key] = (e.value - prev) / prev * 100;
      } else if (e.value > 0) {
        evolutionByUser[e.key] = 100.0;
      }
    }

    // Objectif mensuel = maximum des projets créés ce mois parmi tous les users
    final monthlyTarget = thisMonthByUser.values
        .fold(0, (a, b) => a > b ? a : b)
        .clamp(1, 9999);

    // Reminders depuis _followups (fallback API)
    final remindersCountByUser = <String, int>{};
    for (final f in _followups) {
      final userMap = f['user'] is Map ? f['user'] as Map : {};
      final uid = _sf(userMap['_id'] ?? userMap['id'] ??
          f['userId'] ?? f['ownerId'] ?? f['owner'] ?? '');
      if (uid.isNotEmpty) {
        remindersCountByUser[uid] = (remindersCountByUser[uid] ?? 0) + 1;
      }
    }

    final users = List<Map>.from(_userStats).map((u) {
      final uid = _sf(u['userId'] ?? u['_id']);
      final enriched = Map<String, dynamic>.from(u);
      if (_num(enriched['totalReminders'] ?? enriched['remindersCount']) == 0 &&
          remindersCountByUser.containsKey(uid)) {
        enriched['totalReminders'] = remindersCountByUser[uid];
      }
      return enriched;
    }).toList()
      ..sort((a, b) => (_num(b['count']) - _num(a['count'])).toInt());
    final top10 = users.take(10).toList();

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _sectionHeader('Top 10 — Performance Utilisateurs', badge: '${top10.length}'),
        const SizedBox(height: 20),
        CrmPerformanceGrid(
          users:           top10,
          valByUser:       valByUser,
          surfaceByUser:   surfaceByUser,
          pipelineByUser:  pipelineByUser,
          evolutionByUser: evolutionByUser,
          monthlyByUser:   thisMonthByUser,
          monthlyTarget:   monthlyTarget,
        ),
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. MONTHLY EVOLUTION  (line chart)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildMonthlyChart(BuildContext context) {
    final data = _monthly;
    final maxY = data.fold<int>(0, (m, d) => d.$2 > m ? d.$2 : m) + 2;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: _sectionHeader('Évolution mensuelle des projets')),
          _legend(const Color(0xFF4F46E5), 'Créations'),
          const SizedBox(width: 12),
          _legend(const Color(0xFF22C55E), 'Validations'),
        ]),
        const SizedBox(height: 24),
        SizedBox(
          height: 220,
          child: data.every((d) => d.$2 == 0 && d.$3 == 0)
              ? _emptyState('Aucune donnée mensuelle')
              : LineChart(LineChartData(
                  minY: 0,
                  maxY: maxY.toDouble(),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: (maxY / 4).ceilToDouble(),
                    getDrawingHorizontalLine: (_) => FlLine(color: const Color(0xFFF1F5F9), strokeWidth: 1),
                  ),
                  borderData: FlBorderData(show: false),
                  titlesData: FlTitlesData(
                    leftTitles: AxisTitles(sideTitles: SideTitles(
                      showTitles: true,
                      interval: (maxY / 4).ceilToDouble(),
                      reservedSize: 30,
                      getTitlesWidget: (v, _) => Text(v.toInt().toString(), style: AppTextStyles.chartAxis),
                    )),
                    rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    bottomTitles: AxisTitles(sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 28,
                      getTitlesWidget: (v, _) {
                        final i = v.toInt();
                        if (i < 0 || i >= data.length) return const SizedBox();
                        return Padding(padding: const EdgeInsets.only(top: 6),
                            child: Text(data[i].$1, style: AppTextStyles.chartAxis));
                      },
                    )),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: data.asMap().entries.map((e) => FlSpot(e.key.toDouble(), e.value.$2.toDouble())).toList(),
                      isCurved: true, curveSmoothness: 0.35,
                      color: const Color(0xFF4F46E5),
                      barWidth: 2.5,
                      dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
                          FlDotCirclePainter(radius: 4, color: Colors.white, strokeWidth: 2, strokeColor: const Color(0xFF4F46E5))),
                      belowBarData: BarAreaData(show: true, color: const Color(0xFF4F46E5).withOpacity(0.08)),
                    ),
                    LineChartBarData(
                      spots: data.asMap().entries.map((e) => FlSpot(e.key.toDouble(), e.value.$3.toDouble())).toList(),
                      isCurved: true, curveSmoothness: 0.35,
                      color: const Color(0xFF22C55E),
                      barWidth: 2.5,
                      dotData: FlDotData(show: true, getDotPainter: (_, __, ___, ____) =>
                          FlDotCirclePainter(radius: 4, color: Colors.white, strokeWidth: 2, strokeColor: const Color(0xFF22C55E))),
                      belowBarData: BarAreaData(show: true, color: const Color(0xFF22C55E).withOpacity(0.06)),
                    ),
                  ],
                )),
        ),
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. ALERTS  (missing fields)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildAlerts(BuildContext context) {
    final alerts = [
      (label: 'Bureau de contrôle manquant', icon: Icons.domain_disabled_rounded,  count: _missingBureau, color: const Color(0xFFEF4444), fieldKey: 'bureauControle'),
      (label: 'Architecte manquant',         icon: Icons.architecture_rounded,      count: _missingArch,   color: const Color(0xFFF97316), fieldKey: 'architecte'),
      (label: 'Ingénieur manquant',          icon: Icons.engineering_rounded,       count: _missingIng,    color: const Color(0xFFF59E0B), fieldKey: 'ingenieur'),
      (label: 'Téléphone manquant',          icon: Icons.phone_disabled_rounded,    count: _missingTel,    color: const Color(0xFF8B5CF6), fieldKey: 'telephone'),
      (label: 'Adresse manquante',           icon: Icons.location_off_rounded,      count: _missingAddr,   color: const Color(0xFF3B82F6), fieldKey: 'adresse'),
    ];

    final w    = MediaQuery.of(context).size.width;
    final cols = w > 1100 ? 5 : w > 700 ? 3 : 2;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _sectionHeader('Alertes — Champs manquants'),
      const SizedBox(height: 16),
      _ResponsiveGrid(
        cols: cols, gap: 12,
        children: alerts.map<Widget>((a) => _AlertCard(
          label:    a.label,
          icon:     a.icon,
          count:    a.count,
          color:    a.color,
          total:    _total,
          fieldKey: a.fieldKey,
        )).toList(),
      ),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. RELANCES — grouped timeline view
  // ══════════════════════════════════════════════════════════════════════════

  // Timing helpers
  static const _kOverdue   = 0;
  static const _kToday     = 1;
  static const _kThisWeek  = 2;
  static const _kFuture    = 3;

  int _relanceTiming(dynamic p) {
    final raw = _sf(p['prochaineRelance'] ?? p['nextRelanceAt'] ?? p['followupDate'] ?? p['nextActionDate'] ?? '');
    final dt  = DateTime.tryParse(raw);
    if (dt == null) return _kFuture;
    final now   = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d     = DateTime(dt.year, dt.month, dt.day);
    if (d.isBefore(today))                               return _kOverdue;
    if (d.isAtSameMomentAs(today))                       return _kToday;
    if (d.isBefore(today.add(const Duration(days: 7))))  return _kThisWeek;
    return _kFuture;
  }

  Color _timingColor(int t) {
    switch (t) {
      case _kOverdue:  return const Color(0xFFEF4444);
      case _kToday:    return const Color(0xFFF97316);
      case _kThisWeek: return const Color(0xFF3B82F6);
      default:         return const Color(0xFF64748B);
    }
  }

  String _timingLabel(int t) {
    final lang = AppLocalizations.of(context);
    switch (t) {
      case _kOverdue:  return '📅 ${lang.translate('En retard')}';
      case _kToday:    return '📅 ${lang.translate('Aujourd\'hui')}';
      case _kThisWeek: return '📅 ${lang.translate('Cette semaine')}';
      default:         return '📅 ${lang.translate('Plus tard')}';
    }
  }

  Widget _buildRelances(BuildContext context) {
    final all = _relances;

    // Grouper par timing
    final groups = <int, List<dynamic>>{
      _kOverdue: [],
      _kToday: [],
      _kThisWeek: [],
      _kFuture: [],
    };
    for (final p in all) {
      groups[_relanceTiming(p)]!.add(p);
    }
    final hasAny = groups.values.any((g) => g.isNotEmpty);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: _sectionHeader('Relances à venir', badge: '${all.length}')),
          // Légende
          _timingLegendChip(_kOverdue),
          const SizedBox(width: 6),
          _timingLegendChip(_kToday),
          const SizedBox(width: 6),
          _timingLegendChip(_kThisWeek),
        ]),
        const SizedBox(height: 20),
        // ── Bandeau erreur prioritaire ──────────────────────────────────────
        if (_followupsError)
          _buildFollowupsErrorBanner(),
        if (_followupsError && !hasAny)
          const SizedBox.shrink()
        else if (!hasAny)
          _emptyState('Aucune relance planifiée')
        else
          ...[_kOverdue, _kToday, _kThisWeek, _kFuture].expand((timing) {
            final items = groups[timing]!;
            if (items.isEmpty) return <Widget>[];
            return [
              // ── Section header ──────────────────────────────────────
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 10),
                child: Row(children: [
                  Text(
                    _timingLabel(timing),
                    style: TextStyle(
                      fontFamily: 'InterTight',
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: _timingColor(timing),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: _timingColor(timing).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${items.length}',
                      style: TextStyle(
                        fontFamily: 'InterTight',
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: _timingColor(timing),
                      ),
                    ),
                  ),
                ]),
              ),
              // ── Relance cards ───────────────────────────────────────
              ...items.map((p) {
                final data = p is Map<String, dynamic>
                    ? p
                    : Map<String, dynamic>.from(p as Map);
                return CrmRelanceCard(
                  key:  ValueKey(_sf(data['_id'] ?? data['id'] ??
                                     data['projectId'] ?? data['nomProjet'] ?? '')),
                  data: data,
                );
              }),
              const SizedBox(height: 16),
            ];
          }),
      ]),
    );
  }

  Widget _timingLegendChip(int timing) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: _timingColor(timing).withOpacity(0.1),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 6, height: 6,
        decoration: BoxDecoration(color: _timingColor(timing), shape: BoxShape.circle),
      ),
      const SizedBox(width: 4),
      Text(
        AppLocalizations.of(context).translate(
            timing == _kOverdue ? 'Retard' : timing == _kToday ? 'Aujourd\'hui' : 'Cette sem.'),
        style: TextStyle(fontFamily: 'InterTight', fontSize: 9, fontWeight: FontWeight.w700, color: _timingColor(timing)),
      ),
    ]),
  );


  // ══════════════════════════════════════════════════════════════════════════
  // 9. PROJETS À SUIVRE  (remplace _buildRelances)
  //    • Source : _projects (tous les projets de l'API, pas uniquement les reminders)
  //    • Compteur badge = _projects.length  (pas _relances.length)
  //    • Admin : groupé par utilisateur avec badge "X projets à suivre"
  // ══════════════════════════════════════════════════════════════════════════

  // ── Helpers privés ────────────────────────────────────────────────────────

  /// Nom du propriétaire depuis n'importe quel format de réponse API.
  String _projectOwnerName(dynamic p) {
    final u = p['user']  is Map ? p['user']  as Map :
              p['owner'] is Map ? p['owner'] as Map : <dynamic, dynamic>{};
    return _sf(u['nom'] ?? u['name'] ?? u['prenom'] ??
               p['userNom'] ?? p['userName'] ?? p['ownerName'] ?? '');
  }

  /// Couleur hex depuis string "#RRGGBB".
  Color _hexClr(String hex) {
    try { return Color(int.parse('FF${hex.replaceAll('#', '')}', radix: 16)); }
    catch (_) { return const Color(0xFF6366F1); }
  }

  /// Chip texte coloré unifié.
  Widget _followupChip(String label, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
    decoration: BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(label,
      style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
          fontWeight: FontWeight.w600, color: color),
      maxLines: 1, overflow: TextOverflow.ellipsis,
    ),
  );

  /// Chip priorité avec icône directionnelle.
  Widget _priorityChip(String p) {
    final l = p.toLowerCase();
    Color color; IconData icon;
    if (l == 'high' || l == 'haute' || l == 'élevée') {
      color = const Color(0xFFEF4444); icon = Icons.keyboard_double_arrow_up_rounded;
    } else if (l == 'medium' || l == 'moyenne') {
      color = const Color(0xFFF97316); icon = Icons.remove_rounded;
    } else {
      color = const Color(0xFF22C55E); icon = Icons.keyboard_double_arrow_down_rounded;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 10, color: color), const SizedBox(width: 3),
        Text(p, style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
            fontWeight: FontWeight.w600, color: color)),
      ]),
    );
  }

  /// Bouton icône compact pour les actions projet.
  Widget _followupIconBtn({
    required IconData icon,
    required Color color,
    required String tooltip,
    required VoidCallback onTap,
  }) => Tooltip(
    message: tooltip,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(7),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon, size: 16, color: color),
      ),
    ),
  );

  // ── Carte individuelle projet ──────────────────────────────────────────────
  Widget _buildProjectFollowupCard(BuildContext context, dynamic p) {
    final projectId  = _sf(p['_id'] ?? p['id'] ?? p['projectId'] ?? '');
    final nomProjet  = _sf(p['nomProjet'] ?? p['name'] ?? '');
    final owner      = _projectOwnerName(p);

    // Pipeline stage — {name, color} ou string
    final stageMap   = p['pipelineStage'] is Map ? p['pipelineStage'] as Map : null;
    final stageName  = _sf(stageMap?['name'] ??
        (p['pipelineStage'] is String ? p['pipelineStage'] : null) ??
        p['etapeCRM'] ?? p['stage'] ?? '');
    final stageClr   = stageMap?['color'] != null
        ? _hexClr(_sf(stageMap!['color']))
        : _statutColor(stageName);

    final valStatut  = _sf(p['validationStatut'] ?? p['statut'] ?? '');
    final priority   = _sf(p['priority'] ?? p['priorite'] ?? '');

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _kBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: Row(children: [
        // ── Avatar initiale projet ─────────────────────────────────────
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(
            color: stageClr.withOpacity(0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          alignment: Alignment.center,
          child: Text(
            nomProjet.isNotEmpty ? nomProjet[0].toUpperCase() : '?',
            style: TextStyle(fontFamily: 'InterTight', fontSize: 15,
                fontWeight: FontWeight.w800, color: stageClr),
          ),
        ),
        const SizedBox(width: 12),

        // ── Informations projet ────────────────────────────────────────
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              nomProjet.isNotEmpty ? nomProjet : '—',
              style: const TextStyle(fontFamily: 'InterTight', fontSize: 13,
                  fontWeight: FontWeight.w700, color: _kText),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
            if (owner.isNotEmpty) ...[
              const SizedBox(height: 3),
              Row(children: [
                const Icon(Icons.person_outline_rounded, size: 12, color: _kMuted),
                const SizedBox(width: 4),
                Flexible(child: Text(owner,
                  style: AppTextStyles.bodyMuted.copyWith(fontSize: 11),
                  maxLines: 1, overflow: TextOverflow.ellipsis)),
              ]),
            ],
            const SizedBox(height: 6),
            Wrap(spacing: 6, runSpacing: 4, children: [
              if (stageName.isNotEmpty)
                _followupChip(stageName, stageClr),
              if (valStatut.isNotEmpty)
                _followupChip(valStatut, _statutColor(valStatut)),
              if (priority.isNotEmpty)
                _priorityChip(priority),
            ]),
          ]),
        ),

        // ── Boutons Voir + Timeline ────────────────────────────────────
        if (projectId.isNotEmpty) ...[
          const SizedBox(width: 8),
          _followupIconBtn(
            icon: Icons.visibility_rounded,
            color: const Color(0xFF2563EB),
            tooltip: 'Voir projet',
            onTap: () => context.push('/forms/project?id=$projectId'),
          ),
          const SizedBox(width: 4),
          _followupIconBtn(
            icon: Icons.timeline_rounded,
            color: const Color(0xFF7C3AED),
            tooltip: 'Timeline',
            onTap: () => context.push('/forms/project-timeline?projectId=$projectId'),
          ),
        ],
      ]),
    );
  }

  // ── Vue admin : groupée par utilisateur ───────────────────────────────────
  Widget _buildAdminFollowupGroups(BuildContext context) {
    // Grouper par nom utilisateur
    final Map<String, List<dynamic>> byUser = {};
    for (final p in _projects) {
      final name = _projectOwnerName(p);
      byUser.putIfAbsent(name.isNotEmpty ? name : '(Non assigné)', () => []).add(p);
    }

    // Trier par nombre de projets décroissant
    final entries = byUser.entries.toList()
      ..sort((a, b) => b.value.length.compareTo(a.value.length));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: entries.asMap().entries.map((en) {
        final idx  = en.key;
        final name = en.value.key;
        final list = en.value.value;
        final cnt  = list.length;

        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── En-tête utilisateur ──────────────────────────────────────
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 10),
            child: Row(children: [
              _avatar(name, idx),
              const SizedBox(width: 10),
              Expanded(child: Text(name,
                style: const TextStyle(fontFamily: 'InterTight', fontSize: 13,
                    fontWeight: FontWeight.w700, color: _kText),
              )),
              // Badge "X projets à suivre"
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$cnt projet${cnt != 1 ? 's' : ''} à suivre',
                  style: const TextStyle(fontFamily: 'InterTight', fontSize: 11,
                      fontWeight: FontWeight.w700, color: Color(0xFF4F46E5)),
                ),
              ),
            ]),
          ),
          // ── Cartes projets de cet utilisateur ───────────────────────
          ...list.map((p) => _buildProjectFollowupCard(context, p)),
          const SizedBox(height: 4),
          const Divider(height: 1, thickness: 0.8, color: Color(0xFFEFF2F7)),
          const SizedBox(height: 12),
        ]);
      }).toList(),
    );
  }

  // ── Widget principal ──────────────────────────────────────────────────────
  // BUG CORRIGÉ : cette section passait `_projects` (TOUS les projets de
  // /projects ou /projects/my-projects) à RelancesFollowupSection, au lieu de
  // `_relances` (= _followups, les données de l'endpoint dédié
  // /crm/upcoming-followups). Les relances "overdue" renvoyées par le
  // backend (confirmé : count=1, overdue=[...]) étaient donc bien reçues et
  // parsées (_followupsOverdue), mais jamais affichées car totalement
  // absentes du jeu de données réellement rendu par ce widget.
  Widget _buildProjectsFollowup(BuildContext context) {
    final today    = _followupsToday;
    final upcoming = _followupsUpcoming;
    final overdue  = _followupsOverdue;
    // _relances = _followups (overdue+today+upcoming) si l'API a répondu,
    // sinon fallback sur les projets ayant une prochaine relance.
    final combined = _relances;

    // ── Logs demandés (avant affichage) ─────────────────────────────────────
    print("today = ${today.length}");
    print("upcoming = ${upcoming.length}");
    print("overdue = ${overdue.length}");
    print("total = ${today.length + upcoming.length + overdue.length}");

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: _cardDeco(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── En-tête ──────────────────────────────────────────────────────────
        Row(children: [
          Expanded(child: _sectionHeader('Relances à venir')),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '${combined.length}',
              style: const TextStyle(fontFamily: 'InterTight', fontSize: 13,
                  fontWeight: FontWeight.w700, color: Color(0xFF4F46E5)),
            ),
          ),
        ]),
        const SizedBox(height: 16),

        // ── Cartes KPI : Aujourd'hui / À venir / En retard / Toutes ────────
        _followupKpiRow(
          today:    today.length,
          upcoming: upcoming.length,
          overdue:  overdue.length,
          total:    combined.length,
        ),
        const SizedBox(height: 20),

        // ── Section complète avec filtres, recherche, groupes, pagination ──
        RelancesFollowupSection(
          items:   combined,
          isAdmin: _isAdmin,
        ),
      ]),
    );
  }

  // ── Cartes KPI Aujourd'hui / À venir / En retard / Toutes ─────────────────
  // Toutes = today.length + upcoming.length + overdue.length (jamais
  // uniquement today ou upcoming) — voir _buildProjectsFollowup.
  Widget _followupKpiRow({
    required int today,
    required int upcoming,
    required int overdue,
    required int total,
  }) {
    final cards = <(String, int, Color, IconData)>[
      ("Aujourd'hui", today,    const Color(0xFFF97316), Icons.today_rounded),
      ('À venir',     upcoming, const Color(0xFF3B82F6), Icons.event_available_rounded),
      ('En retard',   overdue,  const Color(0xFFEF4444), Icons.warning_amber_rounded),
      ('Toutes',      total,    const Color(0xFF4F46E5), Icons.list_alt_rounded),
    ];

    return LayoutBuilder(builder: (context, constraints) {
      final isNarrow = constraints.maxWidth < 640;
      final width = isNarrow
          ? (constraints.maxWidth - 8) / 2
          : (constraints.maxWidth - 8 * 3) / 4;

      return Wrap(
        spacing: 8,
        runSpacing: 8,
        children: cards.map((c) {
          final (label, count, color, icon) = c;
          return SizedBox(
            width: width,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: color.withOpacity(0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: color.withOpacity(0.22)),
              ),
              child: Row(children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('$count', style: TextStyle(fontFamily: 'InterTight',
                        fontSize: 18, fontWeight: FontWeight.w800, color: color)),
                    Text(label, style: const TextStyle(fontFamily: 'InterTight',
                        fontSize: 11, fontWeight: FontWeight.w600, color: _kMuted),
                        overflow: TextOverflow.ellipsis),
                  ]),
                ),
              ]),
            ),
          );
        }).toList(),
      );
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOLLOWUPS ERROR BANNER
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildFollowupsErrorBanner() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.35)),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            color: const Color(0xFFEF4444).withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(Icons.error_outline_rounded,
              color: Color(0xFFDC2626), size: 18),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text(
              'Impossible de charger les relances',
              style: TextStyle(
                fontFamily: 'InterTight',
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: Color(0xFFDC2626),
              ),
            ),
            if (_followupsErrorMsg.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(
                _followupsErrorMsg,
                style: AppTextStyles.bodyMuted.copyWith(fontSize: 11),
              ),
            ],
          ]),
        ),
        const SizedBox(width: 12),
        TextButton.icon(
          onPressed: () {
            setState(() {
              _followupsError    = false;
              _followupsErrorMsg = '';
            });
            _loadAll();
          },
          icon: const Icon(Icons.refresh_rounded, size: 14),
          label: Text(AppLocalizations.of(context).translate('Réessayer')),
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFFDC2626),
            backgroundColor: const Color(0xFFEF4444).withOpacity(0.08),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            textStyle: const TextStyle(
              fontFamily: 'InterTight',
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  Widget _sectionHeader(String title, {String? badge}) => Row(children: [
    Text(AppLocalizations.of(context).translate(title), style: AppTextStyles.cardTitle),
    if (badge != null) ...[
      const SizedBox(width: 10),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
        decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(20)),
        child: Text(badge, style: const TextStyle(fontFamily: 'InterTight', fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF4F46E5))),
      ),
    ],
  ]);

  Widget _emptyState(String msg) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.inbox_rounded, size: 40, color: Colors.grey[300]),
        const SizedBox(height: 10),
        Text(AppLocalizations.of(context).translate(msg), style: AppTextStyles.bodyMuted),
      ]),
    ),
  );

  Widget _avatar(String name, int idx) {
    const colors = [Color(0xFF4F46E5), Color(0xFF22C55E), Color(0xFF3B82F6), Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFF8B5CF6)];
    final color  = colors[idx % colors.length];
    final init   = name.isNotEmpty ? name.trim()[0].toUpperCase() : '?';
    return Container(
      width: 32, height: 32,
      decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
      alignment: Alignment.center,
      child: Text(init, style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w800, color: color)),
    );
  }

  Widget _statBadge(String v, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
    child: Text(v, style: TextStyle(fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w700, color: color)),
  );

  Widget _rateBar(double rate) => SizedBox(
    width: 100,
    child: Row(children: [
      Expanded(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: rate / 100,
            minHeight: 6,
            backgroundColor: const Color(0xFFF1F5F9),
            valueColor: AlwaysStoppedAnimation(rate >= 70 ? const Color(0xFF22C55E) : rate >= 40 ? const Color(0xFFF59E0B) : const Color(0xFFEF4444)),
          ),
        ),
      ),
      const SizedBox(width: 6),
      Text('${rate.toStringAsFixed(0)}%', style: AppTextStyles.bodyMuted.copyWith(fontSize: 11, fontWeight: FontWeight.w700)),
    ]),
  );

  Widget _legend(Color color, String label) => Row(mainAxisSize: MainAxisSize.min, children: [
    Container(width: 12, height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
    const SizedBox(width: 5),
    Text(AppLocalizations.of(context).translate(label), style: AppTextStyles.bodyMuted.copyWith(fontSize: 11)),
  ]);

  String _fmtDate(String v) {
    if (v.isEmpty) return '';
    try { return DateFormat('dd/MM/yyyy').format(DateTime.parse(v)); } catch (_) { return v; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD WIDGET
// ─────────────────────────────────────────────────────────────────────────────
class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.cfg, required this.value, required this.variation, required this.isUp});
  final _KpiCfg  cfg;
  final String   value;
  final String   variation;
  final bool     isUp;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [cfg.g1, cfg.g2], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: cfg.g1.withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 8))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(10)),
            child: Icon(cfg.icon, size: 20, color: Colors.white),
          ),
          const Spacer(),
          if (variation != '—')
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(isUp ? Icons.trending_up_rounded : Icons.trending_down_rounded, size: 12, color: Colors.white),
                const SizedBox(width: 3),
                Text(variation, style: const TextStyle(fontFamily: 'InterTight', fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
              ]),
            ),
        ]),
        const SizedBox(height: 16),
        Text(value, style: const TextStyle(fontFamily: 'InterTight', fontSize: 36, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1, height: 1)),
        const SizedBox(height: 6),
        Text(cfg.label, style: const TextStyle(fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white70)),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERT CARD WIDGET  (interactive — hover + scale + dynamic shadow)
// ─────────────────────────────────────────────────────────────────────────────
class _AlertCard extends StatefulWidget {
  const _AlertCard({
    required this.label,
    required this.icon,
    required this.count,
    required this.color,
    required this.total,
    required this.fieldKey,
  });
  final String   label;
  final IconData icon;
  final int      count;
  final Color    color;
  final int      total;
  final String   fieldKey;

  @override
  State<_AlertCard> createState() => _AlertCardState();
}

class _AlertCardState extends State<_AlertCard> {
  bool _hovered = false;

  bool get _clickable => widget.count > 0;

  void _navigate(BuildContext context) {
    if (!_clickable) return;
    context.push(
      Uri(
        path: '/projects-list',
        queryParameters: {
          'field': widget.fieldKey,
          'label': widget.label,
        },
      ).toString(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pct = widget.total == 0 ? 0.0 : widget.count / widget.total;

    return MouseRegion(
      cursor: _clickable ? SystemMouseCursors.click : SystemMouseCursors.basic,
      onEnter: (_) { if (_clickable) setState(() => _hovered = true); },
      onExit:  (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: () => _navigate(context),
        child: AnimatedScale(
          scale: _hovered ? 1.035 : 1.0,
          duration: const Duration(milliseconds: 190),
          curve: Curves.easeOut,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 190),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: _kCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: widget.count > 0
                    ? widget.color.withOpacity(_hovered ? 0.65 : 0.3)
                    : const Color(0xFFE2E8F0),
                width: _hovered ? 1.4 : 1.0,
              ),
              boxShadow: [
                BoxShadow(
                  color: _hovered && _clickable
                      ? widget.color.withOpacity(0.22)
                      : Colors.black.withOpacity(0.04),
                  blurRadius: _hovered ? 28 : 12,
                  spreadRadius: _hovered ? 1 : 0,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 190),
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: widget.color.withOpacity(_hovered ? 0.18 : 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(widget.icon, size: 16, color: widget.color),
                ),
                const Spacer(),
                // Badge count
                AnimatedContainer(
                  duration: const Duration(milliseconds: 190),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: widget.count > 0
                        ? widget.color.withOpacity(_hovered ? 0.18 : 0.1)
                        : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${widget.count}',
                    style: TextStyle(
                      fontFamily: 'InterTight',
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: widget.count > 0 ? widget.color : const Color(0xFF94A3B8),
                    ),
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              Text(
                AppLocalizations.of(context).translate(widget.label),
                style: const TextStyle(
                  fontFamily: 'InterTight',
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: _kText,
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: pct,
                  minHeight: 4,
                  backgroundColor: const Color(0xFFF1F5F9),
                  valueColor: AlwaysStoppedAnimation(
                    widget.count > 0 ? widget.color : const Color(0xFF94A3B8),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Row(children: [
                Expanded(
                  child: Text(
                    widget.total > 0
                        ? '${(pct * 100).toStringAsFixed(0)}% des projets'
                        : '—',
                    style: AppTextStyles.bodyMuted.copyWith(fontSize: 10),
                  ),
                ),
                if (_clickable)
                  AnimatedOpacity(
                    opacity: _hovered ? 1.0 : 0.0,
                    duration: const Duration(milliseconds: 190),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(
                        'Voir',
                        style: TextStyle(
                          fontFamily: 'InterTight',
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: widget.color,
                        ),
                      ),
                      const SizedBox(width: 2),
                      Icon(Icons.arrow_forward_rounded, size: 10, color: widget.color),
                    ]),
                  ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSIVE GRID
// ─────────────────────────────────────────────────────────────────────────────
class _ResponsiveGrid extends StatelessWidget {
  const _ResponsiveGrid({required this.cols, required this.gap, required this.children});
  final int         cols;
  final double      gap;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (int i = 0; i < children.length; i += cols) {
      final rowChildren = children.sublist(i, (i + cols).clamp(0, children.length));
      while (rowChildren.length < cols) rowChildren.add(const SizedBox());
      // IntrinsicHeight résout la hauteur sans contrainte infinie
      // (CrossAxisAlignment.stretch interdit dans SingleChildScrollView)
      rows.add(IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: rowChildren.asMap().entries.map((e) {
            return Expanded(child: Padding(
              padding: EdgeInsets.only(left: e.key == 0 ? 0 : gap),
              child: e.value,
            ));
          }).toList(),
        ),
      ));
      if (i + cols < children.length) rows.add(SizedBox(height: gap));
    }
    return Column(children: rows);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLICKABLE STAT ROW — ligne "PROBAR · 42 projets" / "Ø12 · 8 projets"
// (sections Répartition par famille / par diamètre) — hover + clic.
// ─────────────────────────────────────────────────────────────────────────────
class _ClickableStatRow extends StatefulWidget {
  const _ClickableStatRow({
    required this.color,
    required this.label,
    required this.count,
    required this.onTap,
  });
  final Color        color;
  final String       label;
  final int          count;
  final VoidCallback onTap;

  @override
  State<_ClickableStatRow> createState() => _ClickableStatRowState();
}

class _ClickableStatRowState extends State<_ClickableStatRow> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: const EdgeInsets.symmetric(vertical: 3),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: _hovered ? widget.color.withOpacity(0.07) : const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: _hovered ? widget.color.withOpacity(0.35) : _kBorder,
            ),
          ),
          child: Row(children: [
            Container(
              width: 10, height: 10,
              decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(widget.label,
                style: TextStyle(
                  fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w700,
                  color: _hovered ? widget.color : _kText,
                )),
            ),
            Text('${widget.count} ${AppLocalizations.of(context).translate(widget.count > 1 ? 'projets' : 'projet')}',
              style: const TextStyle(
                fontFamily: 'InterTight', fontSize: 12, fontWeight: FontWeight.w600, color: _kMuted,
              )),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right_rounded, size: 16,
              color: _hovered ? widget.color : _kMuted.withOpacity(0.6)),
          ]),
        ),
      ),
    );
  }
}
