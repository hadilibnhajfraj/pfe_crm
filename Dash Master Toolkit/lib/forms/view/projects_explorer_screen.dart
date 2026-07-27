// lib/forms/view/projects_explorer_screen.dart
import 'dart:html' as html;

import 'package:excel/excel.dart' as xl;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dio/dio.dart' show Options, ResponseType;
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/constants/product_family.dart';

// ──────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ──────────────────────────────────────────────────────────────────────────────
const _kDivider  = Color(0xFFF1F5F9);    // très légère — invisible à l'oeil
const _kRowHover = Color(0xFFF8FAFC);
const _kHeader   = Color(0xFFF8FAFC);

// ──────────────────────────────────────────────────────────────────────────────
// DATA MODEL
// ──────────────────────────────────────────────────────────────────────────────
class _Row {
  // ── Display fields ─────────────────────────────────────────────────────────
  final String id;
  final String name;
  final String type;          // 'project' | 'applicateur' | 'revendeur'
  final String ownerName;
  final String ownerEmail;
  final String ownerRole;
  final String ownerId;
  final String createdAt;
  final String status;
  final String validation;
  final bool   isArchived;
  final String adresse;
  final String entreprise;
  final String architecte;
  final String ingenieur;
  final double? lat;
  final double? lng;
  // ── Raw JSON for full export (all business fields) ─────────────────────────
  final Map<String, dynamic> raw;

  _Row({
    required this.id,
    required this.name,
    required this.type,
    required this.ownerName,
    required this.ownerEmail,
    required this.ownerRole,
    required this.ownerId,
    required this.createdAt,
    required this.status,
    required this.validation,
    required this.isArchived,
    required this.raw,
    this.adresse    = '',
    this.entreprise = '',
    this.architecte = '',
    this.ingenieur  = '',
    this.lat,
    this.lng,
  });

  factory _Row.fromJson(Map<String, dynamic> j) {
    final modele = _s(j['projectModele'] ?? '').toLowerCase();
    String type = 'project';
    if (modele.contains('applicateur')) type = 'applicateur';
    if (modele.contains('revendeur'))   type = 'revendeur';

    final userMap = j['user'] is Map
        ? Map<String, dynamic>.from(j['user'] as Map) : <String, dynamic>{};
    final reqMap = j['requester'] is Map
        ? Map<String, dynamic>.from(j['requester'] as Map) : <String, dynamic>{};

    final ownerName = _s(
      j['user_nom'] ?? j['user_nom_custom'] ??
      userMap['name'] ?? userMap['nom'] ??
      reqMap['name']  ?? reqMap['nom']  ??
      j['ownerName']  ?? j['ingenieurResponsable'],
    );
    final ownerEmail = _s(
      userMap['email'] ?? reqMap['email'] ??
      j['ownerEmail']  ?? j['userEmail'] ?? j['email'],
    );
    final ownerRole = _s(
      userMap['role'] ?? reqMap['role'] ??
      j['ownerRole']  ?? j['role'],
    );
    final ownerId = _s(
      userMap['_id'] ?? userMap['id'] ??
      reqMap['_id']  ?? reqMap['id']  ??
      j['userId']    ?? j['ownerId'],
    );

    return _Row(
      id:          _s(j['_id'] ?? j['id']),
      name:        _s(j['nomProjet'] ?? j['name']),
      type:        type,
      ownerName:   ownerName,
      ownerEmail:  ownerEmail,
      ownerRole:   ownerRole,
      ownerId:     ownerId,
      createdAt:   _s(j['dateDemarrage'] ?? j['createdAt'] ?? j['date']),
      status:      _s(j['statut'] ?? j['status']),
      validation:  _s(j['validationStatut'] ?? j['validation']),
      isArchived:  j['isArchived'] == true,
      adresse:     _s(j['adresse']),
      entreprise:  _s(j['entreprise']),
      architecte:  _s(j['architecte']),
      ingenieur:   _s(j['ingenieurResponsable']),
      lat:         _dbl(j['latitude']  ?? j['lat']),
      lng:         _dbl(j['longitude'] ?? j['lng']),
      raw:         j,
    );
  }

  static String  _s(dynamic v) =>
      (v == null || v.toString().trim().isEmpty) ? '' : v.toString().trim();
  static double? _dbl(dynamic v) =>
      v == null ? null : double.tryParse(v.toString());
}

// ──────────────────────────────────────────────────────────────────────────────
// AVATAR HELPERS
// ──────────────────────────────────────────────────────────────────────────────
const _kPalette = [
  Color(0xFF6366F1), Color(0xFF8B5CF6), Color(0xFF10B981),
  Color(0xFF06B6D4), Color(0xFFF59E0B), Color(0xFFEC4899),
  Color(0xFFF97316), Color(0xFF3B82F6), Color(0xFF14B8A6),
];

Color _avatarColor(String name) {
  if (name.isEmpty) return _kPalette[0];
  return _kPalette[name.codeUnitAt(0) % _kPalette.length];
}

String _initials(String name) {
  if (name.isEmpty) return '?';
  final parts = name.trim().split(RegExp(r'[\s._@()\-]'))
      .where((p) => p.isNotEmpty).toList();
  if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  return name.trim()[0].toUpperCase();
}

// ──────────────────────────────────────────────────────────────────────────────
// STATUS COLOR
// ──────────────────────────────────────────────────────────────────────────────
Color _statusColor(String s) {
  final l = s.toLowerCase();
  if (l.contains('prospect'))                         return const Color(0xFF3B82F6);
  if (l.contains('identif'))                          return const Color(0xFF6B7280);
  if (l.contains('plan') || l.contains('technique'))  return const Color(0xFFF59E0B);
  if (l.contains('nego'))                             return const Color(0xFF8B5CF6);
  if (l.contains('offre') || l.contains('devis'))    return const Color(0xFF06B6D4);
  if (l.contains('gagn') || l.contains('won'))       return const Color(0xFF10B981);
  if (l.contains('perd') || l.contains('lost'))      return const Color(0xFFEF4444);
  if (l.contains('visite'))                          return const Color(0xFF6366F1);
  if (l.contains('echant'))                          return const Color(0xFFEC4899);
  if (l.contains('commande'))                        return const Color(0xFFF97316);
  return kCrmTextSub;
}

Color _validationColor(String s) {
  final l = s.toLowerCase();
  if (l.contains('valid') || l.contains('approv'))          return kCrmSuccess;
  if (l.contains('refus') || l.contains('rejet'))           return kCrmDanger;
  if (l.contains('attente') || l.contains('pending'))       return kCrmWarning;
  return kCrmTextSub;
}

Color _typeColor(String type) {
  switch (type) {
    case 'applicateur': return kCrmSecondary;
    case 'revendeur':   return kCrmInfo;
    default:            return kCrmPrimary;
  }
}

