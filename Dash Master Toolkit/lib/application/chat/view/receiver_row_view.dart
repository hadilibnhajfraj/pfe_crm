

import '../chat_imports.dart';

class ReceiverRowView extends StatelessWidget {
  final ThemeData theme;
  final String userName;
  final String userImage;
  final bool isVerified;
  final bool isMobileScreen;
  final MessageData messageData;

  const ReceiverRowView({
    super.key,
    required this.theme,
    required this.userName,
    required this.userImage,
    required this.messageData,
    required this.isVerified,
    required this.isMobileScreen,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        /*  Padding(
          padding: const EdgeInsets.only(left: 10.0, top: 8),
          child: Stack(
            children: [
              if (userImage.isNotEmpty)
                ClipOval(
                  child: commonCacheImageWidget(userImage, 32, width: 32),
                ),
              if (userImage.isEmpty)
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                      shape: BoxShape.circle, color: colorSuccess25),
                  child: Center(
                    child: Text(
                      getInitials(userName),
                      style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w800, color: colorSuccess200),
                    ),
                  ),
                ),
              if (isVerified == true)
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
        IntrinsicWidth(
          child: Padding(
            padding: const EdgeInsets.only(left: 10.0, top: 1.0, bottom: 9.0),
            child: Container(
              margin: const EdgeInsets.only(top: 8.0, bottom: 0.0),
              padding: const EdgeInsets.only(
                  left: 16.0, right: 16.0, top: 10.0, bottom: 10.0),
              decoration: BoxDecoration(
                  shape: BoxShape.rectangle,
                  color: colorPrimary100,
                  borderRadius: const BorderRadius.all(Radius.circular(10.0))),
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
                          fontWeight: FontWeight.w500, color: Colors.white),
                    ),
                  ),
                  SizedBox(
                    height: 6,
                  ),
                  Text(
                    messageData.dateTime,
                    style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w500, color: colorWhite),
                  ),
                ],
              ),
            ),
          ),
          //
        ),
      ],
    );
  }
}
