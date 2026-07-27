
import 'package:dash_master_toolkit/others/components/components_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class TabsScreen extends StatefulWidget {
  const TabsScreen({super.key});

  @override
  State<TabsScreen> createState() => _TabsScreenState();
}

class _TabsScreenState extends State<TabsScreen> {
  ThemeController themeController = Get.put(ThemeController());

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);
    double screenWidth = MediaQuery.of(context).size.width;

    ThemeData theme = Theme.of(context);
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    var buttonTextStyle = theme.textTheme.bodyMedium
        ?.copyWith(fontWeight: FontWeight.w500, color: Colors.white);

    return Scaffold(
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      body: SingleChildScrollView(
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ResponsiveGridRow(
              children: [
                //Basic Elevated Button
                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding:
                        EdgeInsetsDirectional.only(end: isMobile ? 0 : 10),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: _basicTabs(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("BasicTabBar"),
                        theme: theme),
                  ),
                ),
                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                        start: isMobile ? 0 : 10, top: isMobile ? 15 : 0),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: _iconTextTabs(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("IconTextTabs"),
                        theme: theme),
                  ),
                ),
              ],
            ),
            SizedBox(
              height: 20,
            ),
            ResponsiveGridRow(
              children: [
                //Basic Elevated Button
                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding:
                        EdgeInsetsDirectional.only(end: isMobile ? 0 : 10),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: _scrollableTabs(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("ScrollableTabs"),
                        theme: theme),
                  ),
                ),
                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                        start: isMobile ? 0 : 10, top: isMobile ? 15 : 0),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: _customStyledTabs(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("CustomStyledTabs"),
                        theme: theme),
                  ),
                ),
              ],
            ),
            SizedBox(
              height: 20,
            ),
            ResponsiveGridRow(
              children: [
                //Basic Elevated Button
                ResponsiveGridCol(
                  xl: 6,
                  md: 6,
                  lg: 6,
                  xs: 12,
                  sm: 12,
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                      end: isMobile ? 0 : 10,
                    ),
                    child: _commonBackgroundWidget(
                        isMobile: isMobile,
                        child: _bottomTabs(lang),
                        screenWidth: screenWidth,
                        title: lang.translate("BottomTabs"),
                        theme: theme),
                  ),
                ),
              ],
            ),

          ],
        ),
      ),
    );
  }

  Widget _basicTabs(AppLocalizations lang) {
    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          TabBar(
            indicatorSize:TabBarIndicatorSize.tab ,
            labelColor: colorPrimary100,
            indicatorColor: colorPrimary100,
            unselectedLabelStyle: TextStyle(
                fontFamily: Styles.fontFamily,
                fontWeight: FontWeight.w500,
                fontSize: 15,
                color: themeController.isDarkMode ? colorWhite : colorGrey900),
            labelStyle: TextStyle(
                fontFamily: Styles.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 15),
            dividerColor:
                themeController.isDarkMode ? colorGrey700 : colorGrey100,
            tabs: [
              Tab(text: "Home"),
              Tab(text: "Profile"),
              Tab(text: "Settings"),
            ],
          ),
          SizedBox(
            height: 200,
            child: TabBarView(
              children: [
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _iconTextTabs(AppLocalizations lang) {
    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          TabBar(
            labelColor: colorPrimary100,
            indicatorColor: colorPrimary100,
            unselectedLabelStyle: TextStyle(
                fontFamily: Styles.fontFamily,
                fontWeight: FontWeight.w500,
                fontSize: 15,
                color: themeController.isDarkMode ? colorWhite : colorGrey900),
            labelStyle: const TextStyle(
                fontFamily: Styles.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 15),
            dividerColor:
                themeController.isDarkMode ? colorGrey700 : colorGrey100,
            tabs: const [
              Tab(icon: Icon(Icons.home), text: "Home"),
              Tab(icon: Icon(Icons.person), text: "Profile"),
              Tab(icon: Icon(Icons.settings), text: "Settings"),
            ],
          ),
          SizedBox(
            height: 175,
            child: TabBarView(
              children: [
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _scrollableTabs(AppLocalizations lang) {
    return DefaultTabController(
      length: 15,
      child: Column(
        children: [
          TabBar(
            tabAlignment: TabAlignment.start,
            labelColor: colorPrimary100,
            indicatorColor: colorPrimary100,
            unselectedLabelStyle: TextStyle(
                fontFamily: Styles.fontFamily,
                fontWeight: FontWeight.w500,
                fontSize: 15,
                color: themeController.isDarkMode ? colorWhite : colorGrey900),
            labelStyle: const TextStyle(
                fontFamily: Styles.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 15),
            dividerColor:
                themeController.isDarkMode ? colorGrey700 : colorGrey100,
            isScrollable: true,
            tabs: [
              Tab(text: "Tab 1"),
              Tab(text: "Tab 2"),
              Tab(text: "Tab 3"),
              Tab(text: "Tab 4"),
              Tab(text: "Tab 5"),
              Tab(text: "Tab 6"),
              Tab(text: "Tab 7"),
              Tab(text: "Tab 8"),
              Tab(text: "Tab 9"),
              Tab(text: "Tab 10"),
              Tab(text: "Tab 11"),
              Tab(text: "Tab 12"),
              Tab(text: "Tab 13"),
              Tab(text: "Tab 14"),
              Tab(text: "Tab 15"),
            ],
          ),
          SizedBox(
            height: 200,
            child: TabBarView(
              children: [
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
                textWidget(lang),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _customStyledTabs(AppLocalizations lang) {
    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          Container(
            decoration: BoxDecoration(
              color: colorPrimary0,
              borderRadius: BorderRadius.circular(8),
            ),
            child: TabBar(
              unselectedLabelStyle: TextStyle(
                  fontFamily: Styles.fontFamily,
                  fontWeight: FontWeight.w500,
                  fontSize: 15,
                  color: themeController.isDarkMode ? colorWhite : colorGrey900),
              labelStyle: const TextStyle(
                  fontFamily: Styles.fontFamily,
                  fontWeight: FontWeight.w700,
                  fontSize: 15),
              dividerColor: Colors.transparent,
              labelColor: Colors.white,
              unselectedLabelColor: colorPrimary100,
              indicatorSize:TabBarIndicatorSize.tab ,
              indicator: BoxDecoration(
                color:colorPrimary100,
                borderRadius: BorderRadius.circular(8),
              ),
              tabs: [
                Tab(
                  text: lang.translate("Overview"),
                ),
                Tab(
                  text: lang.translate("Details"),
                ),
              ],
            ),
          ),
          SizedBox(
            height: 200,
            child: TabBarView(
              children: [
                textWidget(lang),
                textWidget(lang),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _bottomTabs(AppLocalizations lang) {
    return DefaultTabController(
      length: 3,
      child: SizedBox(
        height: 200,
        child: Scaffold(
          body:  Center(child:  textWidget(lang),),
          bottomNavigationBar: TabBar(
            unselectedLabelStyle: TextStyle(
                fontFamily: Styles.fontFamily,
                fontWeight: FontWeight.w500,
                fontSize: 15,
                color: themeController.isDarkMode ? colorWhite : colorGrey900),
            labelStyle: const TextStyle(
                fontFamily: Styles.fontFamily,
                fontWeight: FontWeight.w700,
                fontSize: 15),
            labelColor: colorPrimary100,
            indicatorColor: colorPrimary100,
            dividerColor: themeController.isDarkMode ? colorGrey700 : colorGrey100,
            unselectedLabelColor: themeController.isDarkMode ? colorGrey500 : colorGrey400,
            tabs:  [
              Tab(icon: Icon(Icons.home), text: lang.translate("Home"),),
              Tab(icon: Icon(Icons.search), text: lang.translate("Search"),),
              Tab(icon: Icon(Icons.person), text: lang.translate("Account"),),
            ],
          ),
        ),
      ),
    );
  }


  textWidget(AppLocalizations lang) {
    return Center(
      child: Text(
        lang.translate("loremIpsumDummyText"),
      ),
    );
  }

  _commonDividerWidget() {
    return Divider(
      color: themeController.isDarkMode ? colorGrey700 : colorGrey100,
    );
  }

  _commonTitleTextWidget({
    required ThemeData theme,
    required String title,
    required bool isMobile,
  }) {
    return Text(
      title,
      style: theme.textTheme.titleLarge
          ?.copyWith(fontWeight: FontWeight.w600, fontSize: isMobile ? 18 : 20),
    );
  }

  _commonBackgroundWidget(
      {required Widget child,
      required double? screenWidth,
      required String title,
      required bool isMobile,
      required ThemeData theme}) {
    return Container(
      width: screenWidth,
      padding: EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: themeController.isDarkMode ? colorDark : colorWhite,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(blurRadius: 6, color: Colors.black12)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _commonTitleTextWidget(
              theme: theme, title: title, isMobile: isMobile),
          SizedBox(
            height: 10,
          ),
          child
        ],
      ),
    );
  }
}
