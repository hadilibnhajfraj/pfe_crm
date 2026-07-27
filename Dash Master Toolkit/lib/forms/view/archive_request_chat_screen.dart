// lib/forms/view/archive_request_chat_screen.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/providers/archive_request_provider.dart';
import 'package:dash_master_toolkit/models/archive_request_model.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

// ══════════════════════════════════════════════════════════════════════════════
// SCREEN
// ══════════════════════════════════════════════════════════════════════════════
class ArchiveRequestChatScreen extends StatefulWidget {
  final String requestId;
  const ArchiveRequestChatScreen({super.key, required this.requestId});

  @override
  State<ArchiveRequestChatScreen> createState() =>
      _ArchiveRequestChatScreenState();
}

class _ArchiveRequestChatScreenState extends State<ArchiveRequestChatScreen> {
  final _scrollCtrl = ScrollController();
  late final ArchiveRequestProvider _provider;

  @override
  void initState() {
    super.initState();
    _provider = ArchiveRequestProvider.to;
    // selectRequest modifie requests → appel hors build pour éviter
    // "markNeedsBuild called during build"
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _provider.selectRequest(widget.requestId);
    });
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // build : Obx lit les données, ne modifie rien
  // ──────────────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: _AppBar(provider: _provider, requestId: widget.requestId),
      body: Obx(() {
        // Lecture seule — aucun appel API, aucun .value=, aucun refresh()
        final request = _provider.requests
            .firstWhereOrNull((r) => r.id == widget.requestId);

        if (request == null) {
          return const Center(
              child: CircularProgressIndicator(strokeWidth: 2));
        }

        return Column(children: [
          if (_provider.isAdmin && request.status == 'pending')
            _AdminActionsBar(request: request, provider: _provider),

          if (request.status != 'pending')
            _StatusBanner(status: request.status),

          Expanded(
            // _MessagesList est StatefulWidget : il gère lui-même le scroll
            // dans didUpdateWidget — jamais depuis build()
            child: _MessagesList(
              request: request,
              provider: _provider,
              scrollCtrl: _scrollCtrl,
            ),
          ),

          _MessageInput(provider: _provider),
        ]);
      }),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// APP BAR
// ══════════════════════════════════════════════════════════════════════════════
class _AppBar extends StatelessWidget implements PreferredSizeWidget {
  final ArchiveRequestProvider provider;
  final String requestId;
  const _AppBar({required this.provider, required this.requestId});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight + 1);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor: Colors.white,
      elevation: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_rounded),
        onPressed: () => Navigator.of(context).pop(),
      ),
      titleSpacing: 0,
      title: Obx(() {
        // Lecture seule
        final req =
            provider.requests.firstWhereOrNull((r) => r.id == requestId);
        return Row(children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: kCrmPrimary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.forum_rounded, size: 18, color: kCrmPrimary),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    req?.projectName ?? 'Discussion',
                    style: tInter(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: kCrmText),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (req != null)
                    Text(
                      req.userEmail.isNotEmpty
                          ? req.userEmail
                          : req.userName,
                      style: tInter(fontSize: 11, color: kCrmTextSub),
                      overflow: TextOverflow.ellipsis,
                    ),
                ]),
          ),
        ]);
      }),
      actions: [
        Obx(() {
          // Lecture seule
          final req =
              provider.requests.firstWhereOrNull((r) => r.id == requestId);
          if (req == null) return const SizedBox.shrink();
          final color = _statusColor(req.status);
          return Container(
            margin: const EdgeInsets.only(right: 16, top: 12, bottom: 12),
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: color.withValues(alpha: 0.3)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(_statusIcon(req.status), size: 11, color: color),
              const SizedBox(width: 4),
              Text(_statusLabel(req.status),
                  style: tInter(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: color)),
            ]),
          );
        }),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Divider(height: 1, color: Colors.grey.shade200),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ACTIONS BAR
