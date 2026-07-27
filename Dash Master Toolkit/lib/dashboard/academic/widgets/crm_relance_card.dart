// lib/dashboard/academic/widgets/crm_relance_card.dart
// Carte CRM professionnelle (style HubSpot / Salesforce) pour les relances
// Compatible new format {pipelineStage:{name,color}} et legacy {etapeCRM, prochaineRelance}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const _kCard   = Colors.white;
const _kBorder = Color(0xFFE2E8F0);
const _kBg     = Color(0xFFF8FAFC);
const _kText   = Color(0xFF1E293B);
const _kMuted  = Color(0xFF64748B);

const _cLate   = Color(0xFFEF4444);
const _cToday  = Color(0xFFF97316);
const _cSoon   = Color(0xFF3B82F6);
const _cFuture = Color(0xFF64748B);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNES
// ─────────────────────────────────────────────────────────────────────────────

String _sf(dynamic v) =>
    (v == null || v.toString().trim().isEmpty) ? '' : v.toString().trim();

Color _hexColor(String? hex) {
  if (hex == null || hex.isEmpty) return const Color(0xFF6366F1);
  try {
    return Color(int.parse('FF${hex.replaceAll('#', '')}', radix: 16));
  } catch (_) {
    return const Color(0xFF6366F1);
  }
}

Color _priorityColor(String? p) {
  switch ((p ?? '').toLowerCase()) {
    case 'high':
    case 'haute':
    case 'élevée':
      return const Color(0xFFEF4444);
    case 'medium':
    case 'moyenne':
      return const Color(0xFFF97316);
    case 'low':
    case 'basse':
    case 'faible':
      return const Color(0xFF22C55E);
    default:
      return const Color(0xFF94A3B8);
  }
}

String _priorityLabel(String? p) {
  switch ((p ?? '').toLowerCase()) {
    case 'high':
    case 'haute':
    case 'élevée':
      return 'Haute priorité';
    case 'medium':
    case 'moyenne':
      return 'Priorité moy.';
    case 'low':
    case 'basse':
    case 'faible':
      return 'Faible priorité';
    default:
      return '';
  }
}

IconData _priorityIcon(String? p) {
  switch ((p ?? '').toLowerCase()) {
    case 'high':
    case 'haute':
    case 'élevée':
      return Icons.keyboard_double_arrow_up_rounded;
    case 'medium':
    case 'moyenne':
      return Icons.remove_rounded;
    default:
      return Icons.keyboard_double_arrow_down_rounded;
  }
}

Color _valColor(String s) {
  final l = s.toLowerCase();
  if (l.contains('valid') && !l.contains('non')) return const Color(0xFF22C55E);
  if (l.contains('non') || l.contains('refus'))  return const Color(0xFFEF4444);
  if (l.contains('attente'))                     return const Color(0xFFF59E0B);
  return const Color(0xFF94A3B8);
}

IconData _valIcon(String s) {
  final l = s.toLowerCase();
  if (l.contains('valid') && !l.contains('non')) return Icons.check_circle_rounded;
  if (l.contains('non') || l.contains('refus'))  return Icons.cancel_rounded;
  if (l.contains('attente'))                     return Icons.hourglass_top_rounded;
  return Icons.radio_button_unchecked_rounded;
}

String _fmtDate(String v) {
  if (v.isEmpty) return '';
  try {
    return DateFormat('dd/MM/yyyy').format(DateTime.parse(v));
  } catch (_) {
    return v;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/// Carte CRM professionnelle pour une relance.
///
/// Accepte un [data] brut depuis /crm/upcoming-followups.
/// Les callbacks [onViewProject] et [onTimeline] reçoivent le projectId —
/// si non fournis, la carte navigue via go_router.
class CrmRelanceCard extends StatefulWidget {
  const CrmRelanceCard({
    super.key,
    required this.data,
    this.onViewProject,
    this.onTimeline,
  });

  final Map<String, dynamic> data;
  final void Function(String projectId)? onViewProject;
  final void Function(String projectId)? onTimeline;

  @override
  State<CrmRelanceCard> createState() => _CrmRelanceCardState();
}

class _CrmRelanceCardState extends State<CrmRelanceCard> {
  bool _hovered = false;

  // ── Extraction des données ─────────────────────────────────────────────────
  Map<String, dynamic> get _d => widget.data;

  // Priorité : champ "projectId" explicite (nouveau format API), puis _id/id
  String get _projectId =>
      _sf(_d['projectId'] ?? _d['_id'] ?? _d['id'] ?? '');

  String get _nomProjet =>
      _sf(_d['nomProjet'] ?? _d['name'] ?? _d['projectName'] ?? '');

  String get _promoteur =>
      _sf(_d['promoteur'] ?? _d['client'] ?? _d['clientName'] ?? _d['proprietaire'] ?? '');

  String get _priority =>
      _sf(_d['priority'] ?? _d['priorite'] ?? '');

  String get _valStatut =>
      _sf(_d['validationStatut'] ?? _d['statut'] ?? '');

  String get _message =>
      _sf(_d['message'] ?? _d['note'] ?? _d['description'] ?? _d['commentaire'] ?? '');

  // Pipeline stage — new: {name, color} / legacy: string
  Map? get _stageMap =>
      _d['pipelineStage'] is Map ? _d['pipelineStage'] as Map : null;

  String get _stageName => _sf(
    _stageMap?['name'] ??
    (_d['pipelineStage'] is String ? _d['pipelineStage'] : null) ??
    _d['etapeCRM'] ??
    _d['stage'] ??
    '',
  );

  Color get _stageColor =>
      _hexColor(_sf(_stageMap?['color'] ?? ''));

  // Action type — new: {name} / legacy: string
  Map? get _actionMap =>
      _d['actionType'] is Map ? _d['actionType'] as Map : null;

  String get _actionType => _sf(
    _actionMap?['name'] ??
    (_d['actionType'] is String ? _d['actionType'] : null) ??
    _d['typeAction'] ??
    _d['type'] ??
    '',
  );

  // Date — new: dateRelance / legacy: prochaineRelance / nextRelanceAt / …
  String get _dateRaw => _sf(
    _d['dateRelance'] ??
    _d['prochaineRelance'] ??
    _d['nextRelanceAt'] ??
    _d['followupDate'] ??
    _d['nextActionDate'] ??
    '',
  );

  String get _dateStr => _fmtDate(_dateRaw);

  // Timing
  int get _daysUntil =>
      (_d['daysUntil'] as num?)?.toInt() ?? _computeDays();

  bool get _isLate  => (_d['isLate'] as bool?) ?? _daysUntil < 0;
  bool get _isToday => !_isLate && _daysUntil == 0;

  int _computeDays() {
    final dt = DateTime.tryParse(_dateRaw);
    if (dt == null) return 999;
    final now = DateTime.now();
    return DateTime(dt.year, dt.month, dt.day)
        .difference(DateTime(now.year, now.month, now.day))
        .inDays;
  }

  // ── Timing helpers ─────────────────────────────────────────────────────────
  Color get _timingColor {
    if (_isLate)          return _cLate;
    if (_isToday)         return _cToday;
    if (_daysUntil <= 7)  return _cSoon;
    return _cFuture;
  }

  String get _timingLabel {
    if (_isLate)  return 'Retard de ${_daysUntil.abs()} j';
    if (_isToday) return "Aujourd'hui";
    return 'Dans $_daysUntil j';
  }

  IconData get _timingIcon {
    if (_isLate)  return Icons.warning_amber_rounded;
    if (_isToday) return Icons.schedule_rounded;
    return Icons.event_available_rounded;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  void _goProject() {
    if (widget.onViewProject != null) {
      widget.onViewProject!(_projectId);
    } else if (_projectId.isNotEmpty) {
      context.push('/forms/project?id=$_projectId');
    }
  }

  void _goTimeline() {
    if (widget.onTimeline != null) {
      widget.onTimeline!(_projectId);
    } else if (_projectId.isNotEmpty) {
      context.push('/forms/project-timeline?projectId=$_projectId');
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width > 640;

    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: _kCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: _hovered ? _timingColor.withOpacity(0.45) : _kBorder,
            width: _hovered ? 1.5 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: _hovered
                  ? _timingColor.withOpacity(0.14)
                  : Colors.black.withOpacity(0.04),
              blurRadius: _hovered ? 24 : 8,
              spreadRadius: _hovered ? 1 : 0,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(15),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Barre colorée gauche (timing urgency indicator) ──────
                _ColoredBar(color: _timingColor),

                // ── Contenu ──────────────────────────────────────────────
                Expanded(
                  child: InkWell(
                    onTap: _goProject,
                    borderRadius: const BorderRadius.only(
                      topRight:    Radius.circular(15),
                      bottomRight: Radius.circular(15),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // ── 1. Badges : timing + priorité + stage ──────
                          _TopBadgeRow(
                            timingLabel: _timingLabel,
                            timingIcon:  _timingIcon,
                            timingColor: _timingColor,
                            isLate:      _isLate,
                            priority:    _priority,
                            stageName:   _stageName,
                            stageColor:  _stageColor,
                          ),

                          const SizedBox(height: 12),

                          // ── 2. Titre + Promoteur + Statut validation ───
                          isWide
                              ? Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(child: _TitleBlock(
                                      nomProjet: _nomProjet,
                                      promoteur: _promoteur,
                                    )),
                                    const SizedBox(width: 12),
                                    if (_valStatut.isNotEmpty)
                                      _ValidationBadge(statut: _valStatut),
                                  ],
                                )
                              : Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _TitleBlock(
                                        nomProjet: _nomProjet,
                                        promoteur: _promoteur),
                                    if (_valStatut.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      _ValidationBadge(statut: _valStatut),
                                    ],
                                  ],
                                ),

                          const SizedBox(height: 12),

                          // ── 3. Informations : action | message | date ──
                          Wrap(
                            spacing: 14,
                            runSpacing: 8,
                            children: [
                              if (_actionType.isNotEmpty)
                                _InfoPill(
                                  icon:  Icons.task_alt_rounded,
                                  label: _actionType,
                                  color: const Color(0xFF6366F1),
                                ),
                              if (_message.isNotEmpty)
                                _InfoPill(
                                  icon:     Icons.chat_bubble_outline_rounded,
                                  label:    _message,
                                  color:    const Color(0xFF0284C7),
                                  maxWidth: 220,
                                ),
                              if (_dateStr.isNotEmpty)
                                _InfoPill(
                                  icon:  Icons.calendar_today_rounded,
                                  label: _dateStr,
                                  color: _timingColor,
                                  bold:  true,
                                ),
                            ],
                          ),

                          const SizedBox(height: 14),
                          const Divider(height: 1, thickness: 0.8,
                              color: Color(0xFFEFF2F7)),
                          const SizedBox(height: 12),

                          // ── 4. Boutons d'action ────────────────────────
                          _ActionRow(
                            hasId:      _projectId.isNotEmpty,
                            isWide:     isWide,
                            onProject:  _goProject,
                            onTimeline: _goTimeline,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COLORED LEFT BAR
// ─────────────────────────────────────────────────────────────────────────────

class _ColoredBar extends StatelessWidget {
  const _ColoredBar({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 5,
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end:   Alignment.bottomCenter,
        colors: [color, color.withOpacity(0.4)],
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP BADGE ROW  (timing + priorité + stage)
// ─────────────────────────────────────────────────────────────────────────────

class _TopBadgeRow extends StatelessWidget {
  const _TopBadgeRow({
    required this.timingLabel,
    required this.timingIcon,
    required this.timingColor,
    required this.isLate,
    required this.priority,
    required this.stageName,
    required this.stageColor,
  });

  final String   timingLabel;
  final IconData timingIcon;
  final Color    timingColor;
  final bool     isLate;
  final String   priority;
  final String   stageName;
  final Color    stageColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Timing badge (animé si retard)
        _TimingBadge(
          label: timingLabel,
          icon:  timingIcon,
          color: timingColor,
          pulse: isLate,
        ),
        const SizedBox(width: 8),
        // Priority
        if (priority.isNotEmpty)
          _PriorityBadge(priority: priority),
        const Spacer(),
        // Pipeline stage (top-right)
        if (stageName.isNotEmpty)
          _StageBadge(name: stageName, color: stageColor),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMING BADGE  (avec animation pulse si retard)
// ─────────────────────────────────────────────────────────────────────────────

class _TimingBadge extends StatefulWidget {
  const _TimingBadge({
    required this.label,
    required this.icon,
    required this.color,
    this.pulse = false,
  });
  final String   label;
  final IconData icon;
  final Color    color;
  final bool     pulse;

  @override
  State<_TimingBadge> createState() => _TimingBadgeState();
}

class _TimingBadgeState extends State<_TimingBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>    _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 850),
    );
    _scale = Tween<double>(begin: 1.0, end: 1.07).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
    if (widget.pulse) _ctrl.repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final badge = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color:  widget.color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: widget.color.withOpacity(0.38), width: 1),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(widget.icon, size: 13, color: widget.color),
        const SizedBox(width: 5),
        Text(
          widget.label,
          style: TextStyle(
            fontFamily: 'InterTight',
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: widget.color,
          ),
        ),
      ]),
    );

    if (!widget.pulse) return badge;

    return AnimatedBuilder(
      animation: _scale,
      builder: (_, child) => Transform.scale(scale: _scale.value, child: child),
      child: badge,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIORITY BADGE
// ─────────────────────────────────────────────────────────────────────────────

class _PriorityBadge extends StatelessWidget {
  const _PriorityBadge({required this.priority});
  final String priority;

  @override
  Widget build(BuildContext context) {
    final color = _priorityColor(priority);
    final label = _priorityLabel(priority);
    final icon  = _priorityIcon(priority);
    if (label.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            fontFamily: 'InterTight',
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE BADGE  (pipeline stage avec couleur hexadécimale)
// ─────────────────────────────────────────────────────────────────────────────

class _StageBadge extends StatelessWidget {
  const _StageBadge({required this.name, required this.color});
  final String name;
  final Color  color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color:  color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: color.withOpacity(0.3)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 7, height: 7,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      const SizedBox(width: 6),
      Text(
        name,
        style: TextStyle(
          fontFamily: 'InterTight',
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    ]),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TITLE BLOCK  (nom projet + promoteur)
// ─────────────────────────────────────────────────────────────────────────────

class _TitleBlock extends StatelessWidget {
  const _TitleBlock({required this.nomProjet, required this.promoteur});
  final String nomProjet;
  final String promoteur;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        nomProjet.isNotEmpty ? nomProjet : '—',
        style: const TextStyle(
          fontFamily: 'InterTight',
          fontSize: 16,
          fontWeight: FontWeight.w800,
          color: _kText,
          height: 1.2,
        ),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      if (promoteur.isNotEmpty) ...[
        const SizedBox(height: 4),
        Row(children: [
          const Icon(Icons.business_rounded, size: 13, color: _kMuted),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              promoteur,
              style: const TextStyle(
                fontFamily: 'InterTight',
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: _kMuted,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ]),
      ],
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION BADGE
// ─────────────────────────────────────────────────────────────────────────────

class _ValidationBadge extends StatelessWidget {
  const _ValidationBadge({required this.statut});
  final String statut;

  @override
  Widget build(BuildContext context) {
    final color = _valColor(statut);
    final icon  = _valIcon(statut);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color:  color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 5),
        Text(
          statut,
          style: TextStyle(
            fontFamily: 'InterTight',
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INFO PILL  (action type / message / date)
// ─────────────────────────────────────────────────────────────────────────────

class _InfoPill extends StatelessWidget {
  const _InfoPill({
    required this.icon,
    required this.label,
    required this.color,
    this.bold     = false,
    this.maxWidth,
  });
  final IconData icon;
  final String   label;
  final Color    color;
  final bool     bold;
  final double?  maxWidth;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Icon(icon, size: 12, color: color),
    ),
    const SizedBox(width: 6),
    ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth ?? 300),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontFamily: 'InterTight',
          fontSize: 12,
          fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
          color:      bold ? color : _kMuted,
        ),
      ),
    ),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION ROW  (Voir Projet | Timeline)
// ─────────────────────────────────────────────────────────────────────────────

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.hasId,
    required this.isWide,
    required this.onProject,
    required this.onTimeline,
  });
  final bool         hasId;
  final bool         isWide;
  final VoidCallback onProject;
  final VoidCallback onTimeline;

  @override
  Widget build(BuildContext context) {
    final btns = [
      // ── Voir Projet — bleu, filled ──────────────────────────────────────
      _Btn(
        label:  'Voir Projet',
        icon:   Icons.visibility_rounded,
        color:  const Color(0xFF2563EB),   // blue-600
        onTap:  hasId ? onProject : null,
        filled: true,
      ),
      // ── Timeline — violet, outlined ──────────────────────────────────────
      _Btn(
        label:  'Timeline',
        icon:   Icons.timeline_rounded,
        color:  const Color(0xFF7C3AED),   // violet-700
        onTap:  hasId ? onTimeline : null,
      ),
    ];

    if (isWide) {
      return Row(
        children: [
          btns[0],
          const SizedBox(width: 8),
          btns[1],
        ],
      );
    }

    return Wrap(spacing: 8, runSpacing: 8, children: btns);
  }
}

class _Btn extends StatelessWidget {
  const _Btn({
    required this.label,
    required this.icon,
    required this.color,
    this.onTap,
    this.filled = false,
  });
  final String        label;
  final IconData      icon;
  final Color         color;
  final VoidCallback? onTap;
  final bool          filled;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    final fg = filled
        ? Colors.white
        : (disabled ? color.withOpacity(0.38) : color);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color:  filled ? (disabled ? color.withOpacity(0.38) : color) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: filled
                ? null
                : Border.all(
                    color: disabled ? color.withOpacity(0.2) : color.withOpacity(0.4),
                  ),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 13, color: fg),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'InterTight',
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: fg,
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
