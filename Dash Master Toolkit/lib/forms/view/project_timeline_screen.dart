// lib/forms/view/project_timeline_screen.dart
//
// CRM Project Timeline — displays actions in reverse-chronological order.
// GetX controller owns the list; the screen uses Obx for reactive rendering.

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:dio/dio.dart' as dio;

import 'package:dash_master_toolkit/core/config/api_config.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/providers/api_client.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/route/my_route.dart';

import '../controller/project_timeline_controller.dart';
import 'add_project_action_screen.dart';
import '../../services/project_action_api.dart';

class ProjectTimelineScreen extends StatefulWidget {
  final String projectId;

  const ProjectTimelineScreen({super.key, required this.projectId});

  @override
  State<ProjectTimelineScreen> createState() => _ProjectTimelineScreenState();
}

class _ProjectTimelineScreenState extends State<ProjectTimelineScreen> {
  // One controller per screen instance — deleted in dispose.
  late final ProjectTimelineController _ctrl;

  // Prevents rapid FAB taps from opening multiple Add-Action screens.
  bool _openingAddAction = false;

  late final bool _isAdmin;

  /// Admin-only toggle: show all project timelines vs. only this project.
  bool _allTimelinesMode = false;

  @override
  void initState() {
    super.initState();
    _isAdmin = AuthService().isAdmin;
    _ctrl = Get.isRegistered<ProjectTimelineController>()
        ? Get.find<ProjectTimelineController>()
        : Get.put(ProjectTimelineController());
    _ctrl.loadActions(widget.projectId);
  }

  void _reload() {
    if (_allTimelinesMode) {
      _ctrl.loadAllActions();
    } else {
      _ctrl.loadActions(widget.projectId);
    }
  }

  void _toggleAllTimelines() {
    setState(() => _allTimelinesMode = !_allTimelinesMode);
    _reload();
  }

