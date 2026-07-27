// lib/forms/view/project_pipeline_board.dart

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../providers/pipeline_provider.dart';
import '../../services/pipeline_service.dart';
import 'pipeline_theme.dart';
import 'archive_request_dialog.dart';

// ══════════════════════════════════════════════════════════════════════════════
// PRIORITY SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
enum _Priority { urgent, high, medium, low, none }

_Priority _parsePriority(dynamic raw) {
  final s = (raw ?? '').toString().toLowerCase().trim();
  if (s == 'urgent' || s == '3') return _Priority.urgent;
  if (s == 'high' || s == 'haute' || s == '2') return _Priority.high;
  if (s == 'medium' || s == 'moyenne' || s == 'normale' || s == '1') {
    return _Priority.medium;
  }
  if (s == 'low' || s == 'basse' || s == '0') return _Priority.low;
  return _Priority.none;
}

Color _priorityColor(_Priority p) {
  switch (p) {
    case _Priority.urgent: return const Color(0xFFEF4444);
    case _Priority.high:   return const Color(0xFFF97316);
    case _Priority.medium: return const Color(0xFF3B82F6);
    case _Priority.low:    return const Color(0xFF94A3B8);
    case _Priority.none:   return kCrmBorder;
  }
}

IconData _priorityIcon(_Priority p) {
  switch (p) {
    case _Priority.urgent: return Icons.priority_high_rounded;
    case _Priority.high:   return Icons.keyboard_double_arrow_up_rounded;
    case _Priority.medium: return Icons.drag_handle_rounded;
    case _Priority.low:    return Icons.keyboard_double_arrow_down_rounded;
    case _Priority.none:   return Icons.remove_rounded;
  }
}

