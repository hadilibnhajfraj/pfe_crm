import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../model/commercial_contact_model.dart';
import 'package:dash_master_toolkit/services/commercial_contact_service.dart';
import 'package:dash_master_toolkit/application/users/view/commercial_timeline_screen.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:excel/excel.dart' as excel;
import 'dart:html' as html;

// Compte pour lequel le Follow-up déclenche l'automatisation complète
// (calendrier / notifications / email / WhatsApp) côté backend — le champ
// "Commercial" n'est affiché/obligatoire que pour ce compte, inchangé pour
// tous les autres utilisateurs.
const String _kFollowupAutomationEmail = "info@probardistribution.com";
class CommercialContactListGetxScreen extends StatefulWidget {
  final String token;
  
  const CommercialContactListGetxScreen({
    super.key,
    required this.token,
  });

  @override
  State<CommercialContactListGetxScreen> createState() =>
      _CommercialContactListGetxScreenState();
}

class _CommercialContactListGetxScreenState
    extends State<CommercialContactListGetxScreen> {
      List<String> users = [];
      Future<void> _loadUsers() async {
  try {
    final list = await _service.getUserNames(widget.token);

    if (mounted) {
      setState(() {
        users = list;
      });
    }
  } catch (e) {
    debugPrint("LOAD USERS ERROR: $e");
  }
}
  final CommercialContactService _service = CommercialContactService();
  final TextEditingController _searchController = TextEditingController();

  final ScrollController _horizontalScrollController = ScrollController();
  final ScrollController _verticalScrollController = ScrollController();
  String? selectedUser;
  String? selectedType;
  int currentPage = 1;
  int rowsPerPage = 10;
  bool _loading = true;
  String? _error;
  List<CommercialContact> _contacts = [];

  static const Color kPrimary = Color(0xFF1976D2);
  static const Color kBg = Color(0xFFF8FAFC);
  static const Color kText = Color(0xFF101828);
  static const Color kMuted = Color(0xFF667085);
 int get totalPages {
  if (_contacts.isEmpty) return 1;
  return (_contacts.length / rowsPerPage).ceil();
}
  @override
  void initState() {
    super.initState();
    _loadUsers();
    _loadContacts();
  }
  Future<String?> _showUserDialog() async {
  String? selected;

  return await showDialog<String>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text("Select User"),
        content: DropdownButtonFormField<String>(
          items: users.map((u) {
            return DropdownMenuItem(
              value: u,
              child: Text(u),
            );
          }).toList(),
          onChanged: (v) {
            selected = v;
          },
          decoration: _inputDecoration("User"),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, selected),
            child: const Text("Save"),
          ),
        ],
      );
    },
  );
}
  Widget _buildPagination() {
  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        /// 🔢 ROWS PER PAGE
        Row(
          children: [
            const Text("Rows per page: "),
            const SizedBox(width: 8),
            DropdownButton<int>(
              value: rowsPerPage,
              items: [5, 10, 20, 50].map((e) {
                return DropdownMenuItem(
                  value: e,
                  child: Text("$e"),
                );
              }).toList(),
              onChanged: (value) {
                if (value != null) {
                  setState(() {
                    rowsPerPage = value;
                    currentPage = 1;
                  });
                }
              },
            ),
          ],
        ),

        /// 📄 PAGE INFO + BUTTONS
        Row(
          children: [
            Text("Page $currentPage / $totalPages"),

            const SizedBox(width: 12),

            IconButton(
              icon: const Icon(Icons.arrow_back_ios),
              onPressed: currentPage > 1
                  ? () {
                      setState(() {
                        currentPage--;
                      });
                    }
                  : null,
            ),

            IconButton(
              icon: const Icon(Icons.arrow_forward_ios),
              onPressed: currentPage < totalPages
                  ? () {
                      setState(() {
                        currentPage++;
                      });
                    }
                  : null,
            ),
          ],
        ),
      ],
    ),
  );
}
List<CommercialContact> get paginatedContacts {
  final start = (currentPage - 1) * rowsPerPage;
  final end = start + rowsPerPage;

  if (start >= _contacts.length) return [];

  return _contacts.sublist(
    start,
    end > _contacts.length ? _contacts.length : end,
  );
}
void _exportContactsExcel() {
  final items = _contacts;

  var excelFile = excel.Excel.createExcel();
  excel.Sheet sheet = excelFile['Contacts'];

  final headers = [
    'ID',
    'Full Name',
    'First Name',
    'Last Name',
    'Company',
    'Phone',
    'Location',
    'Client Type',
    'Status',
    'Pipeline',
    'Calls',
    'Subject',
    'Message',
    'Date Appel',
    'User',
    'Products',
    'Projects',
    'Relances',
    'Follow-up Comment',
    'Created At',
  ];

  sheet.appendRow(headers);

  /// 🎨 HEADER STYLE
  for (int i = 0; i < headers.length; i++) {
    sheet
        .cell(excel.CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 0))
        .cellStyle = excel.CellStyle(
      bold: true,
      backgroundColorHex: "#111827",
      fontColorHex: "#FFFFFF",
    );
  }

  /// 🔥 GROUP BY USER
  Map<String, List<CommercialContact>> grouped = {};

  for (var c in items) {
    final user = c.userNom ?? "Unknown";
    grouped.putIfAbsent(user, () => []).add(c);
  }

  int rowIndex = 1;

  grouped.forEach((user, contacts) {
    /// 🔥 TOTAL PROJECTS PAR USER
    int totalProjects =
        contacts.fold(0, (sum, c) => sum + c.projects.length);

    /// 🔥 USER HEADER ROW
    sheet.appendRow([
      "", // ID
      "👤 $user ($totalProjects projects)", // Full Name
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      user,
      "",
      "",
      "",
      "",
      "",
    ]);

    /// 🎨 STYLE USER ROW
    for (int col = 0; col < headers.length; col++) {
      sheet
          .cell(excel.CellIndex.indexByColumnRow(
              columnIndex: col, rowIndex: rowIndex))
          .cellStyle = excel.CellStyle(
        bold: true,
        backgroundColorHex: "#E0F2FE",
      );
    }

    rowIndex++;

    /// 🔥 CONTACTS
    for (var c in contacts) {
      /// PRODUITS
      String produits = c.produits
          .map((p) => "${p.produit} (${p.qte})")
          .join(" | ");

      /// PROJECTS
      String projects = c.projects
          .map((p) =>
              "${p.nomProjet} (${p.localisation})")
          .join(" | ");

      /// RELANCES
      String relances = c.relances
          .map((r) =>
              "${r.dateRelance ?? ''} ${r.heureRelance ?? ''}")
          .join(" | ");

      /// FOLLOW-UP COMMENT (une entrée par relance, "-" si vide/null)
      String followUpComments = c.relances
          .map((r) {
            final comment = (r.commentaire ?? '').trim();
            return comment.isEmpty ? '-' : comment;
          })
          .join(" | ");

      sheet.appendRow([
  c.id,
  c.fullName,
  c.prenom,
  c.nom,
  c.nomSociete ?? "",
  c.telephone,
  c.localisation ?? "",
  c.typeClient,
  c.statut,
  c.pipelineStage ?? "",
  c.nbAppels,
  c.sujetDiscussion ?? "",
  c.message ?? "",
  c.dateAppel?.toIso8601String() ?? "",
  c.userNom ?? "",
  produits,
  projects,
  relances,
  followUpComments,
  c.createdAt?.toIso8601String() ?? "",
]);

      rowIndex++;
    }

    /// ESPACE ENTRE USERS
    sheet.appendRow([""]);
    rowIndex++;
  });

  /// WIDTH
  for (int i = 0; i < headers.length; i++) {
    sheet.setColWidth(i, 28);
  }

  /// SAVE
  final bytes = excelFile.encode();
  if (bytes == null) return;

  final blob = html.Blob(
    [bytes],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );

  final url = html.Url.createObjectUrlFromBlob(blob);

  html.AnchorElement(href: url)
    ..setAttribute('download', 'contacts_full_grouped.xlsx')
    ..click();

  html.Url.revokeObjectUrl(url);
}
Future<void> _loadContacts({
  String? query,
  String? userNom,
  String? typeClient,
}) async {
  try {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    final data = await _service.fetchMyContacts(
      token: widget.token,
      query: query,
      userNom: userNom,
      typeClient: typeClient,
    );

    debugPrint('Visible contacts = ${data.length}');

    if (mounted) {
      setState(() {
        _contacts = data;
        currentPage = 1;
      });
    }
  } catch (e) {
    if (mounted) {
      setState(() {
        _error = e.toString();
      });
    }
  } finally {
    if (mounted) {
      setState(() {
        _loading = false;
      });
    }
  }
}

  Future<CommercialContact> _updateContact({
    required String id,
    required Map<String, dynamic> data,
  }) async {
    final updated = await _service.updateContact(
      token: widget.token,
      id: id,
      data: data,
    );
    await _loadContacts(query: _searchController.text);
    return updated;
  }

  bool get _isFollowupAutomationActor =>
      (AuthService().userEmail ?? '').toLowerCase().trim() == _kFollowupAutomationEmail;

  // Rôles autorisés à voir/utiliser l'action admin "Affecter des contacts" —
  // même périmètre que PRIVILEGED_ROLES côté backend
  // (commercial_contacts.routes.js).
  bool get _isPrivilegedRole => const ['admin', 'superadmin', 'superadmin2']
      .contains((AuthService().userRole ?? '').toLowerCase().trim());

  Future<List<CommercialUserOption>> _loadCommercialUsers() async {
    try {
      return await _service.fetchCommercialUsers(widget.token);
    } catch (e) {
      debugPrint('LOAD COMMERCIAL USERS ERROR: $e');
      return [];
    }
  }

  // ── Action admin "Affecter des contacts" ─────────────────────────────────
  // Sélection multiple parmi les contacts actuellement chargés (_contacts),
  // filtrable par nom/société, puis attribution en masse à un commercial via
  // POST /commercial-contacts/assign.
  Future<void> _showAssignContactsDialog() async {
    final commercialUsers = await _loadCommercialUsers();
    if (!mounted) return;

    if (commercialUsers.isEmpty) {
      _showError("Aucun commercial disponible pour l'affectation");
      return;
    }

    final selectedIds = <String>{};
    String? targetCommercialId;
    String filterText = '';
    bool submitting = false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final filtered = filterText.trim().isEmpty
                ? _contacts
                : _contacts.where((c) {
                    final f = filterText.trim().toLowerCase();
                    return c.fullName.toLowerCase().contains(f) ||
                        (c.nomSociete ?? '').toLowerCase().contains(f);
                  }).toList();

            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              title: const Text("Affecter des contacts"),
              content: SizedBox(
                width: 560,
                height: 520,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: targetCommercialId,
                      isExpanded: true,
                      decoration: _inputDecoration("Commercial *"),
                      items: commercialUsers
                          .map((u) => DropdownMenuItem(
                                value: u.id,
                                child: Text(
                                  u.label,
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 1,
                                ),
                              ))
                          .toList(),
                      onChanged: (v) => setDialogState(() {
                        targetCommercialId = v;
                      }),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      decoration: _inputDecoration("Rechercher un contact..."),
                      onChanged: (v) => setDialogState(() {
                        filterText = v;
                      }),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '${selectedIds.length} sélectionné(s) sur ${filtered.length} affiché(s)',
                          style: const TextStyle(fontSize: 12, color: kMuted),
                        ),
                        TextButton(
                          onPressed: () => setDialogState(() {
                            final allFilteredIds = filtered.map((c) => c.id).toSet();
                            final allSelected = allFilteredIds.every(selectedIds.contains);
                            if (allSelected) {
                              selectedIds.removeAll(allFilteredIds);
                            } else {
                              selectedIds.addAll(allFilteredIds);
                            }
                          }),
                          child: const Text("Tout sélectionner / désélectionner"),
                        ),
                      ],
                    ),
                    const Divider(height: 1),
                    Expanded(
                      child: ListView.builder(
                        itemCount: filtered.length,
                        itemBuilder: (context, index) {
                          final c = filtered[index];
                          final checked = selectedIds.contains(c.id);
                          return CheckboxListTile(
                            dense: true,
                            value: checked,
                            title: Text(c.fullName, overflow: TextOverflow.ellipsis),
                            subtitle: Text(
                              (c.nomSociete ?? '').trim().isNotEmpty ? c.nomSociete! : c.telephone,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11),
                            ),
                            onChanged: (v) => setDialogState(() {
                              if (v == true) {
                                selectedIds.add(c.id);
                              } else {
                                selectedIds.remove(c.id);
                              }
                            }),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: submitting
                      ? null
                      : () {
                          if (Navigator.of(dialogContext).canPop()) {
                            Navigator.of(dialogContext).pop();
                          }
                        },
                  child: const Text("Annuler"),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: kPrimary, foregroundColor: Colors.white),
                  onPressed: submitting || selectedIds.isEmpty || targetCommercialId == null
                      ? null
                      : () async {
                          setDialogState(() => submitting = true);
                          try {
                            final updatedCount = await _service.assignContacts(
                              token: widget.token,
                              contactIds: selectedIds.toList(),
                              commercialId: targetCommercialId!,
                            );
                            if (Navigator.of(dialogContext).canPop()) {
                              Navigator.of(dialogContext).pop();
                            }
                            _showSuccess("$updatedCount contact(s) affecté(s)");
                            await _loadContacts(query: _searchController.text);
                          } catch (e) {
                            setDialogState(() => submitting = false);
                            _showError(e.toString());
                          }
                        },
                  child: submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text("Affecter"),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showFollowupAutomationSummary(FollowupAutomationResult automation) {
    if (!mounted) return;
    Widget row(bool ok, String label, {bool neutral = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              Icon(
                ok
                    ? Icons.check_circle
                    : neutral
                        ? Icons.info_outline
                        : Icons.cancel,
                color: ok
                    ? Colors.green
                    : neutral
                        ? Colors.grey
                        : Colors.orange,
                size: 18,
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(label)),
            ],
          ),
        );

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text("Follow-up automatisé"),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            row(true, "Follow-up enregistré"),
            row(automation.calendarEventCreated, "Évènement ajouté au calendrier"),
            row(automation.notificationsSent, "Notifications créées"),
            row(automation.emailsSent, "Emails envoyés"),
            // WhatsApp non configuré = état normal (pas une erreur) — icône
            // neutre distincte d'un vrai échec d'envoi Twilio.
            automation.whatsappConfigured
                ? row(automation.whatsappSent, "WhatsApp programmé")
                : row(false, "WhatsApp non configuré", neutral: true),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              // Ferme uniquement ce Dialog (via son propre BuildContext) —
              // ne jamais utiliser le context de l'écran englobant ici, ça
              // popperait la route "Commercial Contacts" au lieu du popup.
              if (Navigator.of(dialogContext).canPop()) {
                Navigator.of(dialogContext).pop();
              }
            },
            child: const Text("OK"),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteContact(String id) async {
    await _service.deleteContact(
      token: widget.token,
      id: id,
    );

    if (mounted) {
      setState(() {
        _contacts.removeWhere((e) => e.id == id);
      });
    }
  }

  void _showSuccess(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
      ),
    );
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
      ),
    );
  }

  Color _typeBgColor(String type) {
    switch (type.toLowerCase()) {
      case 'tuteur':
        return const Color(0xFFE8F1FF);
      case 'cloture':
        return const Color(0xFFEAFBF0);
      default:
        return const Color(0xFFF2F4F7);
    }
  }

  Color _typeTextColor(String type) {
    switch (type.toLowerCase()) {
      case 'tuteur':
        return const Color(0xFF1D4ED8);
      case 'cloture':
        return const Color(0xFF15803D);
      default:
        return const Color(0xFF475467);
    }
  }

  Color _statusBgColor(String status) {
    switch (status) {
      case 'ok':
        return const Color(0xFFEAFBF0);
      case 'rappeler_plus_tard':
        return const Color(0xFFFFF7E6);
      case 'user_injoignable':
        return const Color(0xFFFFF1F2);
      case 'client_refuse':
        return const Color(0xFFF2F4F7);
      default:
        return const Color(0xFFF2F4F7);
    }
  }

  Color _statusTextColor(String status) {
    switch (status) {
      case 'ok':
        return const Color(0xFF15803D);
      case 'rappeler_plus_tard':
        return const Color(0xFFB54708);
      case 'user_injoignable':
        return const Color(0xFFDC2626);
      case 'client_refuse':
        return const Color(0xFF475467);
      default:
        return const Color(0xFF475467);
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'ok':
        return 'OK';
      case 'rappeler_plus_tard':
        return 'Call back later';
      case 'user_injoignable':
        return 'Unreachable';
      case 'client_refuse':
        return 'Client refused';
      default:
        return status;
    }
  }

  Widget _buildTypeBadge(String type) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: _typeBgColor(type),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        type.isEmpty ? 'N/A' : type,
        style: TextStyle(
          color: _typeTextColor(type),
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: _statusBgColor(status),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        _statusLabel(status),
        style: TextStyle(
          color: _statusTextColor(status),
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }

  // ── Historique des statuts (timeline, plus récent en premier) ───────────

  Color _historyColor(CommercialContactStatusHistoryItem item) {
    if (item.isPipelineStage) {
      switch (item.nouveauStatut) {
        case 'Prospect':
          return const Color(0xFF22C55E);
        case 'Contacté':
          return const Color(0xFFF59E0B);
        case 'Visite':
          return const Color(0xFF6366F1);
        case 'Devis envoyé':
          return const Color(0xFF3B82F6);
        case 'Negociation':
          return const Color(0xFFF97316);
        case 'Gagné':
          return const Color(0xFF22C55E);
        case 'Perdu':
          return const Color(0xFFEF4444);
        default:
          return const Color(0xFF94A3B8);
      }
    }
    switch (item.nouveauStatut) {
      case 'ok':
        return const Color(0xFF22C55E);
      case 'rappeler_plus_tard':
        return const Color(0xFFF97316);
      case 'user_injoignable':
        return const Color(0xFFEF4444);
      case 'client_refuse':
        return const Color(0xFF64748B);
      default:
        return const Color(0xFF94A3B8);
    }
  }

  // Libellé affichable d'une valeur brute de statut ("ok", "Devis envoyé",
  // ...) — les valeurs pipelineStage sont déjà lisibles telles quelles, les
  // valeurs statut passent par _statusLabel (déjà utilisé pour le badge du
  // formulaire, garantit un vocabulaire identique partout dans l'écran).
  String _statusValueLabel(String value, bool isPipelineStage) {
    if (value.isEmpty) return '-';
    return isPipelineStage ? value : _statusLabel(value);
  }

  String _historyLabel(CommercialContactStatusHistoryItem item) =>
      _statusValueLabel(item.nouveauStatut, item.isPipelineStage);

  Widget _historyRow(CommercialContactStatusHistoryItem item, {required bool isLast}) {
    final color = _historyColor(item);
    final dateStr = item.createdAt != null
        ? DateFormat('dd/MM/yyyy HH:mm').format(item.createdAt!.toLocal())
        : '';
    final hasComment = (item.commentaire ?? '').trim().isNotEmpty;

    // Deux rendus distincts : la toute première entrée (création) affiche
    // simplement le commentaire "Création du contact" ; toute entrée
    // suivante affiche explicitement l'ancien ET le nouveau statut.
    final detailLines = <Widget>[];
    if (item.isCreated) {
      if (hasComment) {
        detailLines.add(Text(
          item.commentaire!,
          style: const TextStyle(fontSize: 12),
        ));
      }
    } else {
      detailLines.add(Text(
        'Ancien statut : ${_statusValueLabel(item.ancienStatut ?? '', item.isPipelineStage)}',
        style: const TextStyle(fontSize: 12),
      ));
      detailLines.add(Text(
        'Nouveau statut : ${_historyLabel(item)}',
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ));
      if (hasComment) {
        detailLines.add(Text(
          'Commentaire : ${item.commentaire}',
          style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
        ));
      }
    }

    final lineCount = detailLines.length;

    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.only(top: 4),
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              if (!isLast)
                Container(
                  width: 2,
                  height: 34 + (lineCount * 16),
                  color: const Color(0xFFE4E7EC),
                ),
            ],
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _historyLabel(item),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    if (dateStr.isNotEmpty) dateStr,
                    if ((item.changedByName ?? '').trim().isNotEmpty)
                      'par ${item.changedByName}',
                  ].join('  •  '),
                  style: const TextStyle(fontSize: 11, color: kMuted),
                ),
                if (detailLines.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  ...detailLines,
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusHistorySection(List<CommercialContactStatusHistoryItem> history) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: kPrimary.withOpacity(.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Historique des statuts',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 14),
          if (history.isEmpty)
            const Text(
              "Aucun changement de statut enregistré pour l'instant.",
              style: TextStyle(fontSize: 12, color: kMuted),
            )
          else
            for (int i = 0; i < history.length; i++)
              _historyRow(history[i], isLast: i == history.length - 1),
        ],
      ),
    );
  }

  Widget _buildProductsCell(List<CommercialContactProduct> produits) {
    final items = produits.isEmpty
        ? [CommercialContactProduct(id: '', produit: 'PROBAR', qte: 1)]
        : produits;

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: items.take(3).map((p) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
          decoration: BoxDecoration(
            color: const Color(0xFFF5F7FA),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFE4E7EC)),
          ),
          child: Text(
            '${p.produit} (${p.qte})',
            style: const TextStyle(fontSize: 12),
          ),
        );
      }).toList(),
    );
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      filled: true,
      fillColor: const Color(0xFFF9FAFB),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFD0D5DD)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFD0D5DD)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: kPrimary),
      ),
    );
  }

  Future<void> _confirmDelete(CommercialContact contact) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: const Text("Delete"),
          content: Text(
            "Do you really want to delete ${contact.fullName}?",
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text("Cancel"),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text(
                "Delete",
                style: TextStyle(color: Colors.white),
              ),
            ),
          ],
        );
      },
    );

    if (confirm == true) {
      try {
        await _deleteContact(contact.id);
        _showSuccess("Contact deleted successfully");
      } catch (e) {
        _showError(e.toString());
      }
    }
  }
