import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:dash_master_toolkit/core/config/api_config.dart';

import '../model/commercial_action_model.dart';
import 'package:dash_master_toolkit/services/commercial_action_service.dart';
import 'add_commercial_action_screen.dart';
import 'package:dio/dio.dart';
class CommercialTimelineScreen extends StatefulWidget {
  final String contactId;
  final String token;

  const CommercialTimelineScreen({
    super.key,
    required this.contactId,
    required this.token,
  });

  @override
  State<CommercialTimelineScreen> createState() =>
      _CommercialTimelineScreenState();
}

class _CommercialTimelineScreenState
    extends State<CommercialTimelineScreen> {

  final service = CommercialActionService();

  List<CommercialAction> actions = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final data = await service.getActions(
        token: widget.token,
        contactId: widget.contactId,
      );

      setState(() {
        actions = data;
        loading = false;
      });

    } catch (e) {
      setState(() => loading = false);
    }
  }

  /// NEXT ACTION (CRM LOGIC)
  String? getNextAction(String current) {
    switch (current) {
      case "Visite": return "Plan technique";
      case "Plan technique": return "Echantillonnage";
      case "Echantillonnage": return "Devis envoyé";
      case "Devis envoyé": return "Negociation";
      case "Negociation": return "Commande gagnée";
      default: return null;
    }
  }

  /// COLOR
  Color getActionColor(String action) {
    switch(action){
      case "Visite": return Colors.blue;
      case "Plan technique": return Colors.orange;
      case "Echantillonnage": return Colors.teal;
      case "Devis envoyé": return Colors.purple;
      case "Negociation": return Colors.red;
      case "Commande gagnée": return Colors.green;
      case "Commande perdue": return Colors.grey;
      default: return Colors.grey;
    }
  }

  /// DELETE
  Future _deleteAction(String actionId) async {

    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text("Delete action"),
          content: const Text("Are you sure?"),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text("Cancel"),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.pop(context, true),
              child: const Text("Delete"),
            ),
          ],
        );
      },
    );

    if (confirm != true) return;

    try {
      await service.deleteAction(
        token: widget.token,
        actionId: actionId,
      );

      Get.snackbar("Success", "Action deleted");
      load();

    } catch (e) {
      Get.snackbar("Error", "Delete failed");
    }
  }

  /// RELANCE COLOR
  Color getRelanceColor(DateTime d) {
    final now = DateTime.now();

    if (d.isBefore(now)) return Colors.red;

    final diff = d.difference(now).inHours;

    if (diff <= 48) return Colors.orange;

    return Colors.green;
  }

@override
Widget build(BuildContext context) {

  if (loading) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }

  if (actions.isEmpty) {
    return Scaffold( // ⚠️ important: PAS const car on va ajouter FAB
      appBar: AppBar(
        title: const Text("Commercial Timeline"),
      ),
      body: const Center(child: Text("No CRM actions")),

      /// ✅ FAB ICI AUSSI (même si vide)
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text("Add Action"),
        onPressed: () async {

          final result = await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AddCommercialActionScreen(
                contactId: widget.contactId,
              ),
            ),
          );

          if (result == true) {
            load();
          }
        },
      ),
    );
  }

  return Scaffold(

    appBar: AppBar(
      title: const Text("Commercial Timeline"),
    ),

    /// ✅ BODY
    body: ListView.builder(
      itemCount: actions.length,

      itemBuilder: (context, index) {

        final action = actions[index];

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),

          child: Padding(
            padding: const EdgeInsets.all(16),

            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,

              children: [

                /// HEADER
                Row(
                  children: [

                    Icon(
                      Icons.timeline,
                      color: getActionColor(action.typeAction),
                    ),

                    const SizedBox(width: 10),

                    Expanded(
                      child: Text(
                        action.typeAction,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),

                    Text(
                      DateFormat("yyyy-MM-dd HH:mm")
                          .format(action.dateAction!),
                      style: const TextStyle(fontSize: 12),
                    ),

                    IconButton(
                      icon: const Icon(Icons.delete, color: Colors.red),
                      onPressed: () => _deleteAction(action.id),
                    ),
                  ],
                ),

                /// FILE
                if (action.fileUrl != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: InkWell(
                      onTap: () async {
                        final url = Uri.parse(
                          "${ApiConfig.baseUrl}${action.fileUrl}",
                        );

                        if (!await launchUrl(url)) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text("Cannot open file")),
                          );
                        }
                      },
                      child: Row(
                        children: const [
                          Icon(Icons.attach_file, color: Colors.blue),
                          SizedBox(width: 6),
                          Text(
                            "Voir fichier",
                            style: TextStyle(
                              color: Colors.blue,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                /// COMMENT
                if (action.commentaire != null &&
                    action.commentaire!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(action.commentaire!),
                  ),

                const SizedBox(height: 10),

              ],
            ),
          ),
        );
      },
    ),

    /// ✅ ✅ ICI LE BON ENDROIT
    floatingActionButton: FloatingActionButton.extended(
      icon: const Icon(Icons.add),
      label: const Text("Add Action"),
      onPressed: () async {

        final result = await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AddCommercialActionScreen(
              contactId: widget.contactId,
            ),
          ),
        );

        if (result == true) {
          load(); // reload timeline
        }
      },
    ),
  );
}
}