  @override
  void dispose() {
    if (Get.isRegistered<ProjectTimelineController>()) {
      Get.delete<ProjectTimelineController>();
    }
    super.dispose();
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  Future<void> _openAddAction() async {
    // Idempotency gate — a second tap while the route transition is in-flight
    // is silently dropped.  The flag is cleared in the finally block so it
    // resets whether the user saves, cancels, or swipes back.
    if (_openingAddAction) return;
    setState(() => _openingAddAction = true);

    try {
      String suggested = 'Visite';
      if (_ctrl.actions.isNotEmpty) {
        suggested = _nextAction(_ctrl.actions.first.typeAction) ??
            _ctrl.actions.first.typeAction;
      }

      final result = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => AddProjectActionScreen(
            projectId: widget.projectId,
            initialType: suggested,
          ),
        ),
      );

      // Only one reload regardless of how quickly the user tapped.
      if (result == true && mounted) {
        _reload();
      }
    } finally {
      if (mounted) setState(() => _openingAddAction = false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  Future<void> _deleteAction(String actionId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: Text('Delete action',
            style: tInter(fontSize: 16, fontWeight: FontWeight.w700)),
        content: Text('This action cannot be undone.',
            style: tInter(fontSize: 13, color: kCrmTextSub)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: tInter(color: kCrmTextSub)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: kCrmDanger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Delete', style: tInter(color: Colors.white)),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await ApiClient.instance.dio.delete('/projects/actions/$actionId');
      _reload();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not delete action')));
    }
  }

  // ── Reminder ───────────────────────────────────────────────────────────────
  Future<void> _openReminder(String actionId) async {
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    final date = await showDatePicker(
      context: context,
      initialDate: tomorrow,
      firstDate: tomorrow,
      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
            colorScheme: const ColorScheme.light(primary: kCrmPrimary)),
        child: child!,
      ),
    );
    if (date == null || !mounted) return;

    final msgCtrl = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: Text('Set Follow-up',
            style: tInter(fontSize: 16, fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            const Icon(Icons.calendar_month_outlined,
                size: 16, color: kCrmPrimary),
            const SizedBox(width: 6),
            Text(DateFormat('EEEE, dd MMM yyyy').format(date),
                style: tInter(fontSize: 13, color: kCrmPrimary,
                    fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 12),
          TextField(
            controller: msgCtrl,
            decoration: InputDecoration(
              hintText: 'Reminder note (optional)',
              hintStyle: tInter(fontSize: 13, color: kCrmTextSub),
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ]),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: tInter(color: kCrmTextSub)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: kCrmPrimary),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Save', style: tInter(color: Colors.white)),
          ),
        ],
      ),
    );
    if (saved != true) return;

    try {
      await ApiClient.instance.dio.post(
        '/projects/actions/$actionId/reminders',
        data: {
          'dateRelance': date.toIso8601String(),
          'message': msgCtrl.text.trim(),
        },
      );
      _reload();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not save reminder')));
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      appBar: AppBar(
        backgroundColor: kCrmSurface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: kCrmTextSub),
          onPressed: () => context.canPop()
              ? context.pop()
              : context.go(MyRoute.projectPipeline),
        ),
        title: Text(
          _allTimelinesMode ? 'All Timelines' : 'CRM Timeline',
          style: tInter(
              fontSize: 16, fontWeight: FontWeight.w700, color: kCrmText),
        ),
        actions: [
          if (_isAdmin)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Tooltip(
                message: _allTimelinesMode
                    ? 'Show this project only'
                    : 'Show all projects (Admin)',
                child: IconButton(
                  icon: Icon(
                    _allTimelinesMode
                        ? Icons.person_rounded
                        : Icons.group_rounded,
                    color: _allTimelinesMode ? kCrmPrimary : kCrmTextSub,
                  ),
                  onPressed: _toggleAllTimelines,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: OutlinedButton.icon(
              onPressed: () => context.go(MyRoute.projectPipeline),
              icon: const Icon(Icons.view_kanban_rounded, size: 15),
              label: Text('Pipeline', style: tInter(fontSize: 12)),
              style: OutlinedButton.styleFrom(
                foregroundColor: kCrmPrimary,
                side: const BorderSide(color: kCrmPrimary),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: kCrmBorder),
        ),
      ),
      floatingActionButton: _allTimelinesMode
          ? null
          : FloatingActionButton.extended(
              // null disables the button and greys it out automatically.
              onPressed: _openingAddAction ? null : _openAddAction,
              backgroundColor: kCrmPrimary,
              disabledElevation: 0,
              icon: _openingAddAction
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.add_rounded, color: Colors.white),
              label: Text(
                _openingAddAction ? 'Opening…' : 'Add Action',
                style: tInter(color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ),
      body: Obx(() {
        if (_ctrl.loading.value) {
          return const Center(
              child: CircularProgressIndicator(color: kCrmPrimary));
        }

        if (_ctrl.error.value != null) {
          return _ErrorState(
            message: _ctrl.error.value!,
            onRetry: _reload,
          );
        }

        if (_ctrl.actions.isEmpty) {
          return _EmptyState(onAdd: _openAddAction);
        }

        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          itemCount: _ctrl.actions.length,
          itemBuilder: (_, i) => _ActionCard(
            action: _ctrl.actions[i],
            isFirst: i == 0,
            isLast: i == _ctrl.actions.length - 1,
            onDelete: () => _deleteAction(_ctrl.actions[i].id),
            onEdit: () => _editAction(_ctrl.actions[i]),
            onReminder: () => _openReminder(_ctrl.actions[i].id),
            onRetrySync: () => _retryGoogleSync(_ctrl.actions[i].id),
          ),
        );
      }),
    );
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  Future<void> _editAction(ProjectActionModel action) async {
    final saved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _EditActionDialog(action: action),
    );
    if (saved == true) {
      _reload();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Action updated successfully',
            style: tInter(fontSize: 13, color: Colors.white)),
        backgroundColor: kCrmSuccess,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
    }
  }

  // ── Retry Google Calendar sync (point 11) ─────────────────────────────────
  Future<void> _retryGoogleSync(String actionId) async {
    try {
      await ProjectActionApi.instance.retryGoogleSync(
        projectId: widget.projectId,
        actionId: actionId,
      );
      _reload();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Synchronisation relancée',
            style: tInter(fontSize: 13, color: Colors.white)),
        backgroundColor: kCrmSuccess,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Échec de la nouvelle tentative',
            style: tInter(fontSize: 13, color: Colors.white)),
        backgroundColor: kCrmDanger,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
    }
  }

  // ── Pipeline next-stage logic ──────────────────────────────────────────────
  static String? _nextAction(String current) {
    const map = {
      'Visite'         : 'Plan technique',
      'Plan technique' : 'Echantillonnage',
      'Echantillonnage': 'Devis envoyé',
      'Devis envoyé'   : 'Negociation',
      'Negociation'    : 'Commande gagnée',
      'Commande gagnée': 'Fidelisation',
    };
    return map[current];
  }
}

