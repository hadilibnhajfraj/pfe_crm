import 'package:dash_master_toolkit/others/components/components_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class AvtarScreen extends StatefulWidget {
  const AvtarScreen({super.key});

  @override
  State<AvtarScreen> createState() => _AvtarScreenState();
}

class _AvtarScreenState extends State<AvtarScreen> {
  ThemeController themeController = Get.put(ThemeController());
  List<String> avtarList = [profileIcon1, profileIcon2, profileIcon3];
  var imageSize = 60.0;

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: SingleChildScrollView(
        padding: EdgeInsets.all(
          rf.ResponsiveValue<double>(
            context,
            conditionalValues: [
              const rf.Condition.between(start: 0, end: 340, value: 2),
              const rf.Condition.between(start: 341, end: 992, value: 8),
            ],
            defaultValue: 16,
          ).value,
        ),
        child: ResponsiveGridRow(
          children: [
            _avatarCard(
                lang.translate("CircleAvatar"),
                CircleAvatar(
                  radius: 30,
                  backgroundImage: AssetImage(profileIcon2),
                )),
            _avatarCard(
              lang.translate("InitialsAvatar"),
              CircleAvatar(
                radius: 30,
                backgroundColor: Colors.indigo,
                child: Text("AB", style: TextStyle(color: Colors.white)),
              ),
            ),
            _avatarCard(
              lang.translate("IconAvatar"),
              CircleAvatar(
                radius: 30,
                backgroundColor: Colors.orange,
                child: Icon(Icons.person, color: Colors.white),
              ),
            ),
            _avatarCard(
              lang.translate("SquareAvatar"),
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  image: DecorationImage(
                    image: AssetImage(profileIcon2),
                    fit: BoxFit.cover,
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            _avatarCard(
              lang.translate("BorderedAvatar"),
              Container(
                padding: EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.blue, width: 2),
                ),
                child: CircleAvatar(
                  radius: 25,
                  backgroundImage: AssetImage(profileIcon3),
                ),
              ),
            ),
            _avatarCard(
                lang.translate("AvatarWithStatus"),
                Stack(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundImage: AssetImage(profileIcon4),
                    ),
                    Positioned(
                      bottom: 2,
                      right: 2,
                      child: Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: Colors.green,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                      ),
                    )
                  ],
                )),
            _avatarCard(
              lang.translate("GroupAvatars"),
              Flexible(
                child: Container(
                  height: 60,
                  // width: double.maxFinite,
                  alignment: Alignment.centerRight,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      avtarList.length,
                      (index) {
                        final image = avtarList[index];
                        return Align(
                          widthFactor: 0.6,
                          child: CircleAvatar(
                            radius: 25,
                            backgroundImage: AssetImage(image),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),
            _avatarCard(
              lang.translate("CustomShapeAvatar"),
              ClipPath(
                clipper: HexagonClipper(),
                child: Image.asset(
                  profileIcon10,
                  width: 60,
                  height: 60,
                  fit: BoxFit.cover,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  ResponsiveGridCol _avatarCard(String title, Widget avatar) {
    return ResponsiveGridCol(
      xs: 12,
      sm: 6,
      md: 4,
      lg: 3,
      child: Container(
        margin: EdgeInsetsDirectional.only(start: 8, end: 8, top: 15),
        padding: EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: themeController.isDarkMode ? colorDark : colorWhite,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [avatar, SizedBox(height: 10), _titleTextStyle(title)],
        ),
      ),
    );
  }

  Widget _titleTextStyle(String title) {
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    return Text(
      title,
      style: Theme.of(context)
          .textTheme
          .titleLarge
          ?.copyWith(fontSize: isMobile ? 14 : 16, fontWeight: FontWeight.w500),
    );
  }
}

class HexagonClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    final width = size.width;
    final height = size.height;
    // final side = width / 2;
    final centerHeight = height / 2;

    path.moveTo(width * 0.25, 0);
    path.lineTo(width * 0.75, 0);
    path.lineTo(width, centerHeight);
    path.lineTo(width * 0.75, height);
    path.lineTo(width * 0.25, height);
    path.lineTo(0, centerHeight);
    path.close();

    return path;
  }

  @override
  bool shouldReclip(CustomClipper<Path> oldClipper) => false;
}
