import 'package:responsive_framework/responsive_framework.dart' as rf;

import '../chat_imports.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ChatController controller = Get.put(ChatController());
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    controller.chatList.listen((_) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);
    ThemeData theme = Theme.of(context);
    ThemeController themeController = Get.put(ThemeController());
    final screenWidth = MediaQuery.sizeOf(context).width;
    final screenHeight = MediaQuery.sizeOf(context).height;

    final isMobileScreen = rf.ResponsiveValue<bool>(
      context,
      conditionalValues: const [
        rf.Condition.between(start: 0, end: 768, value: true),
      ],
      defaultValue: false,
    ).value;

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: Container(
        height: screenHeight,
        //  Make sure the parent container is full height
        padding: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: [
              const rf.Condition.between(start: 0, end: 340, value: 10),
              const rf.Condition.between(start: 341, end: 992, value: 16),
            ],
            defaultValue: 24,
          ).value,
        ),
        child: isMobileScreen
            ? _buildMobileView(themeController, theme, screenWidth,
                screenHeight, lang, isMobileScreen)
            : _buildDesktopView(themeController, theme, screenWidth,
                screenHeight, lang, isMobileScreen),
      ),
    );
  }

  _buildMobileView(
      ThemeController themeController,
      ThemeData theme,
      double screenWidth,
      double screenHeight,
      AppLocalizations lang,
      bool isMobileScreen) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
            child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildCommonContainerView(
                themeController,
                _buildChatList(themeController, theme, lang, isMobileScreen),
              ),
              SizedBox(
                height: 20,
              ),
              _buildCommonContainerView(
                themeController,
                _buildSingChatList(
                    themeController, theme, lang, isMobileScreen),
              ),
            ],
          ),
        )),
        Obx(
          () {
            return controller.chatList.isNotEmpty
                ? _buildComposer(themeController, theme, lang, isMobileScreen)
                : Wrap();
          },
        )
      ],
    );
  }

  _buildDesktopView(
      ThemeController themeController,
      ThemeData theme,
      double screenWidth,
      double screenHeight,
      AppLocalizations lang,
      bool isMobileScreen) {
    return Row(
      //  Use Row instead of ResponsiveGridRow
      children: [
        Expanded(
          flex: 4, // 4/12 of the screen width
          child: SizedBox(
            height: double.infinity, // Ensures it stretches full height
            width: double.infinity,
            child: _buildCommonContainerView(
              themeController,
              SingleChildScrollView(
                child: _buildChatList(
                    themeController, theme, lang, isMobileScreen),
              ),
            ),
          ),
        ),
        Expanded(
          flex: 8, //  8/12 of the screen width
          child: Padding(
            padding: EdgeInsetsDirectional.only(
              start: screenWidth > 768 ? 10 : 0,
            ),
            child: SizedBox(
              width: double.infinity,
              height: double.infinity, //  Ensures it stretches full height
              child: _buildCommonContainerView(
                themeController,
                _buildSingleUserChatViewForDesktop(
                    themeController, theme, lang, isMobileScreen),
              ),
            ),
          ),
        ),
      ],
    );
  }

  _buildChatList(ThemeController themeController, ThemeData theme,
      AppLocalizations lang, bool isMobileScreen) {
    return Padding(
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextFormField(
            style: theme.textTheme.bodyMedium
                ?.copyWith(fontWeight: FontWeight.w500),
            controller: controller.searchController,
            onChanged: (value) {
              controller.searchChatUser(value);
            },
            onFieldSubmitted: (value) {
              controller.searchChatUser(value);
            },
            decoration:
                inputDecoration(context, hintText: lang.translate('search')),
          ),
          Obx(
            () => ListView.builder(
              padding: const EdgeInsets.only(top: 10),
              itemBuilder: (context, index) {
                ChatData messageModel = controller.chatList[index];
                return Obx(
                  () => GestureDetector(
                    onTap: () {
                      controller.setSelectedUser(messageModel);
                      // Get.toNamed(MyRoute.qhChat, arguments: messageModel);
                    },
                    child: Container(
                      padding: EdgeInsets.all(2),
                      color: controller.selectedUser.value == messageModel
                          ? (themeController.isDarkMode
                              ? colorGrey700
                              : colorGrey50)
                          : Colors.transparent,
                      margin: const EdgeInsets.only(top: 15),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          UserInfoWidget(chatData: messageModel),
                          SizedBox(
                            width: 10,
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Text(
                                        messageModel.userName,
                                        overflow: TextOverflow.ellipsis,
                                        style: theme.textTheme.bodyLarge
                                            ?.copyWith(
                                                fontWeight: FontWeight.w700),
                                      ),
                                    ),
                                    SizedBox(
                                      width: 10,
                                    ),
                                    Text(
                                      messageModel.dateTime,
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                              fontWeight: FontWeight.w500,
                                              color: colorGrey500),
                                    ),
                                  ],
                                ),
                                SizedBox(
                                  height: 5,
                                ),
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Text(
                                        messageModel.message,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: theme.textTheme.bodySmall
                                            ?.copyWith(
                                                fontWeight: FontWeight.w500,
                                                color:
                                                    themeController.isDarkMode
                                                        ? colorGrey500
                                                        : colorGrey400),
                                      ),
                                    ),
                                    SizedBox(
                                      width: 10,
                                    ),
                                    if (messageModel.unreadMsgCount > 0)
                                      Container(
                                        width: 24,
                                        height: 24,
                                        decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: colorPrimary100),
                                        child: Center(
                                          child: Text(
                                            messageModel.unreadMsgCount
                                                .toString(),
                                            style: theme.textTheme.bodySmall
                                                ?.copyWith(
                                                    fontWeight: FontWeight.w700,
                                                    color: Colors.white),
                                          ),
                                        ),
                                      )
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
              itemCount: controller.chatList.length,
              shrinkWrap: true,
              physics: !isMobileScreen
                  ? AlwaysScrollableScrollPhysics()
                  : NeverScrollableScrollPhysics(),
            ),
          ),
        ],
      ),
    );
  }

  _buildSingleUserChatViewForDesktop(ThemeController themeController,
      ThemeData theme, AppLocalizations lang, bool isMobileScreen) {
    return Obx(
      () => controller.chatList.isNotEmpty
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: 10,
                ),
                Expanded(
                    child: SingleChildScrollView(
                  child: _buildSingChatList(
                      themeController, theme, lang, isMobileScreen),
                )),
                _buildComposer(themeController, theme, lang, isMobileScreen)
              ],
            )
          : Wrap(),
    );
  }

  _buildSingChatList(ThemeController themeController, ThemeData theme,
      AppLocalizations lang, bool isMobileScreen) {
    return Obx(
      () => controller.chatList.isNotEmpty
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (isMobileScreen)
                  SizedBox(
                    height: 15,
                  ),
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  width: double.infinity,
                  child: Row(
                    children: [
                      UserInfoWidget(chatData: controller.selectedUser.value),
                      SizedBox(
                        width: 10,
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              controller.selectedUser.value!.userName,
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(fontWeight: FontWeight.w500),
                            ),
                            Text(
                              'Active',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w400,
                                  color: colorGrey500),
                            ),
                          ],
                        ),
                      )
                    ],
                  ),
                ),
                SizedBox(
                  height: 15,
                ),
                Divider(
                  height: 1,
                  color:
                      themeController.isDarkMode ? colorGrey700 : colorGrey100,
                ),
                SizedBox(
                  height: 15,
                ),
                ListView.builder(
                    padding: EdgeInsets.symmetric(horizontal: 10),
                    controller: _scrollController,
                    itemCount:
                        controller.selectedUser.value?.messageList.length,
                    itemBuilder: (context, index) {
                      MessageData message =
                          controller.selectedUser.value!.messageList[index];
                      return (message.isSender)
                          ? SenderRowView(
                              messageData: message,
                              theme: theme,
                              isMobileScreen: isMobileScreen)
                          : ReceiverRowView(
                              userName: controller.selectedUser.value!.userName,
                              userImage: controller.selectedUser.value!.image,
                              theme: theme,
                              messageData: message,
                              isVerified:
                                  controller.selectedUser.value!.isVerified,
                              isMobileScreen: isMobileScreen);
                    },
                    // physics: const AlwaysScrollableScrollPhysics(),
                    shrinkWrap: true),
              ],
            )
          : Wrap(),
    );
  }

  _buildComposer(ThemeController themeController, ThemeData theme,
      AppLocalizations lang, bool isMobileScreen) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Divider(
          height: 1,
          color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
        ),
        SizedBox(
          height: 20,
        ),
        Container(
          color: themeController.isDarkMode ? colorGrey900 : Colors.white,
          // height: 100,
          padding: EdgeInsets.symmetric(horizontal: isMobileScreen ? 0 : 20),
          child: Center(
            child: TextFormField(
              controller: controller.textController,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w500),
              textInputAction: TextInputAction.done,
              keyboardType: TextInputType.text,
              decoration: inputDecoration(context,
                  prefixIcon: addIcon,
                  borderColor:
                      themeController.isDarkMode ? colorGrey700 : colorGrey100,
                  fillColor:
                      themeController.isDarkMode ? colorGrey900 : Colors.white,
                  hintColor:
                      themeController.isDarkMode ? colorGrey500 : colorGrey400,
                  prefixIconColor:
                      themeController.isDarkMode ? colorGrey500 : colorGrey400,
                  hintText: lang.translate('typeHere'),
                  suffixIcon: sendIcon, onSuffixPressed: () {
                sendMessage();
              }, suffixIconColor: colorPrimary100),
            ),
          ),
        ),
        SizedBox(
          height: 20,
        ),
      ],
    );
  }

  void sendMessage() {
    if (controller.textController.text.isNotEmpty) {
      FocusScope.of(context).unfocus();

      controller.addMessage(controller.textController.text);
      controller.textController.text = '';
      // Scroll to the bottom
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  // Common container with proper styling
  Widget _buildCommonContainerView(
      ThemeController themeController, Widget child) {
    return Container(
        // padding: EdgeInsets.all(10),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: themeController.isDarkMode ? colorGrey900 : colorWhite,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: themeController.isDarkMode ? colorGrey700 : colorGrey50,
          ),
        ),
        child: child);
  }
}
