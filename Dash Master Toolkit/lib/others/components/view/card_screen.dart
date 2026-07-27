import 'package:dash_master_toolkit/others/components/components_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class CardScreen extends StatefulWidget {
  const CardScreen({super.key});

  @override
  State<CardScreen> createState() => _CardScreenState();
}

class _CardScreenState extends State<CardScreen> {
  ThemeController themeController = Get.put(ThemeController());
  List<String> avtarList = [profileIcon1, profileIcon2, profileIcon3];
  var imageSize = 60.0;

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);
    ThemeData theme = Theme.of(context);

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorGrey25,
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
            // Basic Card
            _cardWrapper(
              child: Card(
                color: themeController.isDarkMode ? colorDark : colorWhite,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                // elevation: 3,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lang.translate("SimpleCard"),
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        lang.translate("loremIpsumDummyText2"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Basic Card
            _cardWrapper(
              child: Card(
                color: themeController.isDarkMode ? colorDark : colorWhite,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                elevation: 6,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lang.translate("ElevatedCard"),
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        lang.translate("loremIpsumDummyText2"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            _cardWrapper(
              child: Card(
                color: themeController.isDarkMode ? colorDark : colorWhite,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24)),
                elevation: 3,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lang.translate("CardWithButton"),
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 15),
                      Text(
                        lang.translate("loremIpsumDummyText3"),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Align(
                        alignment: Alignment.centerRight,
                        child: ElevatedButton.icon(
                          onPressed: () {},
                          iconAlignment: IconAlignment.end,
                          icon: const Icon(
                            Icons.arrow_forward,
                            color: Colors.white,
                          ),
                          label: Text(
                            lang.translate("GetStarted"),
                            style: theme.textTheme.bodySmall?.copyWith(
                                fontWeight: FontWeight.w500,
                                color: Colors.white),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blueAccent,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 24, vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(30),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Image Card
            _cardWrapper(
              child: ResponsiveGridRow(
                children: List.generate(3, (index) {
                  return ResponsiveGridCol(
                    xs: 12,
                    sm: 6,
                    md: 4,
                    child: Card(
                      color:
                          themeController.isDarkMode ? colorDark : colorWhite,
                      elevation: 3,
                      clipBehavior: Clip.antiAlias,
                      // margin: const EdgeInsets.all(8),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              "Card ${index + 1}",
                              style: theme.textTheme.titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 15),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.network(
                                'https://picsum.photos/400?random=${index + 1}',
                                height: 180,
                                width: double.infinity,
                                fit: BoxFit.cover,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              "This is card ${index + 1} with sample description. It adjusts in responsive layout.",
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(fontWeight: FontWeight.w500),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),

            // Avatar Profile Card
            _cardWrapper(
              child: Card(
                color: themeController.isDarkMode ? colorDark : colorWhite,
                child: ListTile(
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 16, vertical: 5),
                  leading: CircleAvatar(
                    backgroundImage:
                        NetworkImage('https://picsum.photos/150?random=2'),
                  ),
                  title: Text(
                    "John Doe",
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text("Flutter Developer",
                      style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w400, color: colorGrey500)),
                ),
              ),
            ),

            // Gradient Card
            _cardWrapper(
              child: Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                      colors: [Colors.indigo, Colors.blueAccent]),
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.all(16),
                child: Text(
                  lang.translate("GradientCard"),
                  style: theme.textTheme.bodyLarge
                      ?.copyWith(color: Colors.white),
                ),
              ),
            ),

            // Action Card
            _cardWrapper(
              child: Card(
                color: themeController.isDarkMode ? colorDark : colorWhite,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          lang.translate("deleteFile"),
                          style: theme.textTheme.bodyLarge?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          lang.translate("ThisActionIsIrreversible"),
                          style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w400,
                              color: colorGrey500),
                        ),
                      ),
                      OverflowBar(
                        alignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: () {},
                            child: Text(
                              lang.translate("cancel"),
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(fontWeight: FontWeight.w500),
                            ),
                          ),
                          ElevatedButton(
                            onPressed: () {},
                            style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.red),
                            child: Text(
                              lang.translate("delete"),
                              style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w500,
                                  color: colorWhite),
                            ),
                          ),
                        ],
                      )
                    ],
                  ),
                ),
              ),
            ),

            // Dashboard Card
            _cardWrapper(
              child: Card(
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                color: themeController.isDarkMode ? colorDark : colorWhite,
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Total Users",
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontSize: 16),
                      ),
                      SizedBox(height: 8),
                      Text("1,234",
                          style: theme.textTheme.titleLarge?.copyWith(
                              fontSize: 28, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  ResponsiveGridCol _cardWrapper({required Widget child}) {
    return ResponsiveGridCol(
      xs: 12,
      sm: 6,
      md: 6,
      lg: 6,
      xl: 6,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: child,
      ),
    );
  }
}
