


import 'package:dash_master_toolkit/widgets/common_search_field.dart';

import '../academic_imports.dart';

class AcademicDashboardScreen extends StatefulWidget {
  const AcademicDashboardScreen({super.key});

  @override
  AcademicDashboardScreenState createState() => AcademicDashboardScreenState();
}

class AcademicDashboardScreenState extends State<AcademicDashboardScreen> {
  AcademicDashboardController controller = AcademicDashboardController();

  // late ThemeData theme;

  @override
  void initState() {
    super.initState();
    // theme = Get.isDarkMode ? Styles.darkTheme : Styles.lightTheme;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final screenWidth = MediaQuery.sizeOf(context).width;

    final desktopView = screenWidth >= 1200;

    return GetBuilder<AcademicDashboardController>(
        init: controller,
        tag: 'edu_dashboard',
        // theme: theme,
        builder: (controller) {
          return Scaffold(
            backgroundColor: controller.themeController.isDarkMode
                ? colorGrey900
                : colorWhite,
            body: SingleChildScrollView(
              padding: EdgeInsets.only(
                  left: desktopView ? 25.0 : 20.0,
                  right: desktopView ? 25.0 : 20.0,
                  bottom: 25),
              child: Column(
                children: [
                  ResponsiveGridRow(
                    children: [
                      ResponsiveGridCol(
                        xs: 12,
                        md: 8,
                        child: Padding(
                            padding: EdgeInsetsDirectional.only(end: screenWidth > 768 ? 10 : 0 ),
                          child: Column(
                            children: [
                              _buildStatsCards(theme, screenWidth, desktopView),
                                SizedBox(height: 20,),
                              _buildCharts(desktopView, theme, screenWidth),
                                SizedBox(height: 20,),
                              _buildCourseProgress(desktopView, theme),
                            ],
                          ),
                        ),
                      ),
                      ResponsiveGridCol(
                        xs: 12,
                        md: 4,
                        child: Padding(
                          padding: EdgeInsetsDirectional.only(start: screenWidth > 768 ? 10 : 0 ),
                          child: _buildSidePanel(desktopView, theme),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        });
  }

  Widget _buildStatsCards(
      ThemeData theme, double screenWidth, bool desktopView) {
    return ResponsiveGridRow(children: [
      ResponsiveGridCol(
          lg: 4,
          md: 4,
          sm: 12,
          xs: 12,
          child: _statCard(
              courseIcon,
              "24",
              AppLocalizations.of(context)
                  .translate("enrolledCourse"),
              theme,
              greenBgIcon,
              desktopView,
              0,
              screenWidth)),
      ResponsiveGridCol(
          lg: 4,
          md: 4,
          sm: 12,
          xs: 12,
          child: _statCard(
              lessonIcon,
              "56",
              AppLocalizations.of(context)
                  .translate("lesson"),
              theme,
              purpleBgIcon,
              desktopView,
              1,
              screenWidth)),
      ResponsiveGridCol(
          lg: 4,
          md: 4,
          sm: 12,
          xs: 12,
          child: _statCard(
              certificateIcon,
              "17",
              AppLocalizations.of(context)
                  .translate("certificates"),
              theme,
              orangeBgIcon,
              desktopView,
              2,
              screenWidth)),
    ]);
  }

  Widget _statCard(String assetName,
      String count,
      String label,
      ThemeData theme,
      String bgImage,
      bool desktopView,
      int index,
      double screenWidth) {
    return Container(
      margin: EdgeInsets.only(
          left: (index == 1) ? (screenWidth > 768 ? 10 : 0) : 0,
          right: (index == 1) ? (screenWidth > 768 ? 10 : 0) : 0,
          bottom: desktopView ? 0 : 15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color:
        controller.themeController.isDarkMode ? colorGrey900 : Colors.white,
        boxShadow: [
          if (!controller.themeController.isDarkMode)
            BoxShadow(
                color: colorG1.withValues(alpha: 0.24),
                blurRadius: 2,
                offset: Offset(0, 1),
                spreadRadius: 0),
        ],
        border: Border.all(
            color: controller.themeController.isDarkMode
                ? colorGrey700
                : colorGrey100),
      ),
      child: Padding(
        padding: const EdgeInsets.all(15.0),
        child: Column(
          children: [
            Row(
              children: [
                Container(
                  padding: EdgeInsets.all(10),
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    image: DecorationImage(
                      image: AssetImage(bgImage),
                    ),
                  ),
                  child: SvgPicture.asset(
                    assetName,
                    width: 15,
                    height: 15,
                    colorFilter:
                    ColorFilter.mode(Colors.white, BlendMode.srcIn),
                  ),
                ),
                SizedBox(width: 10,),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        count,
                        style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: controller.themeController.isDarkMode
                                ? colorWhite
                                : colorGrey900),
                      ),
                      Text(
                        label,
                        style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w400, color: colorGrey500),
                      )
                    ],
                  ),
                )
              ],
            ),
            SizedBox(height: 15,),
            DashedDivider(),
            SizedBox(height: 15,),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    AppLocalizations.of(context)
                        .translate("viewDetails"),
                    style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500, color: colorGrey500),
                  ),
                ),
                SvgPicture.asset(
                  arrowRightIcon,
                  width: 20,
                  height: 20,
                )
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCharts(bool desktopView, ThemeData theme, double screenWidth) {
    return ResponsiveGridRow(children: [
      ResponsiveGridCol(
          lg: 6,
          md: 6,
          sm: 12,
          xs: 12,
          child: _buildWeeklyHoursChartView(desktopView, theme, screenWidth)),
      ResponsiveGridCol(
          lg: 6,
          md: 6,
          sm: 12,
          xs: 12,
          child: _buildLessonView(desktopView, theme, screenWidth)),
    ]);
  }

  _buildWeeklyHoursChartView(bool desktopView, ThemeData theme, double screenWidth) {
    return Container(
      height: 260,
      padding: EdgeInsets.all(15),
      margin: EdgeInsetsDirectional.only(
          end: screenWidth > 768 ? 10 : 0, bottom: desktopView ? 0 : 15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color:
        controller.themeController.isDarkMode ? colorGrey900 : Colors.white,
        boxShadow: [
          if (!controller.themeController.isDarkMode)
            BoxShadow(
                color: colorG1.withValues(alpha: 0.24),
                blurRadius: 2,
                offset: Offset(0, 1),
                spreadRadius: 0),
        ],
        border: Border.all(
            color: controller.themeController.isDarkMode
                ? colorGrey700
                : colorGrey100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '30',
                    style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: controller.themeController.isDarkMode
                            ? colorWhite
                            : colorGrey900),
                  ),
                  Text(
                    AppLocalizations.of(context)
                        .translate("hoursSpend"),
                    style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w400, color: colorGrey500),
                  )
                ],
              ),
              Container(
                height: 28,
                decoration: BoxDecoration(
                  border: Border.all(
                      color: controller.themeController.isDarkMode
                          ? colorGrey700
                          : colorGrey100),
                  borderRadius: BorderRadius.circular(6),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                // margin: const EdgeInsets.only(right: 10.0),
                child: Obx(
                      () => DropdownButton<String>(
                        padding: EdgeInsets.zero,
                        value: controller.selectedHours.value,
                        onChanged: (String? newValue) {
                          if (newValue != null) {
                            controller.updateHours(newValue);
                          }
                        },
                        underline: const SizedBox(),
                        icon: SvgPicture.asset(
                          angleDownIcon,
                          width: 5,
                          height: 5,
                          colorFilter:
                          ColorFilter.mode(colorGrey400, BlendMode.srcIn),
                        ),
                        items: controller.lessonPeriodList.map((String type) {
                          return DropdownMenuItem<String>(
                            value: type,
                            child: Text(
                              type
                                  .toString()
                                  .split('.')
                                  .last,
                              style: theme.textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w400,
                                  color: colorGrey500),
                            ), // Display name
                          );
                        }).toList(),
                      ),
                ),
              ),
            ],
          ),
          WeeklyLineChart()
        ],
      ),
    );
  }

  _buildLessonView(bool desktopView, ThemeData theme, double screenWidth) {
    return Container(
      height: 260,
      padding: EdgeInsets.symmetric(horizontal: 15),
      margin: EdgeInsetsDirectional.only(
          start: screenWidth > 768 ? 10 : 0, bottom: desktopView ? 0 : 15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color:
        controller.themeController.isDarkMode ? colorGrey900 : Colors.white,
        boxShadow: [
          if (!controller.themeController.isDarkMode)
            BoxShadow(
                color: colorG1.withValues(alpha: 0.24),
                blurRadius: 2,
                offset: Offset(0, 1),
                spreadRadius: 0),
        ],
        border: Border.all(
            color: controller.themeController.isDarkMode
                ? colorGrey700
                : colorGrey100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: 15,),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                AppLocalizations.of(context)
                    .translate("lessons"),
                style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: controller.themeController.isDarkMode
                        ? colorWhite
                        : colorGrey900),
              ),
              Container(
                height: 28,
                decoration: BoxDecoration(
                  border: Border.all(
                      color: controller.themeController.isDarkMode
                          ? colorGrey700
                          : colorGrey100),
                  borderRadius: BorderRadius.circular(6),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                margin: const EdgeInsets.only(right: 10.0),
                child: Obx(
                      () => DropdownButton<String>(
                        padding: EdgeInsets.zero,
                        value: controller.selectedPeriod.value,
                        onChanged: (String? newValue) {
                          if (newValue != null) {
                            controller.updatePeriod(newValue);
                          }
                        },
                        underline: const SizedBox(),
                        icon: SvgPicture.asset(
                          angleDownIcon,
                          width: 5,
                          height: 5,
                          colorFilter:
                          ColorFilter.mode(colorGrey400, BlendMode.srcIn),
                        ),
                        items: controller.lessonPeriodList.map((String type) {
                          return DropdownMenuItem<String>(
                            value: type,
                            child: Text(
                              type
                                  .toString()
                                  .split('.')
                                  .last,
                              style: theme.textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w400, color: colorGrey500),
                            ), // Display name
                          );
                        }).toList(),
                      ),
                ),
              ),
            ],
          ),
            SizedBox(height: 20,),
          _buildBarWidget(desktopView, theme, '126', AppLocalizations.of(context)
              .translate("totalQuiz"),
              controller.quizValues, colorPrimary100),
          SizedBox(height: 12,),
          _buildBarWidget(desktopView, theme, '67%', AppLocalizations.of(context)
              .translate("answers"),
              controller.answerValues, colorPortgage100),
        ],
      ),
    );
  }

  _buildBarWidget(bool desktopView, ThemeData theme, String count, String label,
      List<double> values, Color color) {
    return Container(
      padding: EdgeInsets.all(10),
      margin: EdgeInsets.only(
          right: desktopView ? 10 : 0, bottom: desktopView ? 0 : 15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color:
        controller.themeController.isDarkMode ? colorGrey900 : Colors.white,
        boxShadow: [
          if (!controller.themeController.isDarkMode)
            BoxShadow(
                color: colorG1.withValues(alpha: 0.24),
                blurRadius: 2,
                offset: Offset(0, 1),
                spreadRadius: 0),
        ],
        border: Border.all(
            color: controller.themeController.isDarkMode
                ? colorGrey700
                : colorGrey100),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  count,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: controller.themeController.isDarkMode
                          ? colorWhite
                          : colorGrey900),
                ),
                Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w400, color: colorGrey500),
                )
              ],
            ),
          ),
          MiniBarChart(
            values: values, // Example values
            barColor: color,
          ),
        ],
      ),
    );
  }

  Widget _buildCourseProgress(bool desktopView, ThemeData theme) {
    return Container(
      // height: 457,
      padding: EdgeInsets.only(left: 15, right: 15, top: 15, bottom: 15),
      margin: EdgeInsets.only(bottom: desktopView ? 0 : 15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color:
        controller.themeController.isDarkMode ? colorGrey900 : Colors.white,
        boxShadow: [
          if (!controller.themeController.isDarkMode)
            BoxShadow(
                color: colorG1.withValues(alpha: 0.24),
                blurRadius: 2,
                offset: Offset(0, 1),
                spreadRadius: 0),
        ],
        border: Border.all(
            color: controller.themeController.isDarkMode
                ? colorGrey700
                : colorGrey100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ResponsiveGridRow(
            children: [
              ResponsiveGridCol(
                xl: 6,
                lg: 6,
                md: 12,
                sm: 12,
                xs: 12,
                child: Container(
                  alignment: Alignment.centerLeft,
                  height: isMobile ? 50 : 36,
                  child: Text(
                    AppLocalizations.of(context)
                        .translate("continueLearning"),
                    style: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: controller.themeController.isDarkMode
                            ? colorWhite
                            : colorGrey900),
                  ),
                ),
              ),
              ResponsiveGridCol(
                xl: 5,
                lg: 5,
                md: 8,
                sm: 8,
                xs: 8,
                child: Padding(
                  padding: EdgeInsetsDirectional.only(end: 15),
                  child: CommonSearchField(
                    height: 36,
                    controller: controller.searchController,
                    focusNode: controller.f1,
                    onChanged: (value) {
                      controller.searchCourse(value);
                    },
                    onSubmitted: (value) {
                      controller.searchCourse(value);
                      controller.f1.unfocus();
                    },
                    isDarkMode: controller.themeController.isDarkMode,
                    inputDecoration: inputDecoration(context,
                      borderColor: Colors.transparent,
                      prefixIcon: searchIcon,
                      fillColor: Colors.transparent,
                      prefixIconColor: colorGrey400,
                      hintStyle: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w400,
                          color: controller.themeController.isDarkMode
                              ? colorGrey600
                              : colorGrey300),
                      hintText: AppLocalizations.of(context)
                          .translate("searchForCourses"),
                      borderRadius: 8,
                      topContentPadding: 0,
                      bottomContentPadding: 0),
                  ),
                ),
              ),
              ResponsiveGridCol(
                  xl: 1,
                  lg: 1,
                  md: 4,
                  sm: 4,
                  xs: 4,
                  child: CommonButton(
                    borderRadius: 8,
                    textStyle: theme.textTheme.bodyMedium?.copyWith(
                        color: colorGrey500, fontWeight: FontWeight.w500),
                    height: 36,
                    bgColor: Colors.transparent,
                    onPressed: () {},
                    text: AppLocalizations.of(context)
                        .translate("seeAll"),
                    borderColor: controller.themeController.isDarkMode
                        ? colorGrey500
                        : colorGrey100,
                    textColor: colorGrey500,
                  )),
            ],
          ),
            SizedBox(height: 20,),
          LayoutBuilder(
            builder: (context, constraints) {
              bool isMobile = constraints.maxWidth < 600;

              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: Obx(
                        () => Theme(
                          data: Theme.of(context).copyWith(
                            dividerColor: Colors.transparent,
                            dividerTheme: const DividerThemeData(
                              color: Colors.transparent,
                              space: 0,
                              thickness: 0,
                              indent: 0,
                              endIndent: 0,
                            ),
                          ),
                          child: DataTable(
                            dividerThickness: 0.0,
                            // border: TableBorder.all(color: Colors.blue),
                            dataRowMaxHeight: 65,
                            headingRowColor: WidgetStatePropertyAll(
                                controller.themeController.isDarkMode
                                    ? colorGrey800
                                    : colorGrey25),
                            // columnSpacing: 20,
                            headingRowHeight: 40,
                            // border: TableBorder.all(width: 0), // Removes all
                            // borders
                            columns: [
                              DataColumn(
                                label: Text(
                                  AppLocalizations.of(context)
                                      .translate("courseName"),
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                      fontWeight: FontWeight.w500,
                                      color: colorGrey500),
                                ),
                              ),
                              DataColumn(
                                label: Text(
                                  AppLocalizations.of(context)
                                      .translate("progress"),
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                      fontWeight: FontWeight.w500,
                                      color: colorGrey500),
                                ),
                              ),
                              DataColumn(
                                label: Text(
                                  AppLocalizations.of(context)
                                      .translate("status"),
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                      fontWeight: FontWeight.w500,
                                      color: colorGrey500),
                                ),
                              ),
                              DataColumn(label: Text("")),
                            ],
                            rows: controller.filteredCourseList.map((course) {
                              return DataRow(
                                cells: [
                                  DataCell(
                                    Row(
                                      children: [
                                        commonCacheImageWidget(course.icon, 36,
                                            width: 36, fit: BoxFit.contain),
                                        SizedBox(width: 10,),
                                        Expanded(
                                          child: Column(
                                            mainAxisAlignment:
                                            MainAxisAlignment.center,
                                            crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                course.courseName,
                                                style: theme.textTheme.bodyMedium
                                                    ?.copyWith(
                                                    fontWeight: FontWeight.w600,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                    color: controller
                                                            .themeController
                                                            .isDarkMode
                                                        ? colorWhite
                                                        : colorGrey900),
                                          ),
                                          Row(
                                            children: [
                                              Text(
                                                course.courseType,
                                                overflow: TextOverflow.ellipsis,
                                                style: theme.textTheme.bodySmall
                                                    ?.copyWith(
                                                        fontWeight:
                                                            FontWeight.w400,
                                                        overflow: TextOverflow
                                                            .ellipsis,
                                                        color: colorGrey500),
                                              ),
                                              SizedBox(width: 6,),
                                              Container(
                                                width: 4,
                                                height: 4,
                                                decoration: BoxDecoration(
                                                    shape: BoxShape.circle,
                                                    color: colorGrey500),
                                              ),
                                              SizedBox(width: 6,),
                                              Expanded(
                                                child: Text(
                                                  course.duration,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: theme
                                                      .textTheme.bodySmall
                                                      ?.copyWith(
                                                          fontWeight:
                                                              FontWeight.w400,
                                                          overflow: TextOverflow
                                                              .ellipsis,
                                                          color: colorGrey500),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              DataCell(
                                SizedBox(
                                  width: isMobile ? 100 : 200,
                                  child: Row(
                                    children: [
                                      // Progress Bar
                                      Expanded(
                                        child: ClipRRect(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          // Rounded edges
                                          child: LinearProgressIndicator(
                                            value: (course.progress / 100),
                                            // Example: 0.3 for 30%
                                            backgroundColor: controller
                                                    .themeController.isDarkMode
                                                ? colorGrey800
                                                : colorGrey50,
                                            // Light grey background
                                            valueColor:
                                                AlwaysStoppedAnimation<Color>(
                                                    colorPrimary100),
                                            // Progress color
                                            minHeight: 8, //Adjust thickness
                                          ),
                                        ),
                                      ),
                                      SizedBox(width: 8,),
                                      // Space between bar and text
                                      // Percentage Text
                                      Text(
                                        "${course.progress.toInt()}%",
                                        // Convert to percentage
                                        style:
                                            theme.textTheme.bodySmall?.copyWith(
                                          fontWeight: FontWeight.w500,
                                          color: colorGrey500,
                                        ),
                                      ),
                                      SizedBox(width: 15,),
                                    ],
                                  ),
                                ),
                              ),
                              DataCell(
                                IntrinsicWidth(
                                  child: Container(
                                    padding: EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(
                                        color: controller
                                                .themeController.isDarkMode
                                            ? colorGrey700
                                            : colorGrey100,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        SvgPicture.asset(
                                            course.status == 'In Progress'
                                                ? inProgressIcon
                                                : completedIcon),
                                        SizedBox(width: 8,),
                                        Expanded(
                                          child: Text(
                                            course.status,
                                            overflow: TextOverflow.ellipsis,
                                            style: theme.textTheme.bodySmall
                                                ?.copyWith(
                                                    fontWeight: FontWeight.w500,
                                                    color: colorGrey500),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              DataCell(
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: SvgPicture.asset(
                                    forwardIcon,
                                    colorFilter: ColorFilter.mode(
                                        controller.themeController.isDarkMode
                                            ? colorGrey500
                                            : colorGrey400,
                                        BlendMode.srcIn),
                                  ),
                                ),
                              ),
                            ],
                          );
                        }).toList(),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSidePanel(bool desktopView, ThemeData theme) {
    return Column(
      children: [
        Container(
          height: 470,
          margin: EdgeInsets.only(bottom: desktopView ? 0 : 15),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: controller.themeController.isDarkMode
                ? colorGrey900
                : Colors.white,
            boxShadow: [
              if (!controller.themeController.isDarkMode)
                BoxShadow(
                    color: colorG1.withValues(alpha: 0.24),
                    blurRadius: 2,
                    offset: Offset(0, 1),
                    spreadRadius: 0),
            ],
            border: Border.all(
                color: controller.themeController.isDarkMode
                    ? colorGrey700
                    : colorGrey100),
          ),
          child: _buildCalendar(theme),
        ),
          SizedBox(height: 20,),
        _buildBanner1(theme),
          SizedBox(height: 20,),
        _buildBanner2(theme)
      ],
    );
  }

  _buildBanner1(ThemeData theme) {
    return Container(
      height: 189.5,
      decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16), color: colorOrange0),
      child: Stack(
        children: [
          Positioned(
            left: 24,
            top: 24,
            child: Text(
              'Assessment',
              style: theme.textTheme.bodySmall
                  ?.copyWith(fontWeight: FontWeight.w500, color: colorGrey400),
            ),
          ),
          Positioned(
            bottom: -10,
            right: -10,
            child: SvgPicture.asset(
              bannerBottomIcon1,
            ),
          ),
          Positioned(
            left: 24,
            bottom: 24,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Principle of Design',
                  style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w600, color: colorGrey900),
                ),
                SizedBox(height: 5,),
                Row(
                  children: [
                    Text(
                      'Intermediate',
                      style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w400, color: colorGrey700),
                    ),
                    SizedBox(width: 5,),
                    Container(
                      width: 4,
                      height: 4,
                      decoration: BoxDecoration(
                          shape: BoxShape.circle, color: colorGrey700),
                    ),
                    SizedBox(width: 5,),
                    Text(
                      '25 questions',
                      style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w400, color: colorGrey700),
                    ),
                  ],
                ),
              ],
            ),
          )
        ],
      ),
    );
  }

  _buildBanner2(ThemeData theme) {
    return Container(
      height: 189.5,
      decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16), color: colorPortgage0),
      child: Stack(
        children: [
          Positioned(
            left: 24,
            top: 24,
            child: Text(
              'PRo',
              style: theme.textTheme.bodySmall
                  ?.copyWith(fontWeight: FontWeight.w500, color: colorGrey400),
            ),
          ),
          Positioned(
            bottom: -10,
            right: -10,
            child: SvgPicture.asset(
              bannerBottomIcon2,
            ),
          ),
          Positioned(
            left: 24,
            bottom: 24,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Premium Member',
                  style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w600, color: colorGrey900),
                ),
                SizedBox(height: 5,),
                Text(
                  'Unlimited access to all learning content',
                  style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w400, color: colorGrey700),
                ),
              ],
            ),
          )
        ],
      ),
    );
  }

  _buildCalendar(ThemeData theme) {
    return Column(
      children: [
        Obx(
          () => TableCalendar(
            firstDay: DateTime(2023, 1, 1),
            lastDay: DateTime(2028, 12, 31),
            focusedDay: controller.focusedDate.value,
            selectedDayPredicate: (day) =>
                isSameDay(controller.selectedDate.value, day),
            onDaySelected: controller.onDaySelected,
            calendarFormat: CalendarFormat.week,
            headerStyle: HeaderStyle(
              formatButtonVisible: false,
              titleCentered: true,
              titleTextStyle: theme.textTheme.bodyLarge!.copyWith(
                  color: controller.themeController.isDarkMode
                      ? colorWhite
                      : colorGrey900,
                  fontWeight: FontWeight.w500),
            ),
            calendarStyle: CalendarStyle(
              selectedDecoration: BoxDecoration(
                color: colorPrimary100,
                shape: BoxShape.circle,
              ),
              todayTextStyle: theme.textTheme.bodyLarge!.copyWith(
                  color: controller.themeController.isDarkMode
                      ? colorWhite
                      : colorGrey900,
                  fontWeight: FontWeight.w500),
              defaultTextStyle: theme.textTheme.bodyLarge!
                  .copyWith(color: colorGrey500, fontWeight: FontWeight.w500),
              todayDecoration: BoxDecoration(
                color: Colors.grey[300],
                shape: BoxShape.circle,
              ),
            ),
          ),
        ),
        SizedBox(height: 20),
        Obx(() {
          List<Event> events =
              controller.getEventsForDay(controller.selectedDate.value);
          return Expanded(
            child: events.isEmpty
                ? Center(
                    child: Text(
                      AppLocalizations.of(context).translate("noEventsToday"),
                    style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w600, color: colorPrimary300),
                  ))
                : ListView.builder(
                    physics: NeverScrollableScrollPhysics(),
                    itemCount: events.length,
                    itemBuilder: (context, index) {
                      Event event = events[index];
                      return Container(
                        margin: EdgeInsets.only(left: 10, right: 10, top: 10),
                        padding: EdgeInsets.all(12),
                        decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            color: controller.themeController.isDarkMode
                                ? colorGrey800
                                : colorGrey25),
                        child: Row(
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              padding: EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                  boxShadow: [
                                    if (!controller.themeController.isDarkMode)
                                      BoxShadow(
                                          color:
                                              colorG1.withValues(alpha: 0.24),
                                          offset: Offset(0, 1),
                                          blurRadius: 2,
                                          spreadRadius: 0)
                                  ],
                                  borderRadius: BorderRadius.circular(8),
                                  color: controller.themeController.isDarkMode
                                      ? colorGrey700
                                      : colorWhite),
                              child: commonCacheImageWidget(event.icon, 16,
                                  width: 16, fit: BoxFit.contain),
                            ),
                            SizedBox(width: 10,),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    event.eventName,
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                        fontWeight: FontWeight.w500,
                                        color: controller
                                                .themeController.isDarkMode
                                            ? colorWhite
                                            : colorGrey900),
                                  ),
                                  Text(
                                    event.eventTime,
                                    style: theme.textTheme.bodySmall?.copyWith(
                                        fontWeight: FontWeight.w400,
                                        color: colorGrey500),
                                  )
                                ],
                              ),
                            ),
                            SizedBox(width: 10,),
                            SvgPicture.asset(
                              verticalDotIcon,
                              colorFilter: ColorFilter.mode(
                                  controller.themeController.isDarkMode
                                      ? colorGrey500
                                      : colorGrey400,
                                  BlendMode.srcIn),
                            )
                          ],
                        ),
                      );
                    },
                  ),
          );
        }),
      ],
    );
  }
}
