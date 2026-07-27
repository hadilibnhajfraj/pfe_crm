// lib/forms/view/ProjectCommentScreen.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controller/project_form_controller.dart';
import '../../services/project_api.dart';
import 'package:dash_master_toolkit/constant/app_color.dart';
import 'package:dash_master_toolkit/widgets/common_app_widget.dart';
import 'package:dash_master_toolkit/application/users/model/project_comment_model.dart';

class ProjectCommentScreen extends StatefulWidget {
  final String projectId;
  final String? projectName;

  const ProjectCommentScreen({
    super.key,
    required this.projectId,
    this.projectName,
  });

  @override
  State<ProjectCommentScreen> createState() => _ProjectCommentScreenState();
}

class _ProjectCommentScreenState extends State<ProjectCommentScreen> {
  late final ProjectFormController c;

  bool _loading = true;
  bool _sending = false;

  // reply inline
  String? _replyingToId;
  final TextEditingController _replyCtrl = TextEditingController();
  bool _sendingReply = false;

  // edit inline
  String? _editingId;
  final TextEditingController _editCtrl = TextEditingController();
  bool _savingEdit = false;

  final TextEditingController _commentCtrl = TextEditingController();

  // data
  List<ProjectCommentModel> _comments = [];

  // ✅ styles demandés (bleu)
  static const Color _actionBlue = Colors.blue;

  // =========================================
  // ✅ TODO: remplace par TON userId connecté
  // =========================================
  String get currentUserId {
    // مثال:
    // return Get.find<AuthController>().userId;
    // ou GetStorage().read("userId") ?? "";
    return "";
  }

  bool get isAdmin {
    // مثال:
    // return Get.find<AuthController>().role == "admin";
    return false;
  }

  bool _canEdit(ProjectCommentModel cm) =>
      isAdmin || (currentUserId.isNotEmpty && cm.authorId == currentUserId);

  @override
  void initState() {
    super.initState();

    c = Get.isRegistered<ProjectFormController>()
        ? Get.find<ProjectFormController>()
        : Get.put(ProjectFormController());

    _init();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    _replyCtrl.dispose();
    _editCtrl.dispose();
    super.dispose();
  }

  // ✅ build thread ONLY if API is flat
  List<ProjectCommentModel> _buildThreadFromFlat(List<ProjectCommentModel> flat) {
    final byId = <String, ProjectCommentModel>{};
    for (final x in flat) {
      byId[x.id] = x.copyWith(replies: const []);
    }

    final roots = <ProjectCommentModel>[];

    for (final x in byId.values) {
      final pid = x.parentId;
      if (pid != null && pid.isNotEmpty && byId.containsKey(pid)) {
        final parent = byId[pid]!;
        byId[pid] = parent.copyWith(replies: [...parent.replies, x]);
      } else {
        roots.add(x);
      }
    }

    int cmp(ProjectCommentModel a, ProjectCommentModel b) =>
        a.createdAt.compareTo(b.createdAt);

    ProjectCommentModel sortNode(ProjectCommentModel n) {
      final sortedReplies = [...n.replies]..sort(cmp);
      return n.copyWith(replies: sortedReplies.map(sortNode).toList());
    }

    final out = roots.map(sortNode).toList()..sort(cmp);
    return out;
  }

  Future<void> _init() async {
    setState(() => _loading = true);
    try {
      await c.loadProject(widget.projectId);
      await _refreshComments();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Erreur chargement : $e")),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ✅ IMPORTANT:
  // - si backend renvoie "replies" (même vide) => on affiche direct (nested)
  // - sinon => on reconstruit depuis flat
  Future<void> _refreshComments() async {
    final list = await ProjectApi.instance.getComments(widget.projectId);
    if (!mounted) return;

    // ✅ Nested si backend inclut le champ replies dans JSON
    // (voir ProjectCommentModel.hasRepliesField)
    final bool apiNested =
        list.isNotEmpty && list.first.hasRepliesField == true;

    setState(() {
      _comments = apiNested ? list : _buildThreadFromFlat(list);
    });
  }

  InputDecoration _dec(String hint) => inputDecoration(context, hintText: hint);

  Widget _roField(String title, TextEditingController controller,
      {int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          TextFormField(
            controller: controller,
            enabled: false,
            readOnly: true,
            maxLines: maxLines,
            decoration: _dec(title).copyWith(
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _send() async {
    final txt = _commentCtrl.text.trim();
    if (txt.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Comment is empty")),
      );
      return;
    }

    setState(() => _sending = true);
    try {
      await ProjectApi.instance.addComment(widget.projectId, txt);
      _commentCtrl.clear();
      await _refreshComments();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Comment posted ✅")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Load error : $e")),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendReply(ProjectCommentModel cm) async {
    final txt = _replyCtrl.text.trim();
    if (txt.isEmpty) return;

    setState(() => _sendingReply = true);
    try {
      await ProjectApi.instance.addComment(
        widget.projectId,
        txt,
        parentId: cm.id,
      );

      _replyCtrl.clear();
      setState(() => _replyingToId = null);

      // ✅ refresh to show new reply
      await _refreshComments();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Erreur réponse : $e")),
      );
    } finally {
      if (mounted) setState(() => _sendingReply = false);
    }
  }

  void _openEdit(ProjectCommentModel cm) {
    setState(() {
      _editingId = cm.id;
      _editCtrl.text = cm.body;

      // fermer reply
      _replyingToId = null;
      _replyCtrl.clear();
    });
  }

  Future<void> _saveEdit(ProjectCommentModel cm) async {
    final txt = _editCtrl.text.trim();
    if (txt.isEmpty) return;

    setState(() => _savingEdit = true);
    try {
      await ProjectApi.instance.updateComment(widget.projectId, cm.id, txt);
      setState(() {
        _editingId = null;
        _editCtrl.clear();
      });
      await _refreshComments();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Erreur modification : $e")),
      );
    } finally {
      if (mounted) setState(() => _savingEdit = false);
    }
  }

  Future<void> _deleteComment(ProjectCommentModel cm) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("Supprimer"),
        content: const Text("Voulez-vous supprimer ce commentaire ?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Annuler"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Supprimer"),
          ),
        ],
      ),
    );

