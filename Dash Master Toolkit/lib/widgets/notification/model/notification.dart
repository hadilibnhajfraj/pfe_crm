class NotificationData {
  final String id;
  final String title;
  final String message;
   bool isRead;
  final String type; // 🔥 AJOUT

  NotificationData({
    required this.id,
    required this.title,
    required this.message,
    required this.isRead,
    required this.type,
  });

  factory NotificationData.fromJson(Map<String, dynamic> json) {
    return NotificationData(
      id: (json["id"] ?? json["_id"] ?? "").toString(),
      title: (json["title"] ?? "").toString(),
      message: (json["message"] ?? "").toString(),
      isRead: json["isRead"] == true || json["read"] == true,
      type: (json["type"] ?? "").toString(), // 🔥 IMPORTANT
    );
  }
}

class NotificationResponse {
  final int unreadCount;
  final List<NotificationData> items;

  NotificationResponse({required this.unreadCount, required this.items});

  factory NotificationResponse.fromJson(Map<String, dynamic> json) {
    final itemsJson = (json["items"] as List?) ?? (json["data"] as List?) ?? [];
    final items = itemsJson
        .map((e) => NotificationData.fromJson(e as Map<String, dynamic>))
        .toList();

    return NotificationResponse(
      unreadCount: (json["unreadCount"] ?? json["unread"] ?? 0) as int,
      items: items,
    );
  }
}