// ── Action card ───────────────────────────────────────────────────────────────

class _ActionCard extends StatelessWidget {
  final ProjectActionModel action;
  final bool isFirst;
  final bool isLast;
  final VoidCallback onDelete;
  final VoidCallback onEdit;
  final VoidCallback onReminder;
  final VoidCallback onRetrySync;

  const _ActionCard({
    required this.action,
    required this.isFirst,
    required this.isLast,
    required this.onDelete,
    required this.onEdit,
    required this.onReminder,
    required this.onRetrySync,
  });

  @override
  Widget build(BuildContext context) {
    final color = kActionColor(action.typeAction);
    final date = _parseDate(action.dateAction);

    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // ── Timeline rail ────────────────────────────────────────────────
        SizedBox(
          width: 48,
          child: Column(children: [
            Container(
              width: 2,
              height: isFirst ? 20 : null,
              color: isFirst ? Colors.transparent : kCrmBorder,
            ),
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
                border: Border.all(color: color, width: 1.5),
              ),
              child: Icon(kActionIcon(action.typeAction),
                  size: 14, color: color),
            ),
            Expanded(
              child: Container(
                width: 2,
                color: isLast ? Colors.transparent : kCrmBorder,
              ),
            ),
          ]),
        ),

        // ── Card body ────────────────────────────────────────────────────
        Expanded(
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: kCrmSurface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kCrmBorder),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.03),
                    blurRadius: 6,
                    offset: const Offset(0, 2))
              ],
            ),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 8, 0),
                child: Row(children: [
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(action.typeAction,
                          style: tInter(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: kCrmText)),
                      const SizedBox(height: 2),
                      Text(
                        date != null
                            ? DateFormat('dd MMM yyyy • HH:mm').format(date)
                            : '—',
                        style:
                            tInter(fontSize: 11, color: kCrmTextSub),
                      ),
                    ]),
                  ),
                  // Status badge
                  if (action.statut != null)
                    _StatusBadge(action.statut!),
                  const SizedBox(width: 4),
                  IconButton(
                    icon: const Icon(Icons.edit_outlined,
                        size: 16, color: kCrmPrimary),
                    tooltip: 'Edit',
                    onPressed: onEdit,
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete_outline_rounded,
                        size: 16, color: kCrmTextSub),
                    tooltip: 'Delete',
                    onPressed: onDelete,
                  ),
                ]),
              ),

              // Calendar / Google Calendar sync indicator
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 6, 14, 0),
                child: _CalendarSyncBadge(action: action, onRetry: onRetrySync),
              ),

              // Comment
              if (action.commentaire != null &&
                  action.commentaire!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
                  child: Text(action.commentaire!,
                      style: tInter(fontSize: 13, color: kCrmTextSub)),
                ),

              // File attachment
              if (action.fileUrl != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
                  child: InkWell(
                    onTap: () => _openFile(context, action.fileUrl!),
                    borderRadius: BorderRadius.circular(6),
                    child: Row(children: [
                      Icon(
                        action.fileUrl!.toLowerCase().endsWith('.pdf')
                            ? Icons.picture_as_pdf_rounded
                            : Icons.image_rounded,
                        size: 15,
                        color: kCrmPrimary,
                      ),
                      const SizedBox(width: 6),
                      Text('View attachment',
                          style: tInter(
                              fontSize: 12,
                              color: kCrmPrimary,
                              decoration: TextDecoration.underline)),
                    ]),
                  ),
                ),

              // Reminders
              if (action.reminders.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                  child: Column(
                    children: action.reminders
                        .map((r) => _ReminderChip(r))
                        .toList(),
                  ),
                ),

              // Actions row
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                child: OutlinedButton.icon(
                  onPressed: onReminder,
                  icon: const Icon(Icons.alarm_add_rounded, size: 14),
                  label: Text('Follow-up',
                      style: tInter(fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: kCrmWarning,
                    side: BorderSide(
                        color: kCrmWarning.withValues(alpha: 0.5)),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  static DateTime? _parseDate(String s) {
    if (s.isEmpty) return null;
    try {
      return DateTime.parse(s).toLocal();
    } catch (_) {
      return null;
    }
  }

  static Future<void> _openFile(BuildContext context, String fileUrl) async {
    final url = fileUrl.startsWith('http')
        ? fileUrl
        : '${ApiConfig.baseUrl}$fileUrl';
    try {
      final uri = Uri.parse(url);
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Cannot open file')));
        }
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Invalid file URL')));
      }
    }
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  final String statut;

  const _StatusBadge(this.statut);

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (statut) {
      case 'Fait':
        color = kCrmSuccess;
      case 'En cours':
        color = kCrmInfo;
      case 'Annulé':
        color = kCrmDanger;
      default:
        color = kCrmWarning;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(statut,
          style: tInter(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: color)),
    );
  }
}

