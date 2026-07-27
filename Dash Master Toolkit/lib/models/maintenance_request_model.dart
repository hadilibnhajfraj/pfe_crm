// lib/models/maintenance_request_model.dart

DateTime _date(dynamic v) {
  if (v == null) return DateTime.now();
  try {
    return DateTime.parse(v.toString());
  } catch (_) {
    return DateTime.now();
  }
}

String _str(dynamic v, {String fallback = ''}) =>
    (v == null || v.toString().trim().isEmpty) ? fallback : v.toString().trim();

class MaintenanceRequestComment {
  final String id;
  final String senderId;
  final String senderName;
  final String message;
  final DateTime createdAt;

  MaintenanceRequestComment({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.createdAt,
  });

  factory MaintenanceRequestComment.fromJson(Map<String, dynamic> j) {
    final sender = j['sender'] is Map ? Map<String, dynamic>.from(j['sender'] as Map) : <String, dynamic>{};
    return MaintenanceRequestComment(
      id: _str(j['id']),
      senderId: _str(sender['id'] ?? j['senderId']),
      senderName: _str(sender['name'], fallback: 'Utilisateur'),
      message: _str(j['message']),
      createdAt: _date(j['createdAt']),
    );
  }
}

class MaintenanceRequestActivity {
  final String id;
  final String type;
  final String message;
  final String actorName;
  final DateTime createdAt;

  MaintenanceRequestActivity({
    required this.id,
    required this.type,
    required this.message,
    required this.actorName,
    required this.createdAt,
  });

  factory MaintenanceRequestActivity.fromJson(Map<String, dynamic> j) {
    final actor = j['actor'] is Map ? Map<String, dynamic>.from(j['actor'] as Map) : <String, dynamic>{};
    return MaintenanceRequestActivity(
      id: _str(j['id']),
      type: _str(j['type']),
      message: _str(j['message']),
      actorName: _str(actor['name'], fallback: 'Système'),
      createdAt: _date(j['createdAt']),
    );
  }
}

class MaintenanceRequest {
  final String id;
  final int ticketNo;
  final String equipement;
  final String typePanne;
  final String urgence; // faible | moyenne | critique
  final String description;
  final List<String> photos;
  String statut; // en_attente | acceptee | en_cours | refusee | terminee
  final String? rejectionReason;
  DateTime? processedAt;
  DateTime? assignedAt;
  DateTime? startedAt;
  DateTime? completedAt;
  final String userId;
  final String requesterName;
  final String requesterEmail;
  String? technicianId;
  String? technicianName;
  final DateTime createdAt;

  MaintenanceRequest({
    required this.id,
    required this.ticketNo,
    required this.equipement,
    required this.typePanne,
    required this.urgence,
    required this.description,
    required this.photos,
    required this.statut,
    this.rejectionReason,
    this.processedAt,
    this.assignedAt,
    this.startedAt,
    this.completedAt,
    required this.userId,
    required this.requesterName,
    required this.requesterEmail,
    this.technicianId,
    this.technicianName,
    required this.createdAt,
  });

  factory MaintenanceRequest.fromJson(Map<String, dynamic> j) {
    final requester = j['requester'] is Map ? Map<String, dynamic>.from(j['requester'] as Map) : <String, dynamic>{};
    final technician = j['technician'] is Map ? Map<String, dynamic>.from(j['technician'] as Map) : null;
    final rawPhotos = j['photos'] is List ? j['photos'] as List : [];

    return MaintenanceRequest(
      id: _str(j['id']),
      ticketNo: (j['ticketNo'] is num) ? (j['ticketNo'] as num).toInt() : 0,
      equipement: _str(j['equipement']),
      typePanne: _str(j['typePanne']),
      urgence: _str(j['urgence'], fallback: 'moyenne'),
      description: _str(j['description']),
      photos: rawPhotos.map((p) => p.toString()).toList(),
      statut: _str(j['statut'], fallback: 'en_attente'),
      rejectionReason: j['rejectionReason'] == null ? null : _str(j['rejectionReason']),
      processedAt: j['processedAt'] == null ? null : _date(j['processedAt']),
      assignedAt: j['assignedAt'] == null ? null : _date(j['assignedAt']),
      startedAt: j['startedAt'] == null ? null : _date(j['startedAt']),
      completedAt: j['completedAt'] == null ? null : _date(j['completedAt']),
      userId: _str(j['userId'] ?? requester['id']),
      requesterName: _str(requester['name'], fallback: 'Utilisateur'),
      requesterEmail: _str(requester['email']),
      technicianId: technician == null ? null : _str(technician['id']),
      technicianName: technician == null ? null : _str(technician['name']),
      createdAt: _date(j['createdAt']),
    );
  }

  bool get isEnAttente => statut == 'en_attente';
  bool get isAcceptee => statut == 'acceptee';
  bool get isEnCours => statut == 'en_cours';
  bool get isRefusee => statut == 'refusee';
  bool get isTerminee => statut == 'terminee';
}

class MaintenanceTechnician {
  final String id;
  final String name;
  final String email;

  MaintenanceTechnician({required this.id, required this.name, required this.email});

  factory MaintenanceTechnician.fromJson(Map<String, dynamic> j) {
    return MaintenanceTechnician(
      id: (j['id'] ?? '').toString(),
      name: (j['name'] ?? j['email'] ?? '').toString(),
      email: (j['email'] ?? '').toString(),
    );
  }
}
