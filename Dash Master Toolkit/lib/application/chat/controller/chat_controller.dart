
import '../chat_imports.dart';
class ChatController extends GetxController {
  RxList<ChatData> chatList = <ChatData>[].obs;
  var selectedUser = Rx<ChatData?>(null);
  RxList<ChatData> filteredChatList = <ChatData>[].obs;

  Future<List<ChatData>> getChatList() async {
    chatList.clear();
    filteredChatList.clear();

    // await Future.delayed(const Duration(seconds: 1));
    String jsonData =
        await rootBundle.loadString("assets/chat/data/chat_list.json");
    dynamic data = json.decode(jsonData);
    List<dynamic> jsonArray = data['chat_list'];
    for (int i = 0; i < jsonArray.length; i++) {
      filteredChatList.add(ChatData.fromJson(jsonArray[i]));
    }
// Initialize filtered list with all chat users
    chatList.assignAll(filteredChatList);

    if (chatList.isNotEmpty) {
      setSelectedUser(chatList[0]);
    }
    return filteredChatList;
  }

  // Function to filter chat list based on search query
  void searchChatUser(String query) {
    if (query.isEmpty) {
      chatList.assignAll(filteredChatList); // Reset to full list
    } else {
      chatList.assignAll(
        filteredChatList.where(
          (user) => user.userName.toLowerCase().contains(query.toLowerCase()),
        ),
      );
    }
  }

  // Function to set the selected user
  void setSelectedUser(ChatData user) {
    selectedUser.value = user; // Updates the selected user
  }

  TextEditingController textController = TextEditingController();
  TextEditingController searchController = TextEditingController();
  FocusNode f1 = FocusNode();

  void addMessage(String message) {
    selectedUser.value!.messageList.add(
        MessageData(message: message, dateTime: "just now", isSender: true));
  }

  @override
  void onInit() {
    getChatList();
    super.onInit();
  }
}