// ── Calendar / Google Calendar sync indicator ─────────────────────────────────
// Point 11 : "✓ Synchronisé" ne doit JAMAIS s'afficher tant que Google n'a
// pas réellement confirmé la création de l'événement (googleEventId +
// succès HTTP — voir ProjectActionModel.isGoogleSynced). Toute autre
// situation (pas encore synchronisé, compte non connecté, échec Google)
// affiche "⚠ Non synchronisé" + un bouton pour réessayer.
class _CalendarSyncBadge extends StatelessWidget {
  final ProjectActionModel action;
  final VoidCallback onRetry;

  const _CalendarSyncBadge({required this.action, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    if (!action.isCalendarSynced) return const SizedBox.shrink();

    if (action.isGoogleSynced) {
      return Tooltip(
        message: 'Synchronisé avec Google Calendar',
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.check_circle_rounded, size: 12, color: kCrmSuccess),
          const SizedBox(width: 4),
          Text('Synchronisé', style: tInter(fontSize: 10, fontWeight: FontWeight.w600, color: kCrmSuccess)),
        ]),
      );
    }

    final hasError = action.googleCalendarError != null && action.googleCalendarError!.isNotEmpty;
    final tooltip = hasError
        ? 'Erreur de synchronisation : ${action.googleCalendarError}'
        : 'Google Calendar non connecté. L\'événement est enregistré dans votre calendrier CRM.';

    return Tooltip(
      message: tooltip,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.warning_amber_rounded, size: 12, color: kCrmWarning),
        const SizedBox(width: 4),
        Text('Non synchronisé', style: tInter(fontSize: 10, fontWeight: FontWeight.w600, color: kCrmWarning)),
        const SizedBox(width: 8),
        InkWell(
          onTap: onRetry,
          borderRadius: BorderRadius.circular(4),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.refresh_rounded, size: 12, color: kCrmPrimary),
            const SizedBox(width: 2),
            Text('Réessayer la synchronisation',
                style: tInter(fontSize: 10, fontWeight: FontWeight.w600, color: kCrmPrimary,
                    decoration: TextDecoration.underline)),
          ]),
        ),
      ]),
    );
  }
}

// ── Reminder chip ─────────────────────────────────────────────────────────────

class _ReminderChip extends StatelessWidget {
  final ReminderModel reminder;

  const _ReminderChip(this.reminder);

  @override
  Widget build(BuildContext context) {
    DateTime? date;
    try {
      date = reminder.dateRelance.isNotEmpty
          ? DateTime.parse(reminder.dateRelance).toLocal()
          : null;
    } catch (_) {}

    final isPast = date != null && date.isBefore(DateTime.now());
    final isSoon = !isPast &&
        date != null &&
        date.difference(DateTime.now()).inHours <= 48;
    final color = isPast ? kCrmDanger : (isSoon ? kCrmWarning : kCrmSuccess);

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(children: [
        Icon(Icons.notifications_active_rounded, size: 14, color: color),
        const SizedBox(width: 6),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
            Text(
              date != null
                  ? 'Follow-up: ${DateFormat('dd MMM yyyy').format(date)}'
                  : 'Follow-up: ${reminder.dateRelance}',
              style: tInter(
                  fontSize: 12, fontWeight: FontWeight.w600, color: color),
            ),
            if (reminder.message != null && reminder.message!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(reminder.message!,
                    style: tInter(fontSize: 11, color: kCrmTextSub)),
              ),
          ]),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
              color: color, borderRadius: BorderRadius.circular(4)),
          child: Text(
            isPast ? 'Overdue' : (isSoon ? 'Soon' : 'Upcoming'),
            style: tInter(
                fontSize: 9, fontWeight: FontWeight.w700,
                color: Colors.white),
          ),
        ),
      ]),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final VoidCallback onAdd;

  const _EmptyState({required this.onAdd});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: kCrmPrimary.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.timeline_rounded,
                size: 40, color: kCrmPrimary),
          ),
          const SizedBox(height: 20),
          Text('No actions yet',
              style: tInter(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: kCrmText)),
          const SizedBox(height: 8),
          Text(
            'Start tracking this project by adding your first CRM action.',
            textAlign: TextAlign.center,
            style: tInter(fontSize: 13, color: kCrmTextSub),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add_rounded, size: 16),
            label: Text('Add First Action',
                style: tInter(
                    fontWeight: FontWeight.w600, color: Colors.white)),
            style: FilledButton.styleFrom(
              backgroundColor: kCrmPrimary,
              padding:
                  const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ]),
      ),
    );
  }
}

