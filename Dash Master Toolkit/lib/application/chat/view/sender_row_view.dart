


import '../chat_imports.dart';

class SenderRowView extends StatelessWidget {
  final MessageData messageData;
  final ThemeData theme;
  final bool isMobileScreen;

  const SenderRowView(
      {super.key,
      required this.messageData,
      required this.theme,
      required this.isMobileScreen});

  @override
  Widget build(BuildContext context) {
    ThemeController themeController = Get.put(ThemeController());
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        /* Flexible(
          flex: 15,
          fit: FlexFit.tight,
          child: Container(
            width: 50.0,
          ),
        ),*/
        if (messageData.message.isNotEmpty)
          IntrinsicWidth(
            child: Padding(
              padding:
                  const EdgeInsets.only(right: 10.0, top: 1.0, bottom: 9.0),
              child: Container(
                margin: const EdgeInsets.only(top: 8.0, bottom: 0.0),
                padding: const EdgeInsets.only(
                    left: 16.0, right: 16.0, top: 10.0, bottom: 10.0),
                decoration: BoxDecoration(
                  shape: BoxShape.rectangle,
                  color:
                      themeController.isDarkMode ? colorGrey700 : colorGrey50,
                  borderRadius: const BorderRadius.all(
                    Radius.circular(10.0),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ConstrainedBox(
                      // Wrap with ConstrainedBox
                      constraints: BoxConstraints(
                          maxWidth: isMobileScreen
                              ? MediaQuery.of(context).size.width * 0.5
                              : MediaQuery.of(context).size.width * 0.3),
                      child: Text(
                        messageData.message,
                        textAlign: TextAlign.left,
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    SizedBox(
                      height: 6,
                    ),
                    Text(
                      messageData.dateTime,
                      style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w500, color: colorGrey500),
                    ),
                  ],
                ),
              ),
            ),
            //
          ),
        /* Padding(
          padding: const EdgeInsets.only(right: 10.0, top: 8),
          child: Stack(
            children: [
              ClipOval(
                child: commonCacheImageWidget(
                    'https://i.ibb.co/cQrmvZr/2.png', 32,
                    width: 32),
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: SvgPicture.asset(
                  verifyIcon,
                  width: 10,
                  height: 10,
                ),
              )
            ],
          ),
        ),*/
      ],
    );
  }
}
