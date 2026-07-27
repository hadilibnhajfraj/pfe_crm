class NotificationData {
  final String id;
  final String title;
  final String message;
  bool         isRead;
  final String type;
  final String createdAt;
  final String projectId;
  final String projectName;

  NotificationData({
    required this.id,
    required this.title,
    required this.message,
    required this.isRead,
    required this.type,
    this.createdAt   = '',
    this.projectId   = '',
    this.projectName = '',
  });

  factory NotificationData.fromJson(Map<String, dynamic> json) {
    print("JSON ITEM = $json");
    return NotificationData(
      id:          (json['id']  ?? json['_id'] ?? '').toString(),
      title:       (json['title']   ?? '').toString(),
      message:     (json['message'] ?? '').toString(),
      isRead:      json['isRead'] == true || json['read'] == true,
      type:        (json['type']   ?? '').toString(),
      createdAt:   (json['createdAt'] ?? json['date'] ?? json['timestamp'] ?? '').toString(),
      projectId:   (json['projectId'] ?? json['project'] ?? '').toString(),
      projectName: (json['projectName'] ?? json['nomProjet'] ?? '').toString(),
    );
  }
}

class NotificationResponse {
  final int unreadCount;
  final List<NotificationData> items;

  NotificationResponse({required this.unreadCount, required this.items});

  factory NotificationResponse.fromJson(Map<String, dynamic> json) {
    print("NOTIF JSON KEYS = ${json.keys.toList()}");

    // Couvre toutes les clés possibles retournées par le backend
    final raw = (json['items']         as List?) ??
                (json['notifications'] as List?) ??
                (json['data']          as List?) ??
                (json['results']       as List?) ??
                (json['docs']          as List?) ??
                [];

    print("NOTIFICATION COUNT API (fromJson) = ${raw.length}");

    final items = raw
        .whereType<Map>()
        .map((e) => NotificationData.fromJson(Map<String, dynamic>.from(e)))
        .toList();

    return NotificationResponse(
      unreadCount: (json['unreadCount'] ?? json['unread'] ?? json['totalUnread'] ?? 0) as int,
      items: items,
    );
  }
}
