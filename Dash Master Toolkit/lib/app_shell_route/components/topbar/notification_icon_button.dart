import '../common_imports.dart' hide NotificationController, NotificationData;
import 'package:get/get.dart';
import 'package:dash_master_toolkit/app_shell_route/components/topbar/NotificationController.dart';
import 'package:dash_master_toolkit/app_shell_route/models/notification.dart';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

String _timeAgo(String raw) {
  if (raw.isEmpty) return '';
  try {
    final dt   = DateTime.parse(raw).toLocal();
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'À l\'instant';
    if (diff.inMinutes < 60) return 'Il y a ${diff.inMinutes} min';
    if (diff.inHours   < 24) return 'Il y a ${diff.inHours} h';
    if (diff.inDays    == 1) return 'Hier';
    if (diff.inDays    <  7) return 'Il y a ${diff.inDays} jours';
    return '${dt.day.toString().padLeft(2,'0')}/${dt.month.toString().padLeft(2,'0')}/${dt.year}';
  } catch (_) { return ''; }
}

typedef _TypeStyle = ({IconData icon, Color bg, Color fg});

_TypeStyle _typeStyle(String type) {
  final t = type.toUpperCase();
  if (t.contains('RELANCE') || t.contains('FOLLOWUP')) {
    return (icon: Icons.alarm_rounded,         bg: const Color(0xFFFFF7ED), fg: const Color(0xFFF97316));
  }
  if (t.contains('VALID')) {
    return (icon: Icons.check_circle_rounded,  bg: const Color(0xFFF0FDF4), fg: const Color(0xFF22C55E));
  }
  if (t.contains('ARCHIV')) {
    return (icon: Icons.archive_rounded,       bg: const Color(0xFFEFF6FF), fg: const Color(0xFF3B82F6));
  }
  if (t.contains('ERROR') || t.contains('MISSING')) {
    return (icon: Icons.error_rounded,         bg: const Color(0xFFFEF2F2), fg: const Color(0xFFEF4444));
  }
  if (t.contains('MESSAGE') || t.contains('COMMENT')) {
    return (icon: Icons.chat_bubble_rounded,   bg: const Color(0xFFF5F3FF), fg: const Color(0xFF8B5CF6));
  }
  return   (icon: Icons.notifications_rounded, bg: const Color(0xFFEFF6FF), fg: const Color(0xFF3B82F6));
}

bool _isRelance(String t)    => t.toUpperCase().contains('RELANCE') || t.toUpperCase().contains('FOLLOWUP');
bool _isValidation(String t) => t.toUpperCase().contains('VALID');
bool _isArchive(String t)    => t.toUpperCase().contains('ARCHIV');

// ─────────────────────────────────────────────────────────────────────────────
// BELL ICON BUTTON
// ─────────────────────────────────────────────────────────────────────────────
class NotificationIconButton extends StatelessWidget {
  const NotificationIconButton({super.key, this.notificationCount = 0});
  final int notificationCount;