Future<void> _showRelanceDialog(CommercialContact contact) async {
  String? selectedUser = contact.userNom;

  final dateCtrl = TextEditingController(
    text: contact.relances.isNotEmpty
        ? (contact.relances.first.dateRelance ?? "")
        : "",
  );

  final heureCtrl = TextEditingController(
    text: contact.relances.isNotEmpty
        ? (contact.relances.first.heureRelance ?? "")
        : "",
  );

  final commentaireCtrl = TextEditingController(
    text: contact.relances.isNotEmpty
        ? (contact.relances.first.commentaire ?? "")
        : "",
  );

  final bool isFollowupActor = _isFollowupAutomationActor;
  String? selectedCommercialId =
      contact.relances.isNotEmpty ? contact.relances.first.commercialId : null;
  List<CommercialUserOption> commercialUsers = [];
  if (isFollowupActor) {
    commercialUsers = await _loadCommercialUsers();
  }
  if (!mounted) return;
  FollowupAutomationResult? capturedAutomation;

  Future<void> pickDate(BuildContext dialogContext) async {
    final picked = await showDatePicker(
      context: dialogContext,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      dateCtrl.text =
          "${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}";
    }
  }

  Future<void> pickTime(BuildContext dialogContext) async {
    final picked = await showTimePicker(
      context: dialogContext,
      initialTime: TimeOfDay.now(),
    );
    if (picked != null) {
      final hh = picked.hour.toString().padLeft(2, '0');
      final mm = picked.minute.toString().padLeft(2, '0');
      heureCtrl.text = "$hh:$mm";
    }
  }

  final saved = await showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      return StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            title: Text("Follow-up - ${contact.fullName}"),
            content: SizedBox(
              width: 520,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  
                  /// 🔥 USER SELECT
                  Row(
                    children: [
                      const Icon(Icons.person, color: kPrimary),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(selectedUser ?? "Unknown"),
                      ),
                      IconButton(
                        icon: const Icon(Icons.edit),
                        onPressed: () async {
                          final newUser = await _showUserDialog();

                          if (newUser != null) {
                            setDialogState(() {
                              selectedUser = newUser;
                            });
                          }
                        },
                      )
                    ],
                  ),

                  const SizedBox(height: 12),

                  TextField(
                    controller: dateCtrl,
                    readOnly: true,
                    decoration: _inputDecoration("Follow-up date"),
                    onTap: () => pickDate(dialogContext),
                  ),

                  const SizedBox(height: 12),

                  TextField(
                    controller: heureCtrl,
                    readOnly: true,
                    decoration: _inputDecoration("Follow-up time"),
                    onTap: () => pickTime(dialogContext),
                  ),

                  const SizedBox(height: 12),

                  TextField(
                    controller: commentaireCtrl,
                    maxLines: 3,
                    decoration: _inputDecoration("Comment"),
                  ),

                  if (isFollowupActor) ...[
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: selectedCommercialId,
                      isExpanded: true,
                      decoration: _inputDecoration("Commercial *"),
                      items: commercialUsers
                          .map((u) => DropdownMenuItem(
                                value: u.id,
                                child: Text(
                                  u.label,
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 1,
                                ),
                              ))
                          .toList(),
                      onChanged: (v) => setDialogState(() {
                        selectedCommercialId = v;
                      }),
                    ),
                  ],
                ],
              ),
            ),

            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text("Cancel"),
              ),

              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: kPrimary,
                  foregroundColor: Colors.white,
                ),
                onPressed: () async {
                  final hasDateAndTime = dateCtrl.text.trim().isNotEmpty &&
                      heureCtrl.text.trim().isNotEmpty;
                  if (isFollowupActor &&
                      hasDateAndTime &&
                      selectedCommercialId == null) {
                    _showError("Commercial requis");
                    return;
                  }

                  try {
                    final payload = {
                      "dateRelance": dateCtrl.text.trim(),
                      "heureRelance": heureCtrl.text.trim().isEmpty
                          ? null
                          : heureCtrl.text.trim(),
                      "commentaire": commentaireCtrl.text.trim().isEmpty
                          ? null
                          : commentaireCtrl.text.trim(),

                      /// 🔥 USER
                      "user_nom": selectedUser,

                      if (isFollowupActor && selectedCommercialId != null)
                        "commercialId": selectedCommercialId,

                      if (contact.statut != "ok" &&
                          contact.statut != "rappeler_plus_tard")
                        "statut": "rappeler_plus_tard",
                    };

                    final updated = await _updateContact(
                      id: contact.id,
                      data: payload,
                    );
                    capturedAutomation = updated.automation;

                    if (dialogContext.mounted) {
                      Navigator.of(dialogContext).pop(true);
                    }
                  } catch (e) {
                    if (dialogContext.mounted) {
                      Navigator.of(dialogContext).pop(false);
                    }
                    _showError(e.toString());
                  }
                },
                child: const Text("Save"),
              ),
            ],
          );
        },
      );
    },
  );

  if (saved == true) {
    _showSuccess("Follow-up saved successfully");
    if (capturedAutomation != null) {
      _showFollowupAutomationSummary(capturedAutomation!);
    }
  }
}

  Future<void> _showEditDialog(CommercialContact contact) async {
    final nomSocieteCtrl = TextEditingController(text: contact.nomSociete ?? "");
    final nomCtrl = TextEditingController(text: contact.nom);
    final prenomCtrl = TextEditingController(text: contact.prenom);
    final localisationCtrl =
        TextEditingController(text: contact.localisation ?? "");
    final telephoneCtrl = TextEditingController(text: contact.telephone);
    final messageCtrl = TextEditingController(text: contact.message ?? "");
    final nbAppelsCtrl = TextEditingController(text: contact.nbAppels.toString());
    final sujetDiscussionCtrl =
        TextEditingController(text: contact.sujetDiscussion ?? "");
    final dateAppelCtrl = TextEditingController(
  text: contact.dateAppel != null
      ? "${contact.dateAppel!.year}-${contact.dateAppel!.month.toString().padLeft(2, '0')}-${contact.dateAppel!.day.toString().padLeft(2, '0')}"
      : "",
      
);
final emailCtrl = TextEditingController(text: contact.email ?? "");
final matriculeFiscaleCtrl =
    TextEditingController(text: contact.matriculeFiscale ?? "");
DateTime? dateAppel = contact.dateAppel;

String selectedPipeline =
    contact.pipelineStage.isNotEmpty ? contact.pipelineStage : "Prospect";

    String selectedType =
        contact.typeClient.isNotEmpty ? contact.typeClient : "autre";
    String selectedStatut =
        contact.statut.isNotEmpty ? contact.statut : "user_injoignable";

    final produits = (contact.produits.isEmpty
            ? [CommercialContactProduct(id: "", produit: "PROBAR", qte: 1)]
            : contact.produits)
        .map((e) => {
              "produitCtrl": TextEditingController(
                text: e.produit.isEmpty ? "PROBAR" : e.produit,
              ),
              "qteCtrl": TextEditingController(text: e.qte.toString()),
            })
        .toList();

    final dateRelanceCtrl = TextEditingController(
      text: contact.relances.isNotEmpty
          ? (contact.relances.first.dateRelance ?? "")
          : "",
    );
    final heureRelanceCtrl = TextEditingController(
      text: contact.relances.isNotEmpty
          ? (contact.relances.first.heureRelance ?? "")
          : "",
    );
    final commentaireRelanceCtrl = TextEditingController(
      text: contact.relances.isNotEmpty
          ? (contact.relances.first.commentaire ?? "")
          : "",
    );

    final bool isFollowupActor = _isFollowupAutomationActor;
    String? selectedCommercialId =
        contact.relances.isNotEmpty ? contact.relances.first.commercialId : null;
    List<CommercialUserOption> commercialUsers = [];
    if (isFollowupActor) {
      commercialUsers = await _loadCommercialUsers();
    }

    List<CommercialContactStatusHistoryItem> statusHistory = [];
    try {
      statusHistory = await _service.fetchStatusHistory(
        token: widget.token,
        contactId: contact.id,
      );
    } catch (e) {
      debugPrint('LOAD STATUS HISTORY ERROR: $e');
    }

    if (!mounted) return;
    FollowupAutomationResult? capturedAutomation;

final projects = (contact.projects.isEmpty
        ? [CommercialProject(id: "", nomProjet: "")]
        : contact.projects)
    .map((p) {
  final proj = p as CommercialProject;

  return {
    "nomCtrl": TextEditingController(text: proj.nomProjet ?? ""),
    "locCtrl": TextEditingController(text: proj.localisation ?? ""),
    "typeCtrl": TextEditingController(text: proj.typeProjet ?? ""),
    "descCtrl": TextEditingController(text: proj.description ?? ""),
  };
}).toList();
    Future<void> pickDate(BuildContext dialogContext) async {
      final picked = await showDatePicker(
        context: dialogContext,
        initialDate: DateTime.now(),
        firstDate: DateTime(2020),
        lastDate: DateTime(2100),
      );
      if (picked != null) {
        dateRelanceCtrl.text =
            "${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}";
      }
    }

    Future<void> pickTime(BuildContext dialogContext) async {
      final picked = await showTimePicker(
        context: dialogContext,
        initialTime: TimeOfDay.now(),
      );
      if (picked != null) {
        final hh = picked.hour.toString().padLeft(2, '0');
        final mm = picked.minute.toString().padLeft(2, '0');
        heureRelanceCtrl.text = "$hh:$mm";
      }
    }

    final saved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final canScheduleRelance = selectedStatut == "ok" ||
                selectedStatut == "rappeler_plus_tard";

            return Dialog(
              insetPadding: const EdgeInsets.all(20),
              child: Container(
                width: 900,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                ),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Edit contact",
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 18),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                                                /// 🔥 USER SECTION (AJOUT ICI)
Container(
  padding: const EdgeInsets.all(12),
  decoration: BoxDecoration(
    color: const Color(0xFFF8FAFC),
    borderRadius: BorderRadius.circular(12),
    border: Border.all(color: const Color(0xFFE4E7EC)),
  ),
  child: Row(
    children: [
      const Icon(Icons.person, color: kPrimary),
      const SizedBox(width: 10),

      Expanded(
        child: Text(
          contact.userNom ?? "Unknown",
          style: const TextStyle(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      IconButton(
        icon: const Icon(Icons.edit, size: 18),
        onPressed: () async {
          final newUser = await _showUserDialog();

          if (newUser != null) {
            await _updateContact(
              id: contact.id,
              data: {"userNom": newUser},
            );
          }
        },
      )
    ],
  ),
),
                          SizedBox(
                            width: 260,
                            child: TextField(
                              controller: nomCtrl,
                              decoration: _inputDecoration("Last name"),
                            ),
                          ),
                          SizedBox(
                            width: 260,
                            child: TextField(
                              controller: prenomCtrl,
                              decoration: _inputDecoration("First name"),
                            ),
                          ),
                          SizedBox(
                            width: 220,
                            child: TextField(
                              controller: telephoneCtrl,
                              decoration: _inputDecoration("Phone"),
                            ),
                          ),
                          SizedBox(
                            width: 280,
                            child: TextField(
                              controller: nomSocieteCtrl,
                              decoration: _inputDecoration("Company"),
                            ),
                          ),
                          SizedBox(
                            width: 280,
                            child: TextField(
                              controller: localisationCtrl,
                              decoration: _inputDecoration("Location"),
                            ),
                          ),
                          SizedBox(
  width: 280,
  child: TextField(
    controller: emailCtrl,
    decoration: _inputDecoration("Email"),
  ),
),
SizedBox(
  width: 280,
  child: TextField(
    controller: matriculeFiscaleCtrl,
    decoration: _inputDecoration("Matricule Fiscale"),
  ),
),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: selectedType,
                              items: const [
                                DropdownMenuItem(
                                    value: "Tuteur", child: Text("Tuteur")),
                                DropdownMenuItem(
                                    value: "Cloture", child: Text("Cloture")),
                                DropdownMenuItem(
                                    value: "Batiment", child: Text("Batiment")),
                              ],
                              onChanged: (v) {
                                if (v != null) {
                                  setDialogState(() {
                                    selectedType = v;
                                  });
                                }
                              },
                              decoration: _inputDecoration("Client type"),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: selectedStatut,
                              items: const [
                                DropdownMenuItem(value: "ok", child: Text("OK")),
                                DropdownMenuItem(
                                  value: "rappeler_plus_tard",
                                  child: Text("Call back later"),
                                ),
                                DropdownMenuItem(
                                  value: "user_injoignable",
                                  child: Text("Unreachable"),
                                ),
                                DropdownMenuItem(
                                  value: "client_refuse",
                                  child: Text("Client refused"),
                                ),
                              ],
                              onChanged: (v) {
                                if (v != null) {
                                  setDialogState(() {
                                    selectedStatut = v;
                                  });
                                }
                              },
                              decoration: _inputDecoration("Status"),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

Row(
  children: [

    /// ✅ DATE APPEL
    Expanded(
      child: TextField(
        controller: dateAppelCtrl,
        readOnly: true,
        decoration: _inputDecoration("Call Date"),
        onTap: () async {
          final picked = await showDatePicker(
            context: context,
            initialDate: dateAppel ?? DateTime.now(),
            firstDate: DateTime(2020),
            lastDate: DateTime(2100),
          );

          if (picked != null) {
            setDialogState(() {
              dateAppel = picked;
              dateAppelCtrl.text =
                  "${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}";
            });
          }
        },
      ),
    ),

    const SizedBox(width: 12),

    /// ✅ PIPELINE
    Expanded(
      child: DropdownButtonFormField<String>(
        value: selectedPipeline,
        items: const [
          DropdownMenuItem(value: "Prospect", child: Text("Prospect")),
          DropdownMenuItem(value: "Plan technique", child: Text("Plan technique")),
          DropdownMenuItem(value: "Echantillonnage", child: Text("Echantillonnage")),
          DropdownMenuItem(value: "Devis envoyé", child: Text("Devis envoyé")),
          DropdownMenuItem(value: "Negociation", child: Text("Négociation")),
          DropdownMenuItem(value: "Relance", child: Text("Relance")),
          DropdownMenuItem(value: "Gagné", child: Text("Commande gagnée")),
          DropdownMenuItem(value: "Perdu", child: Text("Commande perdue")),
        ],
        onChanged: (v) {
          if (v != null) {
            setDialogState(() {
              selectedPipeline = v;
            });
          }
        },
        decoration: _inputDecoration("Next Action"),
      ),
    ),
  ],
),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: nbAppelsCtrl,
                              keyboardType: TextInputType.number,
                              decoration: _inputDecoration("Number of calls"),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: sujetDiscussionCtrl,
                              decoration: _inputDecoration("Discussion topic"),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: messageCtrl,
                        maxLines: 3,
                        decoration: _inputDecoration("Message"),
                      ),
                      const SizedBox(height: 18),
                      const Text(
                        "Products",
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),


const SizedBox(height: 18),
                      const SizedBox(height: 10),
                      Column(
                        children: List.generate(produits.length, (index) {
                          final row = produits[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Row(
                              children: [
                                Expanded(
                                  flex: 3,
                                  child: TextField(
                                    controller:
                                        row["produitCtrl"] as TextEditingController,
                                    decoration: _inputDecoration("Product"),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  flex: 1,
                                  child: TextField(
                                    controller:
                                        row["qteCtrl"] as TextEditingController,
                                    keyboardType:
                                        const TextInputType.numberWithOptions(
                                            decimal: true),
                                    decoration: _inputDecoration("Qty"),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                IconButton(
                                  onPressed: () {
                                    if (produits.length > 1) {
                                      setDialogState(() {
                                        produits.removeAt(index);
                                      });
                                    }
                                  },
                                  icon: const Icon(
                                    Icons.delete_outline,
                                    color: Colors.red,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: OutlinedButton.icon(
                          onPressed: () {
                            setDialogState(() {
                              produits.add({
                                "produitCtrl":
                                    TextEditingController(text: "PROBAR"),
                                "qteCtrl": TextEditingController(text: "1"),
                              });
                            });
                          },
                          icon: const Icon(Icons.add),
                          label: const Text("Add product"),
                        ),
                      ),
                      const SizedBox(height: 18),
const Text(
  "Projects",
  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
),
const SizedBox(height: 10),

Column(
  children: List.generate(projects.length, (index) {
    final row = projects[index];

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE4E7EC)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: row["nomCtrl"] as TextEditingController,
                  decoration: _inputDecoration("Project name"),
                ),
              ),
              IconButton(
                onPressed: () {
                  if (projects.length > 1) {
                    setDialogState(() => projects.removeAt(index));
                  }
                },
                icon: const Icon(Icons.delete, color: Colors.red),
              )
            ],
          ),

          const SizedBox(height: 10),

          TextField(
            controller: row["locCtrl"] as TextEditingController,
            decoration: _inputDecoration("Location"),
          ),

          const SizedBox(height: 10),

          TextField(
            controller: row["typeCtrl"] as TextEditingController,
            decoration: _inputDecoration("Type"),
          ),

          const SizedBox(height: 10),

          TextField(
            controller: row["descCtrl"] as TextEditingController,
            maxLines: 2,
            decoration: _inputDecoration("Description"),
          ),
        ],
      ),
    );
  }),
),

OutlinedButton.icon(
  onPressed: () {
    setDialogState(() {
      projects.add({
        "nomCtrl": TextEditingController(),
        "locCtrl": TextEditingController(),
        "typeCtrl": TextEditingController(),
        "descCtrl": TextEditingController(),
      });
    });
  },
  icon: const Icon(Icons.add),
  label: const Text("Add project"),
),
                      const SizedBox(height: 18),
                      if (canScheduleRelance)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: kPrimary.withOpacity(.15),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                "Follow-up",
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: dateRelanceCtrl,
                                      readOnly: true,
                                      decoration:
                                          _inputDecoration("Follow-up date"),
                                      onTap: () => pickDate(dialogContext),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: TextField(
                                      controller: heureRelanceCtrl,
                                      readOnly: true,
                                      decoration:
                                          _inputDecoration("Follow-up time"),
                                      onTap: () => pickTime(dialogContext),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: commentaireRelanceCtrl,
                                maxLines: 3,
                                decoration:
                                    _inputDecoration("Follow-up comment"),
                              ),
                              if (isFollowupActor) ...[
                                const SizedBox(height: 12),
                                DropdownButtonFormField<String>(
                                  initialValue: selectedCommercialId,
                                  isExpanded: true,
                                  decoration: _inputDecoration("Commercial *"),
                                  items: commercialUsers
                                      .map((u) => DropdownMenuItem(
                                            value: u.id,
                                            child: Text(
                                              u.label,
                                              overflow: TextOverflow.ellipsis,
                                              maxLines: 1,
                                            ),
                                          ))
                                      .toList(),
                                  onChanged: (v) => setDialogState(() {
                                    selectedCommercialId = v;
                                  }),
                                ),
                              ],
                            ],
                          ),
                        ),
                      const SizedBox(height: 22),
                      _buildStatusHistorySection(statusHistory),
                      const SizedBox(height: 22),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: () =>
                                Navigator.of(dialogContext).pop(false),
                            child: const Text("Cancel"),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: kPrimary,
                              foregroundColor: Colors.white,
                            ),
                            onPressed: () async {
                              final hasDateAndTime = canScheduleRelance &&
                                  dateRelanceCtrl.text.trim().isNotEmpty &&
                                  heureRelanceCtrl.text.trim().isNotEmpty;
                              if (isFollowupActor &&
                                  hasDateAndTime &&
                                  selectedCommercialId == null) {
                                _showError("Commercial requis");
                                return;
                              }

                              try {
                                final payload = {
                                  "typeClient": selectedType,
                                  "statut": selectedStatut,
                                  "nomSociete":
                                      nomSocieteCtrl.text.trim().isEmpty
                                          ? null
                                          : nomSocieteCtrl.text.trim(),
                                  "pipelineStage": selectedPipeline,
"dateAppel": dateAppel?.toIso8601String(),
                                  "nom": nomCtrl.text.trim(),
                                  "prenom": prenomCtrl.text.trim(),
                                  "localisation":
                                      localisationCtrl.text.trim().isEmpty
                                          ? null
                                          : localisationCtrl.text.trim(),
                                  "telephone": telephoneCtrl.text.trim(),
                                  "message": messageCtrl.text.trim().isEmpty
                                      ? null
                                      : messageCtrl.text.trim(),
                                  "nbAppels":
                                      int.tryParse(nbAppelsCtrl.text.trim()) ?? 0,
                                      "email": emailCtrl.text.trim().isEmpty
    ? null
    : emailCtrl.text.trim(),
                                  "sujetDiscussion":
                                      sujetDiscussionCtrl.text.trim().isEmpty
                                          ? null
                                          : sujetDiscussionCtrl.text.trim(),
                                          "matriculeFiscale": matriculeFiscaleCtrl.text.trim().isEmpty
    ? null
    : matriculeFiscaleCtrl.text.trim(),
                                  "produits": produits.map((row) {
                                    final produit =
                                        (row["produitCtrl"]
                                                as TextEditingController)
                                            .text
                                            .trim();
                                    final qte = double.tryParse(
                                            (row["qteCtrl"]
                                                    as TextEditingController)
                                                .text
                                                .trim()) ??
                                        1;
                                    return {
                                      "produit":
                                          produit.isEmpty ? "PROBAR" : produit,
                                      "qte": qte <= 0 ? 1 : qte,
                                    };
                                  }).toList(),
                      // ✅ PROJECTS (PAS DE final)
  "projects": projects.map((row) {
    return {
      "nomProjet":
          (row["nomCtrl"] as TextEditingController).text.trim(),
      "localisation":
          (row["locCtrl"] as TextEditingController).text.trim(),
      "typeProjet":
          (row["typeCtrl"] as TextEditingController).text.trim(),
      "description":
          (row["descCtrl"] as TextEditingController).text.trim(),
    };
  }).toList(),
                                  if (canScheduleRelance &&
                                      dateRelanceCtrl.text.trim().isNotEmpty)
                                    "dateRelance": dateRelanceCtrl.text.trim(),
                                  if (canScheduleRelance &&
                                      heureRelanceCtrl.text.trim().isNotEmpty)
                                    "heureRelance": heureRelanceCtrl.text.trim(),
                                  if (canScheduleRelance &&
                                      commentaireRelanceCtrl.text
                                          .trim()
                                          .isNotEmpty)
                                    "commentaire":
                                        commentaireRelanceCtrl.text.trim(),
                                  if (isFollowupActor &&
                                      selectedCommercialId != null)
                                    "commercialId": selectedCommercialId,
                                };

                                final updated = await _updateContact(
                                  id: contact.id,
                                  data: payload,
                                );
                                capturedAutomation = updated.automation;

                                if (dialogContext.mounted) {
                                  Navigator.of(dialogContext).pop(true);
                                }
                              } catch (e) {
                                if (dialogContext.mounted) {
                                  Navigator.of(dialogContext).pop(false);
                                }
                                _showError(e.toString());
                              }
                            },
                            child: const Text("Save"),
                          ),
                        ],
                      )
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
if (saved == true) {
  await _loadContacts(); // 🔥 refresh complet
  _showSuccess("Contact updated successfully");
  if (capturedAutomation != null) {
    _showFollowupAutomationSummary(capturedAutomation!);
  }
}
  }

  Widget _buildTable() {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE4E7EC)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 20,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: Color(0xFFE4E7EC)),
              ),
            ),
            child: Row(
              children: [
                const Icon(Icons.business_center_outlined, size: 22),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Commercial Contacts',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF2F4F7),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${_contacts.length} records',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            height: 520,
            child: Scrollbar(
              controller: _horizontalScrollController,
              thumbVisibility: true,
              child: SingleChildScrollView(
                controller: _horizontalScrollController,
                scrollDirection: Axis.horizontal,
                child: Scrollbar(
                  controller: _verticalScrollController,
                  thumbVisibility: true,
                  child: SingleChildScrollView(
                    controller: _verticalScrollController,
                    scrollDirection: Axis.vertical,
                    child: DataTable(
                      columnSpacing: 28,
                      headingRowHeight: 56,
                      dataRowMinHeight: 64,
                      dataRowMaxHeight: 90,
                      headingTextStyle: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: kText,
                        fontSize: 13,
                      ),
                      columns: const [
                        DataColumn(label: Text('Full Name')),
                        DataColumn(label: Text('Company')),
                        DataColumn(label: Text('Phone')),
                        DataColumn(label: Text('Location')),
                        DataColumn(label: Text('Client Type')),
                        DataColumn(label: Text('Status')),
                        DataColumn(label: Text('Calls')),
                        DataColumn(label: Text('Subject')),
                        DataColumn(label: Text('Products')),
                        DataColumn(label: Text('Follow-up')),
                        DataColumn(label: Text('Message')),
                        DataColumn(label: Text('Actions')),
                      ],
                      rows: paginatedContacts.map((contact)  {
                        final relance = contact.relances.isNotEmpty
                            ? contact.relances.first
                            : null;

                        return DataRow(
                          cells: [
                            DataCell(
  Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      CircleAvatar(
        radius: 18,
        backgroundColor: const Color(0xFFEAF2FF),
        child: Text(
          contact.nom.isNotEmpty
              ? contact.nom[0].toUpperCase()
              : '?',
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            color: Color(0xFF1D4ED8),
          ),
        ),
      ),
      const SizedBox(width: 10),

      /// 🔥 TEXTE + CREATED BY
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              contact.fullName,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
              ),
            ),

            const SizedBox(height: 4),

            Text(
              "👤 Created by: ${contact.userNom ?? contact.userNomCustom ?? '-'}",
              style: const TextStyle(
                fontSize: 11,
                color: Colors.grey,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ),
      ),
    ],
  ),
),
                            DataCell(
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 160),
                                child: Text(
                                  (contact.nomSociete ?? '').trim().isNotEmpty
                                      ? contact.nomSociete!
                                      : 'N/A',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                            DataCell(
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 130),
                                child: Text(
                                  contact.telephone,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                            DataCell(
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 150),
                                child: Text(
                                  (contact.localisation ?? '').trim().isNotEmpty
                                      ? contact.localisation!
                                      : 'N/A',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                            DataCell(_buildTypeBadge(contact.typeClient)),
                            DataCell(_buildStatusBadge(contact.statut)),
                            DataCell(Text('${contact.nbAppels}')),
                            DataCell(
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 160),
                                child: Text(
                                  (contact.sujetDiscussion ?? '')
                                          .trim()
                                          .isNotEmpty
                                      ? contact.sujetDiscussion!
                                      : '-',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                            DataCell(
                              SizedBox(
                                width: 220,
                                child: _buildProductsCell(contact.produits),
                              ),
                            ),
                            DataCell(
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 140),
                                child: Text(
                                  relance == null
                                      ? '-'
                                      : '${relance.dateRelance ?? '-'} ${relance.heureRelance ?? ''}',
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 2,
                                ),
                              ),
                            ),
                            DataCell(
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 220),
                                child: Text(
                                  (contact.message ?? '').trim().isNotEmpty
                                      ? contact.message!
                                      : '-',
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 2,
                                ),
                              ),
                            ),
                            DataCell(
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    tooltip: 'Edit',
                                    onPressed: () => _showEditDialog(contact),
                                    icon: const Icon(
                                      Icons.edit_outlined,
                                      color: Color(0xFF2563EB),
                                    ),
                                  ),
                                  IconButton(
                                    tooltip: 'Calendar',
                                    onPressed: () => _showRelanceDialog(contact),
                                    icon: const Icon(
                                      Icons.event_repeat_outlined,
                                      color: Color(0xFF059669),
                                    ),
                                  ),
                                  IconButton(
                                    tooltip: 'Delete',
                                    onPressed: () => _confirmDelete(contact),
                                    icon: const Icon(
                                      Icons.delete_outline,
                                      color: Color(0xFFDC2626),
                                    ),
                                  ),
                                        /// 🔥 TIMELINE (ICI)
      IconButton(
        tooltip: 'Timeline',
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => CommercialTimelineScreen(
                contactId: contact.id,
                token: widget.token,
              ),
            ),
          );
        },
        icon: const Icon(Icons.timeline, color: Colors.purple),
      ),

     
                                ],
                              ),
                            ),
                          ],
                        );
                      }).toList(),
                    ),
                  ),
                ),
              ),
            ),
          ),
              /// 🔥 AJOUT ICI (TRÈS IMPORTANT)
            _buildPagination(),
        ],
      ),
    );

  }