String _typeLabel(String type) {
  switch (type) {
    case 'applicateur': return 'Applicateur';
    case 'revendeur':   return 'Revendeur';
    default:            return 'Projet';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// USER ENTRY (for admin dropdown)
// ──────────────────────────────────────────────────────────────────────────────
class _UserEntry {
  final String id;
  final String name;
  final String email;
  final String role;
  _UserEntry({required this.id, required this.name, required this.email, required this.role});

  factory _UserEntry.fromJson(Map<String, dynamic> j) {
    final id    = (j['_id'] ?? j['id'] ?? '').toString();
    final email = (j['email'] ?? '').toString();
    final name  = (j['nom']  ?? j['name'] ?? email.split('@').first).toString();
    final role  = (j['role'] ?? '').toString();
    return _UserEntry(id: id, name: name, email: email, role: role);
  }

  String get display => name.isNotEmpty && name != email ? '$name ($email)' : email;
}

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN
// ──────────────────────────────────────────────────────────────────────────────
class ProjectsExplorerScreen extends StatefulWidget {
  const ProjectsExplorerScreen({super.key});
  @override
  State<ProjectsExplorerScreen> createState() => _State();
}

class _State extends State<ProjectsExplorerScreen>
    with SingleTickerProviderStateMixin {

  // ── Auth ───────────────────────────────────────────────────────────────────
  final _auth   = AuthService();
  bool get _isAdmin => _auth.isAdmin;

  // ── Tabs ───────────────────────────────────────────────────────────────────
  static const _tabs   = ['Tous', 'Projets', 'Applicateurs', 'Revendeurs'];
  static const _modeles = <String?>[null, 'project', 'applicateur', 'revendeur'];
  late final TabController _tab;

  // ── State ──────────────────────────────────────────────────────────────────
  List<_Row> _rows      = [];
  bool       _loading   = false;
  int        _page      = 1;
  int        _totalPages = 1;
  int        _total     = 0;
  static const _limit   = 50;

  // ── Users list (admin only, for dropdown) ─────────────────────────────────
  List<_UserEntry>  _users            = [];
  bool              _usersLoaded      = false;
  Map<String, int>  _userProjectCounts = {};  // userId → project count
  bool              _exporting         = false;

  // ── Filters ────────────────────────────────────────────────────────────────
  final _searchCtrl = TextEditingController();
  String?   _statusF;
  String?   _validationF;
  String?   _userIdF;    // null = tous les utilisateurs (admin seulement)
  String?   _productFamilyF;
  int?      _diameterF;
  DateTime? _dateFrom;
  DateTime? _dateTo;
  bool      _filtersOpen = false;

  // ── KPI — alimentés depuis la réponse filtrée dans _load() ───────────────
  int _kActifs   = 0;
  int _kArchived = 0;
  int _kPending  = 0;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
    _tab.addListener(() { if (!_tab.indexIsChanging) { _page = 1; _load(); } });
    _load();
    if (_isAdmin) _loadUsers().then((_) => _loadUserProjectCounts());
  }

  @override
  void dispose() { _tab.dispose(); _searchCtrl.dispose(); super.dispose(); }

  // ── Load users list ────────────────────────────────────────────────────────
  Future<void> _loadUsers() async {
    if (_usersLoaded) return;
    try {
      final res  = await ApiClient.instance.dio.get('/users');
      final data = res.data;
      List raw   = [];
      if (data is List)       raw = data;
      else if (data is Map)   raw = (data['data'] ?? data['users'] ?? data['items'] ?? []) as List;

      setState(() {
        _users       = raw.whereType<Map>()
            .map((e) => _UserEntry.fromJson(Map<String, dynamic>.from(e)))
            .where((u) => u.id.isNotEmpty)
            .toList()
          ..sort((a, b) => a.name.compareTo(b.name));
        _usersLoaded = true;
      });
    } catch (e) {
      debugPrint('[ProjectList] loadUsers error: $e');
    }
  }

  // ── Load project counts per user (background, admin only) ─────────────────
  Future<void> _loadUserProjectCounts() async {
    if (!_isAdmin || _users.isEmpty) return;
    try {
      // Fetch a large batch of projects to compute per-user counts
      final res = await ApiClient.instance.dio.get('/projects', queryParameters: {
        'page': 1, 'limit': 1000,
      });
      final data = res.data;
      List raw = [];
      if (data is Map) {
        raw = (data['items'] ?? data['data'] ?? data['results'] ?? data['docs'] ?? []) as List;
      } else if (data is List) {
        raw = data;
      }

      final counts = <String, int>{};
      for (final item in raw.whereType<Map>()) {
        final j       = Map<String, dynamic>.from(item);
        final userMap = j['user'] is Map
            ? Map<String, dynamic>.from(j['user'] as Map) : <String, dynamic>{};
        final ownerId = _sf(
          userMap['_id'] ?? userMap['id'] ??
          j['userId']    ?? j['ownerId'],
        );
        if (ownerId.isNotEmpty) {
          counts[ownerId] = (counts[ownerId] ?? 0) + 1;
        }
      }
      if (mounted) setState(() => _userProjectCounts = counts);
    } catch (e) {
      debugPrint('[ProjectList] loadCounts error: $e');
    }
  }

  // ── API ────────────────────────────────────────────────────────────────────
  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final modele = _modeles[_tab.index];
      final params = <String, dynamic>{
        'page': _page, 'limit': _limit,
        if (_searchCtrl.text.trim().isNotEmpty) 'q': _searchCtrl.text.trim(),
        if (modele != null)                     'projectModele': modele,
        if (_statusF?.isNotEmpty == true)        'statut': _statusF,
        if (_validationF?.isNotEmpty == true)    'validationStatut': _validationF,
        if (_productFamilyF != null)             'productFamily': _productFamilyF,
        if (_diameterF != null)                  'diameterMm': _diameterF,
        // userId : uniquement pour admin — le backend ignore ce param pour les users
        if (_isAdmin && _userIdF?.isNotEmpty == true) 'userId': _userIdF,
        if (_dateFrom != null)
          'dateStart': DateFormat('yyyy-MM-dd').format(_dateFrom!),
        if (_dateTo != null)
          'dateEnd':   DateFormat('yyyy-MM-dd').format(_dateTo!),
      };

      if (_isAdmin && _userIdF?.isNotEmpty == true) {
        final u = _users.where((u) => u.id == _userIdF).firstOrNull;
        debugPrint('=== USER FILTER ===');
        debugPrint(_userIdF);
        debugPrint(u?.name ?? '');
      }
      debugPrint('REQUEST URL');
      debugPrint(params.toString());

      // Admin gets all projects; user gets their own
      final endpoint = _isAdmin ? '/projects' : '/projects/my-projects';

      final res  = await ApiClient.instance.dio.get(endpoint, queryParameters: params);
      final data = res.data;
      List raw   = [];
      int total = 0, totalPages = 1;

      if (data is Map) {
        raw        = (data['items'] ?? data['data'] ?? data['results'] ?? data['docs'] ?? []) as List;
        total      = (data['total'] ?? data['count'] ?? raw.length) as int;
        totalPages = (data['totalPages'] ?? data['pages'] ?? 1) as int;
      } else if (data is List) {
        raw = data; total = raw.length;
      }

      final filteredRows = raw.whereType<Map>()
          .map((e) => _Row.fromJson(Map<String, dynamic>.from(e))).toList();

      setState(() {
        _rows       = filteredRows;
        _total      = total;
        _totalPages = totalPages;
        // KPIs calculés depuis la réponse filtrée (pas depuis un cache global)
        _kActifs    = filteredRows.where((r) => !r.isArchived).length;
        _kArchived  = filteredRows.where((r) =>  r.isArchived).length;
        _kPending   = filteredRows.where((r) {
          final v = r.validation.toLowerCase();
          return v.contains('attente') || v.isEmpty;
        }).length;
      });
    } catch (e) {
      debugPrint('[ProjectList] $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  void _apply() {
    debugPrint('=== APPLY FILTERS ===');
    debugPrint('FILTER USER: $_userIdF');
    debugPrint('FILTER STATUS: $_statusF');
    debugPrint('FILTER VALIDATION: $_validationF');
    _page = 1;
    _load();
  }
  void _reset() {
    _searchCtrl.clear();
    setState(() {
      _statusF        = null;
      _validationF    = null;
      _userIdF        = null;
      _productFamilyF = null;
      _diameterF      = null;
      _dateFrom       = null;
      _dateTo         = null;
    });
    _tab.animateTo(0);
    _page = 1;
    _load();
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  //
  // Structure:
  //   Row 0  → Section label row  (merged, dark bg per section)
  //   Row 1  → Column header row  (light bg per section)
  //   Row 2+ → Data rows          (alternating white / very-light-blue)
  //
  // Sections & colors:
  //   Utilisateur → bleu
  //   Projet      → vert
  //   Dates       → gris
  //   Ingénieur   → violet   (also Architecte, Entreprise)
  //   Revendeur   → orange   (also Commercial)
  //   Localisation→ gris
  //   Admin       → gris
  //   Autres      → gris
  //   Archivage   → rouge

  // (sectionLabel, darkHex, lightHex, colCount)
  static const _kSections = <(String, String, String, int)>[
    ('UTILISATEUR',    '#1D4ED8', '#DBEAFE', 4),
    ('PROJET',         '#166534', '#DCFCE7', 10),
    ('DATES',          '#334155', '#F1F5F9', 8),
    ('INGENIEUR',      '#5B21B6', '#EDE9FE', 3),
    ('ARCHITECTE',     '#5B21B6', '#EDE9FE', 3),
    ('ENTREPRISE',     '#5B21B6', '#EDE9FE', 6),
    ('REVENDEUR',      '#C2410C', '#FED7AA', 5),
    ('LOCALISATION',   '#334155', '#F1F5F9', 5),
    ('COMMERCIALE',    '#C2410C', '#FED7AA', 3),
    ('ADMINISTRATIVE', '#334155', '#F1F5F9', 3),
    ('AUTRES',         '#334155', '#F1F5F9', 6),
    ('ARCHIVAGE',      '#B91C1C', '#FEE2E2', 2),
  ];

  // All column headers in section order
  static const _kCols = <String>[
    // UTILISATEUR (4)
    'Nom Utilisateur', 'Email Utilisateur', 'Rôle', 'User ID',
    // PROJET (10)
    'Project Name', 'Project ID', 'Type Projet', 'Product Family', 'Diameter (mm)',
    'Modèle Projet', 'Statut', 'Validation Statut', 'Priorité', 'Pipeline Stage',
    // DATES (8)
    'Date Démarrage', 'Date Prospection', 'Date Limite Ingénieur',
    'Date Création', 'Date Modification', 'Date Archivage',
    'Dernière Relance', 'Prochaine Relance',
    // INGENIEUR (3)
    'Ingénieur Responsable', 'Téléphone Ingénieur', 'Email Ingénieur',
    // ARCHITECTE (3)
    'Architecte', 'Téléphone Architecte', 'Email Architecte',
    // ENTREPRISE (6)
    'Entreprise', 'Promoteur', 'Bureau Etude', 'Bureau Contrôle',
    'Entreprise Fluide', 'Entreprise Electricité',
    // REVENDEUR (5)
    'Nom Revendeur', 'Prénom Revendeur', 'Email Revendeur',
    'Statut Revendeur', 'Adresse Revendeur',
    // LOCALISATION (5)
    'Adresse Chantier', 'Latitude', 'Longitude',
    'Commentaire Localisation', 'Type Adresse Chantier',
    // COMMERCIALE (3)
    'Montant Marché', 'Surface Prospectée', 'Pourcentage Réussite',
    // ADMINISTRATIVE (3)
    'Matricule Fiscale', 'Registre Commerce', 'Fonction',
    // AUTRES (6)
    'Comptoir', 'Téléphone Comptoir', 'Téléphone Comptoir 2',
    'Dallagiste', 'Téléphone Dallagiste', 'Email Dallagiste',
    // ARCHIVAGE (2)
    'Archivé', 'Motif Archivage',
  ];

  // Getters in the same column order as _kCols
  static List<String Function(_Row)> get _kGetters => [
    // UTILISATEUR
    (r) => r.ownerName,
    (r) => r.ownerEmail,
    (r) => r.ownerRole,
    (r) => r.ownerId,
    // PROJET
    (r) => r.name,
    (r) => r.id,
    (r) => _sf(r.raw['typeProjet']),
    (r) => productFamilyLabel(r.raw['productFamily'] as String?),
    (r) => diameterLabel(r.raw['diameterMm'] is num ? (r.raw['diameterMm'] as num).toInt() : null),
    (r) => _typeLabel(r.type),
    (r) => r.status,
    (r) => r.validation,
    (r) => _sf(r.raw['priorite'] ?? r.raw['priority']),
    (r) => _sf(r.raw['pipelineStage'] ?? r.raw['statut']),
    // DATES
    (r) => _fmtDate(_sf(r.raw['dateDemarrage'])),
    (r) => _fmtDate(_sf(r.raw['dateProspection'])),
    (r) => _fmtDate(_sf(r.raw['dateLimiteIngenieur'] ?? r.raw['dateLimite'])),
    (r) => _fmtDate(_sf(r.raw['createdAt'])),
    (r) => _fmtDate(_sf(r.raw['updatedAt'])),
    (r) => _fmtDate(_sf(r.raw['dateArchivage'] ?? r.raw['archivedAt'])),
    (r) => _fmtDate(_sf(r.raw['derniereRelance'] ?? r.raw['lastRelanceAt'])),
    (r) => _fmtDate(_sf(r.raw['prochaineRelance'] ?? r.raw['nextRelanceAt'])),
    // INGENIEUR
    (r) => _sf(r.raw['ingenieurResponsable']),
    (r) => _sf(r.raw['telephoneIngenieur'] ?? r.raw['tel_ingenieur']),
    (r) => _sf(r.raw['emailIngenieur'] ?? r.raw['email_ingenieur']),
    // ARCHITECTE
    (r) => _sf(r.raw['architecte']),
    (r) => _sf(r.raw['telephoneArchitecte']),
    (r) => _sf(r.raw['emailArchitecte']),
    // ENTREPRISE
    (r) => _sf(r.raw['entreprise']),
    (r) => _sf(r.raw['promoteur']),
    (r) => _sf(r.raw['bureauEtude'] ?? r.raw['bureau_etude']),
    (r) => _sf(r.raw['bureauControle'] ?? r.raw['bureau_controle']),
    (r) => _sf(r.raw['entrepriseFluide']),
    (r) => _sf(r.raw['entrepriseElectricite'] ?? r.raw['entrepriseElec']),
    // REVENDEUR
    (r) => _sf(r.raw['revendeurNom'] ?? r.raw['nom_revendeur']),
    (r) => _sf(r.raw['revendeurPrenom'] ?? r.raw['prenom_revendeur']),
    (r) => _sf(r.raw['revendeurEmail'] ?? r.raw['email_revendeur']),
    (r) => _sf(r.raw['revendeurStatut']),
    (r) => _sf(r.raw['adresseRevendeur']),
    // LOCALISATION
    (r) => _sf(r.raw['adresse'] ?? r.raw['adresseChantier']),
    (r) => r.lat?.toString() ?? '',
    (r) => r.lng?.toString() ?? '',
    (r) => _sf(r.raw['commentaireLocalisation'] ?? r.raw['commentaire']),
    (r) => _sf(r.raw['typeAdresseChantier'] ?? r.raw['typeAdresse']),
    // COMMERCIALE
    (r) => _sf(r.raw['montantMarche'] ?? r.raw['montant_marche']),
    (r) => _sf(r.raw['surfaceProspectee']),
    (r) => _sf(r.raw['pourcentageReussite']),
    // ADMINISTRATIVE
    (r) => _sf(r.raw['matriculeFiscale']),
    (r) => _sf(r.raw['registreCommerce']),
    (r) => _sf(r.raw['fonction']),
    // AUTRES
    (r) => _sf(r.raw['comptoir']),
    (r) => _sf(r.raw['telephoneComptoir']),
    (r) => _sf(r.raw['telephoneComptoir2']),
    (r) => _sf(r.raw['dallagiste']),
    (r) => _sf(r.raw['telephoneDallagiste']),
    (r) => _sf(r.raw['emailDallagiste']),
    // ARCHIVAGE
    (r) => r.isArchived ? 'Oui' : 'Non',
    (r) => _sf(r.raw['motifArchivage'] ?? r.raw['reasonArchived'] ?? r.raw['raisonArchivage']),
  ];

  Future<void> _export() async {
    // ── Empêcher les clics simultanés ─────────────────────────────────────────
    if (_exporting) return;

    // ignore: avoid_print
    print('[EXPORT START]');

    final now    = DateTime.now();
    final date   = DateFormat('yyyy_MM_dd').format(now);
    final tabIdx = _tab.index;
    final filePrefix = [
      'Project_List',
      'Project_List',
      'Applicateur_List',
      'Revendeur_List',
    ][tabIdx];

    String fileName;
    if (_isAdmin && _userIdF != null && _userIdF!.isNotEmpty) {
      final u = _users.where((u) => u.id == _userIdF).firstOrNull;
      if (u != null) {
        final userLabel = u.name.toUpperCase().replaceAll(' ', '.');
        fileName = '${userLabel}_${_total}_PROJETS';
      } else {
        fileName = '${filePrefix}_$date';
      }
    } else {
      fileName = '${filePrefix}_$date';
    }

    setState(() => _exporting = true);

    try {
      // ── 1. Essai endpoint backend ─────────────────────────────────────────
      bool backendOk = false;
      try {
        final params = <String, dynamic>{
          if (_isAdmin && _userIdF?.isNotEmpty == true) 'userId': _userIdF,
          if (_modeles[tabIdx] != null) 'projectModele': _modeles[tabIdx],
          if (_searchCtrl.text.trim().isNotEmpty) 'q': _searchCtrl.text.trim(),
          if (_statusF?.isNotEmpty == true)       'statut': _statusF,
          if (_validationF?.isNotEmpty == true)   'validationStatut': _validationF,
          if (_productFamilyF != null)            'productFamily': _productFamilyF,
          if (_diameterF != null)                 'diameterMm': _diameterF,
          if (_dateFrom != null)
            'dateStart': DateFormat('yyyy-MM-dd').format(_dateFrom!),
          if (_dateTo != null)
            'dateEnd':   DateFormat('yyyy-MM-dd').format(_dateTo!),
        };

        final res = await ApiClient.instance.dio.get(
          '/projects/export',
          queryParameters: params,
          options: Options(responseType: ResponseType.bytes),
        );

        final bytes = res.data as List<int>;
        _downloadBytes(bytes, '$fileName.xlsx');
        backendOk = true;
      } catch (e) {
        // ignore: avoid_print
        print('[EXPORT] Backend indisponible: $e — génération côté client');
      }

      // ── 2. Fallback : génération côté client ──────────────────────────────
      if (!backendOk) {
        final excelFile = xl.Excel.createExcel();
        final sheet     = excelFile['Projets'];

        // Row 0 — section labels
        int colCursor = 0;
        for (final sec in _kSections) {
          final (label, darkHex, _, colCount) = sec;
          final startCol = colCursor;
          final endCol   = colCursor + colCount - 1;
          if (colCount > 1) {
            sheet.merge(
              xl.CellIndex.indexByColumnRow(columnIndex: startCol, rowIndex: 0),
              xl.CellIndex.indexByColumnRow(columnIndex: endCol,   rowIndex: 0),
            );
          }
          sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: startCol, rowIndex: 0))
            ..value     = label
            ..cellStyle = xl.CellStyle(
              bold: true, backgroundColorHex: darkHex, fontColorHex: '#FFFFFF',
            );
          colCursor += colCount;
        }

        // Row 1 — column headers
        final colSection = <int, (String, String, String, int)>{};
        int cc = 0;
        for (final sec in _kSections) {
          for (int i = cc; i < cc + sec.$4; i++) colSection[i] = sec;
          cc += sec.$4;
        }
        for (int col = 0; col < _kCols.length; col++) {
          final lightHex = colSection[col]?.$3 ?? '#F8FAFC';
          sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: col, rowIndex: 1))
            ..value     = _kCols[col]
            ..cellStyle = xl.CellStyle(
              bold: true, backgroundColorHex: lightHex, fontColorHex: '#1E293B',
            );
        }

        // Row 2+ — data
        final getters = _kGetters;
        for (int ri = 0; ri < _rows.length; ri++) {
          final rowIdx = ri + 2;
          final rowBg  = ri.isEven ? '#FFFFFF' : '#FAFAFA';
          for (int col = 0; col < getters.length; col++) {
            sheet.cell(xl.CellIndex.indexByColumnRow(columnIndex: col, rowIndex: rowIdx))
              ..value     = getters[col](_rows[ri])
              ..cellStyle = xl.CellStyle(backgroundColorHex: rowBg);
          }
        }

        // Column widths
        final widths = <int, double>{
          0: 22, 1: 28, 2: 14, 3: 30,
          4: 26, 5: 30, 6: 16, 7: 18,
          8: 16, 9: 16, 10: 22, 11: 20,
        };
        for (int col = 0; col < _kCols.length; col++) {
          sheet.setColWidth(col, widths[col] ?? 18);
        }

        final bytes = excelFile.encode();
        if (bytes == null) throw Exception('Échec de la génération du fichier Excel');
        _downloadBytes(bytes, '$fileName.xlsx');
      }

      // ignore: avoid_print
      print('[EXPORT SUCCESS]');
      if (mounted) _showToast(success: true, message: 'Export terminé · $fileName.xlsx');

    } catch (e, stack) {
      // ignore: avoid_print
      print('[EXPORT ERROR] $e');
      // ignore: avoid_print
      print(stack);
      if (mounted) {
        _showToast(
          success: false,
          message: 'Erreur export : ${e.toString().split('\n').first}',
        );
      }
    } finally {
      // ignore: avoid_print
      print('[EXPORT END]');
      if (mounted) setState(() => _exporting = false);
    }
  }

  // ── Download bytes via dart:html ───────────────────────────────────────────
  void _downloadBytes(List<int> bytes, String name) {
    final blob = html.Blob(
      [bytes],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    final url = html.Url.createObjectUrlFromBlob(blob);
    html.AnchorElement(href: url)
      ..setAttribute('download', name)
      ..click();
    html.Url.revokeObjectUrl(url);
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  void _showToast({required bool success, String? message}) {
    final color   = success ? kCrmSuccess : kCrmDanger;
    final icon    = success
        ? Icons.check_circle_rounded
        : Icons.error_outline_rounded;
    final text    = message ??
        (success
            ? 'Export Excel généré avec succès'
            : 'Erreur lors de la génération de l\'export');

    // Close any existing snackbar before showing the new one
    ScaffoldMessenger.of(context).hideCurrentSnackBar();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(children: [
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
          ),
        ]),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        duration: const Duration(seconds: 5),
      ),
    );
  }

  // ── BUILD ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      appBar: _appBar(),
      body: Column(children: [
        // Tab bar
        _tabBar(),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: kCrmPrimary))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _filtersCard(),
                      const SizedBox(height: 16),
                      _kpiRow(),
                      const SizedBox(height: 16),
                      _rows.isEmpty ? _emptyState() : _tableCard(),
                      if (_totalPages > 1) ...[
                        const SizedBox(height: 16),
                        _pagination(),
                      ],
                    ],
                  ),
                ),
        ),
      ]),
    );
  }

  // ── AppBar ─────────────────────────────────────────────────────────────────
  PreferredSizeWidget _appBar() => AppBar(
    backgroundColor: Colors.white,
    elevation: 0,
    surfaceTintColor: Colors.transparent,
    titleSpacing: 20,
    title: Row(children: [
      Container(
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(
          color: kCrmPrimary.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(Icons.list_alt_rounded, size: 20, color: kCrmPrimary),
      ),
      const SizedBox(width: 12),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Project List',
              style: tInter(fontSize: 16, fontWeight: FontWeight.w700, color: kCrmText),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          Text(
            _isAdmin ? 'Vue administrateur · tous les utilisateurs' : 'Mes projets · applicateurs · revendeurs',
            style: tInter(fontSize: 11, color: kCrmTextSub),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    ]),
    actions: [
      if (!_loading && _rows.isNotEmpty)
        _exporting
            // Spinner + label "Export en cours..." — bouton désactivé
            ? Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const SizedBox(
                    width: 14, height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2, color: kCrmSuccess,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('Export en cours...',
                      style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmSuccess)),
                ]),
              )
            // Bouton normal — actif uniquement si pas en cours
            : _Pill(
                icon: Icons.download_rounded,
                label: 'Export',
                color: kCrmSuccess,
                onTap: _export,
              ),
      _loading
          ? const Padding(padding: EdgeInsets.all(16),
              child: SizedBox(width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: kCrmPrimary)))
          : IconButton(
              icon: const Icon(Icons.refresh_rounded, size: 20),
              onPressed: _load,
              tooltip: 'Actualiser',
            ),
      const SizedBox(width: 8),
    ],
    bottom: PreferredSize(
      preferredSize: const Size.fromHeight(1),
      child: Container(height: 1, color: _kDivider),
    ),
  );

  // ── Tab bar ────────────────────────────────────────────────────────────────
  Widget _tabBar() => Container(
    color: Colors.white,
    child: TabBar(
      controller: _tab,
      labelColor: kCrmPrimary,
      unselectedLabelColor: kCrmTextSub,
      indicatorColor: kCrmPrimary,
      indicatorWeight: 2,
      dividerColor: _kDivider,
      labelStyle: tInter(fontSize: 13, fontWeight: FontWeight.w700),
      unselectedLabelStyle: tInter(fontSize: 13, fontWeight: FontWeight.w500),
      tabs: _tabs.map((l) => Tab(text: l)).toList(),
    ),
  );

  // ── Filters card ───────────────────────────────────────────────────────────
  static const _statuts = [
    'Visite', 'Plan technique', 'Echantillonnage', 'Devis envoyé',
    'Negociation', 'Commande gagnée', 'Commande perdue',
  ];
  static const _validations = ['En attente', 'Validé', 'Refusé'];

  int get _activeCount => [
    _searchCtrl.text.isNotEmpty,
    _statusF != null,
    _validationF != null,
    _userIdF != null,
    _productFamilyF != null,
    _diameterF != null,
    _dateFrom != null,
    _dateTo != null,
  ].where((v) => v).length;

  // ── Product Family / Diameter filter dropdowns ──────────────────────────────
  // Not reusing _Drop<T> here: it casts items (List<String>) to T, so it can't
  // back an int-typed Diameter dropdown, and it can't show a label distinct
  // from the stored value (needed to display "Probar" for 'PROBAR').
  Widget _productFamilyDropdown() => DropdownButtonFormField<String?>(
    value: _productFamilyF,
    decoration: InputDecoration(
      labelText: 'Product Family',
      labelStyle: tInter(fontSize: 11, color: kCrmTextSub),
      filled: true, fillColor: kCrmBg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kDivider)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kDivider)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    ),
    style: tInter(fontSize: 13, color: kCrmText),
    items: [
      DropdownMenuItem<String?>(value: null, child: Text('Toutes familles', style: tInter(fontSize: 13, color: kCrmTextSub))),
      ...kProductFamilies.map((f) => DropdownMenuItem<String?>(
          value: f, child: Text(productFamilyLabel(f), style: tInter(fontSize: 13, color: kCrmText)))),
    ],
    onChanged: (v) => setState(() {
      _productFamilyF = v;
      _diameterF = null;
    }),
  );

  Widget _diameterDropdown() {
    final options = kDiametersByFamily[_productFamilyF] ?? const <int>[];
    return DropdownButtonFormField<int?>(
      value: options.contains(_diameterF) ? _diameterF : null,
      decoration: InputDecoration(
        labelText: 'Diameter',
        labelStyle: tInter(fontSize: 11, color: kCrmTextSub),
        filled: true, fillColor: kCrmBg,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kDivider)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kDivider)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
      style: tInter(fontSize: 13, color: kCrmText),
      items: [
        DropdownMenuItem<int?>(value: null, child: Text('Tous diamètres', style: tInter(fontSize: 13, color: kCrmTextSub))),
        ...options.map((mm) => DropdownMenuItem<int?>(
            value: mm, child: Text(diameterLabel(mm), style: tInter(fontSize: 13, color: kCrmText)))),
      ],
      onChanged: options.isEmpty ? null : (v) => setState(() => _diameterF = v),
    );
  }

  Widget _filtersCard() => _SurCard(
    child: Column(children: [
      // Toggle
      InkWell(
        onTap: () => setState(() => _filtersOpen = !_filtersOpen),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [
            Icon(Icons.tune_rounded, size: 16, color: kCrmPrimary),
            const SizedBox(width: 10),
            Text('Filtres', style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmText)),
            if (_activeCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: kCrmPrimary, borderRadius: BorderRadius.circular(10)),
                child: Text('$_activeCount', style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
              ),
            ],
            const Spacer(),
            Icon(
              _filtersOpen ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
              size: 18, color: kCrmTextSub,
            ),
          ]),
        ),
      ),
      // Panel
      if (_filtersOpen) ...[
        Container(height: 1, color: _kDivider),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            // Search
            _SearchField(ctrl: _searchCtrl),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _Drop<String?>(
                label: 'Statut',
                value: _statusF,
                none: 'Tous statuts',
                items: _statuts,
                onChanged: (v) => setState(() => _statusF = v),
              )),
              const SizedBox(width: 10),
              Expanded(child: _Drop<String?>(
                label: 'Validation',
                value: _validationF,
                none: 'Toutes',
                items: _validations,
                onChanged: (v) => setState(() => _validationF = v),
              )),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _productFamilyDropdown()),
              const SizedBox(width: 10),
              Expanded(child: _diameterDropdown()),
            ]),
            // Filtre utilisateur — admin uniquement
            if (_isAdmin) ...[
              const SizedBox(height: 10),
              _UserDropdown(
                users:         _users,
                loading:       !_usersLoaded && _isAdmin,
                value:         _userIdF,
                projectCounts: _userProjectCounts,
                onChanged: (id) {
                  setState(() => _userIdF = id);
                  _page = 1;
                  _load();
                },
              ),
            ],
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _DateBtn(
                label: 'Date début',
                value: _dateFrom,
                onPick: (d) => setState(() => _dateFrom = d),
                onClear: () => setState(() => _dateFrom = null),
              )),
              const SizedBox(width: 10),
              Expanded(child: _DateBtn(
                label: 'Date fin',
                value: _dateTo,
                onPick: (d) => setState(() => _dateTo = d),
                onClear: () => setState(() => _dateTo = null),
              )),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: ElevatedButton.icon(
                onPressed: _apply,
                icon: const Icon(Icons.check_rounded, size: 16),
                label: Text('Appliquer',
                    style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: kCrmPrimary,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              )),
              const SizedBox(width: 10),
              Expanded(child: OutlinedButton.icon(
                onPressed: _reset,
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: Text('Réinitialiser',
                    style: tInter(fontSize: 13, fontWeight: FontWeight.w600)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: kCrmTextSub,
                  side: const BorderSide(color: _kDivider),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              )),
            ]),
          ]),
        ),
      ],
    ]),
  );

  // ── KPI row ────────────────────────────────────────────────────────────────
  Widget _kpiRow() => Row(children: [
    _Kpi(label: 'Total',      value: _total,    icon: Icons.folder_rounded,           color: kCrmPrimary),
    const SizedBox(width: 10),
    _Kpi(label: 'Actifs',     value: _kActifs,  icon: Icons.check_circle_rounded,     color: kCrmSuccess),
    const SizedBox(width: 10),
    _Kpi(label: 'Archivés',   value: _kArchived,icon: Icons.archive_rounded,           color: kCrmTextSub),
    const SizedBox(width: 10),
    _Kpi(label: 'En attente', value: _kPending, icon: Icons.hourglass_bottom_rounded, color: kCrmWarning),
  ]);

  // ── Empty state ────────────────────────────────────────────────────────────
  Widget _emptyState() => _SurCard(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 56),
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              color: kCrmPrimary.withValues(alpha: 0.06), shape: BoxShape.circle,
            ),
            child: Icon(Icons.folder_open_rounded, size: 44, color: kCrmPrimary.withValues(alpha: 0.4)),
          ),
          const SizedBox(height: 16),
          Text('Aucun résultat',
              style: tInter(fontSize: 16, fontWeight: FontWeight.w700, color: kCrmText)),
          const SizedBox(height: 6),
          Text('Aucun élément trouvé avec les filtres actuels.',
              style: tInter(fontSize: 13, color: kCrmTextSub)),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: _reset,
            icon: const Icon(Icons.refresh_rounded, size: 16),
            label: Text('Réinitialiser les filtres',
                style: tInter(fontSize: 13, fontWeight: FontWeight.w600)),
            style: OutlinedButton.styleFrom(
              foregroundColor: kCrmPrimary,
              side: BorderSide(color: kCrmPrimary.withValues(alpha: 0.4)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            ),
          ),
        ]),
      ),
    ),
  );

  // ── Table card ─────────────────────────────────────────────────────────────
  Widget _tableCard() => _SurCard(
    padding: EdgeInsets.zero,
    child: Column(children: [
      // Table header info
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(children: [
          Icon(Icons.table_rows_rounded, size: 15, color: kCrmPrimary),
          const SizedBox(width: 8),
          Text('${_rows.length} éléments affichés sur $_total',
              style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmTextSub)),
        ]),
      ),
      Container(height: 1, color: _kDivider),
      // Actual table
      LayoutBuilder(builder: (_, c) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: ConstrainedBox(
          constraints: BoxConstraints(minWidth: c.maxWidth),
          child: _buildDataTable(),
        ),
      )),
    ]),
  );

  Widget _buildDataTable() {
    final showUserCols = _isAdmin;
    return Theme(
      // ⬇ Override divider color — removes thick black borders
      data: Theme.of(context).copyWith(
        dividerColor: _kDivider,
        dividerTheme: const DividerThemeData(color: _kDivider, thickness: 0.5),
      ),
      child: DataTable(
        dividerThickness: 0.5,
        columnSpacing: 24,
        horizontalMargin: 20,
        dataRowMinHeight: 56,
        dataRowMaxHeight: 64,
        headingRowColor: WidgetStateProperty.all(_kHeader),
        dataRowColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.hovered)) return _kRowHover;
          return Colors.white;
        }),
        headingTextStyle: tInter(
          fontSize: 10, fontWeight: FontWeight.w700,
          color: kCrmTextSub, letterSpacing: 0.6,
        ),
        columns: [
          const DataColumn(label: Text('NOM')),
          const DataColumn(label: Text('FAMILLE')),
          const DataColumn(label: Text('DIAMETER')),
          const DataColumn(label: Text('TYPE')),
          if (showUserCols) const DataColumn(label: Text('UTILISATEUR')),
          if (showUserCols) const DataColumn(label: Text('EMAIL')),
          const DataColumn(label: Text('DATE')),
          const DataColumn(label: Text('STATUT')),
          const DataColumn(label: Text('VALIDATION')),
          const DataColumn(label: Text('ACTIONS')),
        ],
        rows: _rows.map((r) => _buildRow(r, showUserCols)).toList(),
      ),
    );
  }

  DataRow _buildRow(_Row r, bool showUserCols) {
    return DataRow(cells: [
      // Nom + avatar
      DataCell(_AvatarNameCell(name: r.name, archived: r.isArchived)),
      // Product Family (read-only)
      DataCell(Text(productFamilyLabel(r.raw['productFamily'] as String?),
          style: tInter(fontSize: 12, color: kCrmTextSub))),
      // Diameter (read-only)
      DataCell(Text(
          diameterLabel(r.raw['diameterMm'] is num ? (r.raw['diameterMm'] as num).toInt() : null),
          style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText))),
      // Type badge
      DataCell(_TypeBadge(type: r.type)),
      // Utilisateur (admin only)
      if (showUserCols)
        DataCell(SizedBox(
          width: 120,
          child: Text(r.ownerName.isEmpty ? '—' : r.ownerName,
              style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText),
              overflow: TextOverflow.ellipsis),
        )),
      // Email (admin only)
      if (showUserCols)
        DataCell(SizedBox(
          width: 180,
          child: Text(r.ownerEmail.isEmpty ? '—' : r.ownerEmail,
              style: tInter(fontSize: 11, color: kCrmTextSub),
              overflow: TextOverflow.ellipsis),
        )),
      // Date
      DataCell(Text(_fmtDate(r.createdAt),
          style: tInter(fontSize: 11, color: kCrmTextSub))),
      // Statut
      DataCell(_StatusBadge(status: r.status)),
      // Validation
      DataCell(_ValidationBadge(status: r.validation)),
      // Actions
      DataCell(Row(mainAxisSize: MainAxisSize.min, children: [
        _Btn(
          icon: Icons.timeline_rounded, color: kCrmPrimary, tooltip: 'Timeline',
          onTap: r.isArchived ? null : () => context.go('/forms/project-timeline?projectId=${r.id}'),
        ),
        const SizedBox(width: 4),
        _Btn(
          icon: Icons.edit_rounded, color: kCrmSecondary, tooltip: 'Modifier',
          onTap: r.isArchived ? null : () => context.go(_editUrl(r.id)),
        ),
      ])),
    ]);
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  Widget _pagination() => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      _PageBtn(
        label: 'Précédent',
        icon: Icons.chevron_left_rounded,
        leading: true,
        onTap: _page > 1 ? () { setState(() => _page--); _load(); } : null,
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Text('$_page / $_totalPages',
            style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: kCrmTextSub)),
      ),
      _PageBtn(
        label: 'Suivant',
        icon: Icons.chevron_right_rounded,
        leading: false,
        onTap: _page < _totalPages ? () { setState(() => _page++); _load(); } : null,
      ),
    ],
  );

  String _editUrl(String id) => Uri(
    path: MyRoute.projectFormScreen, queryParameters: {'id': id},
  ).toString();
}

