
import 'package:responsive_framework/responsive_framework.dart' as rf;
import 'components/common_imports.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  final scaffoldKey = GlobalKey<ScaffoldState>();
  bool isSidebarExpanded = true;

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.sizeOf(context);
    final isDesktop = rf.ResponsiveBreakpoints.of(context).largerThan(
      BreakpointName.MD.name,
    );
    ThemeController themeController = Get.put(ThemeController());

    return Scaffold(
      key: scaffoldKey,
      backgroundColor: themeController.isDarkMode ? colorGrey900 : colorWhite,
      drawer: screenSize.width > 1240 ? null : _buildSidebar(isDesktop && isSidebarExpanded),
      body: rf.ResponsiveRowColumn(
        layout: rf.ResponsiveRowColumnType.ROW,
        rowCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Sidebar for Larger Screens
          if (isDesktop) ...[
            rf.ResponsiveRowColumnItem(
              columnFit: FlexFit.loose,
              child: _buildSidebar(!isSidebarExpanded),
            ),
            rf.ResponsiveRowColumnItem(
              child:  VerticalDivider(
                width: 1,
                thickness: 1,
                color: themeController.isDarkMode ? colorGrey700 : colorGrey100, // or any color that suits your theme
              ),
            ),
          ],
          // Main Content
          rf.ResponsiveRowColumnItem(
            rowFit: FlexFit.tight,
            child: rf.ResponsiveRowColumn(
              layout: rf.ResponsiveRowColumnType.COLUMN,
              children: [

  // Top Navigation Bar
                rf.ResponsiveRowColumnItem(
                  child: _buildTopBar(isDesktop),
                ),

                // Breadcrumb Navigation
                rf.ResponsiveRowColumnItem(
                  child: Padding(
                    padding: rf.ResponsiveValue<EdgeInsetsGeometry>(
                      context,
                      conditionalValues: [
                        rf.Condition.smallerThan(
                          name: BreakpointName.LG.name,
                          value: const EdgeInsets.fromLTRB(16, 5, 16, 10),
                        ),
                      ],
                      defaultValue: const EdgeInsets.fromLTRB(24, 5, 24, 10),
                    ).value,
                    child: NavigationBreadcrumbWidget(
                      breadcrumbData: _getBreadcrumbData(context),
                    ),
                  ),
                ),

                // Page Content
                rf.ResponsiveRowColumnItem(
                  columnFit: FlexFit.tight,
                  child: widget.child,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  PreferredSizeWidget _buildTopBar(bool isDesktop) {
    if (isDesktop) scaffoldKey.currentState?.closeDrawer();
    return TopBarWidget(
      onMenuTap: () {
        if (isDesktop) {
          setState(() => isSidebarExpanded = !isSidebarExpanded);
        } else {
          scaffoldKey.currentState?.openDrawer();
        }
      },
    );
  }

  Widget _buildSidebar(bool isCollapsed) {
    return SideBarWidget(
      rootScaffoldKey: scaffoldKey,
      iconOnly: isCollapsed,
    );
  }

  NavigationBreadcrumbModel _getBreadcrumbData(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    return routerParam[location] ?? _fallbackBreadcrumb(location);
  }

  // Génère un breadcrumb lisible depuis le chemin URL quand aucune
  // métadonnée n'est définie — supprime tous les affichages "N/A".
  NavigationBreadcrumbModel _fallbackBreadcrumb(String path) {
    String toTitle(String segment) => segment
        .split('-')
        .where((w) => w.isNotEmpty)
        .map((w) => w[0].toUpperCase() + w.substring(1))
        .join(' ');

    final segments = path.split('/').where((s) => s.isNotEmpty).toList();
    if (segments.isEmpty) {
      return const NavigationBreadcrumbModel(
        title: 'Dashboard', parentRoute: 'Dashboard', childRoute: 'Dashboard');
    }
    final child  = toTitle(segments.last);
    final parent = segments.length >= 2 ? toTitle(segments[segments.length - 2]) : 'App';
    return NavigationBreadcrumbModel(
      title:       child,
      parentRoute: parent,
      childRoute:  child,
    );
  }
}