// ── Error state ───────────────────────────────────────────────────────────────

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline_rounded,
              size: 40, color: kCrmDanger),
          const SizedBox(height: 16),
          Text('Failed to load timeline',
              style: tInter(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: kCrmText)),
          const SizedBox(height: 8),
          Text(message,
              textAlign: TextAlign.center,
              style: tInter(fontSize: 12, color: kCrmTextSub)),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 15),
            label: Text('Retry', style: tInter(fontSize: 13)),
            style: OutlinedButton.styleFrom(
                foregroundColor: kCrmPrimary,
                side: const BorderSide(color: kCrmPrimary)),
          ),
        ]),
      ),
    );
  }
}

// ── Edit action dialog ────────────────────────────────────────────────────────
//
// StatefulWidget because it owns form state (selected type, statut, saving
// flag). Returns true via Navigator.pop when the PUT succeeds so the
// caller can reload the timeline and show a success snackbar.

class _EditActionDialog extends StatefulWidget {
  final ProjectActionModel action;

  const _EditActionDialog({required this.action});

  @override
  State<_EditActionDialog> createState() => _EditActionDialogState();
}

class _EditActionDialogState extends State<_EditActionDialog> {
  static const _actionTypes = [
    'Visite',
    'Plan technique',
    'Echantillonnage',
    'Devis envoyé',
    'Negociation',
    'Relance',
    'Commande gagnée',
    'Commande perdue',
    'Fidelisation',
  ];

  static const _statuts = ['A faire', 'En cours', 'Fait', 'Annulé'];

  late String _type;
  late String _statut;
  late final TextEditingController _commentaire;

