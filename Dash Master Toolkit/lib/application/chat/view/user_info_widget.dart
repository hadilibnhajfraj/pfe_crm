
import '../chat_imports.dart';
class UserInfoWidget extends StatelessWidget {
  final ChatData? chatData;

  const UserInfoWidget({super.key, required this.chatData});

  @override
  Widget build(BuildContext context) {
    ThemeData theme = Theme.of(context);
    var imageSize = 48.0;
    return Stack(
      children: [
        if (chatData!.image.isNotEmpty)
          ClipOval(
            child: commonCacheImageWidget(chatData!.image, imageSize, width: imageSize),
          ),
        if (chatData!.image.isEmpty)
          Container(
            width: imageSize,
            height: imageSize,
            decoration:
                BoxDecoration(shape: BoxShape.circle, color: colorSuccess25),
            child: Center(
              child: Text(
                getInitials(chatData?.userName),
                style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800, color: colorSuccess200),
              ),
            ),
          ),
        if (chatData?.isVerified == true)
          Positioned(
            right: 0,
            bottom: 0,
            child: SvgPicture.asset(
              verifyIcon,
              width: 15,
              height: 15,
            ),
          )
      ],
    );
  }
}

