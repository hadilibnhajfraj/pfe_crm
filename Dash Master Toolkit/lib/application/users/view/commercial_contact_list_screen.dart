import 'package:flutter/material.dart';
import '../model/commercial_contact_model.dart';
import 'package:dash_master_toolkit/services/commercial_contact_service.dart';

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
  final CommercialContactService _service = CommercialContactService();
  final TextEditingController _searchController = TextEditingController();

  bool _loading = true;
  String? _error;
  List<CommercialContact> _contacts = [];

  static const Color kPrimary = Color(0xFF1976D2);
  static const Color kBg = Color(0xFFF8FAFC);
  static const Color kText = Color(0xFF101828);
  static const Color kMuted = Color(0xFF667085);

  @override
  void initState() {
    super.initState();
    _loadContacts();
  }

  Future<void> _loadContacts({String? query}) async {
    try {
      if (mounted) {
        setState(() {
          _loading = true;
          _error = null;
        });
      }

      final data = await _service.fetchMyContacts(
        token: widget.token,
        query: query?.trim(),
      );

      if (mounted) {
        setState(() {
          _contacts = data;
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

  Future<void> _updateContact({
    required String id,
    required Map<String, dynamic> data,
  }) async {
    await _service.updateContact(
      token: widget.token,
      id: id,
      data: data,
    );
    await _loadContacts(query: _searchController.text);
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

  String _statusLabel(String status) {
    switch (status) {
      case 'ok':
        return 'OK';
      case 'rappeler_plus_tard':
        return 'Call Later';
      case 'user_injoignable':
        return 'Not Reachable';
      case 'client_refuse':
        return 'Client Refused';
      default:
        return status;
    }
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      filled: true,
      fillColor: const Color(0xFFF9FAFB),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
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
            "Do you really want to delete the contact ${contact.fullName} ?",
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

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by name, company, phone or location...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              onSubmitted: (value) => _loadContacts(query: value),
            ),
          ),
          const SizedBox(width: 12),
          ElevatedButton.icon(
            onPressed: () => _loadContacts(query: _searchController.text),
            icon: const Icon(Icons.search),
            label: const Text('Search'),
          ),
          const SizedBox(width: 10),
          OutlinedButton.icon(
            onPressed: () {
              _searchController.clear();
              _loadContacts();
            },
            icon: const Icon(Icons.refresh),
            label: const Text('Reset'),
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
      return Center(
        child: Text(
          _error!,
          style: const TextStyle(color: Colors.red),
        ),
      );
    }

    if (_contacts.isEmpty) {
      return const Center(
        child: Text(
          'No commercial contacts found.',
          style: TextStyle(fontSize: 18),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _loadContacts(query: _searchController.text),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildSearchBar(),
          const SizedBox(height: 18),
          ..._contacts.map((contact) {
            return Card(
              child: ListTile(
                title: Text(contact.fullName),
                subtitle: Text(contact.telephone),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Edit',
                      icon: const Icon(Icons.edit),
                      onPressed: () {},
                    ),
                    IconButton(
                      tooltip: 'Delete',
                      icon: const Icon(Icons.delete),
                      onPressed: () => _confirmDelete(contact),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBg,
      appBar: AppBar(
        title: const Text('Commercial Contacts'),
      ),
      body: _buildBody(),
    );
  }
}