  // ── File upload state ─────────────────────────────────────────────────────
  // Bytes are only set after the user picks a replacement file.
  // When null the backend keeps the existing attachment unchanged.
  Uint8List? _newFileBytes;
  String? _newFileName;

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _type = _actionTypes.contains(widget.action.typeAction)
        ? widget.action.typeAction
        : _actionTypes.first;
    _statut = _statuts.contains(widget.action.statut)
        ? widget.action.statut!
        : _statuts.first;
    _commentaire =
        TextEditingController(text: widget.action.commentaire ?? '');
  }

  @override
  void dispose() {
    _commentaire.dispose();
    super.dispose();
  }

  // ── File picker ───────────────────────────────────────────────────────────
  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      withData: true, // required on Flutter Web
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'],
    );
    if (result == null) return;
    final f = result.files.first;
    if (f.bytes == null) return;
    setState(() {
      _newFileBytes = f.bytes;
      _newFileName = f.name;
    });
  }

  void _removeNewFile() => setState(() {
        _newFileBytes = null;
        _newFileName = null;
      });

  // ── PUT — always FormData so the file part is optional without a separate
  //   code path.  When no file is picked the 'file' part is simply absent.
  // ─────────────────────────────────────────────────────────────────────────
  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);

    try {
      final fd = dio.FormData();
      fd.fields.addAll([
        MapEntry('typeAction',        _type),
        MapEntry('typeAction_legacy', _type),
        MapEntry('commentaire',       _commentaire.text.trim()),
        MapEntry('statut',            _statut),
      ]);

      // Only attach file part if the user picked a replacement.
      if (_newFileBytes != null && _newFileName != null) {
        fd.files.add(MapEntry(
          'file',
          dio.MultipartFile.fromBytes(
            _newFileBytes!,
            filename: _newFileName,
          ),
        ));
      }

      await ApiClient.instance.dio.put(
        '/projects/actions/${widget.action.id}',
        data: fd,
      );

      if (mounted) Navigator.pop(context, true);
    } on Exception catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Failed to update: ${_parseError(e)}',
            style: tInter(fontSize: 13, color: Colors.white)),
        backgroundColor: kCrmDanger,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  static String _parseError(Object e) {
    final s = e.toString();
    final match = RegExp(r'"message"\s*:\s*"([^"]+)"').firstMatch(s);
    return match?.group(1) ?? s;
  }

  // ── Shared input decoration ───────────────────────────────────────────────
  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: tInter(fontSize: 13, color: kCrmTextSub),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: kCrmBorder)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: kCrmBorder)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: kCrmPrimary, width: 1.5)),
        filled: true,
        fillColor: kCrmSurface,
      );

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480, maxHeight: 680),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Fixed header ─────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 16, 0),
              child: Row(children: [
                Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: kCrmPrimary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.edit_rounded,
                      size: 14, color: kCrmPrimary),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('Edit Action',
                      style: tInter(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: kCrmText)),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded,
                      size: 18, color: kCrmTextSub),
                  onPressed:
                      _saving ? null : () => Navigator.pop(context, false),
                ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 4, 24, 0),
              child: Text('Edit fields and optionally replace the attachment.',
                  style: tInter(fontSize: 11, color: kCrmTextSub)),
            ),
            const SizedBox(height: 16),
            const Divider(height: 1),

            // ── Scrollable body ──────────────────────────────────────────
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Action type
                    _FieldLabel('Action Type', required: true),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: _type,
                      decoration: _dec('Select action type'),
                      style: tInter(fontSize: 13, color: kCrmText),
                      items: _actionTypes
                          .map((v) => DropdownMenuItem(
                                value: v,
                                child: Row(children: [
                                  Icon(kActionIcon(v),
                                      size: 14, color: kActionColor(v)),
                                  const SizedBox(width: 8),
                                  Text(v,
                                      style: tInter(
                                          fontSize: 13, color: kCrmText)),
                                ]),
                              ))
                          .toList(),
                      onChanged:
                          _saving ? null : (v) => setState(() => _type = v!),
                    ),

                    const SizedBox(height: 14),

                    // Status
                    _FieldLabel('Status'),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: _statut,
                      decoration: _dec('Select status'),
                      style: tInter(fontSize: 13, color: kCrmText),
                      items: _statuts
                          .map((v) => DropdownMenuItem(
                                value: v,
                                child: Text(v,
                                    style:
                                        tInter(fontSize: 13, color: kCrmText)),
                              ))
                          .toList(),
                      onChanged: _saving
                          ? null
                          : (v) => setState(() => _statut = v!),
                    ),

                    const SizedBox(height: 14),

                    // Comment
                    _FieldLabel('Comment'),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _commentaire,
                      maxLines: 3,
                      enabled: !_saving,
                      style: tInter(fontSize: 13, color: kCrmText),
                      decoration: _dec('Add or update note…'),
                    ),

                    const SizedBox(height: 20),
                    const Divider(),
                    const SizedBox(height: 16),

                    // ── Attachment section ───────────────────────────────
                    _FieldLabel('Attachment'),
                    const SizedBox(height: 10),

                    // Current attachment (from backend)
                    if (widget.action.fileUrl != null &&
                        _newFileBytes == null) ...[
                      _CurrentFileTile(
                        fileUrl: widget.action.fileUrl!,
                        disabled: _saving,
                      ),
                      const SizedBox(height: 8),
                    ],

                    // New file picked by the user
                    if (_newFileBytes != null && _newFileName != null) ...[
                      _NewFileTile(
                        fileName: _newFileName!,
                        onRemove: _saving ? null : _removeNewFile,
                      ),
                      const SizedBox(height: 8),
                    ],

                    // Pick / replace button
                    OutlinedButton.icon(
                      onPressed: _saving ? null : _pickFile,
                      icon: const Icon(Icons.upload_file_rounded, size: 16),
                      label: Text(
                        widget.action.fileUrl == null && _newFileBytes == null
                            ? 'Upload attachment'
                            : _newFileBytes != null
                                ? 'Choose different file'
                                : 'Replace attachment',
                        style: tInter(fontSize: 13),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: kCrmPrimary,
                        side: const BorderSide(color: kCrmPrimary, width: 1.2),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                    ),

                    // Supported formats hint
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'PDF, JPG, PNG, WEBP, DOC, DOCX',
                        style: tInter(fontSize: 11, color: kCrmTextSub),
                      ),
                    ),

                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),

            // ── Fixed footer buttons ─────────────────────────────────────
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
              child: Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving
                        ? null
                        : () => Navigator.pop(context, false),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: kCrmTextSub,
                      side: const BorderSide(color: kCrmBorder),
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                    child: Text('Cancel', style: tInter(fontSize: 13)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    style: FilledButton.styleFrom(
                      backgroundColor: kCrmPrimary,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                    icon: _saving
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.check_rounded,
                            size: 15, color: Colors.white),
                    label: Text(
                      _saving ? 'Saving…' : 'Save Changes',
                      style: tInter(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white),
                    ),
                  ),
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Current attachment tile ───────────────────────────────────────────────────
//
// Shows the file already stored on the backend.  Tapping opens it via
// url_launcher.  Hidden when the user has picked a replacement file.

