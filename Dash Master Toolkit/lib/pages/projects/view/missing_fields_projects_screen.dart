// lib/pages/projects/view/missing_fields_projects_screen.dart
// Affiche les projets avec un champ spécifique manquant.
// Appelé depuis les cartes d'alerte du dashboard.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/core/theme/app_text_styles.dart';

const _kBg     = Color(0xFFF8FAFC);
const _kCard   = Colors.white;
const _kBorder = Color(0xFFE2E8F0);
const _kText   = Color(0xFF1E293B);

class MissingFieldsProjectsScreen extends StatefulWidget {
  final String field;
  final String label;

  const MissingFieldsProjectsScreen({
    super.key,
    required this.field,
    required this.label,
  });

  @override
  State<MissingFieldsProjectsScreen> createState() =>
      _MissingFieldsProjectsScreenState();
}

class _MissingFieldsProjectsScreenState
    extends State<MissingFieldsProjectsScreen> {
  bool          _loading  = true;
  List<dynamic> _projects = [];
  String?       _error;

  static const _fieldDisplay = {
    'bureauControle': 'Bureau de contrôle',
    'architecte':     'Architecte',
    'ingenieur':      'Ingénieur responsable',
    'telephone':      'Téléphone',
    'adresse':        'Adresse',
  };

  static const _fieldColors = {
    'bureauControle': Color(0xFFEF4444),
    'architecte':     Color(0xFFF97316),
    'ingenieur':      Color(0xFFF59E0B),
    'telephone':      Color(0xFF8B5CF6),
    'adresse':        Color(0xFF3B82F6),
  };

  static const _fieldIcons = {
    'bureauControle': Icons.domain_disabled_rounded,
    'architecte':     Icons.architecture_rounded,
    'ingenieur':      Icons.engineering_rounded,
    'telephone':      Icons.phone_disabled_rounded,
    'adresse':        Icons.location_off_rounded,
  };

  Color    get _color => _fieldColors[widget.field]  ?? const Color(0xFF4F46E5);
  String   get _displayField => _fieldDisplay[widget.field] ?? widget.field;
  IconData get _icon  => _fieldIcons[widget.field]   ?? Icons.warning_amber_rounded;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiClient.instance.dio.get(
        '/projects/missing-fields',
        queryParameters: {'field': widget.field, 'page': 1, 'limit': 1000},
      );
      final data = res.data;
      List raw = [];
      if (data is Map) {
        raw = (data['items'] ?? data['data'] ?? data['results'] ?? data['docs'] ?? []) as List;
      } else if (data is List) {
        raw = data;
      }
      setState(() => _projects = raw);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  String _sf(dynamic v) =>
      (v == null || v.toString().trim().isEmpty) ? '' : v.toString().trim();

  String _fmtDate(String v) {
    if (v.isEmpty) return '—';
    try {
      return DateFormat('dd/MM/yyyy').format(DateTime.parse(v));
    } catch (_) {
      return v;
    }
  }

  Color _statutColor(String s) {
    final l = s.toLowerCase();
    if (l.contains('valid') && !l.contains('non')) return const Color(0xFF22C55E);
    if (l.contains('non') || l.contains('refus'))  return const Color(0xFFEF4444);
    if (l.contains('attente'))                      return const Color(0xFFF59E0B);
    return const Color(0xFF94A3B8);
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(
                      color: Color(0xFF4F46E5), strokeWidth: 2,
                    ),
                  )
                : _error != null
                    ? _buildError()
                    : _projects.isEmpty
                        ? _buildEmpty()
                        : _buildList(),
          ),
        ],
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────
  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
      decoration: const BoxDecoration(
        color: _kCard,
        border: Border(bottom: BorderSide(color: _kBorder)),
      ),
      child: Row(children: [
        // Back button
        _IconBtn(
          icon: Icons.arrow_back_rounded,
          onTap: () => context.pop(),
        ),
        const SizedBox(width: 14),
        // Field icon
        Container(
          padding: const EdgeInsets.all(9),
          decoration: BoxDecoration(
            color: _color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(_icon, size: 20, color: _color),
        ),
        const SizedBox(width: 12),
        // Title + subtitle
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              'Projets — $_displayField manquant',
              style: AppTextStyles.pageTitle,
            ),
            const SizedBox(height: 2),
            Text(
              _loading
                  ? 'Chargement…'
                  : '${_projects.length} projet${_projects.length > 1 ? 's' : ''} concerné${_projects.length > 1 ? 's' : ''}',
              style: AppTextStyles.bodyMuted,
            ),
          ]),
        ),
        // Count badge
        if (!_loading && _error == null)
          Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              color: _color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '${_projects.length}',
              style: TextStyle(
                fontFamily: 'InterTight',
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: _color,
              ),
            ),
          ),
        // Refresh button
        TextButton.icon(
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded, size: 16),
          label: const Text('Actualiser'),
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFF4F46E5),
            backgroundColor: const Color(0xFFEEF2FF),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            textStyle: const TextStyle(
              fontFamily: 'InterTight', fontSize: 13, fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ]),
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  Widget _buildError() {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, size: 52, color: Color(0xFFEF4444)),
        const SizedBox(height: 14),
        Text('Erreur de chargement', style: AppTextStyles.cardTitle),
        const SizedBox(height: 6),
        Text(
          _error ?? '',
          style: AppTextStyles.bodyMuted,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 18),
        TextButton.icon(
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Réessayer'),
          style: TextButton.styleFrom(foregroundColor: const Color(0xFF4F46E5)),
        ),
      ]),
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  Widget _buildEmpty() {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(
          Icons.check_circle_outline_rounded,
          size: 56,
          color: const Color(0xFF22C55E).withOpacity(0.5),
        ),
        const SizedBox(height: 14),
        Text('Aucun projet concerné', style: AppTextStyles.cardTitle),
        const SizedBox(height: 6),
        Text(
          'Tous les projets ont renseigné le champ "$_displayField".',
          style: AppTextStyles.bodyMuted,
          textAlign: TextAlign.center,
        ),
      ]),
    );
  }

  // ── Projects list ─────────────────────────────────────────────────────────
  Widget _buildList() {
    return RefreshIndicator(
      color: const Color(0xFF4F46E5),
      onRefresh: _load,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Filter chip
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: _color.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _color.withOpacity(0.3)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.filter_alt_rounded, size: 14, color: _color),
                const SizedBox(width: 6),
                Text(
                  'Filtre actif : $_displayField vide',
                  style: TextStyle(
                    fontFamily: 'InterTight',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: _color,
                  ),
                ),
              ]),
            ),
          ]),
          const SizedBox(height: 16),
          // Table card
          Container(
            decoration: BoxDecoration(
              color: _kCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _kBorder, width: 0.8),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 20,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                columnSpacing: 20,
                headingRowHeight: 46,
                dataRowMinHeight: 54,
                dataRowMaxHeight: 66,
                headingRowColor:
                    WidgetStateProperty.all(const Color(0xFFF8FAFC)),
                headingTextStyle: AppTextStyles.tableHeader,
                dividerThickness: 0.5,
                columns: const [
                  DataColumn(label: Text('PROJET')),
                  DataColumn(label: Text('UTILISATEUR')),
                  DataColumn(label: Text('STATUT')),
                  DataColumn(label: Text('DATE CRÉATION')),
                  DataColumn(label: Text('CHAMP MANQUANT')),
                ],
                rows: _projects.map((p) => _buildRow(p)).toList(),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  DataRow _buildRow(dynamic p) {
    final name    = _sf(p['nomProjet'] ?? p['name'] ?? '');
    final userMap = p['user'] is Map ? p['user'] as Map : {};
    final user    = _sf(
      userMap['nom'] ?? userMap['name'] ?? userMap['prenom'] ?? p['userNom'] ?? '',
    );
    final statut  = _sf(p['statut'] ?? p['validationStatut'] ?? '');
    final created = _fmtDate(_sf(p['createdAt'] ?? ''));
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return DataRow(cells: [
      // Projet
      DataCell(Row(children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(
            color: _color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            initial,
            style: TextStyle(
              fontFamily: 'InterTight',
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: _color,
            ),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 160,
          child: Text(
            name.isNotEmpty ? name : '—',
            style: const TextStyle(
              fontFamily: 'InterTight',
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: _kText,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ])),

      // Utilisateur
      DataCell(
        Text(
          user.isNotEmpty ? user : '—',
          style: AppTextStyles.bodyMuted.copyWith(fontSize: 12),
        ),
      ),

      // Statut
      DataCell(
        statut.isEmpty
            ? const Text('—')
            : Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _statutColor(statut).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  statut,
                  style: TextStyle(
                    fontFamily: 'InterTight',
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: _statutColor(statut),
                  ),
                ),
              ),
      ),

      // Date
      DataCell(
        Text(
          created,
          style: AppTextStyles.bodyMuted.copyWith(fontSize: 12),
        ),
      ),

      // Champ manquant badge
      DataCell(
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: _color.withOpacity(0.08),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: _color.withOpacity(0.3)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.warning_amber_rounded, size: 12, color: _color),
            const SizedBox(width: 4),
            Text(
              'Manquant',
              style: TextStyle(
                fontFamily: 'InterTight',
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: _color,
              ),
            ),
          ]),
        ),
      ),
    ]);
  }
}

// ── Small icon button helper ─────────────────────────────────────────────────
class _IconBtn extends StatefulWidget {
  const _IconBtn({required this.icon, required this.onTap});
  final IconData    icon;
  final VoidCallback onTap;

  @override
  State<_IconBtn> createState() => _IconBtnState();
}

class _IconBtnState extends State<_IconBtn> {
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
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: _hovered ? const Color(0xFFE2E8F0) : const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(widget.icon, size: 18, color: const Color(0xFF1E293B)),
        ),
      ),
    );
  }
}