// ══════════════════════════════════════════════════════════════════════════════
class _AdminActionsBar extends StatelessWidget {
  final ArchiveRequest request;
  final ArchiveRequestProvider provider;
  const _AdminActionsBar({required this.request, required this.provider});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(children: [
        Icon(Icons.admin_panel_settings_rounded,
            size: 15, color: kCrmPrimary),
        const SizedBox(width: 8),
        Text('Décision admin :',
            style: tInter(
                fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText)),
        const Spacer(),
        _actionBtn(
          icon: Icons.check_circle_outline_rounded,
          label: 'Approuver',
          color: const Color(0xFF16A34A),
          onTap: () => _confirmApprove(context),
        ),
        const SizedBox(width: 8),
        _actionBtn(
          icon: Icons.cancel_outlined,
          label: 'Refuser',
          color: const Color(0xFFDC2626),
          onTap: () => _confirmReject(context),
        ),
      ]),
    );
  }

  Widget _actionBtn({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.28)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Text(label,
              style: tInter(
                  fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ]),
      ),
    );
  }

  void _confirmApprove(BuildContext ctx) {
    try {
      // ignore: avoid_print
      print('STEP 1 - REQUEST = ${request.toJson()}');

      final id = request.id.trim();
      if (id.isEmpty) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('ID demande introuvable')),
        );
        return;
      }

      final projectId = request.projectId.trim();
      // ignore: avoid_print
      print('STEP 2 - APPROVE → id=$id  projectId=$projectId');

      // ignore: avoid_print
      print('STEP 3 - Ouverture showDialog');

      // showDialog utilise le BuildContext Flutter — pas Get.overlayContext!
      showDialog<void>(
        context: ctx,
        builder: (dialogCtx) {
          // ignore: avoid_print
          print('STEP 4 - Dialog builder appelé');
          return AlertDialog(
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16)),
            title: Text('Approuver la demande',
                style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
            content: Text(
              'Désarchiver le projet "${request.projectName}" ?',
              style: tInter(fontSize: 13, color: kCrmTextSub),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  // ignore: avoid_print
                  print('STEP 5 - Annuler');
                  Navigator.of(dialogCtx).pop();
                },
                child: Text('Annuler', style: tInter(color: kCrmTextSub)),
              ),
              ElevatedButton(
                onPressed: () {
                  // ignore: avoid_print
                  print('STEP 5 - Confirmer Approuver');
                  Navigator.of(dialogCtx).pop();
                  // ignore: avoid_print
                  print('STEP 6 - Appel approveRequest($id)');
                  provider.approveRequest(id);
                  // ignore: avoid_print
                  print('STEP 7 - approveRequest lancé');
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF16A34A),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                child: Text('Approuver',
                    style: tInter(
                        color: Colors.white,
                        fontWeight: FontWeight.w600)),
              ),
            ],
          );
        },
      );

      // ignore: avoid_print
      print('STEP 3 done - showDialog appelé');
    } catch (e, stack) {
      // ignore: avoid_print
      print('APPROVE ERROR=');
      // ignore: avoid_print
      print(e);
      // ignore: avoid_print
      print(stack);
    }
  }

  void _confirmReject(BuildContext ctx) {
    try {
      // ignore: avoid_print
      print('STEP 1 - REQUEST = ${request.toJson()}');

      final id = request.id.trim();
      if (id.isEmpty) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('ID demande introuvable')),
        );
        return;
      }

      // ignore: avoid_print
      print('STEP 2 - REJECT → id=$id');

      // ignore: avoid_print
      print('STEP 3 - Ouverture showDialog');

      showDialog<void>(
        context: ctx,
        builder: (dialogCtx) {
          // ignore: avoid_print
          print('STEP 4 - Dialog builder appelé');
          return AlertDialog(
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16)),
            title: Text('Refuser la demande',
                style: tInter(fontSize: 15, fontWeight: FontWeight.w700)),
            content: Text(
              'Refuser la demande pour "${request.projectName}" ?',
              style: tInter(fontSize: 13, color: kCrmTextSub),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  // ignore: avoid_print
                  print('STEP 5 - Annuler');
                  Navigator.of(dialogCtx).pop();
                },
                child: Text('Annuler', style: tInter(color: kCrmTextSub)),
              ),
              ElevatedButton(
                onPressed: () {
                  // ignore: avoid_print
                  print('STEP 5 - Confirmer Refuser');
                  Navigator.of(dialogCtx).pop();
                  // ignore: avoid_print
                  print('STEP 6 - Appel rejectRequest($id)');
                  provider.rejectRequest(id);
                  // ignore: avoid_print
                  print('STEP 7 - rejectRequest lancé');
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                child: Text('Refuser',
                    style: tInter(
                        color: Colors.white,
                        fontWeight: FontWeight.w600)),
              ),
            ],
          );
        },
      );

      // ignore: avoid_print
      print('STEP 3 done - showDialog appelé');
    } catch (e, stack) {
      // ignore: avoid_print
      print('REJECT ERROR=');
      // ignore: avoid_print
      print(e);
      // ignore: avoid_print
      print(stack);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// STATUS BANNER
// ══════════════════════════════════════════════════════════════════════════════
class _StatusBanner extends StatelessWidget {
  final String status;
  const _StatusBanner({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        border:
            Border(bottom: BorderSide(color: color.withValues(alpha: 0.2))),
      ),
      child: Row(children: [
        Icon(_statusIcon(status), size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            status == 'approved'
                ? 'Cette demande a été approuvée — le projet a été désarchivé.'
                : 'Cette demande a été refusée.',
            style: tInter(
                fontSize: 12, fontWeight: FontWeight.w600, color: color),
          ),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES LIST — StatefulWidget
//
// Règle : build() ne fait QUE lire + retourner des widgets.
// Le scroll vers le bas est déclenché depuis didUpdateWidget / initState,
// jamais depuis build().
// ══════════════════════════════════════════════════════════════════════════════
class _MessagesList extends StatefulWidget {
  final ArchiveRequest request;
  final ArchiveRequestProvider provider;
  final ScrollController scrollCtrl;

  const _MessagesList({
    required this.request,
    required this.provider,
    required this.scrollCtrl,
  });

  @override
  State<_MessagesList> createState() => _MessagesListState();
}

class _MessagesListState extends State<_MessagesList> {
  @override
  void initState() {
    super.initState();
    // Premier affichage : scroll en bas après le premier frame
    _scheduleScrollToBottom();
  }

  @override
  void didUpdateWidget(_MessagesList old) {
    super.didUpdateWidget(old);
    // Nouveau message arrivé → scroll en bas
    if (widget.request.messages.length != old.request.messages.length) {
      _scheduleScrollToBottom();
    }
  }

  // Planifie le scroll APRÈS le build, jamais pendant
  void _scheduleScrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (widget.scrollCtrl.hasClients &&
          widget.scrollCtrl.position.maxScrollExtent > 0) {
        widget.scrollCtrl.animateTo(
          widget.scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // build() : lecture seule, aucun effet de bord
  @override
  Widget build(BuildContext context) {
    final msgs = widget.request.messages;

    if (msgs.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.chat_bubble_outline_rounded,
              size: 40, color: kCrmPrimary.withValues(alpha: 0.4)),
          const SizedBox(height: 12),
          Text('Aucun message pour l\'instant',
              style: tInter(fontSize: 14, color: kCrmTextSub)),
          const SizedBox(height: 6),
          Text('Envoyez le premier message.',
              style: tInter(fontSize: 12, color: kCrmTextSub)),
        ]),
      );
    }

    return ListView.builder(
      controller: widget.scrollCtrl,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      itemCount: msgs.length,
      itemBuilder: (_, i) => _MessageBubble(
        msg: msgs[i],
        isMe: msgs[i].senderId == widget.provider.currentUserId,
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE BUBBLE
// ══════════════════════════════════════════════════════════════════════════════
class _MessageBubble extends StatelessWidget {
  final ArchiveRequestMessage msg;
  final bool isMe;
  const _MessageBubble({required this.msg, required this.isMe});

  @override
  Widget build(BuildContext context) {
    final isAdminMsg = msg.role == 'admin' || msg.role == 'superadmin' || msg.role == 'superadmin2';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment:
            isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMe) ...[
            _Avatar(name: msg.senderName, isAdmin: isAdminMsg),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                if (!isMe)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 3, left: 4),
                    child: Text(
                      msg.senderName,
                      style: tInter(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: kCrmTextSub),
                    ),
                  ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isMe ? kCrmPrimary : Colors.white,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(isMe ? 16 : 4),
                      bottomRight: Radius.circular(isMe ? 4 : 16),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Text(
                    msg.content,
                    style: tInter(
                        fontSize: 13,
                        color: isMe ? Colors.white : kCrmText),
                  ),
                ),
                Padding(
                  padding:
                      const EdgeInsets.only(top: 3, left: 4, right: 4),
                  child: Text(
                    _fmtTime(msg.createdAt),
                    style: tInter(fontSize: 10, color: kCrmTextSub),
                  ),
                ),
              ],
            ),
          ),
          if (isMe) ...[
            const SizedBox(width: 8),
            _Avatar(name: msg.senderName, isAdmin: isAdminMsg),
          ],
        ],
      ),
    );
  }

  String _fmtTime(DateTime dt) {
    try {
      return DateFormat('HH:mm').format(dt);
    } catch (_) {
      return '';
    }
  }
}

