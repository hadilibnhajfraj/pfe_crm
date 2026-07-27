// lib/dashboard/academic/widgets/relances_followup_section.dart
// Section Relances — cartes CRM directes · pagination · actions Voir Projet + Timeline

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const _kCard   = Colors.white;
const _kBg     = Color(0xFFF8FAFC);
const _kBorder = Color(0xFFE2E8F0);
const _kText   = Color(0xFF1E293B);
const _kMuted  = Color(0xFF64748B);
const _cAccent = Color(0xFF4F46E5);

const _cLate   = Color(0xFFEF4444);
const _cToday  = Color(0xFFF97316);
const _cSoon   = Color(0xFF3B82F6);
const _cFuture = Color(0xFF94A3B8);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
String _sf(dynamic v) =>
    (v == null || v.toString().trim().isEmpty) ? '' : v.toString().trim();

double _nd(dynamic v) =>
    v is num ? v.toDouble() : double.tryParse(_sf(v)) ?? 0;

Color _hexC(String? hex) {
  if (hex == null || hex.isEmpty) return const Color(0xFF6366F1);
  try { return Color(int.parse('FF${hex.replaceAll('#', '')}', radix: 16)); }
  catch (_) { return const Color(0xFF6366F1); }
}

String _fmtDate(String v) {
  if (v.isEmpty) return '';
  try { return DateFormat('dd/MM/yyyy').format(DateTime.parse(v)); }
  catch (_) { return v; }
}

Color _stageColor(String s) {
  final l = s.toLowerCase();
  if (l.contains('identif'))    return const Color(0xFF6B7280);
  if (l.contains('prospect'))   return const Color(0xFF3B82F6);
  if (l.contains('contact'))    return const Color(0xFF0EA5E9);
  if (l.contains('visite'))     return const Color(0xFF6366F1);
  if (l.contains('plan'))       return const Color(0xFF8B5CF6);
  if (l.contains('echant'))     return const Color(0xFF14B8A6);
  if (l.contains('devis'))      return const Color(0xFFF59E0B);
  if (l.contains('nego'))       return const Color(0xFFF97316);
  if (l.contains('gagn') || (l.contains('valid') && !l.contains('non')))
    return const Color(0xFF22C55E);
  if (l.contains('perd') || l.contains('refus') || l.contains('non val'))
    return const Color(0xFFEF4444);
  if (l.contains('commande'))   return const Color(0xFF8B5CF6);
  if (l.contains('attente'))    return const Color(0xFFF59E0B);
  return const Color(0xFF94A3B8);
}

Color _valColor(String s) {
  final l = s.toLowerCase();
  if (l.contains('valid') && !l.contains('non')) return const Color(0xFF22C55E);
  if (l.contains('non') || l.contains('refus'))  return const Color(0xFFEF4444);
  if (l.contains('attente'))                     return const Color(0xFFF59E0B);
  return const Color(0xFF94A3B8);
}

String _ownerOf(dynamic p) {
  final u = p['user']  is Map ? p['user']  as Map :
            p['owner'] is Map ? p['owner'] as Map : <dynamic, dynamic>{};
  return _sf(u['nom'] ?? u['name'] ?? u['prenom'] ??
             p['userNom'] ?? p['userName'] ?? p['ownerName'] ?? '');
}

String _stageNameOf(dynamic p) {
  final m = p['pipelineStage'] is Map ? p['pipelineStage'] as Map : null;
  return _sf(m?['name'] ??
      (p['pipelineStage'] is String ? p['pipelineStage'] : null) ??
      p['etapeCRM'] ?? p['stage'] ?? '');
}

Color _stageColorOf(dynamic p) {
  final m = p['pipelineStage'] is Map ? p['pipelineStage'] as Map : null;
  if (m?['color'] != null) return _hexC(_sf(m!['color']));
  return _stageColor(_stageNameOf(p));
}

String _dateRawOf(dynamic p) => _sf(
  p['dateRelance'] ?? p['prochaineRelance'] ?? p['nextRelanceAt'] ??
  p['followupDate'] ?? p['nextActionDate'] ?? '',
);

int _daysOf(dynamic p) {
  final raw = (p['daysUntil'] as num?)?.toInt();
  if (raw != null) return raw;
  final dt = DateTime.tryParse(_dateRawOf(p));
  if (dt == null) return 9999;
  final now = DateTime.now();
  return DateTime(dt.year, dt.month, dt.day)
      .difference(DateTime(now.year, now.month, now.day))
      .inDays;
}

bool _isLate(dynamic p)  => (p['isLate'] as bool?) ?? _daysOf(p) < 0;
bool _isToday(dynamic p) => !_isLate(p) && _daysOf(p) == 0;
bool _isWeek(dynamic p)  { final d = _daysOf(p); return !_isLate(p) && !_isToday(p) && d >= 1 && d <= 7; }

Color _tColor(dynamic p) {
  if (_isLate(p))  return _cLate;
  if (_isToday(p)) return _cToday;
  if (_isWeek(p))  return _cSoon;
  return _cFuture;
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET PRINCIPAL — pas de filtres, pas de recherche, pas de statistiques
// ─────────────────────────────────────────────────────────────────────────────
class RelancesFollowupSection extends StatefulWidget {
  const RelancesFollowupSection({
    super.key,
    required this.items,
    required this.isAdmin,
  });

  final List<dynamic> items;
  final bool isAdmin;

  @override
  State<RelancesFollowupSection> createState() =>
      _RelancesFollowupSectionState();
}

class _RelancesFollowupSectionState extends State<RelancesFollowupSection> {
  static const int _pageSize = 10;

  // Pagination par groupe (clé = owner ou '_global')
  final Map<String, int> _pages = {};

  // ── Computed ────────────────────────────────────────────────────────────────

  // Groupement par commercial pour vue admin — trié par nb de relances desc
  Map<String, List<dynamic>> get _grouped {
    final map = <String, List<dynamic>>{};
    for (final p in widget.items) {
      final k = _ownerOf(p);
      map.putIfAbsent(k.isEmpty ? '(Non assigné)' : k, () => []).add(p);
    }
    final sorted = map.entries.toList()
      ..sort((a, b) => b.value.length.compareTo(a.value.length));
    return Map.fromEntries(sorted);
  }

  int  _page(String key)       => _pages[key] ?? 0;
  int  _totalPages(int n)      => (n / _pageSize).ceil().clamp(1, 9999);
  void _setPage(String k, int p) => setState(() => _pages[k] = p);

  // ── BUILD ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) return _empty();
    return widget.isAdmin ? _adminView(context) : _userView(context);
  }

  // ── Vue admin : groupée par commercial ───────────────────────────────────

  Widget _adminView(BuildContext context) {
    final groups = _grouped;
    if (groups.isEmpty) return _empty();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: groups.entries.toList().asMap().entries.map((en) {
        final owner = en.value.key;
        final list  = en.value.value;
        final cnt   = list.length;
        final page  = _page(owner);
        final total = _totalPages(cnt);
        final start = page * _pageSize;
        final end   = (start + _pageSize).clamp(0, cnt);

        return Padding(
          padding: const EdgeInsets.only(bottom: 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _groupHeader(owner, cnt),
            const SizedBox(height: 12),
            _cardGrid(context, list.sublist(start, end)),
            if (total > 1) ...[
              const SizedBox(height: 8),
              _pagination(owner, page, total),
            ],
            const SizedBox(height: 8),
            const Divider(height: 1, thickness: 0.8, color: Color(0xFFEFF2F7)),
          ]),
        );
      }).toList(),
    );
  }

  // ── Vue utilisateur : flat paginée ───────────────────────────────────────

  Widget _userView(BuildContext context) {
    final list  = widget.items;
    final cnt   = list.length;
    final page  = _page('_g');
    final total = _totalPages(cnt);
    final start = page * _pageSize;
    final end   = (start + _pageSize).clamp(0, cnt);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _cardGrid(context, list.sublist(start, end)),
      if (total > 1) ...[
        const SizedBox(height: 8),
        _pagination('_g', page, total),
      ],
    ]);
  }

  // ── En-tête groupe commercial ─────────────────────────────────────────────

  Widget _groupHeader(String owner, int cnt) {
    const palette = [_cAccent, Color(0xFF22C55E), Color(0xFF3B82F6),
                     Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFF8B5CF6)];
    final color = palette[owner.hashCode.abs() % palette.length];
    final init  = owner.isNotEmpty ? owner.trim()[0].toUpperCase() : '?';

    return Row(children: [
      Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(9),
        ),
        alignment: Alignment.center,
        child: Text(init, style: TextStyle(fontFamily: 'InterTight',
            fontSize: 14, fontWeight: FontWeight.w800, color: color)),
      ),
      const SizedBox(width: 10),
      Expanded(child: Text('👤 $owner',
        style: const TextStyle(fontFamily: 'InterTight', fontSize: 14,
            fontWeight: FontWeight.w700, color: _kText),
        maxLines: 1, overflow: TextOverflow.ellipsis)),
      const SizedBox(width: 8),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: const Color(0xFFEEF2FF),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text('$cnt relance${cnt != 1 ? 's' : ''}',
          style: const TextStyle(fontFamily: 'InterTight', fontSize: 12,
              fontWeight: FontWeight.w700, color: _cAccent)),
      ),
    ]);
  }

  // ── Grille responsive de cartes ──────────────────────────────────────────

  Widget _cardGrid(BuildContext context, List<dynamic> items) {
    return LayoutBuilder(builder: (_, box) {
      final w = box.maxWidth;

      if (w > 900) {
        return Column(children: items.map((p) =>
            _card(context, p, wide: true)).toList());
      }

      if (w > 560) {
        final rows = <Widget>[];
        for (int i = 0; i < items.length; i += 2) {
          rows.add(IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(child: _card(context, items[i], wide: false)),
              const SizedBox(width: 10),
              Expanded(child: i + 1 < items.length
                  ? _card(context, items[i + 1], wide: false)
                  : const SizedBox()),
            ]),
          ));
          if (i + 2 < items.length) rows.add(const SizedBox(height: 8));
        }
        return Column(children: rows);
      }

      return Column(children: items.map((p) =>
          _card(context, p, wide: false)).toList());
    });
  }

  // ── Carte individuelle ────────────────────────────────────────────────────

  Widget _card(BuildContext context, dynamic p, {required bool wide}) {
    final id        = _sf(p['_id'] ?? p['id'] ?? p['projectId'] ?? '');
    final nom       = _sf(p['nomProjet'] ?? p['name'] ?? '');
    final owner     = _ownerOf(p);
    final stageName = _stageNameOf(p);
    final stageClr  = _stageColorOf(p);
    final valStatut = _sf(p['validationStatut'] ?? p['statut'] ?? '');
    final dateStr   = _fmtDate(_dateRawOf(p));
    final priority  = _sf(p['priority'] ?? p['priorite'] ?? '');
    final surface   = _nd(p['surfaceProspectee']);
    final pctReuss  = _nd(p['pourcentageReussite']);

    final tc   = _tColor(p);
    final late = _isLate(p);
    final days = _daysOf(p);

    final tLabel = late
        ? 'Retard ${days.abs()}j'
        : _isToday(p)
            ? "Aujourd'hui"
            : days < 9999 ? 'Dans ${days}j' : '—';

    Color cardBg, cardBorder;
    if (late) {
      cardBg = const Color(0xFFFEF2F2); cardBorder = _cLate.withOpacity(0.28);
    } else if (_isToday(p)) {
      cardBg = const Color(0xFFFFF7ED); cardBorder = _cToday.withOpacity(0.28);
    } else if (_isWeek(p)) {
      cardBg = const Color(0xFFEFF6FF); cardBorder = _cSoon.withOpacity(0.28);
    } else {
      cardBg = _kBg; cardBorder = _kBorder;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: cardBorder, width: 1.2),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03),
            blurRadius: 7, offset: const Offset(0, 3))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // Barre timing latérale colorée
            Container(
              width: 4,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter, end: Alignment.bottomCenter,
                  colors: [tc, tc.withOpacity(0.35)]),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(13),
                child: wide
                    ? _bodyWide(context, id, nom, owner, stageName, stageClr,
                        valStatut, dateStr, priority, surface, pctReuss, tc, tLabel, late)
                    : _bodyNarrow(context, id, nom, owner, stageName, stageClr,
                        valStatut, dateStr, priority, surface, pctReuss, tc, tLabel, late),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  // ── Corps LARGE (desktop) ─────────────────────────────────────────────────

  Widget _bodyWide(
    BuildContext context, String id, String nom, String owner,
    String stageName, Color stageClr, String valStatut, String dateStr,
    String priority, double surface, double pct, Color tc,
    String tLabel, bool late,
  ) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Row(children: [
      _timingBadge(tLabel, tc, late),
      const SizedBox(width: 8),
      if (stageName.isNotEmpty) _stageBadge(stageName, stageClr),
      const Spacer(),
      if (valStatut.isNotEmpty) _valBadge(valStatut),
    ]),
    const SizedBox(height: 9),
    Text(nom.isNotEmpty ? nom : '—',
      style: const TextStyle(fontFamily: 'InterTight', fontSize: 15,
          fontWeight: FontWeight.w800, color: _kText),
      maxLines: 1, overflow: TextOverflow.ellipsis),
    if (owner.isNotEmpty) ...[
      const SizedBox(height: 3),
      Row(children: [
        const Icon(Icons.person_outline_rounded, size: 12, color: _kMuted),
        const SizedBox(width: 4),
        Flexible(child: Text(owner, style: const TextStyle(fontFamily: 'InterTight',
            fontSize: 12, color: _kMuted),
          maxLines: 1, overflow: TextOverflow.ellipsis)),
      ]),
    ],
    const SizedBox(height: 8),
    Wrap(spacing: 14, runSpacing: 5, children: [
      if (dateStr.isNotEmpty) _metaChip(Icons.calendar_today_rounded, dateStr, tc),
      if (priority.isNotEmpty) _priorityBadge(priority),
      if (surface > 0) _metaChip(Icons.square_foot_rounded,
          '${surface.toStringAsFixed(0)} m²', const Color(0xFF7C3AED)),
      if (pct > 0) _metaChip(Icons.percent_rounded,
          '${pct.toStringAsFixed(0)}%', const Color(0xFF059669)),
    ]),
    const SizedBox(height: 10),
    const Divider(height: 1, color: Color(0xFFEFF2F7)),
    const SizedBox(height: 8),
    _actions(context, id),
  ]);

  // ── Corps ÉTROIT (tablette / mobile) ─────────────────────────────────────

  Widget _bodyNarrow(
    BuildContext context, String id, String nom, String owner,
    String stageName, Color stageClr, String valStatut, String dateStr,
    String priority, double surface, double pct, Color tc,
    String tLabel, bool late,
  ) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Row(children: [
      _timingBadge(tLabel, tc, late),
      const Spacer(),
      if (stageName.isNotEmpty) _stageBadge(stageName, stageClr),
    ]),
    const SizedBox(height: 7),
    Text(nom.isNotEmpty ? nom : '—',
      style: const TextStyle(fontFamily: 'InterTight', fontSize: 14,
          fontWeight: FontWeight.w700, color: _kText),
      maxLines: 2, overflow: TextOverflow.ellipsis),
    if (owner.isNotEmpty) ...[
      const SizedBox(height: 3),
      Row(children: [
        const Icon(Icons.person_outline_rounded, size: 11, color: _kMuted),
        const SizedBox(width: 4),
        Flexible(child: Text(owner, style: const TextStyle(fontFamily: 'InterTight',
            fontSize: 11, color: _kMuted),
          maxLines: 1, overflow: TextOverflow.ellipsis)),
      ]),
    ],
    const SizedBox(height: 7),
    Wrap(spacing: 5, runSpacing: 4, children: [
      if (valStatut.isNotEmpty) _valBadge(valStatut),
      if (dateStr.isNotEmpty)   _metaChip(Icons.calendar_today_rounded, dateStr, tc),
      if (priority.isNotEmpty)  _priorityBadge(priority),
    ]),
    if (surface > 0 || pct > 0) ...[
      const SizedBox(height: 5),
      Wrap(spacing: 5, runSpacing: 4, children: [
        if (surface > 0) _metaChip(Icons.square_foot_rounded,
            '${surface.toStringAsFixed(0)} m²', const Color(0xFF7C3AED)),
        if (pct > 0) _metaChip(Icons.percent_rounded,
            '${pct.toStringAsFixed(0)}%', const Color(0xFF059669)),
      ]),
    ],
    const SizedBox(height: 8),
    const Divider(height: 1, color: Color(0xFFEFF2F7)),
    const SizedBox(height: 7),
    _actions(context, id),
  ]);

  // ── Boutons Voir Projet + Timeline ────────────────────────────────────────

  Widget _actions(BuildContext context, String id) {
    if (id.isEmpty) return const SizedBox.shrink();
    return Row(children: [
      _actionBtn('Voir Projet', Icons.visibility_rounded,
          const Color(0xFF2563EB), filled: true,
          onTap: () => context.push('/forms/project?id=$id')),
      const SizedBox(width: 8),
      _actionBtn('Timeline', Icons.timeline_rounded,
          const Color(0xFF7C3AED),
          onTap: () => context.push('/forms/project-timeline?projectId=$id')),
    ]);
  }

  Widget _actionBtn(String label, IconData icon, Color color,
      {bool filled = false, required VoidCallback onTap}) =>
    Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color:  filled ? color : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: filled ? null : Border.all(color: color.withOpacity(0.38)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 13, color: filled ? Colors.white : color),
            const SizedBox(width: 5),
            Text(label, style: TextStyle(fontFamily: 'InterTight', fontSize: 11,
                fontWeight: FontWeight.w700,
                color: filled ? Colors.white : color)),
          ]),
        ),
      ),
    );

  // ── Pagination ────────────────────────────────────────────────────────────

  Widget _pagination(String key, int page, int pages) => Container(
    padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 12),
    decoration: BoxDecoration(
      color: _kCard,
      borderRadius: BorderRadius.circular(11),
      border: Border.all(color: _kBorder),
    ),
    child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
      _pageBtn('Précédent', Icons.chevron_left_rounded,
          page > 0, () => _setPage(key, page - 1)),
      const SizedBox(width: 12),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        decoration: BoxDecoration(
          color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(20)),
        child: Text('Page ${page + 1} / $pages',
          style: const TextStyle(fontFamily: 'InterTight', fontSize: 12,
              fontWeight: FontWeight.w700, color: _cAccent)),
      ),
      const SizedBox(width: 12),
      _pageBtn('Suivant', Icons.chevron_right_rounded,
          page + 1 < pages, () => _setPage(key, page + 1), right: true),
    ]),
  );

  Widget _pageBtn(String label, IconData icon, bool on,
      VoidCallback cb, {bool right = false}) {
    final c = on ? _cAccent : _kMuted.withOpacity(0.35);
    final child = right
        ? Row(mainAxisSize: MainAxisSize.min, children: [
            Text(label, style: TextStyle(fontFamily: 'InterTight',
                fontSize: 12, fontWeight: FontWeight.w600, color: c)),
            const SizedBox(width: 4),
            Icon(icon, size: 18, color: c),
          ])
        : Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 18, color: c),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(fontFamily: 'InterTight',
                fontSize: 12, fontWeight: FontWeight.w600, color: c)),
          ]);
    return on
        ? InkWell(onTap: cb, borderRadius: BorderRadius.circular(8),
            child: Padding(padding: const EdgeInsets.symmetric(
                horizontal: 7, vertical: 4), child: child))
        : Padding(padding: const EdgeInsets.symmetric(
            horizontal: 7, vertical: 4), child: child);
  }

  // ── Micro badges ─────────────────────────────────────────────────────────

  Widget _timingBadge(String label, Color color, bool late) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(
      color: color.withOpacity(0.12),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: color.withOpacity(0.38)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(late ? Icons.warning_amber_rounded : Icons.schedule_rounded,
          size: 11, color: color),
      const SizedBox(width: 4),
      Text(label, style: TextStyle(fontFamily: 'InterTight', fontSize: 11,
          fontWeight: FontWeight.w800, color: color)),
    ]),
  );

  Widget _stageBadge(String name, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: color.withOpacity(0.25)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 5, height: 5,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 5),
      Text(name, style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
          fontWeight: FontWeight.w700, color: color),
        maxLines: 1, overflow: TextOverflow.ellipsis),
    ]),
  );

  Widget _valBadge(String s) {
    final c = _valColor(s);
    final l = s.toLowerCase();
    final icon = l.contains('valid') && !l.contains('non')
        ? Icons.check_circle_rounded
        : l.contains('non') || l.contains('refus')
            ? Icons.cancel_rounded
            : Icons.hourglass_top_rounded;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: c.withOpacity(0.08),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: c.withOpacity(0.20)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 10, color: c),
        const SizedBox(width: 3),
        Text(s, style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
            fontWeight: FontWeight.w700, color: c)),
      ]),
    );
  }

  Widget _metaChip(IconData icon, String label, Color color) =>
    Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
            color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
        child: Icon(icon, size: 10, color: color),
      ),
      const SizedBox(width: 4),
      Text(label, style: const TextStyle(fontFamily: 'InterTight',
          fontSize: 11, fontWeight: FontWeight.w600, color: _kMuted)),
    ]);

  Widget _priorityBadge(String p) {
    final l = p.toLowerCase();
    Color c; IconData icon;
    if (l == 'high' || l == 'haute' || l == 'élevée') {
      c = _cLate; icon = Icons.keyboard_double_arrow_up_rounded;
    } else if (l == 'medium' || l == 'moyenne') {
      c = _cToday; icon = Icons.remove_rounded;
    } else {
      c = const Color(0xFF22C55E); icon = Icons.keyboard_double_arrow_down_rounded;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
          color: c.withOpacity(0.1), borderRadius: BorderRadius.circular(11)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 10, color: c), const SizedBox(width: 3),
        Text(p, style: TextStyle(fontFamily: 'InterTight', fontSize: 10,
            fontWeight: FontWeight.w700, color: c)),
      ]),
    );
  }

  Widget _empty() => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.event_busy_rounded, size: 44, color: Colors.grey[300]),
        const SizedBox(height: 10),
        const Text('Aucune relance',
          style: TextStyle(fontFamily: 'InterTight', fontSize: 14,
              color: _kMuted, fontWeight: FontWeight.w500)),
      ]),
    ),
  );
}
