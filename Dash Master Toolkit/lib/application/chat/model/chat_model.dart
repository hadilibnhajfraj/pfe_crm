class ChatData {
  String message = "";
  String image = "";
  String userName = "";
  String dateTime = "";
  bool isVerified = false;
  int unreadMsgCount = 0;
  List<MessageData> messageList = [];

  ChatData(
      {required this.message,
      required this.image,
      required this.userName,
      required this.dateTime,
      required this.isVerified,
      required this.unreadMsgCount,
      required this.messageList});

  ChatData.fromJson(Map<String, dynamic> json) {
    if (json['message'] != null) {
      message = json['message'];
    }
    if (json['image'] != null) {
      image = json['image'];
    }
    if (json['user_name'] != null) {
      userName = json['user_name'];
    }
    if (json['date_time'] != null) {
      dateTime = json['date_time'];
    }
    if (json['unread_msg_count'] != null) {
      unreadMsgCount = json['unread_msg_count'];
    }
    if (json['isVerified'] != null) {
      isVerified = json['isVerified'];
    }
    if (json['message_list'] != null) {
      messageList = List<dynamic>.from(json['message_list'])
          .map((i) => MessageData.fromJson(i))
          .toList();
    }
  }
}

class MessageData {
  String message = "";
  String dateTime = "";
  bool isSender = false;

  MessageData(
      {required this.message, required this.dateTime, required this.isSender});

  MessageData.fromJson(Map<String, dynamic> json) {
    if (json['message'] != null) {
      message = json['message'];
    }
    if (json['date_time'] != null) {
      dateTime = json['date_time'];
    }
    if (json['isSender'] != null) {
      isSender = json['isSender'];
    }
  }
}