// ══════════════════════════════════════════════════════════════════════════════
// CELL WIDGETS
// ══════════════════════════════════════════════════════════════════════════════
class _AvatarNameCell extends StatelessWidget {
  final String name;
  final bool   archived;
  const _AvatarNameCell({required this.name, required this.archived});

  @override
  Widget build(BuildContext context) {
    final color = _avatarColor(name);
    final ini   = _initials(name);
    return Row(children: [
      Container(
        width: 34, height: 34,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color.withValues(alpha: 0.7), color],
            begin: Alignment.topLeft, end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: Text(ini, style: tInter(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white)),
      ),
      const SizedBox(width: 10),
      Flexible(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              name.isEmpty ? '—' : name,
              style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: kCrmText),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (archived)
              Container(
                margin: const EdgeInsets.only(top: 3),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: kCrmTextSub.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text('Archivé',
                    style: tInter(fontSize: 9, fontWeight: FontWeight.w700, color: kCrmTextSub),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ),
          ],
        ),
      ),
    ]);
  }
}

class _TypeBadge extends StatelessWidget {
  final String type;
  const _TypeBadge({required this.type});
  @override
  Widget build(BuildContext context) {
    final color = _typeColor(type);
    final label = _typeLabel(type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(label, style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});
  @override
  Widget build(BuildContext context) {
    final color = _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        status.isEmpty ? '—' : status,
        style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: color),
      ),
    );
  }
}

