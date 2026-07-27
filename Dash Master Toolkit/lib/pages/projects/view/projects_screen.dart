import 'package:dash_master_toolkit/pages/projects/projetcs_imports.dart';

import 'package:responsive_framework/responsive_framework.dart' as rf;


class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final ProjectsController controller = Get.put(ProjectsController());
  ThemeController themeController = Get.put(ThemeController());

  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);
    ThemeData theme = Theme.of(context);
    double screenWidth = MediaQuery.of(context).size.width;

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
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: CommonSearchField(
                    controller: controller.searchController,
                    focusNode: controller.f1,
                    isDarkMode: controller.themeController.isDarkMode,
                    inputDecoration: inputDecoration(context,
                        borderColor: Colors.transparent,
                        prefixIcon: searchIcon,
                        fillColor: Colors.transparent,
                        prefixIconColor: colorGrey400,
                        hintText: lang.translate("search"),
                        borderRadius: 8,
                        topContentPadding: 0,
                        bottomContentPadding: 0),
                  ),
                ),
                SizedBox(
                  width: 10,
                ),
                IntrinsicWidth(
                  // width: 180,
                  // height: 45,
                  child: SizedBox(
                    height: 45,
                    child: CommonButtonWithIcon(
                      onPressed: () {
                        // Handle button press
                      },
                      text: lang.translate('addNewProject'),
                      icon: Icons.add,
                      backgroundColor: colorPrimary100,
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(
              height: 15,
            ),
            Obx(
              () => SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.start,
                  children: List.generate(controller.tabTitles.length, (index) {
                    bool isSelected = controller.selectedIndex.value == index;
                    return GestureDetector(
                      onTap: () => controller.changeTab(index),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        margin: const EdgeInsets.only(right: 12),
                        decoration: BoxDecoration(
                          color:
                              isSelected ? colorPrimary100 : Colors.transparent,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          "${controller.tabTitles[index]} (${controller.tabCounts[index]})",
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: isSelected
                                ? colorWhite
                                : (themeController.isDarkMode
                                    ? colorWhite
                                    : colorGrey900),
                            fontWeight:
                                isSelected ? FontWeight.w600 : FontWeight.w500,
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),
            ),
            SizedBox(
              height: 15,
            ),
            buildProjectList(screenWidth)
          ],
        ),
      ),
    );
  }

  buildProjectList(double screenWidth) {
    return Obx(
      () {
        var projectList = controller.projects[controller.selectedIndex.value];
        return ResponsiveGridRow(
          // crossAxisAlignment: CrossAxisAlignment.center,
          children: List.generate(
            projectList.length,
            (index) {
              return ResponsiveGridCol(
                lg: 4,
                xl: 4,
                md: 4,
                xs: 12,
                child: Padding(
                  padding: const EdgeInsets.only(top: 20.0),
                  child: ProjectCard(project: projectList[index]),
                ),
              );
            },
          ),
        );
      },
    );
  }
}