String _priorityLabel(_Priority p) {
  switch (p) {
    case _Priority.urgent: return 'Urgent';
    case _Priority.high:   return 'Haute';
    case _Priority.medium: return 'Moyenne';
    case _Priority.low:    return 'Basse';
    case _Priority.none:   return '';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELANCE STATUS
// ══════════════════════════════════════════════════════════════════════════════
enum _RelanceStatus { overdue, today, tomorrow, upcoming, none }

_RelanceStatus _relanceStatus(String? dateStr) {
  if (dateStr == null || dateStr.isEmpty) return _RelanceStatus.none;
  try {
    final date  = DateTime.parse(dateStr).toLocal();
    final now   = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d     = DateTime(date.year, date.month, date.day);
    final diff  = d.difference(today).inDays;
    if (diff < 0)  return _RelanceStatus.overdue;
    if (diff == 0) return _RelanceStatus.today;
    if (diff == 1) return _RelanceStatus.tomorrow;
    return _RelanceStatus.upcoming;
  } catch (_) {
    return _RelanceStatus.none;
  }
}

Color _relanceColor(_RelanceStatus s) {
  switch (s) {
    case _RelanceStatus.overdue:  return const Color(0xFFEF4444);
    case _RelanceStatus.today:    return const Color(0xFFF97316);
    case _RelanceStatus.tomorrow: return const Color(0xFFF59E0B);
    case _RelanceStatus.upcoming: return const Color(0xFF10B981);
    case _RelanceStatus.none:     return kCrmBorder;
  }
}

String _relanceLabel(_RelanceStatus s, String? dateStr) {
  switch (s) {
    case _RelanceStatus.overdue:  return 'Relance en retard';
    case _RelanceStatus.today:    return 'Relance aujourd\'hui';
    case _RelanceStatus.tomorrow: return 'Relance demain';
    case _RelanceStatus.upcoming:
      if (dateStr != null && dateStr.isNotEmpty) {
        try {
          return 'Relance ${DateFormat('dd MMM').format(DateTime.parse(dateStr))}';
        } catch (_) {}
      }
      return 'Relance à venir';
    case _RelanceStatus.none: return '';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT KIND  (chatter classification)
// ══════════════════════════════════════════════════════════════════════════════
enum _EventKind { note, relance, upload, stageChange, action }

_EventKind _classifyEvent(Map<String, dynamic> a) {
  // Read typeAction OR the legacy alias typeAction_legacy
  final t = (a['typeAction'] ?? a['typeAction_legacy'] ?? a['type'] ?? '')
      .toString()
      .toLowerCase();
  if (t == 'note' || t.contains('note') || t.contains('interne') ||
      t.contains('message')) {
    return _EventKind.note;
  }
  if (t.contains('relance') || t.contains('rappel') || t.contains('reminder')) {
    return _EventKind.relance;
  }
  if (t.contains('upload') || t.contains('fichier') || t.contains('document') ||
      t.contains('pièce') || t.contains('piece') || t.contains('attach')) {
    return _EventKind.upload;
  }
  if (t.contains('change') || t.contains('modif') || t.contains('statut') ||
      t.contains('update') || t.contains('stage')) {
    return _EventKind.stageChange;
  }
  return _EventKind.action;
}

Color _eventKindColor(_EventKind k) {
  switch (k) {
    case _EventKind.note:        return const Color(0xFF6366F1);
    case _EventKind.relance:     return const Color(0xFFF97316);
    case _EventKind.upload:      return const Color(0xFF10B981);
    case _EventKind.stageChange: return const Color(0xFF94A3B8);
    case _EventKind.action:      return kCrmInfo;
  }
}

IconData _eventKindIcon(_EventKind k, String rawType) {
  switch (k) {
    case _EventKind.note:        return Icons.sticky_note_2_rounded;
    case _EventKind.relance:     return Icons.notifications_active_rounded;
    case _EventKind.upload:      return Icons.attach_file_rounded;
    case _EventKind.stageChange: return Icons.swap_horiz_rounded;
    case _EventKind.action:      return kActionIcon(rawType);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA HELPERS  — read normalised map first, then raw nested objects
// ══════════════════════════════════════════════════════════════════════════════
String _projectId(Map<String, dynamic> p) =>
    (p['id'] ?? p['_id'] ?? '').toString();

/// Safe cast: returns null when the value is not a Map (avoids cast exception).
Map<String, dynamic>? _asMap(dynamic v) {
  if (v == null) return null;
  if (v is Map<String, dynamic>) return v;
  if (v is Map) return Map<String, dynamic>.from(v);
  return null;
}

String _cardNom(Map<String, dynamic> p) {
  // Top-level flat keys (normalizeIntoMap writes 'nomProjet')
  for (final k in [
    'nomProjet', 'name', 'title', 'projectName',
    'projet', 'nom', 'projetNom', 'label',
  ]) {
    final v = p[k]?.toString().trim() ?? '';
    if (v.isNotEmpty) return v;
  }
  // One level deeper: {project: {nomProjet: ...}}
  for (final wk in ['project', 'data', 'item']) {
    final nested = _asMap(p[wk]);
    if (nested == null) continue;
    for (final k in ['nomProjet', 'name', 'title', 'projectName']) {
      final v = nested[k]?.toString().trim() ?? '';
      if (v.isNotEmpty) return v;
    }
  }
  return 'Projet sans nom';
}

/// Resolves the owner display name from any API shape.
/// Priority: normalised 'ownerName' → nested owner/user object → flat fields.
String _cardOwner(Map<String, dynamic> p) {
  // 1. normalizeIntoMap writes 'ownerName'
  final norm = p['ownerName']?.toString().trim() ?? '';
  if (norm.isNotEmpty) return norm;

  // 2. Nested owner / user / commercial object
  for (final key in [
    'owner', 'user', 'commercial', 'responsable',
    'assignedTo', 'assignee', 'createdBy',
  ]) {
    final obj = _asMap(p[key]);
    if (obj == null) continue;
    for (final fld in [
      'fullName', 'name', 'nom',
      'displayName', 'username', 'email',
    ]) {
      final v = obj[fld]?.toString().trim() ?? '';
      if (v.isNotEmpty && !_looksLikeId(v)) return v;
    }
  }

  // 3. Flat fields
  for (final k in ['user_nom', 'user_nom_custom', 'createdByName']) {
    final v = p[k]?.toString().trim() ?? '';
    if (v.isNotEmpty) return v;
  }
  return '';
}

String _cardOwnerEmail(Map<String, dynamic> p) {
  final norm = p['ownerEmail']?.toString().trim() ?? '';
  if (norm.isNotEmpty) return norm;

  for (final key in ['owner', 'user', 'commercial']) {
    final obj = _asMap(p[key]);
    if (obj == null) continue;
    final v = (obj['email'] ?? obj['mail'] ?? '').toString().trim();
    if (v.isNotEmpty) return v;
  }
  return '';
}

String _cardOwnerAvatar(Map<String, dynamic> p) {
  final norm = p['ownerAvatar']?.toString().trim() ?? '';
  if (norm.isNotEmpty) return norm;

  for (final key in ['owner', 'user']) {
    final obj = _asMap(p[key]);
    if (obj == null) continue;
    for (final fld in [
      'avatar', 'avatarUrl', 'photo', 'picture',
      'profileImage', 'image',
    ]) {
      final v = (obj[fld] ?? '').toString().trim();
      if (v.isNotEmpty) return v;
    }
  }
  return '';
}

/// Resolves action type from any action map shape.
/// Handles both 'typeAction' and the 'typeAction_legacy' variant.
String _actionType(Map<String, dynamic>? a) {
  if (a == null) return '';
  return (a['typeAction'] ??
          a['typeAction_legacy'] ??
          a['type'] ??
          a['action'] ??
          '')
      .toString()
      .trim();
}

bool _looksLikeId(String s) =>
    s.length == 24 && RegExp(r'^[a-f0-9]+$').hasMatch(s);

String? _nextRelanceDate(Map<String, dynamic> p) {
  for (final k in [
    'nextRelance', 'relanceDate', 'nextReminder',
    'dateRelance', 'reminderDate', 'dateRappel'
  ]) {
    final v = p[k]?.toString().trim() ?? '';
    if (v.isNotEmpty) return v;
  }
  // Scan actions for relance events
  final actions = (p['allActions'] as List? ?? []);
  final now = DateTime.now();
  String? best;
  DateTime? bestDate;

  for (final a in actions) {
    if (a is! Map) continue;
    if (_classifyEvent(Map<String, dynamic>.from(a)) != _EventKind.relance) continue;
    final dateStr = (a['dateAction'] ?? '').toString();
    if (dateStr.isEmpty) continue;
    try {
      final d = DateTime.parse(dateStr);
      if (bestDate == null) {
        best = dateStr; bestDate = d;
      } else {
        final bFuture = bestDate!.isAfter(now);
        final dFuture = d.isAfter(now);
        if (bFuture && dFuture) {
          if (d.isBefore(bestDate!)) { best = dateStr; bestDate = d; }
        } else if (!bFuture && !dFuture) {
          if (d.isAfter(bestDate!)) { best = dateStr; bestDate = d; }
        } else if (dFuture) {
          best = dateStr; bestDate = d;
        }
      }
    } catch (_) {}
  }
  return best;
}

int _countNotes(Map<String, dynamic> p) {
  return (p['allActions'] as List? ?? []).where((a) {
    if (a is! Map) return false;
    return _classifyEvent(Map<String, dynamic>.from(a)) == _EventKind.note;
  }).length;
}

int _countAttachments(Map<String, dynamic> p) {
  return (p['allActions'] as List? ?? []).where((a) {
    if (a is! Map) return false;
    return _classifyEvent(Map<String, dynamic>.from(a)) == _EventKind.upload;
  }).length;
}

// Keep for backward compat with any callers
String resolveProjectOwner(Map<String, dynamic> p) => _cardOwner(p);

// ══════════════════════════════════════════════════════════════════════════════
// BOARD
// ══════════════════════════════════════════════════════════════════════════════
class PipelineBoard extends StatelessWidget {
  final PipelineProvider provider;
  final Future<void> Function(Map<String, dynamic>, String) onMove;

  const PipelineBoard({
    super.key,
    required this.provider,
    required this.onMove,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (_, constraints) => Obx(() {
        final data   = provider.filtered;
        final stages = provider.stages;
        // Subtract top+bottom padding (20+24=44) so the Row's explicit height
        // is tight — this makes _StageColumn's Expanded work correctly.
        final boardH = (constraints.maxHeight - 44).clamp(200.0, double.infinity);
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          child: SizedBox(
            height: boardH,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ...stages.map((stage) => _StageColumn(
                      stage: stage,
                      projects: data[stage.id] ?? [],
                      onMove: onMove,
                      provider: provider,
                    )),
                Align(
                  alignment: Alignment.topCenter,
                  child: _AddStageButton(provider: provider),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE COLUMN  — drag & drop intact
// ══════════════════════════════════════════════════════════════════════════════
class _StageColumn extends StatefulWidget {
  final PipelineStage stage;
  final List<Map<String, dynamic>> projects;
  final Future<void> Function(Map<String, dynamic>, String) onMove;
  final PipelineProvider provider;

  const _StageColumn({
    required this.stage,
    required this.projects,
    required this.onMove,
    required this.provider,
  });

  @override
  State<_StageColumn> createState() => _StageColumnState();
}

class _StageColumnState extends State<_StageColumn> {
  bool _dragOver = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.stage.color;
    final count = widget.projects.length;

    debugPrint('[Pipeline] stage=${widget.stage.id} projects=$count');

    return SizedBox(
      width: 360,
      child: Padding(
        padding: const EdgeInsets.only(right: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Stage header with left accent border
            Container(
              decoration: BoxDecoration(
                color: kCrmSurface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: kCrmBorder),
                boxShadow: [
                  BoxShadow(
                      color: color.withOpacity(0.08),
                      blurRadius: 10,
                      offset: const Offset(0, 3)),
                ],
              ),
              child: Row(children: [
                Container(
                  width: 5,
                  height: 54,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: const BorderRadius.horizontal(
                        left: Radius.circular(14)),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                      color: color.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8)),
                  child: Icon(widget.stage.icon, color: color, size: 14),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.stage.label,
                          style: tInter(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: kCrmText),
                          overflow: TextOverflow.ellipsis),
                      Text('$count deal${count == 1 ? '' : 's'}',
                          style: tInter(fontSize: 10, color: kCrmTextSub)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                      color: color.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20)),
                  child: Text('$count',
                      style: tInter(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: color)),
                ),
                const SizedBox(width: 4),
                _StageMenu(stage: widget.stage, provider: widget.provider),
              ]),
            ),
            const SizedBox(height: 10),
            // Drop zone — takes all remaining height
            Expanded(
              child: DragTarget<Map<String, dynamic>>(
                onWillAcceptWithDetails: (d) {
                  if (d.data['computedStage'] == widget.stage.id) {
                    return false;
                  }
                  setState(() => _dragOver = true);
                  return true;
                },
                onAcceptWithDetails: (d) {
                  setState(() => _dragOver = false);
                  widget.onMove(d.data, widget.stage.id);
                },
                onLeave: (_) => setState(() => _dragOver = false),
                builder: (ctx, _, __) => AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  decoration: BoxDecoration(
                    color: _dragOver
                        ? color.withOpacity(0.04)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(16),
                    border: _dragOver
                        ? Border.all(
                            color: color.withOpacity(0.5), width: 2)
                        : null,
                  ),
                  child: widget.projects.isEmpty && !_dragOver
                      ? _EmptyColumn(stage: widget.stage, color: color)
                      : ListView.builder(
                          padding: EdgeInsets.all(_dragOver ? 6 : 0),
                          itemCount: widget.projects.length +
                              (_dragOver ? 1 : 0),
                          itemBuilder: (ctx, i) {
                            if (_dragOver &&
                                i == widget.projects.length) {
                              return _DropIndicator(color: color);
                            }
                            return _DraggableCard(
                              project: widget.projects[i],
                              stageColor: color,
                            );
                          },
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE CONTEXT MENU
// ══════════════════════════════════════════════════════════════════════════════
class _StageMenu extends StatelessWidget {
  final PipelineStage stage;
  final PipelineProvider provider;

  const _StageMenu({required this.stage, required this.provider});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      padding: EdgeInsets.zero,
      iconSize: 18,
      icon: const Icon(Icons.more_vert_rounded, size: 16, color: kCrmTextSub),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      elevation: 8,
      onSelected: (v) async {
        switch (v) {
          case 'rename':
            await _renameDialog(context);
            break;
          case 'color':
            await _colorDialog(context);
            break;
          case 'delete':
            await provider.removeStage(stage.id);
            break;
        }
      },
      itemBuilder: (_) => [
        _item('rename', Icons.edit_rounded, 'Rename'),
        _item('color', Icons.palette_rounded, 'Change Color'),
        if (!stage.isSystem) ...[
          const PopupMenuDivider(),
          _item('delete', Icons.delete_outline_rounded, 'Delete',
              color: kCrmDanger),
        ],
      ],
    );
  }

  PopupMenuItem<String> _item(String v, IconData icon, String label,
      {Color? color}) {
    return PopupMenuItem(
      value: v,
      child: Row(children: [
        Icon(icon, size: 15, color: color ?? kCrmTextSub),
        const SizedBox(width: 10),
        Text(label, style: tInter(fontSize: 13, color: color ?? kCrmText)),
      ]),
    );
  }

  Future<void> _renameDialog(BuildContext context) async {
    final ctrl = TextEditingController(text: stage.label);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Rename Stage', style: tInter(fontWeight: FontWeight.w700)),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: InputDecoration(
            labelText: 'Stage name',
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          ElevatedButton(
            style:
                ElevatedButton.styleFrom(backgroundColor: kCrmPrimary),
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Save', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (result != null && result.isNotEmpty) {
      await provider.renameStage(stage.id, result);
    }
  }

  Future<void> _colorDialog(BuildContext context) async {
    Color picked = stage.color;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('Choose Color', style: tInter(fontWeight: FontWeight.w700)),
          content: Wrap(
            spacing: 10,
            runSpacing: 10,
            children: kStagePalette
                .map((c) => GestureDetector(
                      onTap: () => setS(() => picked = c),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: c,
                          shape: BoxShape.circle,
                          border: picked == c
                              ? Border.all(color: Colors.white, width: 3)
                              : null,
                          boxShadow: picked == c
                              ? [
                                  BoxShadow(
                                      color: c.withOpacity(0.5),
                                      blurRadius: 8,
                                      spreadRadius: 1)
                                ]
                              : null,
                        ),
                        child: picked == c
                            ? const Icon(Icons.check_rounded,
                                color: Colors.white, size: 18)
                            : null,
                      ),
                    ))
                .toList(),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            ElevatedButton(
              style:
                  ElevatedButton.styleFrom(backgroundColor: kCrmPrimary),
              onPressed: () async {
                Navigator.pop(ctx);
                await provider.recolorStage(stage.id, picked);
              },
              child:
                  const Text('Apply', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD STAGE BUTTON
// ══════════════════════════════════════════════════════════════════════════════
class _AddStageButton extends StatelessWidget {
  final PipelineProvider provider;
  const _AddStageButton({required this.provider});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showDialog(context),
      child: Container(
        width: 180,
        height: 54,
        decoration: BoxDecoration(
          color: kCrmPrimary.withOpacity(0.06),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: kCrmPrimary.withOpacity(0.3)),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
                color: kCrmPrimary.withOpacity(0.12), shape: BoxShape.circle),
            child: const Icon(Icons.add_rounded, color: kCrmPrimary, size: 16),
          ),
          const SizedBox(width: 8),
          Text('Add Stage',
              style: tInter(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: kCrmPrimary)),
        ]),
      ),
    );
  }

  Future<void> _showDialog(BuildContext context) async {
    final nameCtrl = TextEditingController();
    Color selectedColor = const Color(0xFF6366F1);

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: Row(children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                  color: kCrmPrimary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.add_box_rounded,
                  color: kCrmPrimary, size: 18),
            ),
            const SizedBox(width: 10),
            Text('Add New Stage',
                style: tInter(fontSize: 16, fontWeight: FontWeight.w700)),
          ]),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: nameCtrl,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Stage Name',
                  hintText: 'e.g. Qualification',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10)),
                  focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide:
                          const BorderSide(color: kCrmPrimary, width: 1.5)),
                ),
              ),
              const SizedBox(height: 18),
              Text('Stage Color',
                  style:
                      tInter(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: kStagePalette
                    .map((c) => GestureDetector(
                          onTap: () => setS(() => selectedColor = c),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              color: c,
                              shape: BoxShape.circle,
                              border: selectedColor == c
                                  ? Border.all(
                                      color: Colors.white, width: 3)
                                  : null,
                              boxShadow: selectedColor == c
                                  ? [
                                      BoxShadow(
                                          color: c.withOpacity(0.5),
                                          blurRadius: 8)
                                    ]
                                  : null,
                            ),
                            child: selectedColor == c
                                ? const Icon(Icons.check_rounded,
                                    color: Colors.white, size: 16)
                                : null,
                          ),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: selectedColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border:
                      Border.all(color: selectedColor.withOpacity(0.4)),
                ),
                child: Row(children: [
                  Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                          color: selectedColor,
                          shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  ValueListenableBuilder<TextEditingValue>(
                      valueListenable: nameCtrl,
                      builder: (_, val, __) => Text(
                            val.text.isEmpty
                                ? 'Stage name preview'
                                : val.text,
                            style: tInter(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: selectedColor),
                          )),
                ]),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child:
                    Text('Cancel', style: tInter(color: kCrmTextSub))),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: kCrmPrimary,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8))),
              onPressed: () async {
                final name = nameCtrl.text.trim();
                if (name.isEmpty) return;
                Navigator.pop(ctx);
                await provider.addStage(
                    id: name, label: name, color: selectedColor);
              },
              child: Text('Add Stage',
                  style: tInter(
                      color: Colors.white, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DRAGGABLE WRAPPER — interface unchanged
// ══════════════════════════════════════════════════════════════════════════════
class _DraggableCard extends StatelessWidget {
  final Map<String, dynamic> project;
  final Color stageColor;

  const _DraggableCard({required this.project, required this.stageColor});

  @override
  Widget build(BuildContext context) {
    return LongPressDraggable<Map<String, dynamic>>(
      data: project,
      delay: const Duration(milliseconds: 350),
      hapticFeedbackOnStart: true,
      feedback: Material(
        color: Colors.transparent,
        child: SizedBox(
          width: 300,
          child: Transform.rotate(
            angle: 0.018,
            child: Opacity(
              opacity: 0.93,
              child: _ProjectCard(
                  project: project,
                  stageColor: stageColor,
                  isDragging: true),
            ),
          ),
        ),
      ),
      childWhenDragging: Opacity(
          opacity: 0.20,
          child: _ProjectCard(project: project, stageColor: stageColor)),
      child: _ProjectCard(project: project, stageColor: stageColor),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PROJECT CARD  — Odoo-inspired professional design
// ══════════════════════════════════════════════════════════════════════════════
class _ProjectCard extends StatefulWidget {
  final Map<String, dynamic> project;
  final Color stageColor;
  final bool isDragging;

  const _ProjectCard({
    required this.project,
    required this.stageColor,
    this.isDragging = false,
  });

  @override
  State<_ProjectCard> createState() => _ProjectCardState();
}

class _ProjectCardState extends State<_ProjectCard> {
  bool _hovered = false;

  String _fmtShort(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      return DateFormat('dd MMM').format(DateTime.parse(iso));
    } catch (_) {
      return iso.length > 10 ? iso.substring(0, 10) : iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.project;

    // Guard: empty / null map → placeholder card
    if (p.isEmpty) {
      return Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: kCrmBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: kCrmDanger.withOpacity(0.3)),
        ),
        child: Row(children: [
          Icon(Icons.warning_amber_rounded,
              size: 14, color: kCrmDanger.withOpacity(0.6)),
          const SizedBox(width: 8),
          Text('Projet invalide',
              style: tInter(fontSize: 12, color: kCrmDanger)),
        ]),
      );
    }

    final color       = widget.stageColor;
    final stage       = (p['computedStage'] ?? 'Visite').toString();
    final stageLabel  = kCrmStageLabels[stage] ?? stage;
    final nom         = _cardNom(p);
    final cie         = (p['entreprise'] ?? p['company'] ?? '').toString();
    final ownerName   = _cardOwner(p);
    final ownerEmail  = _cardOwnerEmail(p);
    final ownerAvatar = _cardOwnerAvatar(p);
    final isArchived  = p['isArchived'] == true ||
        p['isArchived']?.toString() == 'true';
    final archiveReason = (p['archiveReason'] ??
        p['raisonArchivage'] ?? p['raison'] ?? '').toString().trim();
    final archivedAt = (p['archivedAt'] ?? p['dateArchive'] ?? '').toString().trim();

    final priority    = _parsePriority(
        p['priority'] ?? p['priorite'] ?? p['urgence']);
    final relanceDate = _nextRelanceDate(p);
    final rStatus     = _relanceStatus(relanceDate);
    final rColor      = _relanceColor(rStatus);

    // Safe cast: avoids crash when JSON gives Map<dynamic,dynamic>
    final allActions  = (p['allActions'] as List? ?? []);
    final lastAction  = _asMap(p['lastAction']);
    final lastType    = _actionType(lastAction);
    final lastDate    = lastAction?['dateAction']?.toString();
    final lastComment = (lastAction?['commentaire'] ?? '').toString();

    final notesCount  = _countNotes(p);
    final attachCount = _countAttachments(p);
    final pctRaw      = p['pourcentageReussite'];
    final pct         = pctRaw is num
        ? pctRaw.toDouble()
        : double.tryParse(pctRaw?.toString() ?? '') ?? 0.0;

    // Debug print — visible in Flutter debug console
    debugPrint(
      '[PipelineCard] id=${_projectId(p)} | nom=$nom | '
      'owner=$ownerName | action=$lastType | stage=$stage | '
      'actions=${allActions.length}',
    );

    // Left border: priority color when set, otherwise stage color
    final accentColor =
        priority != _Priority.none ? _priorityColor(priority) : color;

    return GestureDetector(
      onTap: () => isArchived
          ? _showArchiveDetail(context, p, archiveReason, archivedAt)
          : _showDetail(context, p),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovered = true),
        onExit:  (_) => setState(() => _hovered = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.only(bottom: 10),
          constraints: const BoxConstraints(minHeight: 160),
          decoration: BoxDecoration(
            // Archived cards get a grey-tinted background
            color: isArchived ? const Color(0xFFF3F4F6) : kCrmSurface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _hovered ? accentColor.withOpacity(0.25) : kCrmBorder,
            ),
            boxShadow: [
              BoxShadow(
                color: _hovered
                    ? accentColor.withOpacity(0.16)
                    : Colors.black.withOpacity(0.04),
                blurRadius: _hovered ? 20 : 5,
                offset: Offset(0, _hovered ? 7 : 2),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(13),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 4, color: accentColor),
                  Expanded(
                    child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 10, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Row 1: Priority + Stage + Menu ───────────────────
                    Row(children: [
                      if (priority != _Priority.none) ...[
                        _PriorityBadge(priority: priority),
                        const SizedBox(width: 6),
                      ],
                      const Spacer(),
                      // Stage badge
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: color.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                              color: color.withOpacity(0.28)),
                        ),
                        child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                kCrmStageIcons[stage] ??
                                    Icons.folder_rounded,
                                size: 9,
                                color: color,
                              ),
                              const SizedBox(width: 4),
                              Text(stageLabel,
                                  style: tInter(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: color)),
                            ]),
                      ),
                      const SizedBox(width: 4),
                      // Card options
                      PopupMenuButton<String>(
                        padding: EdgeInsets.zero,
                        iconSize: 18,
                        icon: const Icon(Icons.more_vert_rounded,
                            size: 16, color: kCrmTextSub),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        elevation: 8,
                        itemBuilder: (_) => [
                          _menuItem('edit', Icons.edit_rounded,
                              'Modifier'),
                          _menuItem('timeline',
                              Icons.timeline_rounded, 'Timeline'),
                          const PopupMenuDivider(),
                          _menuItem('detail',
                              Icons.open_in_new_rounded, 'Voir détails'),
                        ],
                        onSelected: (v) {
                          final pid = _projectId(p);
                          if (v == 'edit') {
                            context.go('/forms/project?id=$pid');
                          } else if (v == 'timeline') {
                            context.go(
                                '/forms/project-timeline?projectId=$pid');
                          } else if (v == 'detail') {
                            _showDetail(context, p);
                          }
                        },
                      ),
                    ]),
                    const SizedBox(height: 8),
                    // ── Project name ──────────────────────────────────────
                    Text(nom,
                        style: tInter(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: kCrmText,
                            height: 1.3),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis),
                    // ── Company ───────────────────────────────────────────
                    if (cie.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Row(children: [
                        const Icon(Icons.business_rounded,
                            size: 10, color: kCrmTextSub),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(cie,
                              style: tInter(
                                  fontSize: 11, color: kCrmTextSub),
                              overflow: TextOverflow.ellipsis),
                        ),
                      ]),
                    ],
                    const SizedBox(height: 10),
                    // ── Owner ─────────────────────────────────────────────
                    _OwnerRow(
                      name: ownerName,
                      email: ownerEmail,
                      avatarUrl: ownerAvatar,
                      fallbackColor: color,
                    ),
                    // ── Archived badge ────────────────────────────────────
                    if (isArchived) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(30),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.archive_rounded,
                              size: 11, color: Colors.grey.shade600),
                          const SizedBox(width: 5),
                          Text('ARCHIVÉ',
                              style: tInter(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.grey.shade700,
                                  letterSpacing: 0.5)),
                        ]),
                      ),
                    ],
                    // ── Archive reason ────────────────────────────────────
                    if (isArchived && archiveReason.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      _ArchiveReasonBox(reason: archiveReason),
                    ],
                    // ── Request unarchive button ──────────────────────────
                    if (isArchived) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: GestureDetector(
                          onTap: () => showArchiveRequestDialog(
                            context,
                            projectId:   _projectId(p),
                            projectName: nom,
                          ),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 9, vertical: 5),
                            decoration: BoxDecoration(
                              color:
                                  kCrmPrimary.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: kCrmPrimary
                                      .withValues(alpha: 0.22)),
                            ),
                            child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.forum_outlined,
                                      size: 12, color: kCrmPrimary),
                                  const SizedBox(width: 4),
                                  Text('Demande',
                                      style: tInter(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w600,
                                          color: kCrmPrimary)),
                                ]),
                          ),
                        ),
                      ),
                    ],
                    // ── Last action ───────────────────────────────────────
                    if (!isArchived && lastAction != null) ...[
                      const SizedBox(height: 10),
                      _LastActionBox(
                        type: lastType,
                        date: _fmtShort(lastDate),
                        comment: lastComment,
                      ),
                    ],
                    // ── Relance strip ─────────────────────────────────────
                    if (!isArchived && rStatus != _RelanceStatus.none) ...[
                      const SizedBox(height: 8),
                      _RelanceStrip(
                          status: rStatus,
                          color: rColor,
                          dateStr: relanceDate),
                    ],
                    const SizedBox(height: 10),
                  ],
                ),
              ),
              // ── Footer counters ───────────────────────────────────────
              Container(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 9),
                decoration: BoxDecoration(
                  color: kCrmBg,
                  border: Border(top: BorderSide(color: kCrmBorder)),
                ),
                child: Row(children: [
                  _counter(Icons.sticky_note_2_rounded,
                      '$notesCount', const Color(0xFF6366F1)),
                  const SizedBox(width: 12),
                  _counter(Icons.bolt_rounded,
                      '${allActions.length}', kCrmInfo),
                  if (attachCount > 0) ...[
                    const SizedBox(width: 12),
                    _counter(Icons.attach_file_rounded,
                        '$attachCount', kCrmSuccess),
                  ],
                  const Spacer(),
                  if (pct > 0)
                    _SuccessRatePill(pct: pct, color: color),
                ]),
              ),
            ],
          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  PopupMenuItem<String> _menuItem(String v, IconData icon, String label,
      {Color? color}) {
    return PopupMenuItem(
      value: v,
      child: Row(children: [
        Icon(icon, size: 15, color: color ?? kCrmTextSub),
        const SizedBox(width: 10),
        Text(label,
            style: tInter(fontSize: 13, color: color ?? kCrmText)),
      ]),
    );
  }

  Widget _counter(IconData icon, String label, Color color) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color.withOpacity(0.8)),
          const SizedBox(width: 3),
          Text(label,
              style: tInter(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: kCrmTextSub)),
        ],
      );

  void _showDetail(BuildContext context, Map<String, dynamic> p) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _OdooDetailSheet(project: p),
    );
  }

  void _showArchiveDetail(BuildContext context, Map<String, dynamic> p,
      String reason, String archivedAt) {
    final nom = _cardNom(p);

    // ── Completeness check ────────────────────────────────────────────────────
    const fieldDefs = <Map<String, String>>[
      {'key': 'telephoneIngenieur', 'label': 'Téléphone client manquant'},
      {'key': 'emailIngenieur',     'label': 'Email client manquant'},
      {'key': 'architecte',         'label': 'Architecte non renseigné'},
      {'key': 'montantMarche',      'label': 'Montant marché non renseigné'},
      {'key': 'bureauEtude',        'label': "Bureau d'étude non renseigné"},
    ];

    final missing = fieldDefs
        .where((f) => (p[f['key']] ?? '').toString().trim().isEmpty)
        .map((f) => f['label']!)
        .toList();

    final pct = ((fieldDefs.length - missing.length) / fieldDefs.length * 100)
        .round();

    // ── Format archive date ───────────────────────────────────────────────────
    String dateLabel = archivedAt;
    if (archivedAt.isNotEmpty) {
      try {
        final dt = DateTime.parse(archivedAt);
        dateLabel =
            '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
      } catch (_) {}
    }

    // ── Progress bar color ────────────────────────────────────────────────────
    final barColor = pct >= 80
        ? const Color(0xFF22C55E)
        : pct >= 50
            ? kCrmWarning
            : kCrmDanger;

    showDialog(
      context: context,
      builder: (_) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: Colors.white,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Header ───────────────────────────────────────────────────
              Container(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8F9FA),
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(20)),
                  border:
                      Border(bottom: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(children: [
                  Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.archive_rounded,
                        size: 20, color: Colors.grey.shade600),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(nom,
                              style: tInter(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: kCrmText),
                              overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 5),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade300,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              'ARCHIVED',
                              style: tInter(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: Colors.grey.shade700,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),
                        ]),
                  ),
                ]),
              ),

              // ── Body ─────────────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Completion rate label
                      Text('Taux de complétude',
                          style: tInter(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: kCrmTextSub)),
                      const SizedBox(height: 8),
                      // Progress bar row
                      Row(children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: LinearProgressIndicator(
                              value: pct / 100,
                              minHeight: 10,
                              backgroundColor: Colors.grey.shade200,
                              valueColor:
                                  AlwaysStoppedAnimation<Color>(barColor),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text('$pct %',
                            style: tInter(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: kCrmText)),
                      ]),

                      const SizedBox(height: 20),
                      Divider(color: Colors.grey.shade200, height: 1),
                      const SizedBox(height: 16),

                      // Missing fields section
                      Text('Données manquantes',
                          style: tInter(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: kCrmTextSub)),
                      const SizedBox(height: 10),
                      if (missing.isEmpty)
                        _archiveAllOkRow()
                      else
                        ...missing.map(_archiveMissingRow),

                      // Archive date section
                      if (dateLabel.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Divider(color: Colors.grey.shade200, height: 1),
                        const SizedBox(height: 16),
                        Text("Date d'archivage",
                            style: tInter(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: kCrmTextSub)),
                        const SizedBox(height: 6),
                        Row(children: [
                          Icon(Icons.calendar_today_rounded,
                              size: 15, color: kCrmTextSub),
                          const SizedBox(width: 6),
                          Text(dateLabel,
                              style: tInter(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: kCrmText)),
                        ]),
                      ],
                    ]),
              ),

              // ── Separator ────────────────────────────────────────────────
              Divider(height: 1, color: Colors.grey.shade200),

              // ── Action buttons ────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                child: Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        Navigator.pop(context);
                        await PipelineProvider.to.restoreProject(p);
                      },
                      icon: const Icon(Icons.restore_rounded, size: 16),
                      label: Text('Restaurer',
                          style: tInter(
                              fontWeight: FontWeight.w600, fontSize: 13)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: kCrmPrimary,
                        side:
                            BorderSide(color: kCrmPrimary.withOpacity(0.4)),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        context.go('/forms/project?id=${_projectId(p)}');
                      },
                      icon: const Icon(Icons.open_in_new_rounded,
                          size: 14, color: Colors.white),
                      label: Text('Voir projet',
                          style: tInter(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 13)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: kCrmPrimary,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ]),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _archiveMissingRow(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        Icon(Icons.cancel_rounded, size: 16, color: Colors.red.shade400),
        const SizedBox(width: 8),
        Text(label,
            style: tInter(
                fontSize: 13, color: kCrmText, fontWeight: FontWeight.w500)),
      ]),
    );
  }

  Widget _archiveAllOkRow() {
    return Row(children: [
      Icon(Icons.check_circle_rounded,
          size: 16, color: Colors.green.shade500),
      const SizedBox(width: 8),
      Text(
        'Toutes les informations sont complètes.',
        style: tInter(
            fontSize: 13,
            color: const Color(0xFF16A34A),
            fontWeight: FontWeight.w500),
      ),
    ]);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIORITY BADGE widget
// ══════════════════════════════════════════════════════════════════════════════
class _PriorityBadge extends StatelessWidget {
  final _Priority priority;
  const _PriorityBadge({required this.priority});

  @override
  Widget build(BuildContext context) {
    final color = _priorityColor(priority);
    final label = _priorityLabel(priority);
    if (label.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.35)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(_priorityIcon(priority), size: 10, color: color),
        const SizedBox(width: 4),
        Text(label,
            style: tInter(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: color)),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// OWNER ROW widget
// ══════════════════════════════════════════════════════════════════════════════
class _OwnerRow extends StatelessWidget {
  final String name;
  final String email;
  final String avatarUrl;
  final Color fallbackColor;

  const _OwnerRow({
    required this.name,
    required this.email,
    required this.avatarUrl,
    required this.fallbackColor,
  });

  String _initials(String n) {
    final parts = n.trim().split(' ');
    if (parts.isEmpty || parts[0].isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final displayName = name.isNotEmpty ? name : email;
    if (displayName.isEmpty) return const SizedBox.shrink();

    Widget avatar = avatarUrl.isNotEmpty
        ? ClipOval(
            child: CachedNetworkImage(
              imageUrl: avatarUrl,
              width: 24,
              height: 24,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => _fallback(),
              placeholder: (_, __) => _fallback(),
            ),
          )
        : _fallback();

    return Row(children: [
      avatar,
      const SizedBox(width: 8),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(displayName,
                style: tInter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: kCrmText),
                overflow: TextOverflow.ellipsis),
            if (name.isNotEmpty && email.isNotEmpty)
              Text(email,
                  style: tInter(fontSize: 9, color: kCrmTextSub),
                  overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    ]);
  }

  Widget _fallback() => Container(
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          gradient: LinearGradient(
              colors: [fallbackColor, fallbackColor.withOpacity(0.6)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Text(name.isNotEmpty ? _initials(name) : '?',
            style: tInter(
                fontSize: 8,
                fontWeight: FontWeight.w800,
                color: Colors.white)),
      );
}

// ══════════════════════════════════════════════════════════════════════════════
// LAST ACTION BOX widget
// ══════════════════════════════════════════════════════════════════════════════
class _LastActionBox extends StatelessWidget {
  final String type;
  final String date;
  final String comment;

  const _LastActionBox({
    required this.type,
    required this.date,
    required this.comment,
  });

  @override
  Widget build(BuildContext context) {
    // Use a neutral color when type is empty (unknown action)
    final displayType = type.isNotEmpty ? type : 'Dernière activité';
    final color = type.isNotEmpty ? kActionColor(type) : kCrmTextSub;
    final icon  = type.isNotEmpty
        ? kActionIcon(type)
        : Icons.history_rounded;

    return Container(
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        color: kCrmBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(5)),
              child: Icon(icon, size: 10, color: color),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(displayType,
                  style: tInter(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: color),
                  overflow: TextOverflow.ellipsis),
            ),
            if (date.isNotEmpty)
              Text(date, style: tInter(fontSize: 9, color: kCrmTextSub)),
          ]),
          if (comment.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(comment,
                style: tInter(
                    fontSize: 10, color: kCrmTextSub, height: 1.4),
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ],
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELANCE STRIP widget
// ══════════════════════════════════════════════════════════════════════════════
class _RelanceStrip extends StatelessWidget {
  final _RelanceStatus status;
  final Color color;
  final String? dateStr;

  const _RelanceStrip({
    required this.status,
    required this.color,
    this.dateStr,
  });

  @override
  Widget build(BuildContext context) {
    final label = _relanceLabel(status, dateStr);
    final isOverdue = status == _RelanceStatus.overdue;
    final isToday   = status == _RelanceStatus.today;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(isOverdue ? 0.08 : 0.06),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(
          isOverdue
              ? Icons.warning_amber_rounded
              : isToday
                  ? Icons.notifications_active_rounded
                  : Icons.notifications_rounded,
          size: 12,
          color: color,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(label,
              style: tInter(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: color),
              overflow: TextOverflow.ellipsis),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUCCESS RATE PILL widget
// ══════════════════════════════════════════════════════════════════════════════
class _SuccessRatePill extends StatelessWidget {
  final double pct;
  final Color color;

  const _SuccessRatePill({required this.pct, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      SizedBox(
        width: 44,
        height: 5,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: LinearProgressIndicator(
            value: (pct / 100).clamp(0.0, 1.0),
            backgroundColor: kCrmBorder,
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
      ),
      const SizedBox(width: 5),
      Text('${pct.toStringAsFixed(0)}%',
          style: tInter(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color)),
    ]);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ODOO DETAIL SHEET  — full Chatter + Note editor
// ══════════════════════════════════════════════════════════════════════════════
class _OdooDetailSheet extends StatefulWidget {
  final Map<String, dynamic> project;
  const _OdooDetailSheet({required this.project});

  @override
  State<_OdooDetailSheet> createState() => _OdooDetailSheetState();
}

class _OdooDetailSheetState extends State<_OdooDetailSheet> {
  late List<Map<String, dynamic>> _events;
  bool _showNoteEditor = false;
  bool _posting        = false;
  final _noteCtrl      = TextEditingController();

  @override
  void initState() {
    super.initState();
    _events = List<Map<String, dynamic>>.from(
        (widget.project['allActions'] as List? ?? [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e)));
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _postNote() async {
    final content = _noteCtrl.text.trim();
    if (content.isEmpty) return;
    setState(() => _posting = true);
    try {
      final pid = _projectId(widget.project);
      await PipelineService.instance.addNote(pid, content);
      setState(() {
        _events.insert(0, {
          'typeAction'  : 'Note',
          'commentaire' : content,
          'dateAction'  : DateTime.now().toIso8601String(),
          'isNew'       : true,
        });
        _noteCtrl.clear();
        _showNoteEditor = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erreur: $e', style: tInter(fontSize: 13)),
          backgroundColor: kCrmDanger,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.all(16),
        ));
      }
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  String _fmt(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    try {
      return DateFormat('dd MMM yyyy · HH:mm').format(DateTime.parse(iso));
    } catch (_) {
      return iso;
    }
  }

  String _fmtRelative(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      final d   = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(d);
      if (diff.inMinutes < 1)  return 'à l\'instant';
      if (diff.inMinutes < 60) return 'il y a ${diff.inMinutes}min';
      if (diff.inHours < 24)   return 'il y a ${diff.inHours}h';
      if (diff.inDays < 7)     return 'il y a ${diff.inDays}j';
      return DateFormat('dd MMM').format(d);
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final p         = widget.project;
    final stage     = (p['computedStage'] ?? 'Visite').toString();
    final color     = kCrmStageColors[stage] ?? kCrmPrimary;
    final stageIcon = kCrmStageIcons[stage] ?? Icons.folder_rounded;
    final nom       = _cardNom(p);
    final cie       = (p['entreprise'] ?? p['company'] ?? '').toString();
    final ownerName   = _cardOwner(p);
    final ownerEmail  = _cardOwnerEmail(p);
    final ownerAvatar = _cardOwnerAvatar(p);
    final priority    = _parsePriority(
        p['priority'] ?? p['priorite'] ?? p['urgence']);
    final pctRaw = p['pourcentageReussite'];
    final pct    = pctRaw is num
        ? pctRaw.toDouble()
        : double.tryParse(pctRaw?.toString() ?? '') ?? 0.0;
    final pid = _projectId(p);

    final notesCount = _events
        .where((e) => _classifyEvent(e) == _EventKind.note)
        .length;
    final relanceDate = _nextRelanceDate(p);
    final rStatus     = _relanceStatus(relanceDate);
    final rColor      = _relanceColor(rStatus);

    return Container(
      height: MediaQuery.of(context).size.height * 0.92,
      decoration: const BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(children: [
        // Drag handle
        Center(
          child: Container(
            margin: const EdgeInsets.only(top: 12, bottom: 4),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
                color: kCrmBorder,
                borderRadius: BorderRadius.circular(2)),
          ),
        ),

        // ── Header ──────────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 16, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                      colors: [color, color.withOpacity(0.55)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight),
                  borderRadius: BorderRadius.circular(13),
                  boxShadow: [
                    BoxShadow(
                        color: color.withOpacity(0.3),
                        blurRadius: 10,
                        offset: const Offset(0, 4))
                  ],
                ),
                alignment: Alignment.center,
                child: Icon(stageIcon, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(nom,
                        style: tInter(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: kCrmText)),
                    if (cie.isNotEmpty)
                      Text(cie,
                          style: tInter(
                              fontSize: 12, color: kCrmTextSub)),
                  ],
                ),
              ),
              // Edit button → go directly to form, no modal
              TextButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  context.go('/forms/project?id=$pid');
                },
                icon: const Icon(Icons.edit_rounded, size: 13),
                label: Text('Modifier',
                    style: tInter(fontSize: 12)),
                style: TextButton.styleFrom(
                  foregroundColor: kCrmPrimary,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                ),
              ),
              TextButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  context.go(
                      '/forms/project-timeline?projectId=$pid');
                },
                icon: const Icon(Icons.timeline_rounded, size: 13),
                label:
                    Text('Timeline', style: tInter(fontSize: 12)),
                style: TextButton.styleFrom(
                  foregroundColor: kCrmPrimary,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                ),
              ),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close_rounded,
                    size: 20, color: kCrmTextSub),
                padding: const EdgeInsets.all(4),
                constraints: const BoxConstraints(),
              ),
            ],
          ),
        ),

        // ── Badges ──────────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          child: Wrap(spacing: 8, runSpacing: 6, children: [
            // Stage
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: color.withOpacity(0.3)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(stageIcon, size: 11, color: color),
                const SizedBox(width: 5),
                Text(kCrmStageLabels[stage] ?? stage,
                    style: tInter(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: color)),
              ]),
            ),
            // Priority
            if (priority != _Priority.none)
              _PriorityBadge(priority: priority),
            // Success
            if (pct > 0)
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: kCrmSuccess.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                      color: kCrmSuccess.withOpacity(0.3)),
                ),
                child: Text('${pct.toStringAsFixed(0)}% succès',
                    style: tInter(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: kCrmSuccess)),
              ),
            // Relance status
            if (rStatus != _RelanceStatus.none)
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: rColor.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: rColor.withOpacity(0.3)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.notifications_rounded,
                      size: 11, color: rColor),
                  const SizedBox(width: 5),
                  Text(_relanceLabel(rStatus, relanceDate),
                      style: tInter(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: rColor)),
                ]),
              ),
            // Events count
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: kCrmPrimary.withOpacity(0.07),
                borderRadius: BorderRadius.circular(20),
                border:
                    Border.all(color: kCrmPrimary.withOpacity(0.2)),
              ),
              child: Text(
                  '${_events.length} événements · $notesCount notes',
                  style: tInter(fontSize: 11, color: kCrmPrimary)),
            ),
          ]),
        ),

        // ── Owner ────────────────────────────────────────────────────────
        if (ownerName.isNotEmpty || ownerEmail.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
            child: Row(children: [
              _OdooAvatar(
                  name: ownerName,
                  avatarUrl: ownerAvatar,
                  color: color,
                  size: 28),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    ownerName.isNotEmpty
                        ? ownerName
                        : ownerEmail,
                    style: tInter(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: kCrmText),
                  ),
                  if (ownerName.isNotEmpty && ownerEmail.isNotEmpty)
                    Text(ownerEmail,
                        style: tInter(
                            fontSize: 10, color: kCrmTextSub)),
                ],
              ),
            ]),
          ),

        const SizedBox(height: 14),
        Container(height: 1, color: kCrmBorder),

        // ── Chatter header ───────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 10),
          child: Row(children: [
            const Icon(Icons.chat_bubble_outline_rounded,
                size: 15, color: kCrmPrimary),
            const SizedBox(width: 8),
            Text('Chatter',
                style: tInter(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: kCrmText)),
            const Spacer(),
            // Add Note
            _chatterBtn(
              Icons.sticky_note_2_rounded,
              'Note',
              const Color(0xFF6366F1),
              () =>
                  setState(() => _showNoteEditor = !_showNoteEditor),
            ),
            const SizedBox(width: 8),
            // Log Activity → timeline form
            _chatterBtn(
              Icons.add_task_rounded,
              'Activité',
              kCrmInfo,
              () {
                Navigator.pop(context);
                context.go(
                    '/forms/project-timeline?projectId=$pid');
              },
            ),
          ]),
        ),

        // ── Note editor (inline) ─────────────────────────────────────────
        if (_showNoteEditor)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color:
                    const Color(0xFF6366F1).withOpacity(0.04),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: const Color(0xFF6366F1).withOpacity(0.25)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.sticky_note_2_rounded,
                        size: 13, color: Color(0xFF6366F1)),
                    const SizedBox(width: 6),
                    Text('Note interne',
                        style: tInter(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: const Color(0xFF6366F1))),
                  ]),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _noteCtrl,
                    maxLines: 4,
                    minLines: 2,
                    autofocus: true,
                    decoration: InputDecoration(
                      hintText: 'Écrivez votre note interne...',
                      hintStyle: tInter(
                          fontSize: 13, color: kCrmTextSub),
                      filled: true,
                      fillColor: kCrmSurface,
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              const BorderSide(color: kCrmBorder)),
                      focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(
                              color: Color(0xFF6366F1), width: 1.5)),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                    style: tInter(fontSize: 13, color: kCrmText),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: () => setState(() {
                          _showNoteEditor = false;
                          _noteCtrl.clear();
                        }),
                        child: Text('Annuler',
                            style: tInter(
                                fontSize: 13,
                                color: kCrmTextSub)),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton.icon(
                        onPressed: _posting ? null : _postNote,
                        style: ElevatedButton.styleFrom(
                          backgroundColor:
                              const Color(0xFF6366F1),
                          shape: RoundedRectangleBorder(
                              borderRadius:
                                  BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 10),
                        ),
                        icon: _posting
                            ? const SizedBox(
                                width: 12,
                                height: 12,
                                child: CircularProgressIndicator(
                                    strokeWidth: 1.5,
                                    color: Colors.white))
                            : const Icon(Icons.check_rounded,
                                size: 13, color: Colors.white),
                        label: Text(
                            _posting
                                ? 'Publication...'
                                : 'Poster la note',
                            style: tInter(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: Colors.white)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

        // ── Chatter timeline ─────────────────────────────────────────────
        Expanded(
          child: _events.isEmpty
              ? _emptyChatter()
              : ListView.builder(
                  padding:
                      const EdgeInsets.fromLTRB(20, 4, 20, 24),
                  itemCount: _events.length,
                  itemBuilder: (_, i) => _ChatterEvent(
                    event: _events[i],
                    isLast: i == _events.length - 1,
                    fmtDate: _fmt,
                    fmtRelative: _fmtRelative,
                  ),
                ),
        ),
      ]),
    );
  }

  Widget _chatterBtn(
      IconData icon, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withOpacity(0.25)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 6),
          Text(label,
              style: tInter(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color)),
        ]),
      ),
    );
  }

  Widget _emptyChatter() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.chat_bubble_outline_rounded,
              size: 48, color: kCrmBorder),
          const SizedBox(height: 14),
          Text('Pas encore d\'activité',
              style: tInter(
                  fontSize: 14,
                  color: kCrmTextSub,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text('Ajoutez une note ou une action',
              style: tInter(fontSize: 12, color: kCrmBorder)),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CHATTER EVENT  — Odoo-style timeline item
// ══════════════════════════════════════════════════════════════════════════════
class _ChatterEvent extends StatelessWidget {
  final Map<String, dynamic> event;
  final bool isLast;
  final String Function(String?) fmtDate;
  final String Function(String?) fmtRelative;

  const _ChatterEvent({
    required this.event,
    required this.isLast,
    required this.fmtDate,
    required this.fmtRelative,
  });

  @override
  Widget build(BuildContext context) {
    final kind     = _classifyEvent(event);
    final rawType  = _actionType(event); // reads typeAction + typeAction_legacy
    final comment  = (event['commentaire'] ?? '').toString();
    final dateStr  = event['dateAction'] as String?;
    final isNew    = event['isNew'] == true;
    final baseColor = _eventKindColor(kind);
    final icon     = _eventKindIcon(kind, rawType);

    // Relances get colored by their due-date status
    Color accentColor = baseColor;
    if (kind == _EventKind.relance) {
      accentColor = _relanceColor(_relanceStatus(dateStr));
    }

    String typeLabel = rawType;
    if (kind == _EventKind.note &&
        rawType.toLowerCase() == 'note') {
      typeLabel = 'Note interne';
    }

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Spine
          SizedBox(
            width: 44,
            child: Column(children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: baseColor.withOpacity(0.10),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: accentColor.withOpacity(0.4),
                      width: 1.5),
                ),
                child: Icon(icon, size: 15, color: accentColor),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    color: kCrmBorder,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                  ),
                ),
            ]),
          ),
          const SizedBox(width: 10),
          // Content card
          Expanded(
            child: Container(
              margin: EdgeInsets.only(bottom: isLast ? 0 : 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isNew
                    ? baseColor.withOpacity(0.04)
                    : kCrmBg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: isNew
                        ? baseColor.withOpacity(0.25)
                        : kCrmBorder),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    // Type badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: baseColor.withOpacity(0.10),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(typeLabel,
                          style: tInter(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: accentColor)),
                    ),
                    if (isNew) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: kCrmSuccess.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text('Nouveau',
                            style: tInter(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: kCrmSuccess)),
                      ),
                    ],
                    const Spacer(),
                    // Relative date with full date tooltip
                    Tooltip(
                      message: fmtDate(dateStr),
                      child: Text(fmtRelative(dateStr),
                          style:
                              tInter(fontSize: 10, color: kCrmTextSub)),
                    ),
                  ]),
                  // Relance status pill
                  if (kind == _EventKind.relance) ...[
                    const SizedBox(height: 6),
                    Builder(builder: (_) {
                      final rs = _relanceStatus(dateStr);
                      if (rs == _RelanceStatus.none) {
                        return const SizedBox.shrink();
                      }
                      final rc = _relanceColor(rs);
                      return Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: rc.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                              color: rc.withOpacity(0.3)),
                        ),
                        child: Text(_relanceLabel(rs, dateStr),
                            style: tInter(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: rc)),
                      );
                    }),
                  ],
                  // Comment
                  if (comment.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(comment,
                        style: tInter(
                            fontSize: 12,
                            color: kCrmText,
                            height: 1.5)),
                  ],
                  // Full timestamp
                  const SizedBox(height: 4),
                  Text(fmtDate(dateStr),
                      style: tInter(
                          fontSize: 10,
                          color: kCrmBorder,
                          fontStyle: FontStyle.italic)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ODOO AVATAR  — shared fallback avatar
// ══════════════════════════════════════════════════════════════════════════════
class _OdooAvatar extends StatelessWidget {
  final String name;
  final String avatarUrl;
  final Color color;
  final double size;

  const _OdooAvatar({
    required this.name,
    required this.avatarUrl,
    required this.color,
    this.size = 32,
  });

  String _initials() {
    if (name.isEmpty) return '?';
    final parts = name.trim().split(' ');
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    if (avatarUrl.isNotEmpty) {
      return ClipOval(
        child: CachedNetworkImage(
          imageUrl: avatarUrl,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => _fallback(),
          placeholder: (_, __) => _fallback(),
        ),
      );
    }
    return _fallback();
  }

  Widget _fallback() => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: LinearGradient(
              colors: [color, color.withOpacity(0.6)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Text(_initials(),
            style: tInter(
                fontSize: size * 0.33,
                fontWeight: FontWeight.w800,
                color: Colors.white)),
      );
}

// ══════════════════════════════════════════════════════════════════════════════
// EMPTY COLUMN
// ══════════════════════════════════════════════════════════════════════════════
class _EmptyColumn extends StatelessWidget {
  final PipelineStage stage;
  final Color color;

  const _EmptyColumn({required this.stage, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 44),
      decoration: BoxDecoration(
        color: color.withOpacity(0.03),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.14)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inbox_rounded,
              size: 40, color: color.withOpacity(0.22)),
          const SizedBox(height: 10),
          Text('Aucun projet',
              style: tInter(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color.withOpacity(0.45))),
          const SizedBox(height: 4),
          Text('Glissez une carte ici',
              style: tInter(fontSize: 10, color: kCrmTextSub)),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DROP INDICATOR
// ══════════════════════════════════════════════════════════════════════════════
class _DropIndicator extends StatelessWidget {
  final Color color;
  const _DropIndicator({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 68,
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color, width: 1.5),
      ),
      child: Center(
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.add_rounded, color: color, size: 18),
          const SizedBox(width: 6),
          Text('Déposer ici',
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
// ARCHIVE REASON BOX
// ══════════════════════════════════════════════════════════════════════════════
class _ArchiveReasonBox extends StatelessWidget {
  final String reason;
  const _ArchiveReasonBox({required this.reason});

  @override
  Widget build(BuildContext context) {
    if (reason.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.red.shade100),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, color: Colors.red.shade400, size: 14),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              reason,
              style: tInter(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: Colors.red.shade700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