class _Avatar extends StatelessWidget {
  final String name;
  final bool isAdmin;
  const _Avatar({required this.name, required this.isAdmin});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: isAdmin ? kCrmPrimary : const Color(0xFF6B7280),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        _initials(name),
        style: tInter(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Colors.white),
      ),
    );
  }

  String _initials(String v) {
    if (v.isEmpty) return '?';
    final parts =
        v.split(RegExp(r'[\s@._-]')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return v[0].toUpperCase();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE INPUT
// ══════════════════════════════════════════════════════════════════════════════
class _MessageInput extends StatelessWidget {
  final ArchiveRequestProvider provider;
  const _MessageInput({required this.provider});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
      ),
      child: Row(children: [
        Expanded(
          child: TextField(
            controller: provider.messageCtrl,
            minLines: 1,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              hintText: 'Écrire un message...',
              hintStyle: tInter(fontSize: 13, color: kCrmTextSub),
              filled: true,
              fillColor: const Color(0xFFF8F9FA),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide.none,
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            ),
            style: tInter(fontSize: 13, color: kCrmText),
            onSubmitted: (_) => provider.sendMessage(),
          ),
        ),
        const SizedBox(width: 8),
        // Obx ici : lecture seule de sending.value
        Obx(() => GestureDetector(
              onTap:
                  provider.sending.value ? null : provider.sendMessage,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: provider.sending.value
                      ? kCrmPrimary.withValues(alpha: 0.5)
                      : kCrmPrimary,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: provider.sending.value
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send_rounded,
                        size: 18, color: Colors.white),
              ),
            )),
      ]),
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
Color _statusColor(String status) {
  switch (status) {
    case 'approved':
      return const Color(0xFF16A34A);
    case 'rejected':
      return const Color(0xFFDC2626);
    default:
      return const Color(0xFFD97706);
  }
}

String _statusLabel(String status) {
  switch (status) {
    case 'approved':
      return 'Approuvé';
    case 'rejected':
      return 'Rejeté';
    default:
      return 'En attente';
  }
}

IconData _statusIcon(String status) {
  switch (status) {
    case 'approved':
      return Icons.check_circle_outline_rounded;
    case 'rejected':
      return Icons.cancel_outlined;
    default:
      return Icons.schedule_rounded;
  }
}