class _ValidationBadge extends StatelessWidget {
  final String status;
  const _ValidationBadge({required this.status});
  @override
  Widget build(BuildContext context) {
    final color = _validationColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        status.isEmpty ? '—' : status,
        style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: color),
      ),
    );
  }
}

class _Btn extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback? onTap;
  const _Btn({required this.icon, required this.color, required this.tooltip, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final active = onTap != null;
    return Tooltip(
      message: active ? tooltip : 'Archivé',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 32, height: 32,
          decoration: BoxDecoration(
            color: active ? color.withValues(alpha: 0.08) : kCrmBg,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Icon(icon, size: 15, color: active ? color : kCrmBorder),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED SMALL WIDGETS
// ══════════════════════════════════════════════════════════════════════════════
class _SurCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const _SurCard({required this.child, this.padding = EdgeInsets.zero});
  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: const Color(0xFFEEF2F7), width: 1),
      boxShadow: [
        BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 3)),
      ],
    ),
    child: child,
  );
}

class _Kpi extends StatelessWidget {
  final String label;
  final int value;
  final IconData icon;
  final Color color;
  const _Kpi({required this.label, required this.value, required this.icon, required this.color});
  @override
  Widget build(BuildContext context) => Expanded(
    child: _SurCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(9),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 17, color: color),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('$value',
                style: tInter(fontSize: 20, fontWeight: FontWeight.w900, color: kCrmText),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            Text(label,
                style: tInter(fontSize: 11, color: kCrmTextSub),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ],
        )),
      ]),
    ),
  );
}

