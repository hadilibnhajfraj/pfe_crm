import 'package:dash_master_toolkit/tables/table_imports.dart';
import 'package:responsive_framework/responsive_framework.dart' as rf;

class DragAndDropTableScreen extends StatefulWidget {
  const DragAndDropTableScreen({super.key});

  @override
  State<DragAndDropTableScreen> createState() => _DragAndDropTableScreenState();
}

class _DragAndDropTableScreenState extends State<DragAndDropTableScreen> {
  final CourseController controller = Get.put(CourseController());
  ThemeController themeController = Get.put(ThemeController());

  Color getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'paid':
        return Color(0xff00a1ff);
      case 'cancelled':
        return Color(0xffff6692);
      case 'refunded':
        return Color(0xff8965e5);
      default:
        return Colors.grey;
    }
  }

  IconData getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'paid':
        return Icons.check_circle_outline;
      case 'cancelled':
        return Icons.cancel_outlined;
      case 'refunded':
        return Icons.refresh_outlined;
      default:
        return Icons.info_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    AppLocalizations lang = AppLocalizations.of(context);
    ThemeData theme = Theme.of(context);
    final isMobile = responsiveValue<bool>(
      context,
      xs: true,
      sm: true,
      md: false,
      lg: false,
      xl: false,
    );

    var titleTextStyle = theme.textTheme.titleMedium?.copyWith(
      fontWeight: FontWeight.w600,
    );

    var rowTextStyle = theme.textTheme.bodyLarge
        ?.copyWith(fontWeight: FontWeight.w600, fontSize: isMobile ? 14 : 16);

    var menuTextStyle = theme.textTheme.bodyMedium
        ?.copyWith(fontWeight: FontWeight.w400, fontSize: isMobile ? 12 : 14);

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
            _buildTable(lang, titleTextStyle!, rowTextStyle!, menuTextStyle!),
          ],
        ),
      ),
    );
  }

  final ScrollController _scrollController = ScrollController();

  Color getCourseColor(String course) {
    switch (course) {
      case 'Angular':
        return Color(0xff00a1ff);
      case 'ReactJS':
        return Color(0xffff6692);
      default:
        return Color(0xff8965e5);
    }
  }

  Widget _buildTable(
    AppLocalizations lang,
    TextStyle titleTextStyle,
    TextStyle rowTextStyle,
    TextStyle menuTextStyle,
  ) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = constraints.biggest;
        return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            controller: _scrollController,
            child: ConstrainedBox(
              constraints: BoxConstraints.loose(
                Size.fromWidth(
                  MediaQuery.sizeOf(context).width <= 1239 ? 1366 : size.width,
                ),
              ),
              child: // Reorderable List
                  Obx(() => ReorderableListView.builder(
                        shrinkWrap: true,
                        header: _buildTableHeader(titleTextStyle),
                        physics: const NeverScrollableScrollPhysics(),
                        onReorder: controller.reorder,
                        itemCount: controller.courseList.length,
                        buildDefaultDragHandles: false,
                        itemBuilder: (context, index) {
                          final item = controller.courseList[index];
                          return _buildDataRow(
                              item, lang, index, rowTextStyle, menuTextStyle);
                        },
                      )),
            ));
      },
    );
  }

  _buildDataRow(
    CourseItem item,
    AppLocalizations lang,
    int index,
    TextStyle rowTextStyle,
    TextStyle menuTextStyle,
  ) {
    return Container(
      key: ValueKey(item.title),
      padding: EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        border: Border.all(
            color: themeController.isDarkMode ? colorGrey700 : colorGrey100),
      ),
      child: ListTileTheme(
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        child: Row(
          children: [
            // Drag Handle
            ReorderableDragStartListener(
              index: index,
              child: SizedBox(
                width: 40,
                child: Icon(Icons.drag_handle, color: colorGrey500),
              ),
            ),

            // Author Info
            Expanded(
              flex: 3,
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: commonCacheImageWidget(item.image, 40,
                        width: 40, fit: BoxFit.cover),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.title, style: rowTextStyle),
                      Text(
                        item.subtitle,
                        style: rowTextStyle.copyWith(
                            fontSize: 12,
                            color: themeController.isDarkMode
                                ? colorGrey500
                                : colorGrey400),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Tags
            Expanded(
              flex: 2,
              child: Wrap(
                spacing: 8,
                runSpacing: 4,
                children: item.tags.map((course) {
                  final color = getCourseColor(course);
                  return Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      course,
                      style: rowTextStyle.copyWith(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: color,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

            // Users
            Expanded(
              child: Text(
                "${item.users} Users",
                style: rowTextStyle.copyWith(
                    color: themeController.isDarkMode
                        ? colorGrey500
                        : colorGrey400,
                    fontWeight: FontWeight.w500),
              ),
            ),

            // Action Menu
            Expanded(
              child: Align(
                alignment: Alignment.centerLeft,
                child: PopupMenuButton<String>(
                  icon: Icon(
                    Icons.more_vert,
                    color: colorGrey500,
                  ),
                  onSelected: (value) {
                    if (value == 'add') {
                      // TODO: Handle Add
                    } else if (value == 'edit') {
                      // TODO: Handle Edit
                    } else if (value == 'delete') {
                      // TODO: Handle Delete
                    }
                  },
                  itemBuilder: (BuildContext context) =>
                      <PopupMenuEntry<String>>[
                    PopupMenuItem<String>(
                      value: 'add',
                      child: ListTile(
                        leading: _buildCommonIconWidget(addCircleIcon),
                        title: Text(
                          'Add',
                          style: menuTextStyle,
                        ),
                      ),
                    ),
                    PopupMenuItem<String>(
                      value: 'edit',
                      child: ListTile(
                        leading: _buildCommonIconWidget(editPenIcon),
                        title: Text(
                          'Edit',
                          style: menuTextStyle,
                        ),
                      ),
                    ),
                    PopupMenuItem<String>(
                      value: 'delete',
                      child: ListTile(
                        leading: _buildCommonIconWidget(deleteIcon2),
                        title: Text(
                          'Delete',
                          style: menuTextStyle,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  _buildTableHeader(TextStyle titleTextStyle) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
        border: Border.all(
            color: themeController.isDarkMode ? colorGrey700 : colorGrey100),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(width: 40), // Fixed width for #
          Expanded(flex: 3, child: Text("Authors", style: titleTextStyle)),
          Expanded(flex: 2, child: Text("Courses", style: titleTextStyle)),
          Expanded(child: Text("Users", style: titleTextStyle)),
          Expanded(child: Text("Action", style: titleTextStyle)),
        ],
      ),
    );
  }

  _buildCommonIconWidget(String assetName) {
    return SvgPicture.asset(
      assetName,
      width: 18,
      height: 18,
      colorFilter: ColorFilter.mode(
          themeController.isDarkMode ? colorWhite : colorGrey900,
          BlendMode.srcIn),
    );
  }
}