Widget _buildSearchBar() {
  return Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: const Color(0xFFE4E7EC)),
      boxShadow: const [
        BoxShadow(
          color: Color(0x0A000000),
          blurRadius: 20,
          offset: Offset(0, 6),
        ),
      ],
    ),
    child: Column(
      children: [
        /// 🔍 SEARCH TEXT
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText:
                      'Search by name, company, phone or location...',
                  prefixIcon: const Icon(Icons.search),
                  filled: true,
                  fillColor: const Color(0xFFF9FAFB),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onSubmitted: (value) => _loadContacts(
                  query: value,
                  userNom: selectedUser,
                  typeClient: selectedType,
                ),
              ),
            ),
            const SizedBox(width: 12),

            /// 🔍 SEARCH BUTTON
            ElevatedButton.icon(
              onPressed: () => _loadContacts(
                query: _searchController.text,
                userNom: selectedUser,
                typeClient: selectedType,
              ),
              icon: const Icon(Icons.search),
              label: const Text('Search'),
            ),

            const SizedBox(width: 10),

            /// 🔄 RESET
            OutlinedButton.icon(
              onPressed: () {
                _searchController.clear();
                setState(() {
                  selectedUser = null;
                  selectedType = null;
                });
                _loadContacts();
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Reset'),
            ),
          ],
        ),

        const SizedBox(height: 12),

        /// 🔥 FILTERS (USER + TYPE)
        Row(
          children: [
            /// 👤 USER FILTER
            Expanded(
              child: DropdownButtonFormField<String>(
                value: selectedUser,
                hint: const Text("Filter by User"),
             items: users.map((u) {
  return DropdownMenuItem(
    value: u,
    child: Text(u),
  );
}).toList(),
                onChanged: (v) {
                  setState(() {
                    selectedUser = v;
                  });
                  _loadContacts(
                    query: _searchController.text,
                    userNom: selectedUser,
                    typeClient: selectedType,
                  );
                },
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.person),
                  filled: true,
                  fillColor: const Color(0xFFF9FAFB),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),

            const SizedBox(width: 12),

            /// 🏢 TYPE FILTER
            Expanded(
              child: DropdownButtonFormField<String>(
                value: selectedType,
                hint: const Text("Filter by Type"),
                items: const [
                  DropdownMenuItem(value: "Tuteur", child: Text("Tuteur")),
                  DropdownMenuItem(value: "Cloture", child: Text("Cloture")),
                  DropdownMenuItem(value: "Batiment", child: Text("Batiment")),
                ],
                onChanged: (v) {
                  setState(() {
                    selectedType = v;
                  });
                  _loadContacts(
                    query: _searchController.text,
                    userNom: selectedUser,
                    typeClient: selectedType,
                  );
                },
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.business),
                  filled: true,
                  fillColor: const Color(0xFFF9FAFB),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
            ElevatedButton.icon(
  onPressed: _exportContactsExcel,
  icon: const Icon(Icons.download),
  label: const Text("Export Excel"),
),
            if (_isPrivilegedRole) ...[
              const SizedBox(width: 12),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: kPrimary),
                onPressed: _showAssignContactsDialog,
                icon: const Icon(Icons.assignment_ind_outlined, color: Colors.white),
                label: const Text(
                  "Affecter des contacts",
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ],
          ],
        ),
      ],
    ),
  );
}

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildSearchBar(),
          const SizedBox(height: 20),
          Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 500),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF1F2),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFFDA4AF)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline_rounded,
                      size: 42, color: Color(0xFFB42318)),
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    style: const TextStyle(
                      color: Color(0xFFB42318),
                      fontWeight: FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    onPressed: _loadContacts,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Réessayer'),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    // État vide : search bar toujours visible + message + bouton reset.
    // Un commercial sans AUCUN contact affecté (et sans filtre actif) n'est
    // pas une erreur — le backend l'a renvoyé volontairement (voir
    // GET /commercial-contacts, court-circuit "assignedContactIds=[]"). Ce
    // cas précis a son propre message, distinct d'une recherche trop
    // restrictive, pour ne jamais laisser croire à un bug de filtrage.
    if (_contacts.isEmpty) {
      final isCommercialRole =
          (AuthService().userRole ?? '').toLowerCase().trim() == 'commercial';
      final hasActiveFilters = _searchController.text.trim().isNotEmpty ||
          selectedUser != null ||
          selectedType != null;
      final noAssignmentForCommercial = isCommercialRole && !hasActiveFilters;

      final title = noAssignmentForCommercial
          ? 'Aucun contact ne vous est actuellement affecté.'
          : 'No commercial contacts found.';
      final subtitle = noAssignmentForCommercial
          ? "Un administrateur doit d'abord vous assigner des contacts commerciaux."
          : 'Essayez de modifier vos critères de recherche ou réinitialisez les filtres.';

      return ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildSearchBar(),
          const SizedBox(height: 24),
          Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 460),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFE4E7EC)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    noAssignmentForCommercial
                        ? Icons.person_off_outlined
                        : Icons.folder_open_outlined,
                    size: 54,
                    color: const Color(0xFF98A2B3),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    title,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    subtitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFF667085)),
                  ),
                  if (!noAssignmentForCommercial) ...[
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: () {
                        _searchController.clear();
                        setState(() {
                          selectedUser = null;
                          selectedType = null;
                        });
                        _loadContacts();
                      },
                      icon: const Icon(Icons.refresh),
                      label: const Text('Réinitialiser les filtres'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: () => _loadContacts(query: _searchController.text),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildSearchBar(),
          const SizedBox(height: 18),
          _buildTable(),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    _horizontalScrollController.dispose();
    _verticalScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(
        title: const Text('Commercial Contacts'),
        centerTitle: false,
        elevation: 0,
      ),
      body: _buildBody(),
    );
  }
}