class _Pill extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _Pill({required this.icon, required this.label, required this.color, required this.onTap});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 6),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 5),
          Text(label, style: tInter(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        ]),
      ),
    ),
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// USER DROPDOWN (admin only)
// ══════════════════════════════════════════════════════════════════════════════
class _UserDropdown extends StatelessWidget {
  final List<_UserEntry>  users;
  final bool              loading;
  final String?           value;
  final Map<String, int>  projectCounts;
  final ValueChanged<String?> onChanged;

  const _UserDropdown({
    required this.users,
    required this.loading,
    required this.value,
    required this.projectCounts,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          color: kCrmBg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _kDivider),
        ),
        child: Row(children: [
          const SizedBox(
            width: 14, height: 14,
            child: CircularProgressIndicator(strokeWidth: 2, color: kCrmPrimary),
          ),
          const SizedBox(width: 10),
          Text('Chargement des utilisateurs...',
              style: tInter(fontSize: 13, color: kCrmTextSub)),
        ]),
      );
    }

    final allItems = <DropdownMenuItem<String?>>[
      DropdownMenuItem<String?>(
        value: null,
        child: Text('Tous les utilisateurs',
            style: tInter(fontSize: 13, color: kCrmTextSub)),
      ),
      ...users.map((u) {
        final count = projectCounts[u.id];
        final color = _avatarColor(u.name);
        return DropdownMenuItem<String?>(
          value: u.id,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(children: [
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Text(
                  _initials(u.name),
                  style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: color),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  u.name,
                  style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: kCrmText),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (count != null)
                Container(
                  margin: const EdgeInsets.only(left: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '$count projet${count != 1 ? 's' : ''}',
                    style: tInter(fontSize: 9, fontWeight: FontWeight.w700, color: color),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ]),
          ),
        );
      }),
    ];

    return DropdownButtonFormField<String?>(
      value: value,
      isExpanded: true,
      itemHeight: null,
      decoration: InputDecoration(
        // labelText supprimé intentionnellement : avec OutlineInputBorder,
        // le label inline occupe ~24px quand value==null, réduisant la zone
        // de contenu à exactement 24px → overflow garanti sur Column(name+email).
        prefixIcon: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Icon(Icons.person_outline_rounded, size: 18, color: kCrmTextSub),
        ),
        filled: true,
        fillColor: kCrmBg,
        constraints: const BoxConstraints(minHeight: 52),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _kDivider),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _kDivider),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: kCrmPrimary, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      ),
      style: tInter(fontSize: 13, color: kCrmText),
      hint: Row(children: [
        const SizedBox(width: 4),
        Text('Tous les utilisateurs', style: tInter(fontSize: 13, color: kCrmTextSub)),
      ]),
      selectedItemBuilder: (context) => [
        // null → "Tous les utilisateurs"
        Align(
          alignment: Alignment.centerLeft,
          child: Text('Tous les utilisateurs',
              style: tInter(fontSize: 13, color: kCrmTextSub)),
        ),
        ...users.map((u) {
          final count = projectCounts[u.id];
          final color = _avatarColor(u.name);
          final isSelected = u.id == value;
          return Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 30, height: 30,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Text(
                  _initials(u.name),
                  style: tInter(fontSize: 11, fontWeight: FontWeight.w800, color: color),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  u.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tInter(fontSize: 14, fontWeight: FontWeight.w600, color: kCrmText),
                ),
              ),
              if (count != null && isSelected)
                Container(
                  margin: const EdgeInsets.only(left: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '$count projets',
                    style: tInter(fontSize: 10, fontWeight: FontWeight.w700, color: color),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          );
        }),
      ],
      items: allItems,
      onChanged: onChanged,
    );
  }
}