    if (ok != true) return;

    try {
      await ProjectApi.instance.deleteComment(widget.projectId, cm.id);
      await _refreshComments();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Erreur suppression : $e")),
      );
    }
  }

  // ✅ bouton texte bleu (Facebook)
  Widget _blueActionTextButton({
    required String text,
    required VoidCallback? onPressed,
  }) {
    return TextButton(
      style: TextButton.styleFrom(
        foregroundColor: _actionBlue,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
        minimumSize: const Size(0, 0),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      onPressed: onPressed,
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600)),
    );
  }

  Widget _commentTile(ProjectCommentModel cm, {bool isReply = false}) {
    final isReplyOpen = _replyingToId == cm.id;
    final isEditOpen = _editingId == cm.id;
    final canEdit = _canEdit(cm);

    return Container(
      margin: EdgeInsets.only(top: 10, left: isReply ? 22 : 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isReply ? Colors.grey.shade50 : Colors.white,
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(cm.authorName, style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),

          // body ou edit
          if (!isEditOpen)
            Text(cm.body)
          else ...[
            TextField(
              controller: _editCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: "Modifier...",
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                _blueActionTextButton(
                  text: "Annuler",
                  onPressed: _savingEdit
                      ? null
                      : () {
                          setState(() {
                            _editingId = null;
                            _editCtrl.clear();
                          });
                        },
                ),
                const Spacer(),
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: _actionBlue),
                  onPressed: _savingEdit ? null : () => _saveEdit(cm),
                  child: _savingEdit
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text(
                          "Enregistrer",
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                ),
              ],
            ),
          ],

          const SizedBox(height: 8),

          // ✅ date + actions (bleu)
          Wrap(
            spacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                "${cm.createdAt.toLocal()}".split(".").first,
                style: const TextStyle(
                  fontSize: 12,
                  color: _actionBlue,
                  fontWeight: FontWeight.w600,
                ),
              ),
              _blueActionTextButton(
                text: isReplyOpen ? "Annuler" : "Répondre",
                onPressed: () {
                  setState(() {
                    if (_replyingToId == cm.id) {
                      _replyingToId = null;
                      _replyCtrl.clear();
                    } else {
                      _replyingToId = cm.id;
                      _replyCtrl.clear();

                      _editingId = null;
                      _editCtrl.clear();
                    }
                  });
                },
              ),
              if (canEdit)
                _blueActionTextButton(
                  text: "Modifier",
                  onPressed: () => _openEdit(cm),
                ),
              if (canEdit)
                _blueActionTextButton(
                  text: "Supprimer",
                  onPressed: () => _deleteComment(cm),
                ),
            ],
          ),

          // ✅ reply inline (Facebook style)
          if (isReplyOpen) ...[
            const SizedBox(height: 10),
            TextField(
              controller: _replyCtrl,
              maxLines: 2,
              decoration: InputDecoration(
                hintText: "Répondre à ${cm.authorName}...",
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                style: TextButton.styleFrom(
                  foregroundColor: _actionBlue,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
                onPressed: _sendingReply ? null : () => _sendReply(cm),
                child: _sendingReply
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text(
                        "Publier",
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
              ),
            ),
          ],

          // ✅ replies affichées dessous
          if (cm.replies.isNotEmpty) ...[
            const SizedBox(height: 10),
            ...cm.replies.map((r) => _commentTile(r, isReply: true)),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: colorWhite,
      appBar: AppBar(
        title: Text("Commenter ${widget.projectName ?? c.nomProjet.text}"),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [BoxShadow(blurRadius: 8, color: Colors.black12)],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _roField("Project Name", c.nomProjet),
                    _roField("Start Date", c.dateDemarrage),
                    _roField("Project Status", c.statut),
                    _roField("Site Type + Address", c.typeAdresseChantier),
                    _roField("Responsible Engineer", c.ingenieurResponsable),
                    _roField("Engineer Phone", c.telephoneIngenieur),
                    _roField("Architect", c.architecte),
                    _roField("Architect Phone", c.telephoneArchitecte),
                    _roField("Company", c.entreprise),
                    _roField("Developer", c.promoteur),
                    _roField("Design Office", c.bureauEtude),
                    _roField("Control Office", c.bureauControle),
                    _roField("Plumbing/HVAC Company", c.entrepriseFluide),
                    _roField("Electrical Company", c.entrepriseElectricite),
                    _roField("Location (Address)", c.localisationAdresse),

                    const SizedBox(height: 12),

                    Text(
                      "Commentaires (${_comments.length})",
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 8),

                    if (_comments.isEmpty)
                      Text(
                        "Aucun commentaire pour le moment.",
                        style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey),
                      )
                    else
                      ..._comments.map((cm) => _commentTile(cm)),

                    const SizedBox(height: 16),

                    Text(
                      "Ajouter un commentaire",
                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _commentCtrl,
                      maxLines: 4,
                      decoration: _dec("Votre commentaire"),
                    ),

                    const SizedBox(height: 12),

                    Align(
                      alignment: Alignment.centerRight,
                      child: ElevatedButton(
                        onPressed: _sending ? null : _send,
                        child: _sending
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text("Envoyer"),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