  @override
  Widget build(BuildContext context) {
    final ctrl = Get.isRegistered<NotificationController>()
        ? Get.find<NotificationController>()
        : Get.put(NotificationController(), permanent: true);

    return Obx(() {
      final count = ctrl.unreadCount.value;
      return MouseRegion(
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: () => _openCenter(context, ctrl),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              SvgPicture.asset(
                bellIcon,
                width: 22, height: 22,
                colorFilter: ColorFilter.mode(
                  ctrl.themeController.isDarkMode ? colorWhite : colorGrey900,
                  BlendMode.srcIn,
                ),
              ),
              if (count > 0)
                Positioned(
                  right: -4, top: -4,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(
                      child: Text(
                        count > 99 ? '99+' : '$count',
                        style: const TextStyle(
                          fontSize: 9, color: Colors.white, fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    });
  }

  void _openCenter(BuildContext ctx, NotificationController ctrl) {
    ctrl.fetchNotifications(silent: true);
    showGeneralDialog(
      context: ctx,
      barrierDismissible: true,
      barrierLabel: 'notif-center',
      barrierColor: Colors.black.withOpacity(0.12),
      transitionDuration: const Duration(milliseconds: 260),
      pageBuilder: (dialogCtx, _, __) {
        final w = MediaQuery.of(dialogCtx).size.width;
        final isPhone  = w < 600;
        final panelW   = isPhone ? w - 24.0 : (w < 1024 ? 390.0 : 430.0);

        final panel = _NotificationPanel(ctrl: ctrl, width: panelW, parentCtx: ctx);

        return isPhone
            ? Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  child: Material(color: Colors.transparent, child: panel),
                ),
              )
            : Align(
                alignment: Alignment.topRight,
                child: Padding(
                  padding: const EdgeInsets.only(top: 56, right: 14),
                  child: Material(color: Colors.transparent, child: panel),
                ),
              );
      },
      transitionBuilder: (_, anim, __, child) => FadeTransition(
        opacity: CurvedAnimation(parent: anim, curve: Curves.easeOut),
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, -0.04), end: Offset.zero,
          ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
          child: child,
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION PANEL  (owns filter + search state)
// ─────────────────────────────────────────────────────────────────────────────
class _NotificationPanel extends StatefulWidget {
  const _NotificationPanel({
    required this.ctrl,
    required this.width,
    required this.parentCtx,
  });
  final NotificationController ctrl;
  final double width;
  final BuildContext parentCtx;

  @override
  State<_NotificationPanel> createState() => _NotificationPanelState();
}

class _NotificationPanelState extends State<_NotificationPanel> {
  static const _filters = ['Tous', 'Non lues', 'Relances', 'Validations', 'Archives'];
  final _searchCtrl  = TextEditingController();
  final _scrollCtrl  = ScrollController();
  int    _filterIdx  = 0;
  String _search     = '';

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(() {
      if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 80) {
        widget.ctrl.loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  List<NotificationData> _applyFilter(List<NotificationData> all) {
    var list = all;
    switch (_filterIdx) {
      case 1: list = list.where((n) => !n.isRead).toList(); break;
      case 2: list = list.where((n) => _isRelance(n.type)).toList(); break;
      case 3: list = list.where((n) => _isValidation(n.type)).toList(); break;
      case 4: list = list.where((n) => _isArchive(n.type)).toList(); break;
    }
    if (_search.isNotEmpty) {
      final q = _search;
      list = list.where((n) =>
        n.title.toLowerCase().contains(q) ||
        n.message.toLowerCase().contains(q) ||
        n.projectName.toLowerCase().contains(q)
      ).toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: widget.width,
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.84),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.14), blurRadius: 40, offset: const Offset(0, 12)),
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8,  offset: const Offset(0, 2)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(),
            _buildFilterBar(),
            _buildSearch(),
            Flexible(child: _buildBody(context)),
            _buildFooter(context),
          ],
        ),
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────
  Widget _buildHeader() => Obx(() {
    final unread = widget.ctrl.unreadCount.value;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 10, 14),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFF1F5F9), width: 1)),
      ),
      child: Row(children: [
        const Icon(Icons.notifications_rounded, size: 20, color: Color(0xFF6366F1)),
        const SizedBox(width: 10),
        const Text(
          'Notifications',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF0F172A), letterSpacing: -0.3),
        ),
        if (unread > 0) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: const Color(0xFFEF4444), borderRadius: BorderRadius.circular(20)),
            child: Text('$unread', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
          ),
        ],
        const Spacer(),
        if (unread > 0)
          TextButton(
            onPressed: widget.ctrl.markAllRead,
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFF6366F1),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              textStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
              minimumSize: Size.zero,
            ),
            child: const Text('Tout lire'),
          ),
        IconButton(
          icon: const Icon(Icons.close_rounded, size: 17, color: Color(0xFF94A3B8)),
          onPressed: () => Navigator.of(context).pop(),
          padding: const EdgeInsets.all(6),
          constraints: const BoxConstraints(),
        ),
      ]),
    );
  });

  // ── Filter tabs ───────────────────────────────────────────────────────────
  Widget _buildFilterBar() => Container(
    color: const Color(0xFFF8FAFC),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: List.generate(_filters.length, (i) {
          final active = _filterIdx == i;
          return Padding(
            padding: const EdgeInsets.only(right: 6),
            child: GestureDetector(
              onTap: () => setState(() => _filterIdx = i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: active ? const Color(0xFF6366F1) : Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: active ? const Color(0xFF6366F1) : const Color(0xFFE2E8F0)),
                ),
                child: Text(
                  _filters[i],
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: active ? Colors.white : const Color(0xFF64748B),
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    ),
  );

  // ── Search ────────────────────────────────────────────────────────────────
  Widget _buildSearch() => Padding(
    padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
    child: TextField(
      controller: _searchCtrl,
      onChanged: (v) => setState(() => _search = v.toLowerCase()),
      style: const TextStyle(fontSize: 13, color: Color(0xFF0F172A)),
      decoration: InputDecoration(
        hintText: 'Rechercher une notification...',
        hintStyle: const TextStyle(fontSize: 13, color: Color(0xFFCBD5E1)),
        prefixIcon: const Icon(Icons.search_rounded, size: 17, color: Color(0xFF94A3B8)),
        suffixIcon: _search.isNotEmpty
            ? IconButton(
                icon: const Icon(Icons.close_rounded, size: 14, color: Color(0xFF94A3B8)),
                onPressed: () { _searchCtrl.clear(); setState(() => _search = ''); },
              )
            : null,
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
        contentPadding: const EdgeInsets.symmetric(vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.5),
        ),
      ),
    ),
  );

  // ── Body ──────────────────────────────────────────────────────────────────
  Widget _buildBody(BuildContext context) => Obx(() {
    // Accès explicite à .value pour que GetX enregistre la dépendance
    final rawList = widget.ctrl.listOfNotification.value;
    final loading = widget.ctrl.isLoading.value;
    final list    = _applyFilter(List<NotificationData>.from(rawList));

    print("BUILD NOTIFICATIONS = ${rawList.length}");
    print("API COUNT = ${rawList.length}");
    print("STATE COUNT = ${list.length}");
    print("IS LOADING = $loading");

    // ── Priorité 1 : items disponibles → ListView ────────────────────────────
    if (list.isNotEmpty) {
      print("RENDER COUNT = ${list.length}");
      return ListView.separated(
        controller: _scrollCtrl,
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        itemCount: list.length + (loading && widget.ctrl.hasMore.value ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: 6),
        itemBuilder: (_, i) {
          if (i == list.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6366F1))),
            );
          }
          final n = list[i];
          print("RENDER ITEM = ${n.id}  title=${n.title}");
          return _NotifCard(
            notification: n,
            onMarkRead:   () => widget.ctrl.markOneRead(n.id),
            onDismiss:    () => widget.ctrl.deleteNotification(n.id),
            onViewProject: n.projectId.isNotEmpty
                ? () {
                    print("OPEN PROJECT = ${n.projectId}");
                    Navigator.of(context).pop();
                    // Route enregistrée : /forms/project?id=...  (MyRoute.projectFormScreen)
                    widget.parentCtx.go('/forms/project?id=${n.projectId}');
                  }
                : null,
          );
        },
      );
    }

    // ── Priorité 2 : vide + loading → spinner ────────────────────────────────
    if (loading) {
      return const SizedBox(
        height: 180,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6366F1))),
      );
    }

    // ── Priorité 3 : vide + terminé → empty state ────────────────────────────
    print("RENDER COUNT = 0  → empty state");
    return _buildEmpty();
  });

  // ── Empty state ───────────────────────────────────────────────────────────
  Widget _buildEmpty() => SizedBox(
    height: 220,
    child: Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: const Icon(Icons.notifications_outlined, size: 38, color: Color(0xFFCBD5E1)),
        ),
        const SizedBox(height: 16),
        const Text(
          'Aucune notification',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
        ),
        const SizedBox(height: 6),
        const Text(
          'Vous êtes à jour.',
          style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
        ),
      ]),
    ),
  );

  // ── Footer ────────────────────────────────────────────────────────────────
  Widget _buildFooter(BuildContext context) => Container(
    decoration: const BoxDecoration(
      border: Border(top: BorderSide(color: Color(0xFFF1F5F9))),
    ),
    child: TextButton(
      onPressed: () {
        Navigator.of(context).pop();
        // /notifications n'est pas enregistrée → redirection vers la liste projets
        widget.parentCtx.go('/users/project-list');
      },
      style: TextButton.styleFrom(
        foregroundColor: const Color(0xFF6366F1),
        minimumSize: const Size(double.infinity, 44),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(bottom: Radius.circular(20)),
        ),
      ),
      child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Text('Voir toutes les notifications', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        SizedBox(width: 6),
        Icon(Icons.arrow_forward_rounded, size: 14),
      ]),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION CARD