class _SearchField extends StatelessWidget {
  final TextEditingController ctrl;
  const _SearchField({required this.ctrl});
  @override
  Widget build(BuildContext context) => TextField(
    controller: ctrl,
    decoration: InputDecoration(
      hintText: 'Recherche par nom, type, utilisateur...',
      hintStyle: tInter(fontSize: 13, color: kCrmTextSub),
      prefixIcon: Icon(Icons.search_rounded, size: 18, color: kCrmTextSub),
      filled: true, fillColor: kCrmBg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kDivider)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kDivider)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmPrimary, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(vertical: 10),
    ),
    style: tInter(fontSize: 13, color: kCrmText),
  );
}

class _Drop<T> extends StatelessWidget {
  final String label, none;
  final T value;
  final List<String> items;
  final ValueChanged<T?> onChanged;
  const _Drop({required this.label, required this.none, required this.value, required this.items, required this.onChanged});
  @override
  Widget build(BuildContext context) => DropdownButtonFormField<T>(
    value: value,
    decoration: InputDecoration(
      labelText: label,
      labelStyle: tInter(fontSize: 11, color: kCrmTextSub),
      filled: true, fillColor: kCrmBg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kDivider)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _kDivider)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    ),
    style: tInter(fontSize: 13, color: kCrmText),
    items: [
      DropdownMenuItem<T>(value: null as T, child: Text(none, style: tInter(fontSize: 13, color: kCrmTextSub))),
      ...items.map((s) => DropdownMenuItem<T>(value: s as T, child: Text(s, style: tInter(fontSize: 13, color: kCrmText)))),
    ],
    onChanged: onChanged,
  );
}