class _CurrentFileTile extends StatelessWidget {
  final String fileUrl;
  final bool disabled;

  const _CurrentFileTile({required this.fileUrl, required this.disabled});

  @override
  Widget build(BuildContext context) {
    final lower = fileUrl.toLowerCase();
    final isPdf = lower.endsWith('.pdf');
    final isImage = lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp');
    final icon =
        isPdf ? Icons.picture_as_pdf_rounded : isImage ? Icons.image_rounded : Icons.attach_file_rounded;

    final displayName = fileUrl.split('/').last;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: kCrmPrimary.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kCrmPrimary.withValues(alpha: 0.25)),
      ),
      child: Row(children: [
        Icon(icon, size: 18, color: kCrmPrimary),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Current attachment',
                style: tInter(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: kCrmTextSub)),
            const SizedBox(height: 2),
            Text(displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tInter(fontSize: 12, color: kCrmText)),
          ]),
        ),
        const SizedBox(width: 8),
        TextButton.icon(
          onPressed: disabled
              ? null
              : () async {
                  final url = fileUrl.startsWith('http')
                      ? fileUrl
                      : '${ApiConfig.baseUrl}$fileUrl';
                  try {
                    await launchUrl(Uri.parse(url),
                        mode: LaunchMode.externalApplication);
                  } catch (_) {}
                },
          icon: const Icon(Icons.open_in_new_rounded, size: 13),
          label: Text('View', style: tInter(fontSize: 12)),
          style: TextButton.styleFrom(
            foregroundColor: kCrmPrimary,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          ),
        ),
      ]),
    );
  }
}

// ── Newly-picked file tile ────────────────────────────────────────────────────
//
// Shows the file the user just selected from disk.  The × button lets them
// clear the selection and revert to the existing backend attachment.

class _NewFileTile extends StatelessWidget {
  final String fileName;
  final VoidCallback? onRemove;

  const _NewFileTile({required this.fileName, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: kCrmSuccess.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kCrmSuccess.withValues(alpha: 0.3)),
      ),
      child: Row(children: [
        const Icon(Icons.check_circle_rounded, size: 16, color: kCrmSuccess),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Ready to upload',
                style: tInter(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: kCrmSuccess)),
            const SizedBox(height: 2),
            Text(fileName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tInter(fontSize: 12, color: kCrmText)),
          ]),
        ),
        if (onRemove != null)
          IconButton(
            icon: const Icon(Icons.close_rounded, size: 16, color: kCrmTextSub),
            tooltip: 'Remove',
            onPressed: onRemove,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
          ),
      ]),
    );
  }
}

// ── Reusable field label for dialogs ──────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  final String text;
  final bool required;

  const _FieldLabel(this.text, {this.required = false});

  @override
  Widget build(BuildContext context) => RichText(
        text: TextSpan(
          style: tInter(
              fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText),
          children: [
            TextSpan(text: text),
            if (required)
              const TextSpan(
                  text: ' *',
                  style: TextStyle(
                      color: kCrmDanger, fontWeight: FontWeight.w900)),
          ],
        ),
      );
}
