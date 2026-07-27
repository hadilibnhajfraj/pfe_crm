// lib/models/archive_request_model.dart
import 'dart:convert';

class ArchiveRequestMessage {
  final String id;
  final String senderId;
  final String senderName;
  final String role;
  final String content;
  final DateTime createdAt;
  bool isRead;

  ArchiveRequestMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.role,
    required this.content,
    required this.createdAt,
    this.isRead = false,
  });

  factory ArchiveRequestMessage.fromJson(Map<String, dynamic> j) {
    return ArchiveRequestMessage(
      id:         _str(j['_id'] ?? j['id']),
      senderId:   _str(j['senderId'] ?? j['userId']),
      senderName: _str(j['senderName'] ?? j['userName'], fallback: 'Utilisateur'),
      role:       _str(j['role'], fallback: 'user'),
      content:    _str(j['content'] ?? j['message']),
      createdAt:  _date(j['createdAt'] ?? j['timestamp']),
      isRead:     j['isRead'] == true,
    );
  }

  static DateTime _date(dynamic v) {
    if (v == null) return DateTime.now();
    try { return DateTime.parse(v.toString()); } catch (_) { return DateTime.now(); }
  }

  static String _str(dynamic v, {String fallback = ''}) =>
      (v == null || v.toString().trim().isEmpty) ? fallback : v.toString().trim();
}

class ArchiveRequest {
  final String id;
  final String projectId;
  final String projectName; // from project.nomProjet or flat field
  final String society;     // from project.comptoir ("Société")
  final String userId;
  final String userEmail;   // from user.email or flat field
  final String userName;
  final String subject;
  final String message;
  String status;            // 'pending' | 'approved' | 'rejected'
  final String type;        // 'ARCHIVAGE' | 'DESARCHIVAGE'
  final String? rejectionReason;
  final List<ArchiveRequestMessage> messages;
  final DateTime createdAt;

  ArchiveRequest({
    required this.id,
    required this.projectId,
    required this.projectName,
    this.society = '',
    required this.userId,
    required this.userEmail,
    required this.userName,
    required this.subject,
    required this.message,
    required this.status,
    required this.messages,
    required this.createdAt,
    this.type = 'DESARCHIVAGE',
    this.rejectionReason,
  });

  bool get isArchivage => type == 'ARCHIVAGE';

  factory ArchiveRequest.fromJson(Map<String, dynamic> j) {
    // Nested objects — backend may use 'project' or 'archiveProject'
    final project = j['project'] is Map
        ? Map<String, dynamic>.from(j['project'] as Map)
        : j['archiveProject'] is Map
            ? Map<String, dynamic>.from(j['archiveProject'] as Map)
            : <String, dynamic>{};

    // Backend peut envoyer 'requester', 'user', ou des champs plats
    final requester = j['requester'] is Map
        ? Map<String, dynamic>.from(j['requester'] as Map)
        : j['user'] is Map
            ? Map<String, dynamic>.from(j['user'] as Map)
            : <String, dynamic>{};

    // ignore: avoid_print
    print('REQUESTER=${jsonEncode(j['requester'])}');

    final rawMsgs = j['messages'] is List ? j['messages'] as List : [];

    final userName = _str(
      requester['name'] ??
      requester['firstName'] ??
      requester['nom'] ??
      requester['prenom'] ??
      j['userName'] ??
      j['requestedByName'],
      fallback: 'Utilisateur',
    );

    // ignore: avoid_print
    print('USER NAME=$userName');

    final userEmail = _str(
      requester['email'] ??
      j['userEmail'] ??
      j['email'],
    );

    return ArchiveRequest(
      id:          _str(j['_id'] ?? j['id']),
      projectId:   _str(j['projectId'] ?? project['id'] ?? project['_id']),
      projectName: _str(
        project['nomProjet'] ?? project['name'] ?? project['projectName'] ??
        j['projectName'] ?? j['nomProjet'],
        fallback: 'Projet inconnu',
      ),
      society:     _str(project['societe'] ?? project['comptoir'] ?? j['societe']),
      userId:      _str(requester['id'] ?? requester['_id'] ?? j['userId'] ?? j['requestedBy']),
      userEmail:   userEmail,
      userName:    userName,
      subject:     _str(j['subject'] ?? j['objet'], fallback: 'Demande de désarchivage'),
      message:     _str(j['message'] ?? j['reason'] ?? j['raisonDemande']),
      status:      _str(j['status'], fallback: 'pending'),
      type:        _str(j['type'], fallback: 'DESARCHIVAGE').toUpperCase(),
      rejectionReason: j['rejectionReason'] == null
          ? null
          : _str(j['rejectionReason']),
      messages:    rawMsgs
          .map((m) => ArchiveRequestMessage.fromJson(
              m is Map ? Map<String, dynamic>.from(m) : {}))
          .toList(),
      createdAt:   ArchiveRequestMessage._date(j['createdAt']),
    );
  }

  int get unreadCount => messages.where((m) => !m.isRead).length;

  Map<String, dynamic> toJson() => {
    'id':          id,
    'projectId':   projectId,
    'projectName': projectName,
    'societe':     society,
    'userId':      userId,
    'userEmail':   userEmail,
    'userName':    userName,
    'subject':     subject,
    'message':     message,
    'status':      status,
    'type':        type,
    'rejectionReason': rejectionReason,
    'createdAt':   createdAt.toIso8601String(),
    'messageCount': messages.length,
  };

  static String _str(dynamic v, {String fallback = ''}) =>
      (v == null || v.toString().trim().isEmpty) ? fallback : v.toString().trim();
}