class _DateBtn extends StatelessWidget {
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onPick;
  final VoidCallback onClear;
  const _DateBtn({required this.label, required this.value, required this.onPick, required this.onClear});
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: () async {
      final d = await showDatePicker(
        context: context,
        initialDate: value ?? DateTime.now(),
        firstDate: DateTime(2020), lastDate: DateTime(2031),
      );
      if (d != null) onPick(d);
    },
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: kCrmBg, borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _kDivider),
      ),
      child: Row(children: [
        Icon(Icons.calendar_today_rounded, size: 14, color: kCrmTextSub),
        const SizedBox(width: 8),
        Expanded(child: Text(
          value != null ? DateFormat('dd/MM/yyyy').format(value!) : label,
          style: tInter(fontSize: 13, color: value != null ? kCrmText : kCrmTextSub),
          overflow: TextOverflow.ellipsis,
        )),
        if (value != null) GestureDetector(
          onTap: onClear,
          child: Icon(Icons.close_rounded, size: 14, color: kCrmTextSub),
        ),
      ]),
    ),
  );
}

class _PageBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool leading;
  final VoidCallback? onTap;
  const _PageBtn({required this.label, required this.icon, required this.leading, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final active = onTap != null;
    final c      = active ? kCrmPrimary : kCrmBorder;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: active ? Colors.white : kCrmBg,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: _kDivider),
          boxShadow: active
              ? [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 4, offset: const Offset(0, 2))]
              : null,
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (leading) Icon(icon, size: 16, color: c),
          if (leading) const SizedBox(width: 4),
          Text(label, style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: active ? kCrmText : kCrmTextSub)),
          if (!leading) const SizedBox(width: 4),
          if (!leading) Icon(icon, size: 16, color: c),
        ]),
      ),
    );
  }
}

// ── Global helpers ────────────────────────────────────────────────────────────
String _fmtDate(String v) {
  if (v.isEmpty) return '';
  try { return DateFormat('dd/MM/yyyy').format(DateTime.parse(v)); }
  catch (_) { return v; }
}

// Safe field read from raw JSON map
String _sf(dynamic v) =>
    (v == null || v.toString().trim().isEmpty) ? '' : v.toString().trim();