// ─────────────────────────────────────────────────────────────────────────────
class _NotifCard extends StatefulWidget {
  const _NotifCard({
    required this.notification,
    required this.onMarkRead,
    required this.onDismiss,
    this.onViewProject,
  });
  final NotificationData notification;
  final VoidCallback      onMarkRead;
  final VoidCallback      onDismiss;
  final VoidCallback?     onViewProject;

  @override
  State<_NotifCard> createState() => _NotifCardState();
}

class _NotifCardState extends State<_NotifCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final n       = widget.notification;
    final style   = _typeStyle(n.type);
    final isUnread = !n.isRead;
    final timeStr  = _timeAgo(n.createdAt);

    // ── Solution 1 : barre colorée séparée du container arrondi ─────────────
    // Flutter Web interdit borderRadius + couleurs de bordure non-uniformes.
    // La barre gauche devient un widget indépendant → aucun conflit.
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hovered = true),
      onExit:  (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: _hovered
              ? (isUnread ? style.bg : const Color(0xFFF8FAFC))
              : (isUnread ? style.bg.withOpacity(0.55) : Colors.white),
          // Bordure uniforme → compatible Flutter Web
          border: Border.all(color: const Color(0xFFEEF2F7), width: 0.8),
          boxShadow: _hovered
              ? [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 14, offset: const Offset(0, 4))]
              : null,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(13),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Barre gauche colorée (widget séparé, pas une bordure) ───
                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  width: 4,
                  color: isUnread ? style.fg : Colors.transparent,
                ),
                // ── Contenu principal ────────────────────────────────────────
                Expanded(
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: widget.onMarkRead,
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          // ── Icône ─────────────────────────────────────────
                          Container(
                            width: 40, height: 40,
                            decoration: BoxDecoration(
                              color: style.bg,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: style.fg.withOpacity(0.18)),
                            ),
                            child: Icon(style.icon, size: 20, color: style.fg),
                          ),
                          const SizedBox(width: 12),
                          // ── Texte ─────────────────────────────────────────
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(
                                  child: Text(
                                    n.title,
                                    maxLines: 1, overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: isUnread ? FontWeight.w700 : FontWeight.w600,
                                      color: const Color(0xFF0F172A),
                                    ),
                                  ),
                                ),
                                if (isUnread)
                                  Container(
                                    width: 7, height: 7,
                                    margin: const EdgeInsets.only(left: 8, top: 2),
                                    decoration: BoxDecoration(color: style.fg, shape: BoxShape.circle),
                                  ),
                              ]),
                              const SizedBox(height: 4),
                              Text(
                                n.message,
                                maxLines: 2, overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), height: 1.45),
                              ),
                              if (n.projectName.isNotEmpty) ...[
                                const SizedBox(height: 5),
                                Row(children: [
                                  const Icon(Icons.folder_rounded, size: 11, color: Color(0xFF94A3B8)),
                                  const SizedBox(width: 4),
                                  Flexible(
                                    child: Text(
                                      n.projectName,
                                      maxLines: 1, overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontWeight: FontWeight.w500),
                                    ),
                                  ),
                                ]),
                              ],
                              if (timeStr.isNotEmpty) ...[
                                const SizedBox(height: 3),
                                Text(timeStr, style: const TextStyle(fontSize: 10, color: Color(0xFFCBD5E1))),
                              ],
                              const SizedBox(height: 9),
                              Row(children: [
                                if (widget.onViewProject != null) ...[
                                  _ActionChip(
                                    label: 'Voir projet',
                                    color: style.fg,
                                    onTap: widget.onViewProject!,
                                  ),
                                  const SizedBox(width: 7),
                                ],
                                _ActionChip(
                                  label: 'Ignorer',
                                  color: const Color(0xFF94A3B8),
                                  onTap: widget.onDismiss,
                                  outlined: true,
                                ),
                              ]),
                            ]),
                          ),
                        ]),
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
// ACTION CHIP
// ─────────────────────────────────────────────────────────────────────────────
class _ActionChip extends StatefulWidget {
  const _ActionChip({required this.label, required this.color, required this.onTap, this.outlined = false});
  final String       label;
  final Color        color;
  final VoidCallback onTap;
  final bool         outlined;

  @override
  State<_ActionChip> createState() => _ActionChipState();
}

class _ActionChipState extends State<_ActionChip> {
  bool _h = false;

  @override
  Widget build(BuildContext context) => MouseRegion(
    cursor: SystemMouseCursors.click,
    onEnter: (_) => setState(() => _h = true),
    onExit:  (_) => setState(() => _h = false),
    child: GestureDetector(
      onTap: widget.onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: widget.outlined
              ? (_h ? widget.color.withOpacity(0.06) : Colors.transparent)
              : (_h ? widget.color.withOpacity(0.2) : widget.color.withOpacity(0.1)),
          borderRadius: BorderRadius.circular(7),
          border: widget.outlined ? Border.all(color: widget.color.withOpacity(0.3)) : null,
        ),
        child: Text(
          widget.label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: widget.color),
        ),
      ),
    ),
  );
}
